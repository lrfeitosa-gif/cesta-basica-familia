"""Leitor barato (Groq ou Gemini) primeiro, Claude só na página em que ele falha (sem rede: respostas simuladas)."""
import json

import httpx
import pytest

from coleta import extrator
from coleta.extrator import Encarte, OfertaExtraida

ITEM = {"produto": "Arroz branco tipo 1", "marca": "Tio", "quantidade": 5, "unidade": "kg",
        "categoria": "mercearia", "preco": 25.9, "preco_de": None, "condicao": None}


def resposta_groq(conteudo: str, status: int = 200) -> httpx.Response:
    return httpx.Response(status, json={"choices": [{"message": {"content": conteudo}}]})


@pytest.fixture
def ambiente(monkeypatch):
    monkeypatch.setenv("GROQ_API_KEY", "teste")
    monkeypatch.setenv("GEMINI_API_KEY", "teste")
    monkeypatch.setenv("EXTRATOR", "groq")
    monkeypatch.setattr(extrator, "_carregar", lambda origem: (b"img", "image/jpeg"))
    monkeypatch.setattr(extrator.time, "sleep", lambda s: None)
    chamadas = {"claude": 0}

    def claude_falso(dados, tipo, client=None):
        chamadas["claude"] += 1
        return Encarte(valido_de=None, valido_ate="2026-11-20",
                       ofertas=[OfertaExtraida(**{**ITEM, "produto": "Feijão carioca", "preco": 7.5})])

    monkeypatch.setattr(extrator, "_extrair_claude", claude_falso)
    return chamadas


def cliente(*respostas):
    fila = list(respostas)
    return httpx.Client(transport=httpx.MockTransport(lambda req: fila.pop(0)))


def test_groq_le_e_claude_nao_e_chamado(ambiente):
    corpo = json.dumps({"valido_de": None, "valido_ate": "2026-11-15", "ofertas": [ITEM]})
    e = extrator.extrair("x.jpg", http=cliente(resposta_groq(corpo)))
    assert [o.produto for o in e.ofertas] == ["Arroz branco tipo 1"]
    assert e.valido_ate == "2026-11-15"
    assert ambiente["claude"] == 0


def test_json_com_think_e_cercas(ambiente):
    texto = "<think>pensando</think>```json\n" + json.dumps({"ofertas": [ITEM, {"produto": "sem preço"}]}) + "\n```"
    e = extrator.extrair("x.jpg", http=cliente(resposta_groq(texto)))
    assert len(e.ofertas) == 1      # o item malformado é descartado, o bom fica
    assert ambiente["claude"] == 0


@pytest.mark.parametrize("falha", [
    resposta_groq("não consegui ler"),                       # sem JSON
    resposta_groq(json.dumps({"ofertas": []})),             # nenhuma oferta
    httpx.Response(500, text="instável"),                    # erro do serviço
])
def test_falha_da_groq_vai_para_o_claude(ambiente, falha):
    e = extrator.extrair("x.jpg", http=cliente(falha))
    assert [o.produto for o in e.ofertas] == ["Feijão carioca"]
    assert ambiente["claude"] == 1


def test_limite_por_minuto_espera_e_tenta_de_novo(ambiente):
    corpo = json.dumps({"ofertas": [ITEM]})
    e = extrator.extrair("x.jpg", http=cliente(httpx.Response(429, headers={"retry-after": "2"}), resposta_groq(corpo)))
    assert len(e.ofertas) == 1 and ambiente["claude"] == 0


def test_limite_duas_vezes_vai_para_o_claude(ambiente):
    e = extrator.extrair("x.jpg", http=cliente(httpx.Response(429), httpx.Response(429)))
    assert ambiente["claude"] == 1 and e.ofertas[0].produto == "Feijão carioca"


def test_modo_json_reprovado_aproveita_o_texto(ambiente):
    falha = httpx.Response(400, json={"error": {"failed_generation": json.dumps({"ofertas": [ITEM]})}})
    e = extrator.extrair("x.jpg", http=cliente(falha))
    assert len(e.ofertas) == 1 and ambiente["claude"] == 0


def test_pdf_por_pagina_com_reserva_so_na_pagina_que_falhou(ambiente, monkeypatch):
    monkeypatch.setattr(extrator, "_carregar", lambda origem: (b"%PDF", "application/pdf"))
    monkeypatch.setattr(extrator, "_paginas", lambda dados, tipo: [(b"p1", "image/jpeg"), (b"p2", "image/jpeg")])
    ok = resposta_groq(json.dumps({"valido_ate": "2026-11-18", "ofertas": [ITEM]}))
    e = extrator.extrair("x.pdf", http=cliente(ok, httpx.Response(500)))
    assert [o.produto for o in e.ofertas] == ["Arroz branco tipo 1", "Feijão carioca"]
    assert e.valido_ate == "2026-11-18"
    assert ambiente["claude"] == 1


def test_sem_chave_ou_extrator_claude_usa_so_o_claude(ambiente, monkeypatch):
    monkeypatch.setenv("EXTRATOR", "claude")
    e = extrator.extrair("x.jpg", http=cliente())
    assert ambiente["claude"] == 1 and len(e.ofertas) == 1
    monkeypatch.setenv("EXTRATOR", "groq")
    monkeypatch.delenv("GROQ_API_KEY")
    extrator.extrair("x.jpg", http=cliente())
    assert ambiente["claude"] == 2
    monkeypatch.delenv("EXTRATOR")        # sem EXTRATOR: Claude, mesmo com as chaves
    monkeypatch.setenv("GROQ_API_KEY", "teste")
    extrator.extrair("x.jpg", http=cliente())
    assert ambiente["claude"] == 3


def resposta_gemini(texto: str) -> httpx.Response:
    return httpx.Response(200, json={"candidates": [{"content": {"parts": [
        {"text": "pensando...", "thought": True}, {"text": texto}]}}]})


def test_gemini_le_e_ignora_o_raciocinio(ambiente, monkeypatch):
    monkeypatch.setenv("EXTRATOR", "gemini")
    pedidos = []

    def responder(req):
        pedidos.append(req)
        return resposta_gemini(json.dumps({"valido_ate": "2026-11-15", "ofertas": [ITEM]}))

    e = extrator.extrair("x.jpg", http=httpx.Client(transport=httpx.MockTransport(responder)))
    assert len(e.ofertas) == 1 and ambiente["claude"] == 0
    assert "gemini-3.8-flash:generateContent" in str(pedidos[0].url) and pedidos[0].url.params["key"] == "teste"
    corpo = json.loads(pedidos[0].content)
    assert corpo["contents"][0]["parts"][1]["inline_data"]["mime_type"] == "image/jpeg"


@pytest.mark.parametrize("falha", [
    httpx.Response(400, text="modelo inválido"),
    resposta_gemini("sem json aqui"),
])
def test_falha_do_gemini_vai_para_o_claude(ambiente, monkeypatch, falha):
    monkeypatch.setenv("EXTRATOR", "gemini")
    e = extrator.extrair("x.jpg", http=cliente(falha))
    assert ambiente["claude"] == 1 and e.ofertas[0].produto == "Feijão carioca"


def test_gemini_sem_chave_usa_o_claude(ambiente, monkeypatch):
    monkeypatch.setenv("EXTRATOR", "gemini")
    monkeypatch.delenv("GEMINI_API_KEY")
    extrator.extrair("x.jpg", http=cliente())
    assert ambiente["claude"] == 1


def test_pdf_vira_imagens():
    pdfium = pytest.importorskip("pypdfium2")
    pdf = pdfium.PdfDocument.new()
    pdf.new_page(400, 600)
    pdf.new_page(400, 600)
    import io
    buf = io.BytesIO()
    pdf.save(buf)
    paginas = extrator._paginas(buf.getvalue(), "application/pdf")
    assert len(paginas) == 2 and all(t == "image/jpeg" and d[:2] == b"\xff\xd8" for d, t in paginas)


def test_gemini_pede_raciocinio_curto_e_tenta_de_novo_na_sobrecarga(ambiente, monkeypatch):
    monkeypatch.setenv("EXTRATOR", "gemini")
    pedidos = []
    fila = [httpx.Response(503, text="alta demanda"), resposta_gemini(json.dumps({"ofertas": [ITEM]}))]

    def responder(req):
        pedidos.append(json.loads(req.content))
        return fila.pop(0)

    e = extrator.extrair("x.jpg", http=httpx.Client(transport=httpx.MockTransport(responder)))
    assert len(e.ofertas) == 1 and ambiente["claude"] == 0 and len(pedidos) == 2
    assert pedidos[0]["generationConfig"]["thinkingConfig"]["thinkingLevel"] == "low"


def test_gemini_demorando_sempre_vai_para_o_claude(ambiente, monkeypatch):
    monkeypatch.setenv("EXTRATOR", "gemini")

    def demora(req):
        raise httpx.ReadTimeout("demorou", request=req)

    extrator.extrair("x.jpg", http=httpx.Client(transport=httpx.MockTransport(demora)))
    assert ambiente["claude"] == 1

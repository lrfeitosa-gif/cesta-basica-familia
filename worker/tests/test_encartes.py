"""Assaí e Cato: quais páginas de encarte entram e com que validade (sem rede: dados no formato dos sites)."""
from datetime import date

from coleta import encartes
from coleta.extrator import Encarte, OfertaExtraida

HOJE = date(2026, 11, 14)
IMG = "https://d2q57q7k4hzryv.cloudfront.net/RPA/v3/{c}/campanha-{c}-cluster-788-pagina-{p}.jpeg"


def jornal(campanha, inicio, fim, lojas, paginas=1):
    return {"id_oferta": f"{campanha}-788", "start_date": inicio, "end_date": fim,
            "custom_text": f"Preços válidos de {inicio} até {fim}",
            "lojas": [{"loja_id": l, "tid": 1, "nid": 1, "eid": 24} for l in lojas],
            "images": [{"url": IMG.format(c=campanha, p=p)} for p in range(1, paginas + 1)]}


def test_assai_so_jornais_vigentes_da_loja_de_indaiatuba():
    dados = {"ofertas": [
        jornal(176015, "13/11/2026", "15/11/2026", [178, 200], paginas=2),
        jornal(176020, "13/11/2026", "15/11/2026", [178]),
        jornal(175000, "03/11/2026", "05/11/2026", [178]),   # vencido
        jornal(176100, "16/11/2026", "18/11/2026", [178]),   # ainda não começou
        jornal(176200, "13/11/2026", "15/11/2026", [122]),   # outra loja
    ], "lojas": []}
    alvos = encartes.jornais_da_loja(dados, hoje=HOJE)
    assert [u for u, _, _ in alvos] == [IMG.format(c=176015, p=1), IMG.format(c=176015, p=2), IMG.format(c=176020, p=1)]
    assert {(de, ate) for _, de, ate in alvos} == {("2026-11-13", "2026-11-15")}


def test_assai_ultimo_dia_ainda_vale_e_loja_como_texto():
    dados = {"ofertas": [jornal(176015, "13/11/2026", "14/11/2026", ["178"])]}
    assert len(encartes.jornais_da_loja(dados, hoje=HOJE)) == 1


def test_cato_paginas_sem_repeticao_e_em_ordem():
    base = "https://cdn.regexsolutions.com.br/production/folheto/42e6/f827"
    srcs = [f"{base}-2.webp", f"{base}-1.webp", f"{base}-10.webp", f"{base}-1.webp",
            "https://cdn.regexsolutions.com.br/production/bandeiras/cartao.png"]
    assert encartes.paginas_do_folheto(srcs) == [f"{base}-1.webp", f"{base}-2.webp", f"{base}-10.webp"]


def _oferta(**k):
    return OfertaExtraida(**{"produto": "Arroz branco tipo 1", "marca": "Tio", "quantidade": 5, "unidade": "kg",
                             "categoria": "mercearia", "preco": 25.9, "preco_de": None, "condicao": None, **k})


def test_validade_do_site_vale_mais_que_a_lida_na_imagem(monkeypatch):
    monkeypatch.setitem(encartes.SITES["assai"], "buscar", lambda: [("u1", "2026-11-13", "2026-11-15")])
    monkeypatch.setattr(encartes, "extrair", lambda url, headers=None:
                        Encarte(valido_de="2026-11-01", valido_ate="2026-11-02", ofertas=[_oferta()]))
    saida = encartes.coletar("assai")
    assert [(o["mercado"], o["validoAte"], o["url"]) for o in saida] == [("Assaí", "2026-11-15", "u1")]


def test_cato_folheto_futuro_fica_para_o_dia_dele(monkeypatch):
    lidos = {"hoje": Encarte(valido_de=date.today().isoformat(), valido_ate=None, ofertas=[_oferta()]),
             "amanha": Encarte(valido_de="2999-01-01", valido_ate=None, ofertas=[_oferta(preco=9.9)])}
    monkeypatch.setitem(encartes.SITES["cato"], "buscar", lambda: [("hoje", None, None), ("amanha", None, None)])
    monkeypatch.setattr(encartes, "extrair", lambda url, headers=None: lidos[url])
    saida = encartes.coletar("cato")
    assert [(o["mercado"], o["url"], o["preco"]) for o in saida] == [("Cato", "hoje", 25.9)]


def test_cabecalhos_do_site_vao_para_o_download(monkeypatch):
    vistos = []
    monkeypatch.setitem(encartes.SITES["cato"], "buscar", lambda: [("u", None, None)])
    monkeypatch.setattr(encartes, "extrair", lambda url, headers=None:
                        vistos.append(headers) or Encarte(valido_de=None, valido_ate=None, ofertas=[]))
    encartes.coletar("cato")
    assert vistos[0]["Referer"] == "https://www.catosupermercados.com.br/"

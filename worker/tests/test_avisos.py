from datetime import date

import avisos


def oferta(i, nome, marca, preco, de=0, q=500, u="g", mercado="Covabra", categoria="Mercearia"):
    base = q / 1000 if u in ("g", "ml") else q
    o = {"id": i, "nome": nome, "marca": marca, "q": q, "u": u, "categoria": categoria, "mercado": mercado,
         "preco": preco, "de": de, "porUn": preco / base, "ub": {"g": "kg", "ml": "l"}.get(u, u)}
    o["busca"] = avisos.texto_busca(o)
    return o


LISTA = [
    oferta(1, "Café Pilão Tradicional 500g", "Pilão", 19.9, de=25.9),
    oferta(2, "Café Pilão Extraforte 500g", "Pilão", 21.5),
    oferta(3, "Cápsula Café Espresso 3 Corações", "Três", 14.99, q=10, u="un"),
    oferta(4, "Cerveja Heineken Zero Álcool 350ml", "Heineken", 4.99, q=350, u="ml", categoria="Bebidas"),
    oferta(5, "Cerveja Heineken 350ml", "Heineken", 4.49, q=350, u="ml", categoria="Bebidas"),
    oferta(6, "Biscoito sabor café", "Marilan", 3.0, q=100),
]


def test_busca_com_foco_e_plural():
    assert [o["id"] for o in avisos.achar({"termo": "café pilão"}, LISTA)] == [1, 2]
    assert [o["id"] for o in avisos.achar({"termo": "capsulas"}, LISTA)] == [3]


def test_marca_tres_casa_com_3_coracoes():
    assert [o["id"] for o in avisos.achar({"termo": "capsula", "marca": "3 corações"}, LISTA)] == [3]


def test_versao_zero_so_quando_pedida():
    assert [o["id"] for o in avisos.achar({"termo": "cerveja heineken"}, LISTA)] == [5]
    assert [o["id"] for o in avisos.achar({"termo": "cerveja heineken zero alcool"}, LISTA)] == [4]


def test_preco_alvo(monkeypatch):
    monkeypatch.setattr(avisos, "referencia_mes", lambda *a: None)
    al = {"id": 1, "familia_id": "f", "termo": "café pilão", "marca": None, "preco_alvo": 20}
    av = avisos.decidir(None, al, LISTA, date(2026, 11, 13))
    assert av and av.motivo == "preco_alvo" and av.oferta["id"] == 1
    assert avisos.decidir(None, {**al, "preco_alvo": 15}, LISTA, date(2026, 11, 13)) is None


def test_abaixo_do_mes_para_despensa(monkeypatch):
    monkeypatch.setattr(avisos, "referencia_mes", lambda *a: 50.0)   # R$ 50/kg no mês; hoje R$ 39,80/kg
    al = {"id": 1, "familia_id": "f", "termo": "café pilão", "marca": None, "preco_alvo": None}
    av = avisos.decidir(None, al, LISTA, date(2026, 11, 13))
    assert av.motivo == "abaixo_mes" and av.desconto == 20 and "despensa" in av.texto


def test_desconto_sobre_preco_normal(monkeypatch):
    monkeypatch.setattr(avisos, "referencia_mes", lambda *a: None)
    al = {"id": 1, "familia_id": "f", "termo": "café pilão", "marca": None, "preco_alvo": None}
    av = avisos.decidir(None, al, LISTA, date(2026, 11, 13))
    assert av.motivo == "abaixo_media" and av.desconto == 23

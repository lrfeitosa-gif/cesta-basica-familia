"""O comparador não pode transformar item faltante em falso erro de preço."""
from coleta.comparar_gabarito import comparar, tabela

G = [
    {"marca": "Oral-B", "produto": "Creme dental extra branco menta", "preco": 5.95, "preco_de": None, "quantidade": 210, "unidade": "g"},
    {"marca": "Oral-B", "produto": "Escova dental Indicator", "preco": 15.90, "preco_de": None, "quantidade": 4, "unidade": "un"},
    {"marca": "Bóris", "produto": "Alimento para gatos premium", "preco": 59.90, "preco_de": None, "quantidade": 10.1, "unidade": "kg"},
    {"marca": "Piracanjuba", "produto": "Creme de leite leve", "preco": 13.69, "preco_de": None, "quantidade": 1.03, "unidade": "kg"},
]


def lido(marca, produto, preco, unidade, de=None):
    return {"marca": marca, "produto": produto, "preco": preco, "precoDe": de, "unidade": unidade}


def test_item_nao_lido_vira_faltou_e_nao_pega_preco_de_outro():
    extraido = [lido("Oral-B", "Escova dental Indicator Color", 15.90, "4 un"),
                lido("Ana Maria", "Bolinho Pullman", 2.79, "70 g", 3.19)]
    r = comparar(G, extraido)
    assert r["itens"][0]["veio"] is None          # creme dental não lido
    assert r["itens"][1]["ok"]["preco"]          # a escova casa com a escova, não com o creme
    assert r["itens"][2]["veio"] is None          # ração não "pega" o preço do bolinho
    assert r["sobras"] == 1


def test_embalagem_equivalente_conta_como_certa():
    r = comparar(G, [lido("Piracanjuba", "Creme de leite leve", 13.69, "1030 g")])
    assert r["itens"][3]["ok"]["embalagem"]


def test_tabela_markdown():
    r = comparar(G, [lido("Bóris", "Alimento para gatos premium", 58.90, "10.1 kg")])
    md = tabela(G, {"Modelo X": r})
    assert "| Modelo X | 1/4 |" in md and "❌ R$ 58,90" in md and "❌ não achou" in md

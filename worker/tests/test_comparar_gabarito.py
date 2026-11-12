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


def test_linha_do_produto_na_marca_ainda_e_a_mesma_marca():
    g = [{"marca": "Ana Maria", "produto": "Bolinho Pullman", "preco": 2.79, "preco_de": 3.19, "quantidade": 70, "unidade": "g"},
         {"marca": "Kellogg's", "produto": "Cereal matinal Sucrilhos", "preco": 6.49, "preco_de": None, "quantidade": 280, "unidade": "g"},
         {"marca": "Maggi", "produto": "Tempero Meu Segredo", "preco": 2.59, "preco_de": 2.89, "quantidade": 49, "unidade": "g"}]
    extraido = [lido("Ana Maria Pullman", "Bolinho", 2.79, "70 g", 3.19),
                lido("Kellogg's Sucrilhos", "Cereal matinal", 6.49, "280 g"),
                lido("Maggi Meu Segredo", "Tempero", 2.59, "49 g", 2.89)]
    r = comparar(g, extraido)
    assert r["encontrados"] == 3 and r["sobras"] == 0 and r["acertos"]["preco"] == 3


def test_marca_parecida_mas_diferente_nao_casa():
    g = [{"marca": "Seara", "produto": "Lasanha congelada", "preco": 11.90, "preco_de": None, "quantidade": 600, "unidade": "g"}]
    r = comparar(g, [lido("Sadia", "Lasanha congelada bolonhesa", 12.90, "600 g")])
    assert r["itens"][0]["veio"] is None      # outra marca: não é o mesmo produto


def test_marca_com_erro_de_leitura_e_marca_nao_lida():
    g = [{"marca": "Agifácil", "produto": "Água sanitária", "preco": 3.69, "preco_de": None, "quantidade": 2, "unidade": "l"},
         {"marca": "Camil", "produto": "Macarrão com ovos", "preco": 2.39, "preco_de": 2.89, "quantidade": 500, "unidade": "g"}]
    r = comparar(g, [lido("Agiifácil", "Água sanitária", 3.69, "2 l"), lido(None, "Macarrão com ovos Camil", 2.39, "500 g", 2.89)])
    assert r["encontrados"] == 2 and r["acertos"]["preco"] == 2

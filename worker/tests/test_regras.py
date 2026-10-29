from datetime import date

from motor.regras import (Interesse, Oferta, Produto, Referencia, aviso_recompra, casa,
                          gatilho, melhor_compra, mensagem, quanto_estocar)

CAFE_A = Produto(1, "cafe_po", "Pilão", 500, "g")
CAFE_A_1KG = Produto(2, "cafe_po", "Pilão", 1, "kg")
CAFE_B = Produto(3, "cafe_po", "Melitta", 500, "g")
HOJE = date(2026, 10, 29)


def test_casa_produto_marca_respeita_gramatura():
    i = Interesse("f", produto=CAFE_A)
    assert casa(i, Oferta(1, CAFE_A, 1, 18.9))
    assert not casa(i, Oferta(2, CAFE_A_1KG, 1, 35.0))
    assert not casa(i, Oferta(3, CAFE_B, 1, 17.0))


def test_casa_so_produto_qualquer_marca():
    i = Interesse("f", categoria="cafe_po")
    assert casa(i, Oferta(1, CAFE_B, 1, 17.0))


def test_gatilho_compara_por_kg():
    # média 40/kg; 1 kg a 33 = 17,5% abaixo
    ref = Referencia(media_60d=40.0, minimo_90d_monitorados=None)
    r = gatilho(Oferta(1, CAFE_A_1KG, 1, 33.0), Interesse("f", categoria="cafe_po"), ref, None, HOJE)
    assert r == ("abaixo_media", 17.5)


def test_gatilho_antispam_e_preco_alvo():
    ref = Referencia(None, None)
    i = Interesse("f", produto=CAFE_A, preco_alvo=19.0)
    o = Oferta(1, CAFE_A, 1, 18.9)
    assert gatilho(o, i, ref, None, HOJE)[0] == "preco_alvo"
    assert gatilho(o, i, ref, date(2026, 10, 26), HOJE) is None


def test_mensagem():
    m = mensagem(Oferta(1, CAFE_A, 1, 18.9), "Café Pilão 500 g", "Atacadão", 18.2)
    assert m == "Café Pilão 500 g a R$ 18,90 no Atacadão, 18% abaixo da média — bom momento para estocar"


def test_melhor_compra_unico_e_dupla():
    itens = {1: 2, 2: 1}
    precos = {10: {1: 10.0, 2: 30.0}, 20: {1: 8.0}, 30: {2: 20.0}}
    coords = {10: (-23.09, -47.21), 20: (-23.09, -47.21), 30: (-23.09, -47.21)}
    unico, dupla = melhor_compra(itens, precos, {1: 9.0, 2: 25.0}, coords, [(-23.09, -47.21)], 1.2)
    # 30: café estimado na média (2 x 9) + arroz 20 = 38, mais barato que 20 (16 + 25 estimado)
    assert unico.mercados == (30,) and unico.total == 38.0 and unico.estimados == [1]
    assert dupla.mercados == (20, 30) and dupla.total == 36.0


def test_quanto_estocar():
    # consumo 20 g/dia, pacote 500 g -> 90 dias = 1,8 kg -> 3 pacotes
    assert quanto_estocar(0.02, 0.5) == 3


def test_aviso_recompra():
    datas = [date(2026, 8, 1), date(2026, 9, 1), date(2026, 10, 1)]  # ~30,5 dias
    assert aviso_recompra(datas, date(2026, 10, 10))[1] == 30.5
    assert aviso_recompra(datas, date(2026, 10, 25)) is None
    assert aviso_recompra([date(2026, 10, 20)], HOJE, estimativa_dias=30)[2] is True

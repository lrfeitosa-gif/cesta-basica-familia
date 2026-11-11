"""Embalagem lida do nome do produto: packs viram o total, para comparar pelo preço do quilo/litro."""
import pytest

from coleta.vtex import embalagem


@pytest.mark.parametrize("nome, esperado", [
    ("Arroz Camil 5kg", (5.0, "kg")),
    ("Cerveja Heineken 269ml Lata", (269.0, "ml")),
    ("Cerveja Heineken 269ml Com 8 Unidades", (2152.0, "ml")),
    ("Café em Cápsula Nescafé Brasil 18x4,4g", (79.2, "g")),
    ("Café Extra Forte VP Melitta - Caixa com 2x500g", (1000.0, "g")),
    ("Nescafé Pro-Energy Chococino 6X270ml", (1620.0, "ml")),
    ("Água Mineral 1,5 L c/ 6 unid", (9.0, "l")),
    ("Detergente 500ml 1 Unidade", (500.0, "ml")),
    ("Ovos Brancos 13g Protein com 10 Unidades", (10.0, "un")),
    ("Banana Prata 1 Unidade 180g", (180.0, "g")),
    ("Ovo Branco Coag Com 20 Grande", (20.0, "un")),
])
def test_embalagem(nome, esperado):
    assert embalagem(nome) == esperado

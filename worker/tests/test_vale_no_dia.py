"""Ofertas de dia certo no encarte ("Só 09/11 e 10") entram só nesses dias, e nunca derrubam a coleta."""
import pytest

from rodar_coleta import vale_no_dia


@pytest.mark.parametrize("condicao, dia, esperado", [
    ("Só 09 e 10/11", "2026-11-10", True),
    ("Só 09 e 10/11", "2026-11-09", True),
    ("Só 09 e 10/11", "2026-11-11", False),
    ("Só 09/11 e 10", "2026-11-10", True),      # mês só na primeira data: quebrava a coleta do Roldão em 12/11
    ("Só 09/11 e 10", "2026-11-12", False),
    ("Só 30/11 e 01/12", "2026-12-01", True),
    ("Só 12/11; leve 3 pague 2", "2026-11-12", True),
    ("Só hoje", "2026-11-12", True),           # sem data: vale todo dia
    (None, "2026-11-12", True),
    ("no cartão da loja", "2026-11-12", True),
])
def test_vale_no_dia(condicao, dia, esperado):
    assert vale_no_dia(condicao, dia) is esperado

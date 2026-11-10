from catalogo import Catalogo


def test_classifica_plurais_comuns():
    catalogo = Catalogo([
        {"id": 1, "termo": "tomate"},
        {"id": 2, "termo": "pao"},
        {"id": 3, "termo": "limao"},
        {"id": 4, "termo": "cereal"},
        {"id": 5, "termo": "papel higienico"},
    ])

    assert catalogo.classificar("Tomates italianos") == 1
    assert catalogo.classificar("Pães franceses") == 2
    assert catalogo.classificar("Limões") == 3
    assert catalogo.classificar("Cereais matinais") == 4
    assert catalogo.classificar("Papéis higiênicos") == 5


def test_preserva_exclusoes_ao_classificar_plural():
    catalogo = Catalogo([
        {"id": 1, "termo": "arroz", "exclusoes": ["integral"]},
    ])

    assert catalogo.classificar("Arroz branco") == 1
    assert catalogo.classificar("Arroz integral") is None

"""Mede a precisão do extrator contra um gabarito transcrito à mão.

Uso:
    python -m coleta.comparar_gabarito gabarito.json extraido1.json [extraido2.json ...]

Casa cada item do gabarito com o extraído de mesma marca e nome mais parecido, e confere
preço, preço "de" e embalagem.
"""
from __future__ import annotations

import json
import sys
import unicodedata
from difflib import SequenceMatcher

from coleta.vtex import embalagem


def _norm(s: str | None) -> str:
    s = unicodedata.normalize("NFD", (s or "").lower())
    return "".join(c for c in s if not unicodedata.combining(c)).replace("'", "").strip()


def _parecido(a: str, b: str) -> float:
    return SequenceMatcher(None, _norm(a), _norm(b)).ratio()


def comparar(gabarito: list[dict], extraido: list[dict]) -> dict:
    livres = list(extraido)
    linhas, acertos = [], {"preco": 0, "preco_de": 0, "embalagem": 0}
    for g in gabarito:
        candidatos = [e for e in livres if _norm(e.get("marca")) == _norm(g["marca"])] or livres
        melhor = max(candidatos, key=lambda e: _parecido(e["produto"], g["produto"]), default=None)
        if melhor is None or _parecido(melhor["produto"], g["produto"]) < 0.35:
            linhas.append(f"  FALTOU   {g['marca']} – {g['produto']} R$ {g['preco']:.2f}")
            continue
        livres.remove(melhor)
        qtd, un = embalagem(melhor.get("unidade") or "")
        ok = {
            "preco": abs(melhor["preco"] - g["preco"]) < 0.005,
            "preco_de": (melhor.get("precoDe") or 0) == (g["preco_de"] or 0),
            "embalagem": un == g["unidade"] and qtd is not None and abs(qtd - g["quantidade"]) < 0.01,
        }
        for k, v in ok.items():
            acertos[k] += v
        if not all(ok.values()):
            erros = ", ".join(k for k, v in ok.items() if not v)
            linhas.append(f"  ERRO     {g['marca']} – {g['produto']}: esperado R$ {g['preco']:.2f} (de {g['preco_de']}) "
                          f"{g['quantidade']:g} {g['unidade']} | veio R$ {melhor['preco']:.2f} (de {melhor.get('precoDe')}) "
                          f"{melhor.get('unidade')} [{erros}]")
    for e in livres:
        linhas.append(f"  SOBROU   {e.get('marca')} – {e['produto']} R$ {e['preco']:.2f}")
    n = len(gabarito)
    encontrados = n - sum(1 for l in linhas if l.startswith("  FALTOU"))
    return {"total": n, "encontrados": encontrados, "acertos": acertos, "sobras": len(livres), "linhas": linhas}


def main(argv: list[str] | None = None) -> None:
    args = argv or sys.argv[1:]
    gabarito = json.load(open(args[0], encoding="utf-8"))["ofertas"]
    extraido = [o for arq in args[1:] for o in json.load(open(arq, encoding="utf-8"))]
    r = comparar(gabarito, extraido)
    n = r["total"]
    print(f"Itens no gabarito: {n} | encontrados: {r['encontrados']} ({r['encontrados']/n:.0%}) | sobras: {r['sobras']}")
    for k, v in r["acertos"].items():
        print(f"  {k:10s} certo em {v}/{n} ({v/n:.0%})")
    print("\n".join(r["linhas"]))


if __name__ == "__main__":
    main()

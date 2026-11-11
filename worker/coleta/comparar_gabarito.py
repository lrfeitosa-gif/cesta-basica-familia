"""Mede a precisão do extrator contra um gabarito transcrito à mão.

Uso:
    python -m coleta.comparar_gabarito gabarito.json extraido1.json [extraido2.json ...]
    python -m coleta.comparar_gabarito --tabela gabarito.json opus=opus sonnet=sonnet ...
        (cada nome=prefixo junta os arquivos prefixo-*.json; sai uma tabela em Markdown, item por item)

Casa cada item do gabarito com o extraído de mesma marca e nome mais parecido, e confere
preço, preço "de" e embalagem.
"""
from __future__ import annotations

import glob
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


_BASE = {"g": ("kg", 0.001), "kg": ("kg", 1), "ml": ("l", 0.001), "l": ("l", 1), "un": ("un", 1)}


def _mesma_embalagem(qtd: float | None, un: str | None, qtd_g: float, un_g: str) -> bool:
    """1030 g e 1,03 kg são a mesma embalagem: compara em quilo, litro ou unidade."""
    if qtd is None or un not in _BASE or un_g not in _BASE:
        return False
    (b, f), (b_g, f_g) = _BASE[un], _BASE[un_g]
    return b == b_g and abs(qtd * f - qtd_g * f_g) < 0.0005 * max(1, qtd_g * f_g)


def _nota(e: dict, g: dict) -> float:
    """Quanto o item lido parece o do gabarito. Mesma marca: basta o nome lembrar (>= 0,35). Outra marca, ou
    marca não lida: o nome tem que ser bem parecido (>= 0,75). Sem isso, um item que o modelo não leu
    "pegava" o preço de um produto qualquer e virava um falso erro de preço."""
    parecido = _parecido(e["produto"], g["produto"])
    if _mesma_marca(e.get("marca"), g["marca"]):
        return parecido + 1 if parecido >= 0.35 else 0     # +1: par da mesma marca vem antes
    if _norm(e.get("marca")):
        return 0                                           # marca lida e diferente: é outro produto
    # marca não lida: vale o nome completo bem parecido
    completo = _parecido(e["produto"], f"{g['marca']} {g['produto']}")
    melhor = max(parecido, completo)
    return melhor if melhor >= 0.75 else 0


def _mesma_marca(a: str | None, b: str | None) -> bool:
    """Mesma marca, mesmo escrita de outro jeito: "Ana Maria" e "Ana Maria Pullman", "Maggi" e "Maggi Meu Segredo"
    (a linha do produto às vezes vem na marca) ou "Agifácil" e "Agiifácil" (erro de leitura)."""
    a, b = _norm(a), _norm(b)
    if not (a and b):
        return False
    return a == b or a.startswith(b + " ") or b.startswith(a + " ") or SequenceMatcher(None, a, b).ratio() >= 0.8


def _parear(gabarito: list[dict], extraido: list[dict]) -> dict[int, int]:
    """Pareamento global: os pares mais parecidos primeiro, cada item usado uma vez só (a ordem não importa)."""
    pares = sorted(((_nota(e, g), i, j) for i, g in enumerate(gabarito) for j, e in enumerate(extraido)),
                   reverse=True)
    usados_g, usados_e, par = set(), set(), {}
    for nota, i, j in pares:
        if nota <= 0:
            break
        if i not in usados_g and j not in usados_e:
            par[i] = j
            usados_g.add(i)
            usados_e.add(j)
    return par


def comparar(gabarito: list[dict], extraido: list[dict]) -> dict:
    par = _parear(gabarito, extraido)
    livres = [e for j, e in enumerate(extraido) if j not in set(par.values())]
    linhas, acertos, itens = [], {"preco": 0, "preco_de": 0, "embalagem": 0}, []
    for i, g in enumerate(gabarito):
        if i not in par:
            linhas.append(f"  FALTOU   {g['marca']} – {g['produto']} R$ {g['preco']:.2f}")
            itens.append({"gabarito": g, "veio": None, "ok": None})
            continue
        melhor = extraido[par[i]]
        qtd, un = embalagem(melhor.get("unidade") or "")
        ok = {
            "preco": abs(melhor["preco"] - g["preco"]) < 0.005,
            "preco_de": (melhor.get("precoDe") or 0) == (g["preco_de"] or 0),
            "embalagem": _mesma_embalagem(qtd, un, g["quantidade"], g["unidade"]),
        }
        itens.append({"gabarito": g, "veio": melhor, "ok": ok})
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
    return {"total": n, "encontrados": encontrados, "acertos": acertos, "sobras": len(livres), "linhas": linhas,
            "itens": itens, "livres": livres}


def _rs(v: float | None) -> str:
    return "–" if v is None else f"R$ {v:.2f}".replace(".", ",")


def _esperado(g: dict) -> str:
    de = f" (de {_rs(g['preco_de'])})" if g.get("preco_de") else ""
    return f"{_rs(g['preco'])}{de} · {g['quantidade']:g} {g['unidade']}"


def _celula(item: dict) -> str:
    if item["veio"] is None:
        return "❌ não achou"
    ok, v = item["ok"], item["veio"]
    if all(ok.values()):
        return "✅"
    erros = []
    if not ok["preco"]:
        erros.append(_rs(v["preco"]))
    if not ok["preco_de"]:
        erros.append(f"de {_rs(v.get('precoDe'))}")
    if not ok["embalagem"]:
        erros.append(v.get("unidade") or "sem embalagem")
    return "❌ " + " · ".join(erros)


def tabela(gabarito: list[dict], resultados: dict[str, dict]) -> str:
    """Markdown: resumo por modelo e uma linha por item do gabarito, com o que cada modelo leu."""
    nomes = list(resultados)
    n = len(gabarito)
    saida = ["| Modelo | Encontrados | Preço certo | Preço \"de\" certo | Embalagem certa | Itens a mais |",
             "| --- | --- | --- | --- | --- | --- |"]
    for nome, r in resultados.items():
        a = r["acertos"]
        saida.append(f"| {nome} | {r['encontrados']}/{n} | {a['preco']}/{n} ({a['preco']/n:.0%}) | "
                     f"{a['preco_de']}/{n} ({a['preco_de']/n:.0%}) | {a['embalagem']}/{n} ({a['embalagem']/n:.0%}) | {r['sobras']} |")
    saida += ["", "✅ = preço, preço \"de\" e embalagem certos; ❌ mostra só o que veio errado.", "",
              "| Item | Esperado | " + " | ".join(nomes) + " |", "| --- | --- | " + " | ".join("---" for _ in nomes) + " |"]
    for i, g in enumerate(gabarito):
        celulas = [_celula(resultados[nome]["itens"][i]) for nome in nomes]
        saida.append(f"| {g['marca']} – {g['produto']} | {_esperado(g)} | " + " | ".join(celulas) + " |")
    for nome, r in resultados.items():
        if r["livres"]:
            extras = "; ".join(f"{e.get('marca') or ''} {e['produto']} {_rs(e['preco'])}".strip() for e in r["livres"])
            saida.append(f"\n**{nome}, itens que não estão no gabarito:** {extras}")
    return "\n".join(saida)


def main(argv: list[str] | None = None) -> None:
    args = argv or sys.argv[1:]
    if args and args[0] == "--tabela":
        gabarito = json.load(open(args[1], encoding="utf-8"))["ofertas"]
        resultados = {}
        for par in args[2:]:
            nome, prefixo = par.split("=", 1)
            arquivos = sorted(glob.glob(f"{prefixo}-*.json"))
            if arquivos:
                extraido = [o for arq in arquivos for o in json.load(open(arq, encoding="utf-8"))]
                resultados[nome] = comparar(gabarito, extraido)
        print(tabela(gabarito, resultados))
        return
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

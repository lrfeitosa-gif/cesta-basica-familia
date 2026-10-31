"""Coletor São Vicente (Salesforce Commerce Cloud): lê a busca pública do site.

Cada página de busca traz um bloco <search-card-grid products="[...]"> com nome, marca, preço de venda,
preço "de" e a imagem (cujo nome contém o EAN). Sem robots.txt publicado no site (verificado em 31/10/2026).

Uso:
    python -m coleta.svicente arroz feijão --saida svicente.json
"""
from __future__ import annotations

import argparse
import html
import json
import re
import time
from datetime import date

import httpx

from coleta.vtex import TERMOS_CESTA, embalagem

MERCADO = "São Vicente"
BASE = "https://www.svicente.com.br"
BUSCA = f"{BASE}/on/demandware.store/Sites-SaoVicente-Site/pt_BR/Search-Show"
POR_PAGINA = 20          # o site não aceita páginas maiores
PAGINAS_POR_TERMO = 3    # até 60 produtos por termo (os termos específicos cobrem os básicos)
PAUSA_S = 1.0

_GRADE = re.compile(r'<search-card-grid[^>]*?products="([^"]*)"', re.S)
_EAN = re.compile(r"/\d+-(\d{8,14})-")


def produtos_da_pagina(pagina: str) -> list[dict]:
    m = _GRADE.search(pagina)
    return json.loads(html.unescape(m.group(1))) if m else []


def para_oferta(d: dict, hoje: str) -> dict | None:
    preco = ((d.get("price") or {}).get("sales") or {}).get("value")
    if not preco or not d.get("available", True):
        return None
    lista = ((d.get("price") or {}).get("list") or {}).get("value")
    img = (((d.get("images") or {}).get("small") or [{}])[0]).get("url", "")
    ean = _EAN.search(img)
    qtd, un = embalagem(d.get("productName", ""))
    horti = (d.get("brand") or "").strip().lower() == "flv"   # "Flv" = frutas, legumes e verduras
    if (d.get("weighable") or horti) and not qtd:   # vendido por peso: preço por kg
        qtd, un = 1.0, "kg"
    url = d.get("productShowFullUrl") or ""
    return {k: v for k, v in {
        "produto": d.get("productName"),
        "marca": None if horti else d.get("brand"),
        # códigos internos (começam com zeros) não são EAN: não podem juntar produtos de mercados diferentes
        "ean": ean.group(1) if ean and not ean.group(1).startswith("0000") else None,
        "quantidade": qtd,
        "unidade": un,
        "categoria": "hortifruti" if horti else None,
        "mercado": MERCADO,
        "preco": float(preco),
        "precoDe": float(lista) if lista and float(lista) > float(preco) else None,
        "validoAte": hoje,
        "fonte": "ecommerce",
        "url": (BASE + url) if url.startswith("/") else url or None,
    }.items() if v is not None}


def coletar(termos: list[str] | None = None) -> list[dict]:
    hoje = date.today().isoformat()
    vistos, saida = set(), []
    with httpx.Client(timeout=40, follow_redirects=True,
                      headers={"User-Agent": "Mozilla/5.0 (compatible; FastPromotionsMK/0.1; piloto Indaiatuba)"}) as client:
        for termo in termos or TERMOS_CESTA:
            for pagina in range(PAGINAS_POR_TERMO):
                try:
                    r = client.get(BUSCA, params={"q": termo, "start": pagina * POR_PAGINA, "sz": POR_PAGINA})
                except httpx.TransportError:
                    break
                if r.status_code != 200:
                    break
                lote = produtos_da_pagina(r.text)
                for d in lote:
                    if d.get("id") in vistos:
                        continue
                    vistos.add(d.get("id"))
                    if (o := para_oferta(d, hoje)):
                        saida.append(o)
                time.sleep(PAUSA_S)
                if len(lote) < POR_PAGINA:
                    break
    return saida


def main(argv: list[str] | None = None) -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("termos", nargs="*")
    ap.add_argument("--saida")
    a = ap.parse_args(argv)
    ofertas = coletar(a.termos or None)
    texto = json.dumps(ofertas, ensure_ascii=False, indent=2)
    if a.saida:
        open(a.saida, "w", encoding="utf-8").write(texto)
        print(f"{len(ofertas)} produtos salvos em {a.saida}")
    else:
        print(texto)


if __name__ == "__main__":
    main()

"""Coletor Goodbom (plataforma Mercafacil): preços da loja de Indaiatuba pelas páginas de departamento.

As páginas da loja trazem os produtos no payload do Next.js (objetos "EcommerceProduct" com preço, preço com
desconto, preço do clube, unidade e departamento). O robots.txt proíbe só /busca; usamos departamentos e
ofertas do clube (verificado em 31/10/2026).

Uso:
    python -m coleta.goodbom --saida goodbom.json
"""
from __future__ import annotations

import argparse
import json
import re
import time
from datetime import date

import httpx

from coleta.vtex import embalagem

MERCADO = "Goodbom"
BASE = "https://www.goodbom.com.br"
LOJA = "/goodbom-indaiatuba-sp"
PAUSA_S = 1.0
MAX_PAGINAS = 60   # trava de segurança por departamento

_PUSH = re.compile(r'self\.__next_f\.push\(\[1,"(.*?)"\]\)', re.S)
_PRODUTO = re.compile(r'\{"__typename":"EcommerceProduct"')
_PAGINAS = re.compile(r'"pagination":\{"page":\d+,"records":\d+,"totalPages":(\d+)\}')


def payload(pagina: str) -> str:
    return "".join(json.loads('"' + p + '"') for p in _PUSH.findall(pagina))


def produtos(rsc: str) -> list[dict]:
    dec, achados = json.JSONDecoder(), {}
    for m in _PRODUTO.finditer(rsc):
        try:
            o, _ = dec.raw_decode(rsc, m.start())
            achados[o["id"]] = o
        except (ValueError, KeyError):
            continue
    return list(achados.values())


def departamentos(pagina_categorias: str) -> list[str]:
    """Departamentos principais da loja (objetos StoreDepartment da página /categorias), mais ofertas do clube.
    Os principais já incluem os produtos dos subdepartamentos."""
    rsc, dec, urls = payload(pagina_categorias), json.JSONDecoder(), []
    for m in re.finditer(r'\{"__typename":"StoreDepartment"', rsc):
        try:
            o, _ = dec.raw_decode(rsc, m.start())
        except ValueError:
            continue
        if o.get("slug") and o.get("id") and o["id"] != "99999":   # 99999 = Promoções (vem como ofertas-clube)
            urls.append(f"{LOJA}/{o['slug']}-{o['id']}")
    return sorted(set(urls)) + [f"{LOJA}/ofertas-clube"]


def para_oferta(o: dict, hoje: str) -> dict | None:
    preco = float(o.get("price") or 0)
    if not preco or (o.get("stock") is not None and o["stock"] <= 0):
        return None
    candidatos = [(preco, None)]
    if (o.get("priceWithDiscount") or 0) > 0:
        candidatos.append((float(o["priceWithDiscount"]), "oferta do site"))
    clube = o.get("clubSale") if isinstance(o.get("clubSale"), dict) else None
    if clube and (clube.get("priceWithDiscount") or 0) > 0:
        candidatos.append((float(clube["priceWithDiscount"]), "no Clube Goodbom"))
    menor, condicao = min(candidatos, key=lambda x: x[0])
    nome = (o.get("name") or "").strip()
    un = ((o.get("unitOfMeasurement") or {}) if isinstance(o.get("unitOfMeasurement"), dict) else {}).get("abbreviation", "")
    qtd, unidade = embalagem(nome)
    if un.lower() == "kg" or re.search(r"\bkg\s*$", nome, re.I) and not qtd:
        qtd, unidade = 1.0, "kg"             # vendido por quilo
    return {k: v for k, v in {
        "produto": nome.title(),
        "marca": (o.get("brand") or None),
        "quantidade": qtd,
        "unidade": unidade,
        "categoria": (o.get("department") or "").lower() or None,
        "mercado": MERCADO,
        "preco": menor,
        "precoDe": preco if menor < preco else None,
        "condicao": condicao,
        "validoAte": hoje,
        "fonte": "ecommerce",
        "url": f"{BASE}{LOJA}/produto/m/{o['slug']}-{o['modelId']}" if o.get("slug") and o.get("modelId") else None,
    }.items() if v is not None}


def coletar() -> list[dict]:
    hoje = date.today().isoformat()
    vistos, saida = set(), []
    with httpx.Client(timeout=40, follow_redirects=True,
                      headers={"User-Agent": "Mozilla/5.0 (compatible; FastPromotionsMK/0.1; piloto Indaiatuba)"}) as client:
        for dep in departamentos(client.get(BASE + LOJA + "/categorias").text):
            total = 1
            for pagina in range(1, MAX_PAGINAS + 1):
                if pagina > total:
                    break
                try:
                    r = client.get(BASE + dep, params={"page": pagina} if pagina > 1 else None)
                except httpx.TransportError:
                    break
                if r.status_code != 200:
                    break
                rsc = payload(r.text)
                if pagina == 1 and (m := _PAGINAS.search(rsc)):
                    total = int(m.group(1))
                for o in produtos(rsc):
                    if o["id"] in vistos:
                        continue
                    vistos.add(o["id"])
                    if (oferta := para_oferta(o, hoje)):
                        saida.append(oferta)
                time.sleep(PAUSA_S)
    return saida


def main(argv: list[str] | None = None) -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--saida")
    a = ap.parse_args(argv)
    ofertas = coletar()
    texto = json.dumps(ofertas, ensure_ascii=False, indent=2)
    if a.saida:
        open(a.saida, "w", encoding="utf-8").write(texto)
        print(f"{len(ofertas)} produtos salvos em {a.saida}")
    else:
        print(texto)


if __name__ == "__main__":
    main()

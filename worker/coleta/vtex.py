"""Coletor para mercados em VTEX (Covabra, Pague Menos): API pública de catálogo.

Traz preço do site, preço "de", EAN e estoque.

Uso:
    python -m coleta.vtex covabra arroz feijão café --saida covabra.json
    python -m coleta.vtex paguemenos --colecao 161 --saida paguemenos.json   # coleção de ofertas

Os preços valem para o site no dia da coleta; podem diferir da loja física.
"""
from __future__ import annotations

import argparse
import json
import re
import time
from datetime import date

import httpx

LOJAS = {
    "covabra": ("Covabra", "https://www.covabra.com.br"),
    "paguemenos": ("Pague Menos", "https://www.superpaguemenos.com.br"),
    "savegnago": ("Savegnago", "https://www.savegnago.com.br"),
    "atacadao": ("Atacadão", "https://atacadaobr.vtexcommercestable.com.br"),
}
CEP_PADRAO = "13330000"  # Indaiatuba: a VTEX devolve o preço da região deste CEP
PAGINA = 50          # limite da VTEX por requisição
MAX_ITENS = 2500     # a VTEX não pagina além disso (coleções)
MAX_POR_TERMO = 100  # busca textual é aproximada: depois dos primeiros resultados só vem ruído
PAUSA_S = 1.0        # educado com o servidor

TERMOS_CESTA = [
    "arroz", "feijão", "açúcar", "café", "óleo", "leite", "macarrão", "farinha",
    "sal", "margarina", "manteiga", "ovos", "carne", "frango", "batata", "tomate",
    "cebola", "banana", "pão", "papel higiênico", "sabão", "detergente", "creme dental",
]

_EMB = re.compile(r"(\d+(?:[.,]\d+)?)\s*(kg|g|ml|l|lt|un)\b", re.I)


def embalagem(nome: str) -> tuple[float | None, str | None]:
    """'Arroz Camil 5kg' -> (5.0, 'kg'). Usa a última medida do nome."""
    achados = _EMB.findall(nome)
    if not achados:
        return None, None
    qtd, un = achados[-1]
    un = un.lower().replace("lt", "l")
    return float(qtd.replace(",", ".")), un


def _get(client: httpx.Client, url: str, params: dict, tentativas: int = 3) -> httpx.Response:
    """GET com novas tentativas para quedas de conexão (o Pague Menos derruba de vez em quando)."""
    for i in range(tentativas):
        try:
            return client.get(url, params=params)
        except httpx.TransportError:
            if i == tentativas - 1:
                raise
            time.sleep(5 * (i + 1))


def regiao(base: str, cep: str, client: httpx.Client) -> str | None:
    """regionId da VTEX para o CEP; None se a loja não regionaliza preços."""
    resp = client.get(f"{base}/api/checkout/pub/regions", params={"country": "BRA", "postalCode": cep})
    if resp.status_code != 200 or not resp.json():
        return None
    return resp.json()[0].get("id")


def buscar(base: str, client: httpx.Client, termo: str | None = None, colecao: str | None = None,
           region_id: str | None = None) -> list[dict]:
    params = {"ft": termo} if termo else {"fq": f"productClusterIds:{colecao}"}
    if region_id:
        params["regionId"] = region_id
    limite = MAX_POR_TERMO if termo else MAX_ITENS
    itens, inicio = [], 0
    while inicio < limite:
        resp = _get(client, f"{base}/api/catalog_system/pub/products/search",
                    {**params, "_from": inicio, "_to": inicio + PAGINA - 1})
        if resp.status_code >= 500 and not itens and "regionId" in params:
            params.pop("regionId")  # algumas lojas (Savegnago) recusam o regionId: usa o preço padrão
            continue
        if resp.status_code >= 500 and itens:
            break  # algumas lojas falham em páginas profundas; fica com o que já veio
        resp.raise_for_status()
        lote = resp.json()
        itens.extend(lote)
        if len(lote) < PAGINA:
            break
        inicio += PAGINA
        time.sleep(PAUSA_S)
    return itens


def para_oferta(p: dict, mercado: str, hoje: str) -> dict | None:
    sku = p["items"][0]
    oferta = sku["sellers"][0]["commertialOffer"]
    if not oferta.get("AvailableQuantity") or not oferta.get("Price"):
        return None
    qtd, un = embalagem(p["productName"])
    return {k: v for k, v in {
        "produto": p["productName"],
        "marca": p.get("brand"),
        "ean": sku.get("ean") or None,
        "quantidade": qtd,
        "unidade": un,
        "categoria": (p.get("categories") or ["/"])[0].strip("/").split("/")[0] or None,
        "mercado": mercado,
        "preco": oferta["Price"],
        "precoDe": oferta["ListPrice"] if oferta["ListPrice"] > oferta["Price"] else None,
        "validoAte": hoje,
        "fonte": "ecommerce",
        "url": p.get("link"),
    }.items() if v is not None}


def coletar(loja: str, termos: list[str] | None = None, colecao: str | None = None,
            cep: str = CEP_PADRAO) -> list[dict]:
    mercado, base = LOJAS[loja]
    hoje = date.today().isoformat()
    vistos, saida = set(), []
    buscas = [{"colecao": colecao}] if colecao else [{"termo": t} for t in (termos or TERMOS_CESTA)]
    with httpx.Client(timeout=30, follow_redirects=True,
                      headers={"User-Agent": "CestaBasicaFamilia/0.1 (piloto Indaiatuba)"}) as client:
        region_id = regiao(base, cep, client)
        for b in buscas:
            for p in buscar(base, client, region_id=region_id, **b):
                if p["productId"] in vistos:
                    continue
                vistos.add(p["productId"])
                if (o := para_oferta(p, mercado, hoje)):
                    saida.append(o)
            time.sleep(PAUSA_S)
    return saida


def main(argv: list[str] | None = None) -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("loja", choices=LOJAS)
    ap.add_argument("termos", nargs="*", help="termos de busca (padrão: itens da cesta básica)")
    ap.add_argument("--colecao", help="id de coleção VTEX (ex.: 161 = ofertas do Pague Menos)")
    ap.add_argument("--cep", default=CEP_PADRAO)
    ap.add_argument("--saida")
    a = ap.parse_args(argv)
    ofertas = coletar(a.loja, a.termos, a.colecao, a.cep)
    texto = json.dumps(ofertas, ensure_ascii=False, indent=2)
    if a.saida:
        open(a.saida, "w", encoding="utf-8").write(texto)
        print(f"{len(ofertas)} produtos salvos em {a.saida}")
    else:
        print(texto)


if __name__ == "__main__":
    main()

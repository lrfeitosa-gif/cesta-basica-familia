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

# O que uma família compra no mês. Cada termo traz até MAX_POR_TERMO produtos por mercado.
TERMOS_CESTA = [
    # mercearia
    "arroz", "feijão", "açúcar", "café", "óleo", "azeite", "macarrão", "farinha", "sal", "molho de tomate",
    "extrato de tomate", "milho", "ervilha", "atum", "sardinha", "biscoito", "bolacha", "achocolatado",
    "cereal", "aveia", "fubá", "farofa", "maionese", "ketchup", "vinagre", "tempero", "gelatina",
    # laticínios e frios
    "leite", "leite condensado", "creme de leite", "iogurte", "queijo", "requeijão", "manteiga", "margarina",
    "presunto", "mortadela", "salsicha", "linguiça",
    # carnes, ovos, padaria
    "carne", "frango", "peixe", "bacon", "hambúrguer", "ovos", "pão", "bolo",
    # hortifruti
    "batata", "tomate", "cebola", "alho", "banana", "maçã", "laranja", "limão", "cenoura", "alface",
    # bebidas
    "água mineral", "refrigerante", "suco", "cerveja", "heineken", "energético", "vinho",
    # limpeza
    "sabão", "lava roupas", "amaciante", "detergente", "água sanitária", "desinfetante", "esponja",
    "papel toalha", "saco de lixo", "multiuso", "limpador",
    # higiene
    "papel higiênico", "creme dental", "escova dental", "sabonete", "shampoo", "condicionador",
    "desodorante", "absorvente", "fralda", "lenço umedecido",
    # pet
    "ração",
    # Termos específicos dos itens da cesta: na busca genérica ("leite", "arroz") os básicos podem ficar
    # depois do 100º resultado (ex.: leite longa vida no Savegnago aparecia na posição 182).
    "leite longa vida", "leite integral", "leite desnatado", "leite semidesnatado",
    "arroz tipo 1", "arroz branco", "feijão carioca", "feijão preto", "café torrado", "café 500g",
    "óleo de soja", "açúcar refinado", "açúcar cristal", "macarrão espaguete", "farinha de trigo",
    "molho de tomate", "detergente líquido", "papel higiênico folha dupla", "creme dental", "sabão em pó",
]

_EMB = re.compile(r"(\d+(?:[.,]\d+)?)\s*(kg|g|ml|l|lt|litros?|unidades|unidade|unid|und|un|u)\b", re.I)
_DUZIA = re.compile(r"\b(meia\s+)?d[uú]zia\b", re.I)


def embalagem(nome: str) -> tuple[float | None, str | None]:
    """'Arroz Camil 5kg' -> (5.0, 'kg'); 'Ovos ... 13g Protein com 10 Unidades' -> (10.0, 'un');
    'Banana Prata 1 Unidade 180g' -> (180.0, 'g').

    Usa a última medida do nome (entende "Unidades", "unid", "30u"). "Dúzia" vira 12 unidades.
    """
    achados = [(float(q.replace(",", ".")), u.lower()) for q, u in _EMB.findall(nome)]
    achados = [(q, "l" if u in ("lt", "litro", "litros") else "un" if u.startswith("u") else u) for q, u in achados]
    if achados:
        return achados[-1]
    if (m := _DUZIA.search(nome)):
        return (6.0 if m.group(1) else 12.0), "un"
    return None, None


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

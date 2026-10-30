"""Exporta as ofertas do dia em formato compacto para a tela preliminar.

Uso:
    python exportar_ofertas.py saida.json
"""
import json
import sys
from datetime import date

from rodar_coleta import conectar

db = conectar()
mercados = {m["id"]: m["rede"] for m in db.table("mercado").select("id,rede").execute().data}

linhas, inicio = [], 0
while True:
    lote = (db.table("oferta")
            .select("preco,preco_de,condicao,mercado_id,valido_ate,produto(id,nome,marca,quantidade,unidade,categoria,ean)")
            .eq("valido_de", date.today().isoformat())
            .range(inicio, inicio + 999).execute().data)
    linhas += lote
    if len(lote) < 1000:
        break
    inicio += 1000

produtos, idx = [], {}
ofertas = []
nomes_mercado = sorted(set(mercados.values()))
for l in linhas:
    p = l["produto"]
    if p["id"] not in idx:
        idx[p["id"]] = len(produtos)
        produtos.append([p["nome"], p["marca"] or "", p["quantidade"], p["unidade"], p["categoria"], p["ean"] or ""])
    ofertas.append([idx[p["id"]], nomes_mercado.index(mercados[l["mercado_id"]]), l["preco"],
                    l["preco_de"] or 0, l["condicao"] or "", l["valido_ate"] or ""])

json.dump({"data": date.today().isoformat(), "mercados": nomes_mercado, "produtos": produtos, "ofertas": ofertas},
          open(sys.argv[1], "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
print(f"{len(ofertas)} ofertas, {len(produtos)} produtos")

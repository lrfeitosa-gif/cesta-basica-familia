"""Resumo do que está no banco: ofertas por mercado e tamanho do catálogo.

Uso:
    python resumo_banco.py
"""
import os

from supabase import create_client

db = create_client(os.environ["SUPABASE_URL"].split("/rest/v1")[0].rstrip("/"), os.environ["SUPABASE_SERVICE_KEY"])


def contar(tabela: str, **filtros) -> int:
    q = db.table(tabela).select("id", count="exact")
    for campo, valor in filtros.items():
        q = q.eq(campo, valor)
    return q.limit(1).execute().count


for m in db.table("mercado").select("id,rede").order("rede").execute().data:
    print(f"  {m['rede']:14s} {contar('oferta', mercado_id=m['id']):6d} ofertas")
print(f"  {'TOTAL':14s} {contar('oferta'):6d} ofertas | {contar('produto')} produtos no catálogo")

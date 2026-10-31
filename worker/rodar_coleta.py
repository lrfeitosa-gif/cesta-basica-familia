"""Coleta diária: roda todos os coletores e grava produtos e ofertas no Supabase.

Uso:
    python rodar_coleta.py                      # todos os mercados
    python rodar_coleta.py covabra roldao       # só alguns
    python rodar_coleta.py --arquivo prints.json --mercado Assaí   # ofertas já extraídas (prints)

Requer SUPABASE_URL e SUPABASE_SERVICE_KEY (chave service_role: grava ignorando o RLS).
Encartes também precisam de ANTHROPIC_API_KEY.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import unicodedata
from datetime import date, datetime, timedelta, timezone

from supabase import create_client

from coleta import encartes, goodbom, svicente, vtex
from coleta.vtex import embalagem

COLETORES = {
    **{loja: (lambda loja=loja: vtex.coletar(loja)) for loja in vtex.LOJAS},
    **{site: (lambda site=site: encartes.coletar(site)) for site in encartes.SITES},
    "svicente": svicente.coletar,
    "goodbom": goodbom.coletar,
}
REDES = {"svicente": svicente.MERCADO, "goodbom": goodbom.MERCADO}
UNIDADES = {"g", "kg", "ml", "l", "un"}


def conectar():
    """Cliente Supabase. Tolera o que costuma vir junto ao colar: espaços, aspas e o /rest/v1/ da URL."""
    def limpo(nome: str) -> str:
        return os.environ[nome].strip().strip("'\"").strip()
    return create_client(limpo("SUPABASE_URL").split("/rest/v1")[0].rstrip("/"), limpo("SUPABASE_SERVICE_KEY"))


def _norm(s: str | None) -> str:
    s = unicodedata.normalize("NFD", (s or "").lower().strip())
    return " ".join("".join(c for c in s if not unicodedata.combining(c)).split())


def normalizar(o: dict) -> dict | None:
    """Oferta de coletor -> (produto, oferta) no formato das tabelas. None se faltar o essencial."""
    qtd, un = o.get("quantidade"), o.get("unidade")
    if qtd is None or un not in UNIDADES:      # encartes trazem "5 kg" num campo só
        qtd, un = embalagem(o.get("unidade") or o.get("produto", ""))
    if not o.get("preco") or qtd is None or un not in UNIDADES:
        return None
    marca = (o.get("marca") or "").strip() or None
    nome = o["produto"].strip()
    ean = o.get("ean") or None
    chave = ean or f"{_norm(nome)}|{_norm(marca)}|{qtd:g}{un}"
    return {
        "produto": {"chave": chave, "ean": ean, "nome": nome, "marca": marca, "quantidade": qtd, "unidade": un,
                    "categoria": _norm(o.get("categoria")) or "outros"},
        "oferta": {"preco": o["preco"], "preco_de": o.get("precoDe"), "condicao": o.get("condicao"),
                   "valido_ate": o.get("validoAte"), "fonte": "ecommerce" if o.get("fonte") == "ecommerce" else "tabloide",
                   "url": o.get("url"), "descricao_original": nome,
                   "coletado_em": datetime.now(timezone.utc).isoformat()},  # nova coleta no dia atualiza o horário
    }


def dias_de_validade(ofertas: list[dict], maximo: int = 14) -> list[str]:
    """Hoje até o fim da validade do encarte (prints não são recoletados a cada dia)."""
    hoje = date.today()
    fins = [date.fromisoformat(o["validoAte"]) for o in ofertas if o.get("validoAte")]
    fim = min(max(fins, default=hoje), hoje + timedelta(days=maximo))
    return [(hoje + timedelta(days=d)).isoformat() for d in range((fim - hoje).days + 1)]


def gravar(db, mercado: str, ofertas: list[dict], dias: list[str] | None = None) -> int:
    loja = db.table("mercado").select("id").eq("rede", mercado).limit(1).execute().data
    if not loja:
        raise RuntimeError(f"mercado '{mercado}' não cadastrado (rode a migração 0002)")
    mercado_id = loja[0]["id"]
    itens = [n for o in ofertas if (n := normalizar(o))]
    # mesma chave pode vir duas vezes (ex.: dois encartes); fica o menor preço
    por_chave: dict[str, dict] = {}
    for n in itens:
        k = n["produto"]["chave"]
        if k not in por_chave or n["oferta"]["preco"] < por_chave[k]["oferta"]["preco"]:
            por_chave[k] = n
    dias = dias or [date.today().isoformat()]
    total = 0
    lista = list(por_chave.values())
    for i in range(0, len(lista), 200):
        lote = lista[i:i + 200]
        produtos = db.table("produto").upsert([n["produto"] for n in lote], on_conflict="chave").execute().data
        ids = {p["chave"]: p["id"] for p in produtos}
        # oferta de encarte vencida (validade antes do dia) não entra naquele dia
        linhas = [{**n["oferta"], "produto_id": ids[n["produto"]["chave"]], "mercado_id": mercado_id, "valido_de": dia}
                  for n in lote for dia in dias
                  if not n["oferta"]["valido_ate"] or n["oferta"]["valido_ate"] >= dia]
        db.table("oferta").upsert(linhas, on_conflict="produto_id,mercado_id,valido_de,fonte").execute()
        total += len(linhas)
    return total


def main(argv: list[str] | None = None) -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("mercados", nargs="*", help=f"padrão: todos ({', '.join(COLETORES)})")
    ap.add_argument("--arquivo", help="JSON de ofertas já extraídas (ex.: prints do Assaí)")
    ap.add_argument("--mercado", help="rede do --arquivo, como cadastrada (ex.: Assaí)")
    a = ap.parse_args(argv)
    if desconhecidos := set(a.mercados) - set(COLETORES):
        ap.error(f"mercado desconhecido: {', '.join(desconhecidos)}")

    db = conectar()
    if a.arquivo:
        ofertas = json.load(open(a.arquivo, encoding="utf-8-sig"))  # -sig: aceita JSON salvo pelo PowerShell
        dias = dias_de_validade(ofertas)
        if not dias:
            print(f"{a.mercado}: encarte já vencido, nada gravado")
            return
        n = gravar(db, a.mercado, ofertas, dias)
        print(f"{a.mercado}: {n} ofertas gravadas ({dias[0]} a {dias[-1]})")
        return
    falhas = 0
    for nome in a.mercados or COLETORES:
        rede = REDES.get(nome) or (vtex.LOJAS.get(nome) or (None,))[0] or encartes.SITES[nome]["mercado"]
        try:
            n = gravar(db, rede, COLETORES[nome]())
            print(f"{rede}: {n} ofertas gravadas")
        except Exception as erro:  # um mercado com problema não derruba os outros
            falhas += 1
            print(f"{rede}: FALHOU – {erro}", file=sys.stderr)
    sys.exit(1 if falhas else 0)


if __name__ == "__main__":
    main()

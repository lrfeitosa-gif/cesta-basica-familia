"""Liga cada produto dos mercados a um item base do cadastro (tabela item_base, migração 0011).

Regra: a 1ª palavra do nome do produto é a 1ª palavra do item base e as outras palavras do item aparecem no nome
(ou o nome começa com o item inteiro); nenhuma exclusão aparece. Vale o item base mais específico (mais palavras).
Produtos decididos no admin (item_base_origem = 'admin') nunca são mexidos.

Uso:
    python catalogo.py            # liga os produtos ainda sem decisão (rápido; roda depois de cada coleta)
    python catalogo.py --tudo     # refaz a ligação de todos (depois de mudar exclusões no cadastro)
"""
from __future__ import annotations

import argparse
import re
import unicodedata

LIGACAO = {"de", "do", "da", "em", "com", "e", "tipo", "1", "500g"}


def norm(s: str | None) -> str:
    s = unicodedata.normalize("NFD", (s or "").lower())
    s = "".join(c for c in s if not unicodedata.combining(c))
    return " ".join(re.sub(r"[^a-z0-9 ]+", " ", s).split())


def raiz(w: str) -> str:
    """Singular simples: 'ovos' -> 'ovo', 'limoes' -> 'limo' (vale igual para item e produto)."""
    if w.endswith("es") and len(w) > 4:
        return w[:-2]
    if w.endswith("s") and len(w) > 3:
        return w[:-1]
    return w


class Catalogo:
    def __init__(self, itens: list[dict]):
        self.itens = []
        for i in itens:
            t = [raiz(w) for w in norm(i["termo"]).split() if w not in LIGACAO]
            if t:
                self.itens.append((i["id"], t, [f" {norm(e)} " for e in i.get("exclusoes") or [] if norm(e)]))
        self.itens.sort(key=lambda x: len(x[1]), reverse=True)   # mais específico primeiro

    def classificar(self, nome: str) -> int | None:
        n = norm(nome)
        ws = [raiz(w) for w in n.split()]
        if not ws:
            return None
        com_espaco = f" {n} "
        for id_, t, exc in self.itens:
            casa = (ws[0] == t[0] and all(x in ws for x in t[1:])) or (len(t) > 1 and ws[:len(t)] == t)
            if casa and not any(e in com_espaco for e in exc):
                return id_
        return None


def carregar(db) -> Catalogo:
    return Catalogo(db.table("item_base").select("id,termo,exclusoes").eq("ativo", True).execute().data)


def ligar(db, produtos: list[dict], cat: Catalogo | None = None) -> int:
    """Grava item_base_id/origem dos produtos (id, nome). Ignora os decididos no admin. Devolve quantos ligou."""
    cat = cat or carregar(db)
    grupos: dict[int | None, list[int]] = {}
    for p in produtos:
        grupos.setdefault(cat.classificar(p["nome"]), []).append(p["id"])
    ligados = 0
    for item, ids in grupos.items():
        for i in range(0, len(ids), 300):
            (db.table("produto").update({"item_base_id": item, "item_base_origem": "regra" if item else "sem"})
             .in_("id", ids[i:i + 300]).or_("item_base_origem.is.null,item_base_origem.neq.admin").execute())
        if item:
            ligados += len(ids)
    return ligados


def main() -> None:
    from rodar_coleta import conectar
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--tudo", action="store_true")
    a = ap.parse_args()
    db = conectar()
    cat = carregar(db)
    total = ligados = 0
    ultimo = 0
    while True:
        q = db.table("produto").select("id,nome").gt("id", ultimo).order("id").limit(1000)
        if not a.tudo:
            q = q.is_("item_base_origem", "null")
        lote = q.execute().data
        if not lote:
            break
        ligados += ligar(db, lote, cat)
        total += len(lote)
        ultimo = lote[-1]["id"]
    print(f"catálogo: {total} produtos verificados, {ligados} ligados a um item base, {total - ligados} sem item base")


if __name__ == "__main__":
    main()

"""Planilha para o cadastro base: decidir em Excel o item de cada produto da fila, e gerar o SQL da decisão.

    # 1) baixa a fila (produtos sem item base) para uma planilha
    python planilha_cadastro.py exportar --saida fila_cadastro.xlsx

    # 2) depois de preencher a coluna "Decisão" (e criar itens novos na aba Itens), gera o SQL
    python planilha_cadastro.py importar fila_cadastro.xlsx --saida cadastro_decisoes.sql

O SQL roda no SQL Editor do Supabase, numa transação. Só a leitura usa a API: SUPABASE_URL e SUPABASE_ANON_KEY
(a chave pública do app). Decisões gravadas como 'admin' (a regra automática não mexe mais) ou 'fora' (fora da cesta).
"""
from __future__ import annotations

import argparse
import os
import sys
import unicodedata
from collections import Counter, defaultdict

import httpx
from openpyxl import Workbook, load_workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.datavalidation import DataValidation

FORA = "FORA DA CESTA"
MAX_ITENS = 3000          # linhas reservadas na aba Itens para a lista suspensa (existentes + novos)
LIGACAO = {"de", "da", "do", "das", "dos", "com", "e", "em", "para", "sem", "tipo"}


def norm(s: str | None) -> str:
    s = unicodedata.normalize("NFD", (s or "").lower())
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return " ".join("".join(c if c.isalnum() else " " for c in s).split())


def primeira_palavra(nome: str) -> str:
    ws = [w for w in norm(nome).split() if w not in LIGACAO and not w[0].isdigit()]
    return ws[0] if ws else "(sem nome)"


# ---------------------------------------------------------------- leitura (API pública)
def api() -> httpx.Client:
    url, chave = os.environ.get("SUPABASE_URL"), os.environ.get("SUPABASE_ANON_KEY")
    if not url or not chave:
        sys.exit("Defina SUPABASE_URL e SUPABASE_ANON_KEY (chave pública do app).")
    return httpx.Client(base_url=f"{url}/rest/v1", timeout=60,
                        headers={"apikey": chave, "Authorization": f"Bearer {chave}"})


def tudo(c: httpx.Client, tabela: str, params: dict) -> list[dict]:
    """Todas as linhas, de 1000 em 1000 (limite da API)."""
    linhas, ini = [], 0
    while True:
        r = c.get(f"/{tabela}", params=params, headers={"Range": f"{ini}-{ini + 999}"})
        r.raise_for_status()
        lote = r.json()
        linhas += lote
        if len(lote) < 1000:
            return linhas
        ini += 1000


def exportar(saida: str) -> None:
    c = api()
    itens = tudo(c, "item_base", {"select": "id,termo,nome,exclusoes,ativo", "order": "nome"})
    fila = tudo(c, "produto", {"select": "id,nome,marca,quantidade,unidade,categoria,ean",
                               "item_base_origem": "eq.sem", "order": "id"})
    fila += tudo(c, "produto", {"select": "id,nome,marca,quantidade,unidade,categoria,ean",
                                "item_base_origem": "is.null", "order": "id"})
    # mercados e menor preço de hoje (último dia com coleta dos sites)
    dia = c.get("/oferta", params={"select": "valido_de", "fonte": "eq.ecommerce", "order": "valido_de.desc",
                                   "limit": 1}).json()[0]["valido_de"]
    ofertas = tudo(c, "oferta", {"select": "produto_id,preco,mercado(rede)", "valido_de": f"eq.{dia}"})
    mercados: dict[int, set[str]] = defaultdict(set)
    menor: dict[int, float] = {}
    for o in ofertas:
        pid = o["produto_id"]
        mercados[pid].add(o["mercado"]["rede"])
        menor[pid] = min(menor.get(pid, float("inf")), float(o["preco"]))

    # sugestão: item ativo cuja 1ª palavra do termo é a 1ª palavra do produto
    por_palavra: dict[str, list[str]] = defaultdict(list)
    for i in itens:
        if i["ativo"]:
            por_palavra[primeira_palavra(i["termo"])].append(i["nome"])

    fila.sort(key=lambda p: (primeira_palavra(p["nome"]), norm(p["nome"])))
    grupos = Counter(primeira_palavra(p["nome"]) for p in fila)

    wb = Workbook()
    cab = Font(bold=True, color="FFFFFF")
    fundo = PatternFill("solid", fgColor="4F7F5C")
    decidir = PatternFill("solid", fgColor="FFF4CC")

    def cabecalho(ws, colunas: list[tuple[str, int]]):
        for j, (t, w) in enumerate(colunas, 1):
            cel = ws.cell(row=1, column=j, value=t)
            cel.font, cel.fill = cab, fundo
            ws.column_dimensions[get_column_letter(j)].width = w
        ws.freeze_panes = "A2"

    # ---- Como usar
    ws = wb.active
    ws.title = "Como usar"
    ws.column_dimensions["A"].width = 120
    for i, t in enumerate([
        "Planilha do cadastro base: decidir o item genérico de cada produto da fila (produtos sem item base).",
        "",
        "1. Aba Grupos: uma linha por 1ª palavra do nome. A Decisão do grupo vale para todos os produtos dele.",
        "2. Aba Produtos: uma linha por produto. A Decisão do produto vale mais que a do grupo (use para exceções).",
        "3. Decisão: escolha um item na lista, ou FORA DA CESTA (produto que não é de cesta: esmalte, salgadinho...).",
        "   Deixe em branco para não mexer (o produto continua na fila).",
        "4. Item que não existe: na aba Itens, escreva o Nome numa linha vazia no fim (Termo e Exclusões são opcionais).",
        "   Ele passa a aparecer na lista suspensa. O Termo são as palavras-chave da regra automática (sem acento);",
        "   em branco, usamos o nome. Exclusões: palavras separadas por vírgula que tiram produtos do item.",
        "5. Salve e me envie a planilha (ou rode: python planilha_cadastro.py importar <arquivo>).",
        "   Sai um .sql para rodar no SQL Editor do Supabase. Itens novos também valem para os produtos que chegarem depois.",
        "",
        "Não mude a coluna Id nem a ordem das colunas. Filtros do Excel (setinha no cabeçalho) ajudam a decidir em lote.",
    ], 1):
        ws.cell(row=i, column=1, value=t).font = Font(bold=(i == 1))

    # ---- Itens (fonte da lista suspensa)
    wi = wb.create_sheet("Itens")
    cabecalho(wi, [("Nome", 34), ("Termo", 28), ("Exclusões", 50), ("Situação", 14), ("Id", 8)])
    wi.cell(row=2, column=1, value=FORA)
    wi.cell(row=2, column=4, value="especial")
    for r, i in enumerate(itens, 3):
        wi.cell(row=r, column=1, value=i["nome"])
        wi.cell(row=r, column=2, value=i["termo"])
        wi.cell(row=r, column=3, value=", ".join(i["exclusoes"] or []))
        wi.cell(row=r, column=4, value="existente" if i["ativo"] else "inativo")
        wi.cell(row=r, column=5, value=i["id"])
    lista = f"=Itens!$A$2:$A${MAX_ITENS}"

    def validacao(ws_, coluna: str, ate: int):
        dv = DataValidation(type="list", formula1=lista, allow_blank=True, showErrorMessage=True,
                            errorTitle="Item não encontrado",
                            error="Escolha um item da lista. Para um item novo, crie antes na aba Itens.")
        ws_.add_data_validation(dv)
        dv.add(f"{coluna}2:{coluna}{ate}")

    # ---- Grupos
    wg = wb.create_sheet("Grupos", 1)
    cabecalho(wg, [("Grupo (1ª palavra)", 22), ("Produtos", 10), ("Exemplos", 90), ("Sugestão", 26),
                   ("Decisão do grupo", 30)])
    exemplos: dict[str, list[str]] = defaultdict(list)
    for p in fila:
        g = primeira_palavra(p["nome"])
        if len(exemplos[g]) < 4:
            exemplos[g].append(p["nome"])
    for r, (g, n) in enumerate(sorted(grupos.items(), key=lambda x: -x[1]), 2):
        wg.cell(row=r, column=1, value=g)
        wg.cell(row=r, column=2, value=n)
        wg.cell(row=r, column=3, value=" | ".join(exemplos[g]))
        wg.cell(row=r, column=4, value=" / ".join(por_palavra.get(g, [])) or None)
        wg.cell(row=r, column=5).fill = decidir
    validacao(wg, "E", len(grupos) + 1)
    wg.auto_filter.ref = f"A1:E{len(grupos) + 1}"

    # ---- Produtos
    wp = wb.create_sheet("Produtos", 2)
    cabecalho(wp, [("Id", 9), ("Grupo", 16), ("Produto", 60), ("Marca", 18), ("Embalagem", 11), ("Categoria", 18),
                   ("Mercados hoje", 30), ("Menor preço hoje", 12), ("Sugestão", 24), ("Decisão", 30)])
    for r, p in enumerate(fila, 2):
        g = primeira_palavra(p["nome"])
        q = float(p["quantidade"]) if p["quantidade"] is not None else None
        valores = [p["id"], g, p["nome"], p["marca"], f"{q:g} {p['unidade']}" if q is not None else None,
                   p["categoria"], ", ".join(sorted(mercados.get(p["id"], []))) or None,
                   menor.get(p["id"]), " / ".join(por_palavra.get(g, [])) or None, None]
        for j, v in enumerate(valores, 1):
            wp.cell(row=r, column=j, value=v)
        wp.cell(row=r, column=8).number_format = '"R$" #,##0.00'
        wp.cell(row=r, column=10).fill = decidir
    validacao(wp, "J", len(fila) + 1)
    wp.auto_filter.ref = f"A1:J{len(fila) + 1}"
    for ws_ in (wg, wp):
        for row in ws_.iter_rows(min_row=2):
            for cel in row:
                cel.alignment = Alignment(vertical="top")

    wb.save(saida)
    print(f"{saida}: {len(fila)} produtos em {len(grupos)} grupos; {len(itens)} itens base (dia {dia}).")


# ---------------------------------------------------------------- importação (planilha -> SQL)
def sql_txt(s: str) -> str:
    return "'" + s.replace("'", "''") + "'"


def importar(arquivo: str, saida: str) -> None:
    wb = load_workbook(arquivo, data_only=True)
    # itens: existentes (com Id) e novos (sem Id)
    por_nome: dict[str, str] = {}      # nome normalizado -> expressão SQL do id do item
    novos: list[tuple[str, str, list[str]]] = []
    termos_vistos: set[str] = set()
    for nome, termo, exclusoes, _situacao, iid in wb["Itens"].iter_rows(min_row=2, max_col=5, values_only=True):
        if not nome or str(nome).strip() == FORA:
            continue
        nome = str(nome).strip()
        if iid:
            por_nome[norm(nome)] = str(int(iid))
            continue
        t = norm(str(termo)) if termo else norm(nome)
        if not t or t in termos_vistos:
            continue
        termos_vistos.add(t)
        exc = [norm(x) for x in str(exclusoes or "").split(",") if norm(x)]
        novos.append((nome, t, exc))
        por_nome[norm(nome)] = f"(select id from item_base where termo = {sql_txt(t)})"

    def destino(valor) -> str | None:
        if not valor or not str(valor).strip():
            return None
        v = str(valor).strip()
        if v == FORA:
            return FORA
        if norm(v) not in por_nome:
            sys.exit(f"Decisão '{v}' não é um item da aba Itens. Crie o item lá ou corrija a decisão.")
        return norm(v)

    do_grupo = {str(g): destino(d) for g, _n, _e, _s, d in wb["Grupos"].iter_rows(min_row=2, max_col=5, values_only=True) if g}
    decisao: dict[str, list[int]] = defaultdict(list)
    for linha in wb["Produtos"].iter_rows(min_row=2, max_col=10, values_only=True):
        pid, grupo, dec = linha[0], linha[1], linha[9]
        if not pid:
            continue
        alvo = destino(dec) or do_grupo.get(str(grupo))
        if alvo:
            decisao[alvo].append(int(pid))

    so_fila = "and coalesce(item_base_origem, 'sem') = 'sem'"   # não mexe no que já foi decidido depois do download
    out = ["-- Decisões do cadastro base vindas da planilha. Rode inteiro no SQL Editor (tudo ou nada).", "begin;", ""]
    if novos:
        out.append("-- itens novos")
        for nome, t, exc in novos:
            arr = "array[" + ", ".join(sql_txt(e) for e in exc) + "]::text[]" if exc else "'{}'::text[]"
            out.append(f"insert into item_base (termo, nome, exclusoes) values ({sql_txt(t)}, {sql_txt(nome)}, {arr})"
                       " on conflict (termo) do nothing;")
        out.append("")
    total = 0
    for alvo, ids in sorted(decisao.items(), key=lambda x: x[0]):
        total += len(ids)
        for k in range(0, len(ids), 1000):
            lote = ", ".join(map(str, ids[k:k + 1000]))
            if alvo == FORA:
                out.append(f"update produto set item_base_id = null, item_base_origem = 'fora' where id in ({lote}) {so_fila};")
            else:
                out.append(f"update produto set item_base_id = {por_nome[alvo]}, item_base_origem = 'admin' "
                           f"where id in ({lote}) {so_fila};")
    out += ["", "commit;", ""]
    with open(saida, "w", encoding="utf-8") as f:
        f.write("\n".join(out))
    fora = len(decisao.get(FORA, []))
    print(f"{saida}: {len(novos)} itens novos; {total} produtos decididos ({total - fora} ligados a itens, {fora} fora da cesta).")


def main(argv: list[str] | None = None) -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    e = sub.add_parser("exportar")
    e.add_argument("--saida", default="fila_cadastro.xlsx")
    i = sub.add_parser("importar")
    i.add_argument("arquivo")
    i.add_argument("--saida", default="cadastro_decisoes.sql")
    a = ap.parse_args(argv)
    exportar(a.saida) if a.cmd == "exportar" else importar(a.arquivo, a.saida)


if __name__ == "__main__":
    main()

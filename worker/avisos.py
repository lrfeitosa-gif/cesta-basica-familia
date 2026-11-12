"""Avisos automáticos dos alertas: notificação no celular (push) e e-mail, uma vez por dia depois da coleta.

Para cada alerta (item_interesse com termo) de cada família, procura nos preços de hoje do mesmo jeito que a tela
Alertas do app (busca com foco, marca, versões zero/diet/sem lactose) e avisa quando:
  1. o preço chegou no preço-alvo da família;
  2. está pelo menos 15% abaixo do menor preço típico do último mês (média dos menores preços de cada dia nos
     30 dias anteriores): "bom momento para abastecer a despensa" (item 6 da lista de 12/11);
  3. está pelo menos 15% abaixo do preço normal da própria oferta ("de R$ X por R$ Y").

Antispam: um aviso por alerta a cada 7 dias, salvo se o preço ficou ainda mais baixo (3% ou mais).
Cada família recebe um só aviso por dia, juntando os itens. Tudo fica registrado na tabela `alerta`.

Variáveis: SUPABASE_URL, SUPABASE_SERVICE_KEY; VAPID_PRIVATE_KEY (celular); RESEND_API_KEY e
AVISO_EMAIL_REMETENTE (e-mail; sem domínio próprio a Resend só entrega para o dono da conta).

Uso:
    python avisos.py             # envia e registra
    python avisos.py --simular   # só mostra o que seria enviado
"""
from __future__ import annotations

import argparse
import json
import os
import re
import time
import unicodedata
from collections import defaultdict
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

import httpx

from motor.regras import _norm as chave_marca
from rodar_coleta import conectar, tentar

APP = "https://cesta-basica-familia.vercel.app"
DESCONTO_MIN = 0.15
DIAS_ANTISPAM = 7
DIAS_REFERENCIA = 30
DIAS_MIN_REFERENCIA = 10          # sem pelo menos 10 dias de histórico, não compara com o mês
VERSOES = [r"zero alcool|sem alcool|0,0%|0\.0%", r"zero lactose|sem lactose", r"diet", r"light", r"zero"]
PERECIVEIS = {"Hortifruti", "Açougue", "Padaria", "Laticínios e frios"}
GRUPOS = [
    ("Hortifruti", r"horti|fruta|legume|verdura|feira"),
    ("Açougue", r"acougue|carne|aves|frango|peixe|suino|bovino"),
    ("Laticínios e frios", r"latic|frios|queijo|iogurte"),
    ("Padaria", r"padaria|paes|bolo|rotisseria"),
    ("Bebidas", r"bebida|cerveja|refrigerante|suco|agua"),
    ("Limpeza", r"limpeza|lavanderia"),
    ("Higiene", r"higiene|perfumaria|beleza|cuidados|fralda|bebe"),
    ("Congelados", r"congelad"),
    ("Mercearia", r"mercearia|alimento|matinal|cafe da manha|doce|biscoito|massa|grao|enlatad|tempero|suplement|vitamina"),
    ("Pet", r"pet"),
]
GRAFIAS = [["taiti", "tahiti"], ["ketchup", "catchup"]]


# --- busca: mesma regra de web/lib/ofertas.ts ---------------------------------------------------------------

def norm(s: str | None) -> str:
    t = unicodedata.normalize("NFD", s or "")
    return "".join(c for c in t if not unicodedata.combining(c)).lower()


def grupo(categoria: str | None) -> str:
    c = norm(categoria)
    return next((g for g, re_ in GRUPOS if re.search(re_, c)), "Outros")


def texto_busca(o: dict) -> str:
    q = o["q"]
    q = int(q) if float(q).is_integer() else q
    return norm(f"{o['nome']} {o['marca']} {q}{o['u']} {o['categoria']} {grupo(o['categoria'])} {o['mercado']}")


def _variantes(t: str) -> list[str]:
    for g in GRAFIAS:
        if t in g:
            return g
    return [t[:-1] if len(t) >= 5 and re.search(r"[^s]s$", t) and not re.search(r"\d", t) else t]


def _partes(lista: list[dict], consulta: str) -> tuple[list[list[str]], list[str]]:
    texto = re.sub(r"(\d+)\s+(kg|g|ml|l)\b", r"\1\2", norm(consulta))
    texto = re.sub(r"(^|\s)-\s+(?=\S)", r"\1-", texto)
    partes: list[str] = []
    for t in texto.split():
        m = re.match(r"^(-?[^-]+)-(.+)$", t)
        if not m or any(t.lstrip("-") in o["busca"] for o in lista):
            partes.append(t)
        else:
            partes += [m[1]] + [f"-{x}" for x in m[2].split("-") if x]
    termos = [_variantes(t) for t in partes if not t.startswith("-")]
    fora = [t[1:] for t in partes if t.startswith("-") and len(t) > 1]
    return termos, fora


def filtrar_foco(lista: list[dict], consulta: str) -> list[dict]:
    termos, fora = _partes(lista, consulta)
    if not termos:
        return []
    achados = [o for o in lista if all(any(t in o["busca"] for t in vs) for vs in termos)
               and not any(t in o["busca"] for t in fora)]
    foco = [o for o in achados if norm(o["nome"]).startswith(termos[0][0])]
    return foco or achados


def achar(alerta: dict, lista: list[dict]) -> list[dict]:
    achados = filtrar_foco(lista, alerta["termo"])
    if alerta.get("marca"):
        d = chave_marca(alerta["marca"])
        achados = [o for o in achados if chave_marca(o["marca"]) == d or chave_marca(o["marca"]).startswith(f"{d} ")]
    t = norm(f"{alerta['termo']} {alerta.get('marca') or ''}")
    achados = [o for o in achados if all(not re.search(v, norm(o["nome"])) or re.search(v, t) for v in VERSOES)]
    return sorted(achados, key=lambda o: o["preco"])


# --- preço típico do último mês --------------------------------------------------------------------------

def referencia_mes(db, ofertas: list[dict], ub: str, hoje: date) -> float | None:
    """Média, nos 30 dias antes de hoje, do menor preço por medida de cada dia entre os produtos achados."""
    ids = [o["id"] for o in ofertas if o["ub"] == ub][:200]
    if not ids:
        return None
    linhas = tentar(lambda: db.table("oferta").select("id,produto:produto_id(id,quantidade,unidade)")
                    .in_("id", ids).execute().data) or []
    base = {}
    for l in linhas:
        p = l.get("produto") or {}
        if p.get("quantidade"):
            base[p["id"]] = float(p["quantidade"]) / (1000 if p.get("unidade") in ("g", "ml") else 1)
    if not base:
        return None
    inicio = hoje - timedelta(days=DIAS_REFERENCIA)
    periodos = tentar(lambda: db.table("oferta_periodo").select("produto_id,preco,de,ate")
                      .in_("produto_id", list(base)).gte("ate", inicio.isoformat())
                      .lt("de", hoje.isoformat()).execute().data) or []
    menor_do_dia: dict[date, float] = {}
    for p in periodos:
        un = float(p["preco"]) / base[p["produto_id"]]
        d = max(date.fromisoformat(p["de"]), inicio)
        fim = min(date.fromisoformat(p["ate"]), hoje - timedelta(days=1))
        while d <= fim:
            if un < menor_do_dia.get(d, float("inf")):
                menor_do_dia[d] = un
            d += timedelta(days=1)
    if len(menor_do_dia) < DIAS_MIN_REFERENCIA:
        return None
    return sum(menor_do_dia.values()) / len(menor_do_dia)


# --- decisão ---------------------------------------------------------------------------------------------

@dataclass
class Aviso:
    familia_id: str
    alerta: dict
    oferta: dict
    motivo: str
    desconto: float | None
    texto: str


def brl(v: float) -> str:
    return f"R$ {v:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


def decidir(db, alerta: dict, lista: list[dict], hoje: date) -> Aviso | None:
    achados = achar(alerta, lista)
    if not achados:
        return None
    melhor = achados[0]
    nome = f"{melhor['nome']} no {melhor['mercado']}"
    if alerta.get("preco_alvo") is not None and melhor["preco"] <= float(alerta["preco_alvo"]):
        return Aviso(alerta["familia_id"], alerta, melhor, "preco_alvo", None,
                     f"{nome} por {brl(melhor['preco'])}: chegou no seu preço-alvo de {brl(float(alerta['preco_alvo']))}.")
    if alerta.get("preco_alvo") is not None:
        return None   # com preço-alvo, só avisa quando chega nele (igual à tela)
    # o melhor preço por medida entre os achados com a medida mais comum (kg, l ou un)
    mesma = [o for o in achados if o["ub"] == melhor["ub"]]
    barato = min(mesma, key=lambda o: o["porUn"])
    ref = referencia_mes(db, achados, barato["ub"], hoje)
    if ref and barato["porUn"] <= ref * (1 - DESCONTO_MIN):
        pct = round((1 - barato["porUn"] / ref) * 100)
        despensa = "" if grupo(barato["categoria"]) in PERECIVEIS else " Bom momento para abastecer a despensa."
        return Aviso(alerta["familia_id"], alerta, barato, "abaixo_mes", pct,
                     f"{barato['nome']} no {barato['mercado']} por {brl(barato['preco'])}: "
                     f"{pct}% abaixo do menor preço típico do último mês.{despensa}")
    if melhor["de"] and melhor["de"] > melhor["preco"] and 1 - melhor["preco"] / melhor["de"] >= DESCONTO_MIN:
        pct = round((1 - melhor["preco"] / melhor["de"]) * 100)
        return Aviso(alerta["familia_id"], alerta, melhor, "abaixo_media", pct,
                     f"{nome} de {brl(melhor['de'])} por {brl(melhor['preco'])} ({pct}% abaixo do preço normal).")
    return None


def recente(db, alerta_id: int, hoje: date) -> dict | None:
    desde = (hoje - timedelta(days=DIAS_ANTISPAM)).isoformat()
    r = tentar(lambda: db.table("alerta").select("preco,enviado_em").eq("item_interesse_id", alerta_id)
               .gte("enviado_em", desde).order("enviado_em", desc=True).limit(1).execute().data)
    return r[0] if r else None


# --- envio -----------------------------------------------------------------------------------------------

def enviar_push(db, subs: list[dict], titulo: str, corpo: str) -> bool:
    chave = os.environ.get("VAPID_PRIVATE_KEY", "").strip()
    if not chave or not subs:
        return False
    from pywebpush import WebPushException, webpush
    ok = False
    for s in subs:
        try:
            webpush(subscription_info={"endpoint": s["endpoint"], "keys": s["keys"]},
                    data=json.dumps({"title": titulo, "body": corpo, "url": "/alertas"}),
                    vapid_private_key=chave, vapid_claims={"sub": APP}, ttl=12 * 3600)
            ok = True
        except WebPushException as e:
            status = getattr(e.response, "status_code", None)
            if status in (404, 410):   # o aparelho cancelou a autorização: some da lista
                tentar(lambda: db.table("push_subscription").delete().eq("id", s["id"]).execute())
            print(f"  push falhou ({status}): {str(e)[:120]}")
    return ok


def enviar_email(para: str, titulo: str, avisos: list[Aviso]) -> bool:
    chave = os.environ.get("RESEND_API_KEY", "").strip()
    if not chave or not para:
        return False
    itens = "".join(f"<li style='margin:0 0 10px'>{a.texto}</li>" for a in avisos)
    html = (f"<div style='font-family:system-ui,sans-serif;font-size:15px;line-height:1.45;color:#1b2430'>"
            f"<p>Bom dia! Hoje os preços de alguns itens dos seus alertas estão bons:</p><ul>{itens}</ul>"
            f"<p><a href='{APP}/alertas'>Ver os alertas no app</a></p>"
            f"<p style='color:#6b7686;font-size:13px'>Você recebe este e-mail porque ligou o aviso por e-mail em Alertas. "
            f"Para parar, desligue lá.</p></div>")
    r = httpx.post("https://api.resend.com/emails", timeout=30, headers={"Authorization": f"Bearer {chave}"}, json={
        "from": os.environ.get("AVISO_EMAIL_REMETENTE") or "Cesta Básica Família <onboarding@resend.dev>",
        "to": [para], "subject": titulo, "html": html})
    if r.status_code >= 300:
        print(f"  e-mail falhou ({r.status_code}): {r.text[:160]}")
    return r.status_code < 300


def buscar_lista(tentativas: int = 6) -> list[dict]:
    """Preços do dia montados pelo app. A rota às vezes responde 502 quando monta a lista de novo (visto em 12/11):
    tenta de novo com espera crescente antes de desistir."""
    for i in range(tentativas):
        try:
            r = httpx.get(f"{APP}/api/ofertas", timeout=90)
            r.raise_for_status()
            return r.json()["lista"]
        except (httpx.HTTPError, KeyError, ValueError) as e:
            print(f"api/ofertas: tentativa {i + 1} falhou ({str(e)[:80]})")
            if i == tentativas - 1:
                raise
            time.sleep(15 * (i + 1))
    return []


def main(argv: list[str] | None = None) -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--simular", action="store_true", help="não envia nem registra")
    a = ap.parse_args(argv)

    hoje = datetime.now(ZoneInfo("America/Sao_Paulo")).date()
    db = conectar()
    lista = buscar_lista()
    for o in lista:
        o["busca"] = texto_busca(o)
    print(f"preços de hoje: {len(lista)}")

    alertas = tentar(lambda: db.table("item_interesse").select("id,familia_id,termo,marca,preco_alvo")
                     .not_.is_("termo", "null").execute().data) or []
    avisos: dict[str, list[Aviso]] = defaultdict(list)
    for al in alertas:
        av = decidir(db, al, lista, hoje)
        if not av:
            continue
        ult = recente(db, al["id"], hoje)
        if ult and ult.get("preco") is not None and av.oferta["preco"] > float(ult["preco"]) * 0.97:
            continue
        avisos[al["familia_id"]].append(av)

    if not avisos:
        print("avisos: nenhum hoje")
        return
    familias = {f["id"]: f for f in tentar(lambda: db.table("familia").select("id,aviso_celular,aviso_email")
                                          .in_("id", list(avisos)).execute().data) or []}
    emails = {}
    if any(f.get("aviso_email") for f in familias.values()):
        for u in tentar(lambda: db.auth.admin.list_users()) or []:
            emails[u.id] = u.email

    for fam, lst in avisos.items():
        f = familias.get(fam, {})
        titulo = lst[0].texto.split(":")[0] if len(lst) == 1 else f"{len(lst)} itens dos seus alertas com preço bom hoje"
        corpo = lst[0].texto if len(lst) == 1 else "\n".join(f"• {x.texto}" for x in lst[:4])
        print(f"família {fam[:8]}: {len(lst)} aviso(s)")
        for x in lst:
            print(f"  - {x.motivo}: {x.texto}")
        if a.simular:
            continue
        canais = []
        if f.get("aviso_celular", True):
            subs = tentar(lambda: db.table("push_subscription").select("id,endpoint,keys")
                          .eq("familia_id", fam).execute().data) or []
            if enviar_push(db, subs, titulo, corpo):
                canais.append("celular")
        if f.get("aviso_email") and enviar_email(emails.get(fam, ""), titulo, lst):
            canais.append("email")
        agora = datetime.now(timezone.utc).isoformat()
        tentar(lambda: db.table("alerta").insert([{
            "familia_id": fam, "item_interesse_id": x.alerta["id"], "oferta_id": x.oferta["id"], "motivo": x.motivo,
            "desconto_pct": x.desconto, "preco": x.oferta["preco"], "mercado": x.oferta["mercado"],
            "mensagem": x.texto, "canais": canais, "enviado_em": agora,
        } for x in lst]).execute())
        print(f"  enviado por: {', '.join(canais) or 'nenhum canal ativo (fica só no app)'}")


if __name__ == "__main__":
    main()

"""Coletor de encartes publicados como PDF/imagem no site do mercado (Sumerbol, Roldão, Revolução, Assaí, Cato).

Acha os arquivos na página de ofertas e passa cada um pelo extrator.

Uso:
    python -m coleta.encartes roldao --listar      # só mostra os encartes encontrados
    python -m coleta.encartes sumerbol --saida sumerbol.json
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import time
from datetime import date, datetime

import httpx

from coleta.extrator import extrair, para_artifact

UA_NAVEGADOR = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/130.0 Safari/537.36")

# Assaí: a página da loja monta os jornais com este JSON público, que lista os jornais de todas as lojas
ASSAI_JSON = "https://www.assai.com.br/sites/default/files/static/ofertas_assai.json"
ASSAI_PAGINA = "https://www.assai.com.br/ofertas/sao-paulo/assai-indaiatuba"
ASSAI_LOJA_ID = 178          # "Assaí Indaiatuba" na lista de lojas do mesmo JSON (tid 1534)

# Cato: a página de folhetos é um app Angular; as páginas do folheto só aparecem depois de abrir no navegador
CATO_PAGINA = "https://www.catosupermercados.com.br/folhetos"
CATO_IMAGEM = re.compile(r"https://cdn\.regexsolutions\.com\.br/production/folheto/[^\"'\s)]+\.(?:webp|jpe?g|png|pdf)", re.I)

# pagina: onde os encartes ficam; padrao: regex do arquivo; ignorar: nomes que não são encarte
SITES = {
    "sumerbol": {
        "mercado": "Sumerbol",
        "pagina": "https://www.sumerbol.com.br/artigos/nossas-ofertas",
        "padrao": r"https://www\.sumerbol\.com\.br/uploads/[^\"']+\.(?:pdf|jpe?g|png|webp)",
        "ignorar": [],
    },
    "roldao": {
        "mercado": "Roldão",
        "pagina": "https://roldao.com.br/ofertas/",
        # só uploads do mês corrente: o resto da pasta são logos de marcas parceiras e banners antigos
        "padrao": r"https://roldao\.com\.br/wp-content/uploads/{ano}/{mes:02d}/[^\"'\s]+\.(?:pdf|jpe?g|png)",
        "ignorar": ["Aspect-Ratio", "marcas-parceiras", "Relatorio", "ITU-"],  # ITU-: encarte de outra cidade
    },
    "revolucao": {
        "mercado": "Revolução",
        # o botão "Ofertas para Indaiatuba" do site abre sempre esta imagem (assets/script.js), trocada a cada folheto
        "arquivos": ["https://www.supermercadosrevolucao.com.br/assets/indaiatuba.jpg"],
    },
    "assai": {
        "mercado": "Assaí",
        "buscar": lambda: assai_jornais(),
        "cabecalhos": {"Referer": "https://www.assai.com.br/", "User-Agent": UA_NAVEGADOR},
    },
    "cato": {
        "mercado": "Cato",
        "buscar": lambda: [(u, None, None) for u in cato_paginas()],
        "cabecalhos": {"Referer": "https://www.catosupermercados.com.br/",
                       "Origin": "https://www.catosupermercados.com.br", "User-Agent": UA_NAVEGADOR},
        # a validade vem escrita no folheto: folheto que ainda não começou fica para o dia dele
        "pular_futuro": True,
    },
}


def _data_br(texto: str | None) -> str | None:
    """'13/11/2026' -> '2026-11-13'."""
    try:
        return datetime.strptime((texto or "").strip(), "%d/%m/%Y").date().isoformat()
    except ValueError:
        return None


def jornais_da_loja(dados: dict, loja_id: int = ASSAI_LOJA_ID, hoje: date | None = None) -> list[tuple[str, str | None, str | None]]:
    """Páginas dos jornais do Assaí vigentes hoje na loja: (endereço da imagem, início, fim)."""
    hoje_iso = (hoje or date.today()).isoformat()
    saida, vistos = [], set()
    for jornal in dados.get("ofertas") or []:
        if not any(str(l.get("loja_id")) == str(loja_id) for l in jornal.get("lojas") or []):
            continue
        de, ate = _data_br(jornal.get("start_date")), _data_br(jornal.get("end_date"))
        if (de and de > hoje_iso) or (ate and ate < hoje_iso):
            continue        # jornal futuro entra no dia em que começa; vencido não entra
        for img in jornal.get("images") or []:
            url = (img or {}).get("url")
            if url and url not in vistos:
                vistos.add(url)
                saida.append((url, de, ate))
    return saida


def _json_assai() -> dict:
    """JSON dos jornais. Primeiro direto; se o site pedir navegador, abre a página da loja como um visitante
    e aproveita o mesmo JSON que ela baixa. Página de bloqueio ou CAPTCHA não é contornada: vira erro."""
    try:
        resp = httpx.get(f"{ASSAI_JSON}?{int(time.time())}", timeout=30, follow_redirects=True,
                         headers={"User-Agent": UA_NAVEGADOR, "Referer": ASSAI_PAGINA, "Accept": "application/json"})
        resp.raise_for_status()
        return resp.json()
    except Exception as erro:
        print(f"Assaí: JSON direto não veio ({str(erro)[:100]}); abrindo a página no navegador", file=sys.stderr, flush=True)
    from playwright.sync_api import sync_playwright

    with sync_playwright() as p:
        nav = p.chromium.launch()
        try:
            pag = nav.new_page(locale="pt-BR", user_agent=UA_NAVEGADOR)
            with pag.expect_response(lambda r: "ofertas_assai.json" in r.url, timeout=60_000) as resposta:
                pag.goto(ASSAI_PAGINA, wait_until="domcontentloaded", timeout=60_000)
            if resposta.value.status != 200:
                raise RuntimeError(f"Assaí respondeu {resposta.value.status} (não contornado)")
            return resposta.value.json()
        finally:
            nav.close()


def assai_jornais() -> list[tuple[str, str | None, str | None]]:
    return jornais_da_loja(_json_assai())


def paginas_do_folheto(enderecos: list[str]) -> list[str]:
    """Endereços de folheto do Cato sem repetição, na ordem das páginas (...-1.webp, ...-2.webp)."""
    unicos = list(dict.fromkeys(u for u in enderecos if CATO_IMAGEM.fullmatch(u)))
    def ordem(u: str):
        m = re.search(r"-(\d+)\.\w+$", u)
        return (re.sub(r"-\d+\.\w+$", "", u), int(m.group(1)) if m else 0)
    return sorted(unicos, key=ordem)


def cato_paginas() -> list[str]:
    """Abre a página de folhetos como um visitante (sem login, sem cliques) e lê as imagens exibidas."""
    from playwright.sync_api import sync_playwright

    with sync_playwright() as p:
        nav = p.chromium.launch()
        try:
            pag = nav.new_page(locale="pt-BR", user_agent=UA_NAVEGADOR)
            resp = pag.goto(CATO_PAGINA, wait_until="domcontentloaded", timeout=60_000)
            if resp and resp.status >= 400:
                raise RuntimeError(f"Cato respondeu {resp.status} (não contornado)")
            pag.wait_for_selector('img[src*="/production/folheto/"]', state="attached", timeout=45_000)
            pag.wait_for_timeout(3_000)      # carrossel termina de montar as outras páginas
            srcs = pag.eval_on_selector_all('img[src*="/production/folheto/"]', "els => els.map(e => e.src)")
        finally:
            nav.close()
    return paginas_do_folheto(srcs)


def _alvos(site: str) -> list[tuple[str, str | None, str | None]]:
    """Encartes a ler: (endereço, início, fim). Início e fim só quando o site informa à parte."""
    cfg = SITES[site]
    if "buscar" in cfg:
        return cfg["buscar"]()
    return [(u, None, None) for u in encartes(site)]


def encartes(site: str) -> list[str]:
    cfg = SITES[site]
    if "buscar" in cfg:
        return [u for u, _, _ in cfg["buscar"]()]
    if "arquivos" in cfg:          # endereço fixo do encarte, sem página para procurar
        return list(cfg["arquivos"])
    hoje = date.today()
    padrao = cfg["padrao"].format(ano=hoje.year, mes=hoje.month)
    html = httpx.get(cfg["pagina"], timeout=30, follow_redirects=True,
                     headers={"User-Agent": "CestaBasicaFamilia/0.1 (piloto Indaiatuba)"}).text
    achados = {u for u in re.findall(padrao, html, re.I) if not any(x in u for x in cfg["ignorar"])}
    # WordPress publica cada imagem em vários tamanhos (-768x1086, -scaled...): fica uma por encarte, a maior
    por_encarte: dict[str, str] = {}
    for u in achados:
        chave = re.sub(r"-(?:\d+x\d+|scaled)(?=\.\w+$)", "", u)
        if chave not in por_encarte or _tamanho(u) > _tamanho(por_encarte[chave]):
            por_encarte[chave] = u
    return sorted(por_encarte.values())


def _tamanho(url: str) -> int:
    if "-scaled." in url:
        return 10**8          # versão grande gerada pelo WordPress (2560 px)
    m = re.search(r"-(\d+)x(\d+)\.\w+$", url)
    return int(m.group(1)) * int(m.group(2)) if m else 10**7  # original sem sufixo


def coletar(site: str) -> list[dict]:
    cfg = SITES[site]
    mercado = cfg["mercado"]
    hoje = date.today().isoformat()
    saida = []
    for url, de, ate in _alvos(site):
        try:
            encarte = extrair(url, headers=cfg.get("cabecalhos"))
            if de or ate:      # validade informada pelo site vale mais que a lida na imagem
                encarte = encarte.model_copy(update={"valido_de": de or encarte.valido_de,
                                                     "valido_ate": ate or encarte.valido_ate})
            if cfg.get("pular_futuro") and encarte.valido_de and encarte.valido_de > hoje:
                print(f"{mercado}: {url} começa em {encarte.valido_de}; fica para esse dia", file=sys.stderr, flush=True)
                continue
            saida.extend(para_artifact(encarte, mercado, None, url))
        except Exception as erro:  # um encarte com problema não derruba os outros
            print(f"falhou {url}: {erro}", file=sys.stderr)
    return saida


def main(argv: list[str] | None = None) -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("site", choices=SITES)
    ap.add_argument("--listar", action="store_true")
    ap.add_argument("--saida")
    a = ap.parse_args(argv)
    if a.listar:
        print("\n".join(encartes(a.site)))
        return
    ofertas = coletar(a.site)
    texto = json.dumps(ofertas, ensure_ascii=False, indent=2)
    if a.saida:
        open(a.saida, "w", encoding="utf-8").write(texto)
        print(f"{len(ofertas)} ofertas salvas em {a.saida}")
    else:
        print(texto)


if __name__ == "__main__":
    main()

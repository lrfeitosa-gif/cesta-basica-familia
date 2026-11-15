"""Coletor de encartes publicados como PDF/imagem no site do mercado (Sumerbol, Roldão, Revolução).

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
from datetime import date

import httpx

from coleta.extrator import extrair, para_artifact

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
        # cada encarte é um cartão da página (jet-listing-grid__item) com as lojas em que vale: "Exclusivamente nas
        # lojas: Osasco I e II, Salto, Itu e Indaiatuba" ou "Somente para Franco da Rocha". Fica só o cartão que cita
        # Indaiatuba ou que não restringe lojas (Comerciante, Pepsico). Até 14/11 entravam todos: os preços do
        # encarte "REDE" e de Franco da Rocha se misturavam aos de Indaiatuba.
        "cartao": "jet-listing-grid__item",
        "cidade": "Indaiatuba",
    },
    "revolucao": {
        "mercado": "Revolução",
        # o botão "Ofertas para Indaiatuba" do site abre sempre esta imagem (assets/script.js), trocada a cada folheto
        "arquivos": ["https://www.supermercadosrevolucao.com.br/assets/indaiatuba.jpg"],
    },
}


def encartes(site: str) -> list[str]:
    cfg = SITES[site]
    if "arquivos" in cfg:          # endereço fixo do encarte, sem página para procurar
        return list(cfg["arquivos"])
    hoje = date.today()
    padrao = cfg["padrao"].format(ano=hoje.year, mes=hoje.month)
    html = httpx.get(cfg["pagina"], timeout=30, follow_redirects=True,
                     headers={"User-Agent": "CestaBasicaFamilia/0.1 (piloto Indaiatuba)"}).text
    if cfg.get("cartao"):
        html = _cartoes_da_cidade(html, cfg["cartao"], cfg["cidade"]) or html
    achados = {u for u in re.findall(padrao, html, re.I) if not any(x in u for x in cfg["ignorar"])}
    # WordPress publica cada imagem em vários tamanhos (-768x1086, -scaled...): fica uma por encarte, a maior
    por_encarte: dict[str, str] = {}
    for u in achados:
        chave = re.sub(r"-(?:\d+x\d+|scaled)(?=\.\w+$)", "", u)
        if chave not in por_encarte or _tamanho(u) > _tamanho(por_encarte[chave]):
            por_encarte[chave] = u
    return sorted(por_encarte.values())


_RESTRICAO = re.compile(r"exclusivamente nas lojas|somente para|somente na loja|v[aá]lid[ao]s? (?:somente|apenas) nas? lojas?", re.I)


def _cartoes_da_cidade(html: str, marca: str, cidade: str) -> str:
    """Junta o HTML dos cartões de encarte que valem para a cidade: os que a citam e os que não restringem lojas.
    Devolve "" se a página não tiver cartões (aí vale a página inteira, como antes)."""
    partes = html.split(marca)[1:]
    if not partes:
        return ""
    bons = []
    for parte in partes:
        texto = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", parte))[:1500]
        if cidade.lower() in texto.lower() or not _RESTRICAO.search(texto):
            bons.append(parte)
    return "\n".join(bons)


def _tamanho(url: str) -> int:
    if "-scaled." in url:
        return 10**8          # versão grande gerada pelo WordPress (2560 px)
    m = re.search(r"-(\d+)x(\d+)\.\w+$", url)
    return int(m.group(1)) * int(m.group(2)) if m else 10**7  # original sem sufixo


def coletar(site: str) -> list[dict]:
    mercado = SITES[site]["mercado"]
    saida = []
    for url in encartes(site):
        try:
            saida.extend(para_artifact(extrair(url), mercado, None, url))
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

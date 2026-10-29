"""Leitura de NFC-e de SP a partir da URL do QR Code (página pública de consulta da Sefaz).

Extrai apenas itens, quantidades, preços, CNPJ da loja e data. Dados do consumidor
(CPF, nome) aparecem na página mas nunca são lidos nem gravados.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date, datetime

import httpx
from bs4 import BeautifulSoup


@dataclass
class ItemNota:
    descricao: str
    quantidade: float
    unidade: str
    preco_unitario: float


@dataclass
class Nota:
    chave: str
    cnpj: str
    data: date
    total: float
    itens: list[ItemNota]


def chave_da_url(url: str) -> str:
    m = re.search(r"p=(\d{44})", url)
    if not m:
        raise ValueError("QR Code não parece ser de NFC-e")
    return m.group(1)


def _num(texto: str) -> float:
    return float(re.sub(r"[^\d,]", "", texto).replace(",", "."))


def parse_html(html: str, chave: str) -> Nota:
    """Layout padrão do portal NFC-e (tabela #tabResult). Ajustar se a Sefaz-SP mudar."""
    soup = BeautifulSoup(html, "html.parser")
    itens = []
    for tr in soup.select("#tabResult tr"):
        nome = tr.select_one(".txtTit")
        if not nome:
            continue
        itens.append(ItemNota(
            descricao=nome.get_text(strip=True),
            quantidade=_num(tr.select_one(".Rqtd").get_text()),
            unidade=tr.select_one(".RUN").get_text().split(":")[-1].strip(),
            preco_unitario=_num(tr.select_one(".RvlUnit").get_text()),
        ))
    texto = soup.get_text(" ", strip=True)
    cnpj = re.search(r"CNPJ:\s*([\d./-]+)", texto)
    emissao = re.search(r"Emissão:\s*(\d{2}/\d{2}/\d{4})", texto)
    total = soup.select_one(".totalNumb.txtMax")
    return Nota(
        chave=chave,
        cnpj=re.sub(r"\D", "", cnpj.group(1)) if cnpj else "",
        data=datetime.strptime(emissao.group(1), "%d/%m/%Y").date() if emissao else date.today(),
        total=_num(total.get_text()) if total else sum(i.quantidade * i.preco_unitario for i in itens),
        itens=itens,
    )


def ler_nota(url_qrcode: str) -> Nota:
    chave = chave_da_url(url_qrcode)
    resp = httpx.get(url_qrcode, timeout=20, follow_redirects=True)
    resp.raise_for_status()
    return parse_html(resp.text, chave)

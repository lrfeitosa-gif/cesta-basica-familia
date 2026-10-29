"""Extrator de tabloides: imagem ou PDF de encarte -> lista de ofertas estruturadas.

Uso:
    python -m coleta.extrator encarte.jpg --mercado Assaí --loja "Assaí Indaiatuba"
    python -m coleta.extrator https://.../encarte.pdf --mercado Covabra --saida ofertas.json

Requer ANTHROPIC_API_KEY no ambiente.
"""
from __future__ import annotations

import argparse
import base64
import json
import mimetypes
import sys
from datetime import date
from pathlib import Path

import anthropic
import httpx
from pydantic import BaseModel, Field

MODELO = "claude-opus-5-5"


class OfertaExtraida(BaseModel):
    produto: str = Field(description="Nome genérico, sem marca. Ex.: 'Arroz branco tipo 1'")
    marca: str | None = Field(description="Marca, ou null se o encarte não mostrar")
    quantidade: float | None = Field(description="Quantidade da embalagem. Ex.: 5 para '5 kg'")
    unidade: str | None = Field(description="Uma de: g, kg, ml, l, un")
    categoria: str = Field(description="Ex.: mercearia, hortifruti, açougue, laticínios, limpeza, higiene, bebidas, padaria, frios")
    preco: float = Field(description="Preço de oferta em reais")
    preco_de: float | None = Field(description="Preço 'de' riscado, se houver")
    condicao: str | None = Field(description="Condição do preço: 'no cartão da loja', 'a partir de 3 un', 'leve 3 pague 2'... ou null")


class Encarte(BaseModel):
    valido_de: str | None = Field(description="Início da validade, AAAA-MM-DD, ou null")
    valido_ate: str | None = Field(description="Fim da validade, AAAA-MM-DD, ou null")
    ofertas: list[OfertaExtraida]


INSTRUCOES = """Você extrai ofertas de encartes de supermercado brasileiros.
Liste todos os produtos com preço visível no encarte, um por item. Regras:
- Separe produto genérico, marca e embalagem ("Café Pilão 500g" -> produto "Café torrado e moído", marca "Pilão", 500, "g").
- Unidade sempre em g, kg, ml, l ou un. "Kg" de hortifruti/açougue vendido a granel: quantidade 1, unidade "kg".
- Se houver dois preços (unitário e "a partir de N un", cartão, clube ou app), use o menor em `preco`, o unitário em `preco_de` e descreva a regra em `condicao`. Preço riscado também vai em `preco_de`.
- Packs e multipacks: use o conteúdo total ("pack 5x160g" -> 800, "g"; "pack 3x70g" -> 210, "g"). Use "un" só quando não houver peso ou volume (fraldas, escovas, utensílios).
- Quando o encarte der opções de embalagem ("150 ou 250 ml"), use a menor e cite as opções em `condicao`.
- Não invente: se o preço ou a marca não estiver legível, deixe o item de fora ou a marca null.
- Datas de validade do encarte no formato AAAA-MM-DD; o ano atual é {ano}."""


def _carregar(origem: str) -> tuple[bytes, str]:
    if origem.startswith(("http://", "https://")):
        resp = httpx.get(origem, timeout=60, follow_redirects=True)
        resp.raise_for_status()
        tipo = resp.headers.get("content-type", "").split(";")[0] or mimetypes.guess_type(origem)[0]
        return resp.content, tipo or ""
    caminho = Path(origem)
    return caminho.read_bytes(), mimetypes.guess_type(caminho.name)[0] or ""


def _bloco(dados: bytes, tipo: str) -> dict:
    b64 = base64.standard_b64encode(dados).decode()
    if tipo == "application/pdf":
        return {"type": "document", "source": {"type": "base64", "media_type": tipo, "data": b64}}
    if tipo in ("image/jpeg", "image/png", "image/webp", "image/gif"):
        return {"type": "image", "source": {"type": "base64", "media_type": tipo, "data": b64}}
    raise ValueError(f"Formato não suportado: {tipo or 'desconhecido'} (use imagem ou PDF)")


def _schema_estrito(modelo: type[BaseModel]) -> dict:
    """JSON Schema do Pydantic com additionalProperties: false, exigido pela saída estruturada."""
    schema = modelo.model_json_schema()

    def fechar(no):
        if isinstance(no, dict):
            if no.get("type") == "object":
                no["additionalProperties"] = False
                no["required"] = list(no.get("properties", {}))
            for v in no.values():
                fechar(v)
        elif isinstance(no, list):
            for v in no:
                fechar(v)

    fechar(schema)
    return schema


def extrair(origem: str, client: anthropic.Anthropic | None = None) -> Encarte:
    client = client or anthropic.Anthropic()
    dados, tipo = _carregar(origem)
    # streaming: encartes em PDF de várias páginas geram respostas longas
    with client.beta.messages.stream(
        model=MODELO,
        max_tokens=64000,
        betas=["server-side-fallback-2026-07-01"],
        fallbacks="default",
        output_config={
            "effort": "medium",
            "format": {"type": "json_schema", "schema": _schema_estrito(Encarte)},
        },
        system=INSTRUCOES.format(ano=date.today().year),
        messages=[{"role": "user", "content": [_bloco(dados, tipo), {"type": "text", "text": "Extraia as ofertas deste encarte."}]}],
    ) as stream:
        resposta = stream.get_final_message()
    if resposta.stop_reason == "refusal":
        raise RuntimeError(f"Extração recusada: {resposta.stop_details}")
    if resposta.stop_reason == "max_tokens":
        raise RuntimeError("Encarte grande demais para uma chamada; divida o PDF em páginas.")
    texto = next(b.text for b in resposta.content if b.type == "text")
    return Encarte.model_validate_json(texto)


def para_artifact(encarte: Encarte, mercado: str, loja: str | None, url: str | None) -> list[dict]:
    """Formato da coleção `ofertas` do artifact Ofertas Indaiatuba."""
    saida = []
    for o in encarte.ofertas:
        unidade = f"{o.quantidade:g} {o.unidade}" if o.quantidade and o.unidade else o.unidade
        saida.append({k: v for k, v in {
            "produto": o.produto, "marca": o.marca, "categoria": o.categoria,
            "mercado": mercado, "loja": loja, "unidade": unidade,
            "preco": o.preco, "precoDe": o.preco_de, "condicao": o.condicao,
            "validoAte": encarte.valido_ate, "fonte": "tabloide", "url": url,
        }.items() if v is not None})
    return saida


def main(argv: list[str] | None = None) -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("origem", help="arquivo local ou URL de imagem/PDF do encarte")
    p.add_argument("--mercado", required=True)
    p.add_argument("--loja")
    p.add_argument("--saida", help="arquivo JSON de saída (padrão: imprime na tela)")
    a = p.parse_args(argv)

    encarte = extrair(a.origem)
    url = a.origem if a.origem.startswith("http") else None
    resultado = para_artifact(encarte, a.mercado, a.loja, url)
    texto = json.dumps(resultado, ensure_ascii=False, indent=2)
    if a.saida:
        Path(a.saida).write_text(texto, encoding="utf-8")
        print(f"{len(resultado)} ofertas salvas em {a.saida}", file=sys.stderr)
    else:
        print(texto)


if __name__ == "__main__":
    main()

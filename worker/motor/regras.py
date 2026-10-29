"""Motor de regras: decide o que vira alerta e qual o melhor local de compra.

Funções puras (sem banco), para testar e calibrar com os dados de Indaiatuba.
Os percentuais em Config são pontos de partida, não valores validados.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field
from datetime import date, timedelta
from itertools import combinations


@dataclass
class Config:
    desconto_media_pct: float = 15.0   # gatilho: preço <= média 60d - X%
    antispam_dias: int = 7             # no máximo 1 alerta por produto a cada N dias
    faixa_gramatura: float = 0.25      # +-25% de embalagem para casar "produto + marca" sem EAN
    limiar_recompra: float = 0.5       # aviso se recompra antes de 50% do intervalo médio
    estoque_max_dias: int = 90         # não sugerir estocar mais que ~3 meses


@dataclass(frozen=True)
class Produto:
    id: int
    categoria: str
    marca: str | None
    quantidade: float
    unidade: str  # g, kg, ml, l, un
    ean: str | None = None
    perecivel: bool = False

    def base(self) -> tuple[float, str]:
        """Quantidade convertida para kg, l ou un."""
        if self.unidade == "g":
            return self.quantidade / 1000, "kg"
        if self.unidade == "ml":
            return self.quantidade / 1000, "l"
        return self.quantidade, self.unidade


@dataclass(frozen=True)
class Oferta:
    id: int
    produto: Produto
    mercado_id: int
    preco: float

    def preco_unidade(self) -> float:
        qtd, _ = self.produto.base()
        return self.preco / qtd


@dataclass
class Interesse:
    familia_id: str
    produto: Produto | None = None     # "produto + marca"
    categoria: str | None = None       # "só produto"
    marca: str | None = None
    preco_alvo: float | None = None


@dataclass
class Referencia:
    media_60d: float | None
    minimo_90d_monitorados: float | None


# 1. Cruzamento ofertas x interesses ----------------------------------------

def casa(interesse: Interesse, oferta: Oferta, cfg: Config = Config()) -> bool:
    p = oferta.produto
    alvo = interesse.produto
    if alvo is not None:
        if alvo.ean and p.ean:
            return alvo.ean == p.ean
        if p.categoria != alvo.categoria or _norm(p.marca) != _norm(alvo.marca):
            return False
        (qa, ua), (qb, ub) = alvo.base(), p.base()
        return ua == ub and abs(qb - qa) <= qa * cfg.faixa_gramatura
    if interesse.categoria != p.categoria:
        return False
    return interesse.marca is None or _norm(interesse.marca) == _norm(p.marca)


def _norm(s: str | None) -> str:
    return (s or "").strip().lower()


# 2. Gatilho de preço de oportunidade ---------------------------------------

def gatilho(oferta: Oferta, interesse: Interesse, ref: Referencia,
            ultimo_alerta: date | None, hoje: date, cfg: Config = Config()
            ) -> tuple[str, float | None] | None:
    """Retorna (motivo, desconto_pct) ou None. Compara preço por unidade de medida."""
    if ultimo_alerta and (hoje - ultimo_alerta).days < cfg.antispam_dias:
        return None
    desconto = None
    if ref.media_60d:
        desconto = round((1 - oferta.preco_unidade() / ref.media_60d) * 100, 1)
    if interesse.preco_alvo is not None and oferta.preco <= interesse.preco_alvo:
        return "preco_alvo", desconto
    if desconto is not None and desconto >= cfg.desconto_media_pct:
        return "abaixo_media", desconto
    if ref.minimo_90d_monitorados is not None and oferta.preco_unidade() <= ref.minimo_90d_monitorados:
        return "minimo_90d", desconto
    return None


def mensagem(oferta: Oferta, nome: str, mercado: str, desconto: float | None) -> str:
    texto = f"{nome} a R$ {oferta.preco:.2f} no {mercado}".replace(".", ",")
    if desconto:
        texto += f", {desconto:.0f}% abaixo da média"
    if not oferta.produto.perecivel:
        texto += " — bom momento para estocar"
    return texto


# 3. Melhor local para comprar ----------------------------------------------

@dataclass
class Opcao:
    mercados: tuple[int, ...]
    total: float
    deslocamento: float
    estimados: list[int] = field(default_factory=list)  # produto_ids com preço médio

    @property
    def custo(self) -> float:
        return self.total + self.deslocamento


def distancia_km(a: tuple[float, float], b: tuple[float, float]) -> float:
    """Linha reta (haversine)."""
    lat1, lon1, lat2, lon2 = map(math.radians, (*a, *b))
    h = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    return 6371 * 2 * math.asin(math.sqrt(h))


def melhor_compra(itens: dict[int, float],
                  precos: dict[int, dict[int, float]],
                  media_regional: dict[int, float],
                  coords_mercado: dict[int, tuple[float, float]],
                  regioes: list[tuple[float, float]],
                  custo_km: float) -> tuple[Opcao, Opcao | None]:
    """itens: produto_id -> quantidade; precos: mercado_id -> produto_id -> preço.

    Retorna (melhor mercado único, melhor combinação de 2 mercados).
    Deslocamento = ida e volta a partir da região de interesse mais próxima.
    """
    def desloc(m: int) -> float:
        km = min(distancia_km(r, coords_mercado[m]) for r in regioes)
        return 2 * km * custo_km

    def avaliar(ms: tuple[int, ...]) -> Opcao:
        total, estimados = 0.0, []
        for pid, qtd in itens.items():
            disponiveis = [precos[m][pid] for m in ms if pid in precos.get(m, {})]
            if disponiveis:
                total += min(disponiveis) * qtd
            else:
                total += media_regional.get(pid, 0) * qtd
                estimados.append(pid)
        return Opcao(ms, round(total, 2), round(sum(desloc(m) for m in ms), 2), estimados)

    mercados = list(coords_mercado)
    unico = min((avaliar((m,)) for m in mercados), key=lambda o: o.custo)
    pares = [avaliar(p) for p in combinations(mercados, 2)]
    dupla = min(pares, key=lambda o: o.custo) if pares else None
    return unico, dupla


def quanto_estocar(consumo_dia: float, embalagem_base: float, cfg: Config = Config()) -> int:
    """Nº de embalagens para cobrir até estoque_max_dias de consumo médio (na unidade base)."""
    if consumo_dia <= 0 or embalagem_base <= 0:
        return 1
    return max(1, math.floor(consumo_dia * cfg.estoque_max_dias / embalagem_base))


# 4. Aviso de compra possivelmente desnecessária ------------------------------

def intervalo_medio(datas: list[date]) -> float | None:
    datas = sorted(set(datas))
    if len(datas) < 2:
        return None
    return (datas[-1] - datas[0]).days / (len(datas) - 1)


def aviso_recompra(datas: list[date], hoje: date, estimativa_dias: float | None = None,
                   cfg: Config = Config()) -> tuple[date, float, bool] | None:
    """Retorna (última compra, duração típica, é_estimativa) se for cedo demais para recomprar."""
    if not datas:
        return None
    ultima = max(datas)
    medio = intervalo_medio(datas)
    estimado = medio is None
    medio = medio or estimativa_dias
    if not medio:
        return None
    if hoje - ultima < timedelta(days=medio * cfg.limiar_recompra):
        return ultima, medio, estimado
    return None

'use client';
import type { ReactNode } from 'react';
import { brl, emb, marcarEsgotado, norm, SO_SOCIOS, type Oferta } from '@/lib/ofertas';
import { mostrarAviso } from './aviso';

export default function LinhaOferta({ o, extra, dist }: { o: Oferta; extra?: ReactNode; dist?: string | null }) {
  const comMarca = o.marca && !norm(o.nome).includes(norm(o.marca)) ? `${o.marca} ` : '';
  // o tamanho já está no nome ("Biscoito 90G")? então não repete ao lado
  const nomeJunto = norm(o.nome).replace(/\s/g, '');
  const tamNoNome = [String(o.q), String(o.q).replace('.', ',')].some((q) => nomeJunto.includes(`${q}${o.u}`));
  return (
    <article className="product-card">
      <div className="product-header">
        <h3 className="product-title">{comMarca}{o.nome}{!tamNoNome && <> <small>{emb(o)}</small></>}</h3>
        <div className="price-tag-container">
          <b className="current-price">{brl(o.preco)}</b>
          {o.de > o.preco && <s className="old-price">de {brl(o.de)}</s>}
          {extra && <span className="discount-badge">{extra}</span>}
        </div>
      </div>
      <div className="product-meta">
        <span className="mkt">{o.mercado}</span>
        {SO_SOCIOS.has(o.mercado) && <TagSocios />}
        <span className={o.fonte === 'site' ? 'badge-site' : 'badge-encarte'} title={o.fonte === 'site' ? 'Preço do site do mercado' : 'Preço de promoção do encarte'}>
          {o.fonte === 'site' ? 'site' : 'encarte'}
        </span>
        <span className="unit">{brl(o.porUn)}/{o.ub}</span>
        {dist && <span className="dist">📍 {dist}</span>}
        {o.cond && <span className="cond">{o.cond}</span>}
      </div>
      <div className="product-actions">
        {o.url && (
          <a className="card-btn card-btn-primario" href={o.url} target="_blank" rel="noopener noreferrer">
            {o.fonte === 'site' ? `Comprar no site do ${o.mercado}` : 'Ver encarte'} ↗
          </a>
        )}
        <button type="button" className="card-btn card-btn-secundario" onClick={() => avisarEsgotado(o)}>Avisar que acabou</button>
      </div>
    </article>
  );
}

async function avisarEsgotado(o: Oferta) {
  const desfazer = await marcarEsgotado(o);
  if (!desfazer) return mostrarAviso({ texto: 'Não foi possível registrar agora. Tente de novo em instantes.' });
  mostrarAviso({
    texto: `${o.nome} no ${o.mercado} saiu das listas de hoje. Volta na próxima coleta.`,
    acao: { rotulo: 'Desfazer', fazer: desfazer },
  });
}

// Aviso de mercado que só vende para sócios (Sam's Club).
export function TagSocios() {
  return <span className="fonte fonte-socios" title="Para comprar é preciso ser sócio do clube">só sócios</span>;
}

// Esqueleto de linhas enquanto os preços chegam: a tela já mostra a forma do conteúdo.
export function Carregando() {
  return (
    <div className="lista carregando" role="status" aria-label="Carregando os preços de hoje">
      {[0, 1, 2, 3].map((i) => (
        <div className="item" key={i}>
          <span className="esq" style={{ width: `${70 - i * 8}%` }} />
          <span className="esq esq-preco" />
          <span className="esq" style={{ width: '40%', gridColumn: '1 / -1' }} />
        </div>
      ))}
    </div>
  );
}

export function ErroCarga({ tentarDeNovo }: { tentarDeNovo: () => void }) {
  return (
    <div className="alert alert-error stack" role="alert">
      <span>Não foi possível carregar os preços. Confira a internet e tente de novo.</span>
      <button type="button" className="btn btn-secondary" onClick={tentarDeNovo}>Tentar de novo</button>
    </div>
  );
}

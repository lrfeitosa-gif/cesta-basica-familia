'use client';
import type { ReactNode } from 'react';
import { brl, emb, marcarEsgotado, norm, type Oferta } from '@/lib/ofertas';
import { mostrarAviso } from './aviso';

export default function LinhaOferta({ o, extra }: { o: Oferta; extra?: ReactNode }) {
  const comMarca = o.marca && !norm(o.nome).includes(norm(o.marca)) ? `${o.marca} ` : '';
  return (
    <div className="item">
      <div className="nome">{comMarca}{o.nome} <small>{emb(o)}</small></div>
      <div className="etiqueta-preco">
        <b>{brl(o.preco)}</b>
        {o.de > o.preco && <s>de {brl(o.de)}</s>}
      </div>
      <div className="meta">
        <span className="mkt">{o.mercado}</span>
        <span className={`fonte fonte-${o.fonte}`} title={o.fonte === 'site' ? 'Preço do site do mercado' : 'Preço de promoção do encarte'}>
          {o.fonte === 'site' ? 'site' : 'encarte'}
        </span>
        <span className="unit">{brl(o.porUn)}/{o.ub}</span>
        {extra}
        {o.cond && <span className="cond">{o.cond}</span>}
        <span className="acoes-oferta">
          {o.url && (
            <a className="link-site" href={o.url} target="_blank" rel="noopener noreferrer">
              {o.fonte === 'site' ? `Comprar no site do ${o.mercado}` : 'Ver encarte'} ↗
            </a>
          )}
          <button type="button" className="btn-acabou" onClick={() => avisarEsgotado(o)}>Acabou na loja</button>
        </span>
      </div>
    </div>
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

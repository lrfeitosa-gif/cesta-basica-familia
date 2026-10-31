import type { ReactNode } from 'react';
import { brl, emb, norm, type Oferta } from '@/lib/ofertas';

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
        <span className="unit">{brl(o.porUn)}/{o.ub}</span>
        {extra}
        {o.cond && <span className="cond">{o.cond}</span>}
      </div>
    </div>
  );
}

export function Carregando() {
  return <div className="empty" role="status">Carregando os preços de hoje…</div>;
}

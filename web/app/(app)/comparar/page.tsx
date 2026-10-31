'use client';
import { useEffect, useMemo, useState } from 'react';
import { brl, emb, filtrar, useOfertas } from '@/lib/ofertas';
import LinhaOferta, { Carregando, ErroCarga } from '../linha-oferta';

const ATALHOS = ['café pilão', 'café -cápsula -solúvel', 'arroz 5kg -integral', 'feijão carioca 1kg', 'leite integral 1l'];

export default function Comparar() {
  const { dados, erro, tentarDeNovo } = useOfertas();
  const [q, setQ] = useState('');

  const achados = useMemo(() => dados ? filtrar(dados.lista, q).sort((a, b) => a.porUn - b.porUn).slice(0, 80) : [], [dados, q]);
  const melhor = achados[0];

  return (
    <>
      <div>
        <h1>Comparar preços</h1>
        <p className="lead">Ordenado pelo preço por kg, litro ou unidade, para embalagens diferentes não confundirem.</p>
      </div>
      <div className="chips">
        {ATALHOS.map((a) => <button key={a} type="button" className="chip" aria-pressed={q === a} onClick={() => setQ(a)}>{a}</button>)}
      </div>
      <div className="field">
        <label htmlFor="q" className="visually-hidden">Buscar produto</label>
        <input id="q" className="input" type="search" autoComplete="off" placeholder="Ex.: café pilão 500g  ·  café -cápsula"
          value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {erro ? <ErroCarga tentarDeNovo={tentarDeNovo} /> : !dados ? <Carregando /> : !q.trim() ? (
        <div className="empty">Combine palavras (café pilão 500g) e use o sinal de menos para excluir (café -cápsula).</div>
      ) : !achados.length ? (
        <div className="empty">Nenhum preço encontrado. Tente menos palavras, como &quot;arroz 5kg&quot;.</div>
      ) : (
        <>
          <div className="destaque">
            <span className="muted">Mais barato por {melhor.ub}</span>
            <span className="grande">{brl(melhor.porUn)}/{melhor.ub}</span>
            <span>{melhor.nome} {emb(melhor)} no <b>{melhor.mercado}</b> por {brl(melhor.preco)}</span>
          </div>
          <div className="lista">{achados.map((o, i) => <LinhaOferta key={i} o={o} />)}</div>
        </>
      )}
    </>
  );
}

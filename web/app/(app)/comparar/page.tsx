'use client';
import { useEffect, useMemo, useState } from 'react';
import { brl, emb, filtrarFoco, ordenarPorMedida, useOfertas } from '@/lib/ofertas';
import LinhaOferta, { Carregando, ErroCarga } from '../linha-oferta';
import { useSessao } from '@/lib/sessao';
import { useDistTexto } from '@/lib/locais';

const ATALHOS = ['café pilão', 'café -cápsula -solúvel', 'arroz 5kg -integral', 'feijão carioca 1kg', 'leite integral 1l'];

export default function Comparar() {
  const { dados, erro, tentarDeNovo } = useOfertas();
  const distTxt = useDistTexto(useSessao()?.user.id);
  const [q, setQ] = useState('');

  const todos = useMemo(() => dados ? ordenarPorMedida(filtrarFoco(dados.lista, q)) : [], [dados, q]);
  const [limite, setLimite] = useState(40);
  useEffect(() => setLimite(40), [q]);
  const achados = todos.slice(0, limite);
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
      {/* Sem busca, a dica aparece na hora (os preços carregam por trás); o carregando só aparece se já houver busca. */}
      {erro ? <ErroCarga tentarDeNovo={tentarDeNovo} /> : !q.trim() ? (
        <div className="empty">Combine palavras (café pilão 500g) e use o sinal de menos para excluir (café -cápsula).</div>
      ) : !dados ? (
        <>
          <p className="buscando" role="status"><span className="giro" aria-hidden="true" />Buscando os preços de hoje nos mercados…</p>
          <Carregando />
        </>
      ) : !achados.length ? (
        <div className="empty">Nenhum preço encontrado. Tente menos palavras, como &quot;arroz 5kg&quot;.</div>
      ) : (
        <>
          <div className="destaque">
            <span className="muted">Mais barato (pelo preço do {melhor.ub === 'un' ? 'item' : melhor.ub === 'l' ? 'litro' : 'quilo'})</span>
            <span className="grande">{brl(melhor.preco)}</span>
            <span>{melhor.nome} no <b>{melhor.mercado}</b>{distTxt(melhor.mercado) && <span className="dist"> · 📍 {distTxt(melhor.mercado)}</span>}</span>
            <span className="muted">{brl(melhor.porUn)}/{melhor.ub}</span>
          </div>
          <p className="muted">{todos.length} {todos.length === 1 ? 'preço encontrado' : 'preços encontrados'} em {new Set(todos.map((o) => o.mercado)).size} mercados.</p>
          <div className="lista">{achados.map((o, i) => <LinhaOferta key={i} o={o} dist={distTxt(o.mercado)} />)}</div>
          {todos.length > limite && (
            <button type="button" className="btn btn-secondary btn-block" onClick={() => setLimite(limite + 40)}>
              Mostrar mais ({todos.length - limite} restantes)
            </button>
          )}
        </>
      )}
    </>
  );
}

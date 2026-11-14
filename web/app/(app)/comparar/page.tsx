'use client';
import { useEffect, useMemo, useState } from 'react';
import { brl, emb, filtrarFoco, norm, ordenarPorMedida, SO_SOCIOS, useOfertas, type Oferta } from '@/lib/ofertas';
import LinhaOferta, { Carregando, ErroCarga, TagSocios } from '../linha-oferta';
import { useSessao } from '@/lib/sessao';
import { useDistTexto } from '@/lib/locais';
import LinhaRolagem from '../linha-rolagem';

const ATALHOS = ['café pilão', 'café -cápsula -solúvel', 'arroz 5kg -integral', 'feijão carioca 1kg', 'leite integral 1l'];
const MEDIDA: Record<string, string> = { kg: 'quilo', l: 'litro', un: 'unidade' };

export default function Comparar() {
  const { dados, erro, tentarDeNovo } = useOfertas();
  const distTxt = useDistTexto(useSessao()?.user.id);
  const [q, setQ] = useState('');
  const [ajuda, setAjuda] = useState(false);

  const todos = useMemo(() => dados ? ordenarPorMedida(filtrarFoco(dados.lista, q)) : [], [dados, q]);
  const [limite, setLimite] = useState(40);
  useEffect(() => setLimite(40), [q]);
  const achados = todos.slice(0, limite);
  const melhor = achados[0];

  // Comparativo por mercado: o menor preço por quilo/litro/unidade de cada mercado, na medida mais comum da busca
  // (a do "mais barato"); quilo não se compara com unidade.
  const porMercado = useMemo(() => {
    if (!melhor) return [];
    const vistos = new Map<string, Oferta>();
    for (const o of todos) if (o.ub === melhor.ub && !vistos.has(o.mercado)) vistos.set(o.mercado, o);
    return [...vistos.values()];
  }, [todos, melhor]);
  
  return (
    <>
      <div>
        <h1>Comparar preços</h1>
        <p className="lead">Ordenado pelo preço do quilo, do litro ou da unidade, para comparar embalagens de tamanhos diferentes.</p>
      </div>
      <form className="busca-topo busca-comparar" role="search" onSubmit={(e) => e.preventDefault()}>
        <label htmlFor="q" className="visually-hidden">Produto para comparar</label>
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
        <input id="q" className="input" type="search" autoComplete="off" enterKeyHint="search" placeholder="Produto: café pilão 500 g"
          value={q} onChange={(e) => setQ(e.target.value)} aria-describedby={ajuda ? 'q-ajuda' : undefined} />
        <button type="button" className="btn-ajuda" aria-label="Como buscar" aria-expanded={ajuda} onClick={() => setAjuda(!ajuda)}>ℹ️</button>
      </form>
      {ajuda && (
        <p id="q-ajuda" className="dica-busca">
          Combine palavras (<b>café pilão 500g</b>) e use o sinal de menos para excluir (<b>café -cápsula</b>).
        </p>
      )}
      <LinhaRolagem rotulo="Sugestões de busca">
        {ATALHOS.map((a) => <button key={a} type="button" className="chip" aria-pressed={q === a} onClick={() => setQ(a)}>{a}</button>)}
      </LinhaRolagem>

      {/* Sem busca, só a orientação curta; os preços carregam por trás. */}
      {erro ? <ErroCarga tentarDeNovo={tentarDeNovo} /> : !q.trim() ? (
        <p className="muted comparar-vazio">Digite um produto ou toque numa sugestão para ver, mercado a mercado, quem tem o menor preço por quilo ou litro.</p>
      ) : !dados ? (
        <>
          <p className="buscando" role="status"><span className="giro" aria-hidden="true" />Buscando os preços de hoje nos mercados…</p>
          <Carregando />
        </>
      ) : !achados.length ? (
        <div className="empty">Nenhum preço encontrado. Tente menos palavras, como &quot;arroz 5kg&quot;.</div>
      ) : (
        <>
          {/* Estilo 5 (14/11): cartões lado a lado só com o mercado e o preço por quilo/litro bem marcado como "/kg";
              o preço do pacote fica embaixo, junto do tamanho, para não ler "5 kg" ao lado de um valor por quilo. */}
          <section className="comparativo" aria-label={`Menor preço por ${MEDIDA[melhor.ub] ?? melhor.ub} em cada mercado`}>
            <div className="comparativo-cab">
              <h2>Menor preço por {MEDIDA[melhor.ub] ?? melhor.ub} em cada mercado</h2>
              <span className="muted">{porMercado.length} {porMercado.length === 1 ? 'mercado' : 'mercados'}</span>
            </div>
            <ol className="compara-cards">
              {porMercado.map((o, i) => {
                const pct = melhor.porUn > 0 ? Math.round((o.porUn / melhor.porUn - 1) * 100) : 0;
                return (
                  <li key={o.mercado} className={i === 0 ? 'compara-card vencedor' : 'compara-card'}>
                    <div className="compara-card-topo">
                      <b className="compara-mercado">{o.mercado}</b>
                      {i === 0 ? <span className="selo-menor">Menor preço</span> : <span className="selo-dif">+{pct}%</span>}
                    </div>
                    <span className="compara-unit">{brl(o.porUn)} <small>/ {o.ub}</small></span>
                    <span className="compara-pacote">{o.marca && !norm(o.nome).includes(norm(o.marca)) ? `${o.marca} · ` : ''}{o.nome} <small>{emb(o)}</small>: <b>{brl(o.preco)}</b></span>
                    {(SO_SOCIOS.has(o.mercado) || distTxt(o.mercado)) && (
                      <span className="compara-extra">{SO_SOCIOS.has(o.mercado) && <TagSocios />}{distTxt(o.mercado) && <span>📍 {distTxt(o.mercado)}</span>}</span>
                    )}
                  </li>
                );
              })}
            </ol>
          </section>
          <h2 className="section-title">Todos os preços</h2>
          <p className="muted">{todos.length} {todos.length === 1 ? 'preço encontrado' : 'preços encontrados'} em {new Set(todos.map((o) => o.mercado)).size} mercados, do menor para o maior preço por {MEDIDA[melhor.ub] ?? melhor.ub}.</p>
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

'use client';
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { brl, dataBr, emb, filtrarFoco, useOfertas, type Oferta } from '@/lib/ofertas';
import { Carregando, ErroCarga } from '../linha-oferta';

const PERIODOS = [[30, '30 dias'], [90, '3 meses'], [365, '1 ano']] as const;
const CORES = ['#4f7f5c', '#2f6db3', '#c0841a', '#9b4d8f', '#c2493d', '#2a9d8f', '#6b6f2a', '#5b5f97', '#8a5a2b'];

type Ponto = { dia: string; preco: number };
type Serie = { mercado: string; pontos: Ponto[]; cor: string };

// Evolução do preço de um produto ao longo das coletas: uma linha por mercado, no período escolhido.
export default function Evolucao() {
  const { dados, erro, tentarDeNovo } = useOfertas();
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<Oferta | null>(null);
  const [dias, setDias] = useState<number>(90);
  const [series, setSeries] = useState<Serie[] | null>(null);
  const [falha, setFalha] = useState('');

  const achados = useMemo(() => {
    if (!dados || !q.trim()) return [];
    const vistos = new Set<string>();
    return filtrarFoco(dados.lista, q).filter((o) => {
      const k = o.ean || `${o.nome}|${o.q}${o.u}`;
      if (vistos.has(k)) return false;
      vistos.add(k); return true;
    }).slice(0, 15);
  }, [dados, q]);

  useEffect(() => {
    if (!sel) return;
    setSeries(null); setFalha('');
    const desde = new Date(Date.now() - dias * 86400000).toISOString().slice(0, 10);
    let consulta = supabase.from('oferta')
      .select('preco,valido_de,mercado!inner(rede),produto!inner(nome,ean,quantidade,unidade)')
      .gte('valido_de', desde).order('valido_de').range(0, 4999);
    // com código de barras, o mesmo produto é achado em todos os mercados; sem ele, pelo nome e tamanho
    consulta = sel.ean ? consulta.eq('produto.ean', sel.ean)
      : consulta.eq('produto.nome', sel.nome).eq('produto.quantidade', sel.q).eq('produto.unidade', sel.u);
    consulta.then(({ data, error }) => {
      if (error) { setFalha('Não conseguimos carregar o histórico agora.'); return; }
      const por = new Map<string, Map<string, number>>();
      for (const l of (data ?? []) as unknown as { preco: number; valido_de: string; mercado: { rede: string } }[]) {
        const m = por.get(l.mercado.rede) ?? new Map<string, number>();
        m.set(l.valido_de, Math.min(m.get(l.valido_de) ?? Infinity, Number(l.preco)));
        por.set(l.mercado.rede, m);
      }
      setSeries([...por.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([mercado, m], i) => ({
        mercado, cor: CORES[i % CORES.length], pontos: [...m.entries()].map(([dia, preco]) => ({ dia, preco })).sort((a, b) => a.dia.localeCompare(b.dia)),
      })));
    });
  }, [sel, dias]);

  return (
    <>
      <div>
        <h1>Evolução de preços</h1>
        <p className="lead">Veja como o preço de um produto mudou em cada mercado, desde o início das coletas.</p>
      </div>

      {!sel ? (
        <>
          <div className="field">
            <label htmlFor="q-evol" className="visually-hidden">Buscar produto</label>
            <input id="q-evol" className="input" type="search" autoComplete="off" placeholder="Ex.: café pilão 500g"
              value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          {erro ? <ErroCarga tentarDeNovo={tentarDeNovo} /> : !dados ? <Carregando /> : !q.trim() ? (
            <div className="empty">Digite um produto e escolha na lista para ver o histórico.</div>
          ) : !achados.length ? (
            <div className="empty">Nenhum produto encontrado. Tente menos palavras.</div>
          ) : (
            <div className="lista">
              {achados.map((o) => (
                <button key={o.id} type="button" className="linha-escolha" onClick={() => setSel(o)}>
                  <span><b>{o.nome}</b>{o.marca && <span className="muted"> · {o.marca}</span>}</span>
                  <span className="muted">{emb(o)}</span>
                </button>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          <div className="card stack">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <span><b>{sel.nome}</b> <span className="muted">{emb(sel)}</span></span>
              <button type="button" className="btn btn-link" onClick={() => { setSel(null); setSeries(null); }}>Trocar produto</button>
            </div>
            <div className="choice" role="radiogroup" aria-label="Período">
              {PERIODOS.map(([d, r]) => (
                <label key={d}><input type="radio" name="periodo" checked={dias === d} onChange={() => setDias(d)} /><span>{r}</span></label>
              ))}
            </div>
          </div>
          {falha ? <div className="alert alert-error" role="alert">{falha}</div> : !series ? <Carregando /> : !series.length ? (
            <div className="empty">Ainda não há histórico deste produto no período.</div>
          ) : <Grafico series={series} />}
        </>
      )}
    </>
  );
}

function Grafico({ series }: { series: Serie[] }) {
  const dias = [...new Set(series.flatMap((s) => s.pontos.map((p) => p.dia)))].sort();
  const precos = series.flatMap((s) => s.pontos.map((p) => p.preco));
  const min = Math.min(...precos), max = Math.max(...precos);
  const W = 340, H = 200, E = 44, B = 24, T = 10;
  const pad = (max - min) * 0.1 || max * 0.05 || 1;
  const y0 = min - pad, y1 = max + pad;
  const x = (d: string) => E + (dias.length === 1 ? (W - E - 8) / 2 : (dias.indexOf(d) / (dias.length - 1)) * (W - E - 8));
  const y = (p: number) => T + (1 - (p - y0) / (y1 - y0)) * (H - T - B);
  const marcas = [y0 + (y1 - y0) * 0.1, (y0 + y1) / 2, y1 - (y1 - y0) * 0.1];

  return (
    <>
      <figure className="card evol-grafico" style={{ margin: 0 }}>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Preço por mercado ao longo do tempo">
          {marcas.map((m) => (
            <g key={m}>
              <line x1={E} x2={W - 4} y1={y(m)} y2={y(m)} className="evol-grade" />
              <text x={E - 6} y={y(m) + 4} textAnchor="end" className="evol-eixo">{m.toFixed(2).replace('.', ',')}</text>
            </g>
          ))}
          <text x={E} y={H - 6} className="evol-eixo">{dataBr(dias[0]).slice(0, 5)}</text>
          {dias.length > 1 && <text x={W - 4} y={H - 6} textAnchor="end" className="evol-eixo">{dataBr(dias[dias.length - 1]).slice(0, 5)}</text>}
          {series.map((s) => (
            <g key={s.mercado}>
              {s.pontos.length > 1 && <polyline fill="none" stroke={s.cor} strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round"
                points={s.pontos.map((p) => `${x(p.dia)},${y(p.preco)}`).join(' ')} />}
              {s.pontos.map((p) => <circle key={p.dia} cx={x(p.dia)} cy={y(p.preco)} r="2.6" fill={s.cor}><title>{`${s.mercado} · ${dataBr(p.dia)}: ${brl(p.preco)}`}</title></circle>)}
            </g>
          ))}
        </svg>
        <figcaption className="evol-legenda">
          {series.map((s) => <span key={s.mercado}><i style={{ background: s.cor }} />{s.mercado}</span>)}
        </figcaption>
      </figure>
      <div className="adm-tabela evol-tabela" role="table">
        <div role="row" className="cab"><span>Mercado</span><span>Último</span><span>Menor</span><span>Maior</span><span>Variação</span></div>
        {series.map((s) => {
          const ps = s.pontos.map((p) => p.preco);
          const ult = ps[ps.length - 1], pri = ps[0];
          const v = pri ? ((ult - pri) / pri) * 100 : 0;
          return (
            <div role="row" key={s.mercado}>
              <span><i className="evol-cor" style={{ background: s.cor }} />{s.mercado}</span>
              <span>{brl(ult)}<small className="muted"> {dataBr(s.pontos[s.pontos.length - 1].dia).slice(0, 5)}</small></span>
              <span>{brl(Math.min(...ps))}</span>
              <span>{brl(Math.max(...ps))}</span>
              <span className={v > 0.5 ? 'evol-sobe' : v < -0.5 ? 'evol-desce' : ''}>{v > 0 ? '+' : ''}{v.toFixed(1).replace('.', ',')}%</span>
            </div>
          );
        })}
      </div>
      <p className="muted">Variação: do primeiro ao último preço do período. Preços de site podem diferir da loja física.</p>
    </>
  );
}

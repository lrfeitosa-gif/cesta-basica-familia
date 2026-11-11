'use client';
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { brl, dataBr, emb, filtrarFoco, norm, useOfertas, type Oferta } from '@/lib/ofertas';
import { Carregando, ErroCarga } from '../linha-oferta';

const PERIODOS = [[30, '30 dias'], [90, '3 meses'], [365, '1 ano']] as const;
const CORES = ['#4f7f5c', '#2f6db3', '#c0841a', '#9b4d8f', '#c2493d', '#2a9d8f', '#6b6f2a', '#5b5f97', '#8a5a2b'];

type Ponto = { dia: string; preco: number };
type Serie = { mercado: string; pontos: Ponto[]; cor: string };
type ItemBase = { id: number; nome: string };
// Escolha: um item genérico do cadastro base (todas as marcas e tamanhos, pelo preço do quilo/litro)
// ou um produto específico (mesmo código de barras, ou mesmo nome e tamanho).
// ou todos os produtos achados pela busca juntos (mesma categoria, todas as marcas, pelo preço do quilo/litro).
type Escolha = { item: ItemBase } | { produto: Oferta } | { grupo: { busca: string; produtos: Oferta[] } };
const chaveProd = (ean: string | null, nome: string, q: number, u: string) => `${ean || nome}|${Number(q)}${u}`;

// Histórico de preços (migração 0019): os dias recentes ficam em `oferta`, uma linha por dia; os mais antigos
// em `oferta_periodo`, uma linha por período de preço. Aqui os períodos voltam a ser dias. Um dia que esteja
// nas duas tabelas tem o mesmo preço nas duas, e `montar` fica com o menor por dia e mercado: não duplica.
type LinhaHist = { preco: number; valido_de: string; mercado: { rede: string }; produto: { nome: string; ean: string | null; quantidade: number; unidade: string } };
const SEL_HIST = 'mercado!inner(rede),produto!inner(nome,ean,quantidade,unidade)';
const maisDias = (d: string, n: number) => new Date(Date.parse(d) + n * 86400000).toISOString().slice(0, 10);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Filtro = (consulta: any) => any;
async function historico(filtrar: Filtro, desde: string): Promise<LinhaHist[]> {
  const out: LinhaHist[] = [];
  for (let i = 0; i < 20; i++) {
    const { data, error } = await filtrar(supabase.from('oferta').select(`preco,valido_de,${SEL_HIST}`).gte('valido_de', desde))
      .order('id').range(i * 1000, i * 1000 + 999);
    if (error) throw error;
    out.push(...((data ?? []) as LinhaHist[]));
    if ((data ?? []).length < 1000) break;
  }
  type Periodo = Omit<LinhaHist, 'valido_de'> & { de: string; ate: string };
  for (let i = 0; i < 20; i++) {
    const { data, error } = await filtrar(supabase.from('oferta_periodo').select(`preco,de,ate,${SEL_HIST}`).gte('ate', desde))
      .order('id').range(i * 1000, i * 1000 + 999);
    if (error) throw error;
    for (const p of (data ?? []) as Periodo[]) {
      for (let d = p.de < desde ? desde : p.de; d <= p.ate; d = maisDias(d, 1)) {
        out.push({ preco: p.preco, valido_de: d, mercado: p.mercado, produto: p.produto });
      }
    }
    if ((data ?? []).length < 1000) break;
  }
  return out;
}

// Evolução do preço ao longo das coletas: uma linha por mercado, no período escolhido.
export default function Evolucao() {
  const { dados, erro, tentarDeNovo } = useOfertas();
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<Escolha | null>(null);
  const [dias, setDias] = useState<number>(90);
  const [series, setSeries] = useState<Serie[] | null>(null);
  const [unidade, setUnidade] = useState('');
  const [falha, setFalha] = useState('');
  const [itens, setItens] = useState<ItemBase[]>([]);

  useEffect(() => {
    supabase.from('item_base').select('id,nome').eq('ativo', true).order('nome')
      .then(({ data }) => setItens((data ?? []) as ItemBase[]));
  }, []);

  const itensAchados = useMemo(() => {
    const termos = norm(q).split(/\s+/).filter(Boolean);
    if (!termos.length) return [];
    // "arroz" acha "Arroz branco"; "arroz branco tipo 1 5 kg" também (todas as palavras do item estão na busca)
    const busca = ` ${termos.join(' ')} `;
    return itens.filter((i) => termos.every((t) => norm(i.nome).includes(t))
      || norm(i.nome).split(/\s+/).every((w) => busca.includes(` ${w} `))).slice(0, 8);
  }, [itens, q]);

  // todos os produtos diferentes que a busca acha (para "comparar todos"); a lista mostra os 15 primeiros
  const todosAchados = useMemo(() => {
    if (!dados || !q.trim()) return [];
    const vistos = new Set<string>();
    return filtrarFoco(dados.lista, q).filter((o) => {
      const k = chaveProd(o.ean, o.nome, o.q, o.u);
      if (vistos.has(k)) return false;
      vistos.add(k); return true;
    });
  }, [dados, q]);
  const achados = todosAchados.slice(0, 15);
  // medida mais comum entre os achados: o grupo compara só os vendidos nela (quilo com quilo)
  const grupoDaBusca = useMemo(() => {
    const conta = new Map<string, number>();
    for (const o of todosAchados) conta.set(o.ub, (conta.get(o.ub) ?? 0) + 1);
    const [ub] = [...conta.entries()].sort((a, b) => b[1] - a[1])[0] ?? [];
    const produtos = todosAchados.filter((o) => o.ub === ub).slice(0, 60);
    return { produtos, marcas: new Set(produtos.map((o) => o.marca).filter(Boolean)).size, ub: ub ?? '' };
  }, [todosAchados]);

  useEffect(() => {
    if (!sel) return;
    setSeries(null); setFalha(''); setUnidade('');
    const montar = (linhas: { dia: string; mercado: string; preco: number }[]) => {
      const por = new Map<string, Map<string, number>>();
      for (const l of linhas) {
        const m = por.get(l.mercado) ?? new Map<string, number>();
        m.set(l.dia, Math.min(m.get(l.dia) ?? Infinity, Number(l.preco)));
        por.set(l.mercado, m);
      }
      setSeries([...por.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([mercado, m], i) => ({
        mercado, cor: CORES[i % CORES.length], pontos: [...m.entries()].map(([dia, preco]) => ({ dia, preco })).sort((a, b) => a.dia.localeCompare(b.dia)),
      })));
    };
    const erroCarga = () => setFalha('Não conseguimos carregar o histórico agora.');

    if ('grupo' in sel) {
      // histórico de cada produto achado; por dia e mercado vale o menor preço do quilo/litro/unidade
      const prods = sel.grupo.produtos;
      const chaves = new Set(prods.map((o) => chaveProd(o.ean, o.nome, o.q, o.u)));
      const eans = [...new Set(prods.filter((o) => o.ean).map((o) => o.ean))];
      const nomes = [...new Set(prods.filter((o) => !o.ean).map((o) => o.nome))];
      const desde = new Date(Date.now() - dias * 86400000).toISOString().slice(0, 10);
      const buscarTudo = async (campo: 'produto.ean' | 'produto.nome', valores: string[]) =>
        valores.length ? historico((c) => c.in(campo, valores), desde) : [];
      setUnidade(prods[0]?.ub ?? '');
      Promise.all([buscarTudo('produto.ean', eans), buscarTudo('produto.nome', nomes)]).then(([a, b]) => {
        const linhas = [...a, ...b].filter((l) => chaves.has(chaveProd(l.produto.ean, l.produto.nome, l.produto.quantidade, l.produto.unidade)));
        montar(linhas.map((l) => {
          const qtd = Number(l.produto.quantidade);
          const base = l.produto.unidade === 'g' || l.produto.unidade === 'ml' ? qtd / 1000 : qtd;
          return { dia: l.valido_de, mercado: l.mercado.rede, preco: Number(l.preco) / base };
        }));
      }).catch(erroCarga);
      return;
    }
    if ('item' in sel) {
      // agrupado no banco (migração 0014): menor preço do quilo/litro por dia e mercado, entre todas as marcas
      supabase.rpc('evolucao_item_base', { p_item: sel.item.id, p_dias: dias }).then(({ data, error }) => {
        if (error) return erroCarga();
        const linhas = (data ?? []) as { dia: string; mercado: string; preco_un: number; unidade: string }[];
        setUnidade(linhas[0]?.unidade ?? '');
        montar(linhas.map((l) => ({ dia: l.dia, mercado: l.mercado, preco: Number(l.preco_un) })));
      });
      return;
    }
    const prod = sel.produto;
    const desde = new Date(Date.now() - dias * 86400000).toISOString().slice(0, 10);
    // com código de barras, o mesmo produto é achado em todos os mercados; sem ele, pelo nome. Sempre no mesmo
    // tamanho: há mercados que usam o código da lata avulsa também no pack (migração 0015)
    historico((c) => (prod.ean ? c.eq('produto.ean', prod.ean) : c.eq('produto.nome', prod.nome))
      .eq('produto.quantidade', prod.q).eq('produto.unidade', prod.u), desde)
      .then((linhas) => montar(linhas.map((l) => ({ dia: l.valido_de, mercado: l.mercado.rede, preco: l.preco }))))
      .catch(erroCarga);
  }, [sel, dias]);

  const porItem = !!sel && ('item' in sel || 'grupo' in sel);
  const nomeUnidade = unidade === 'un' ? 'unidade' : unidade === 'l' ? 'litro' : 'quilo';

  return (
    <>
      <div>
        <h1>Evolução de preços</h1>
        <p className="lead">Veja como o preço de um item mudou em cada mercado, desde o início das coletas.</p>
      </div>

      {!sel ? (
        <>
          <div className="field">
            <label htmlFor="q-evol" className="visually-hidden">Buscar item</label>
            <input id="q-evol" className="input" type="search" autoComplete="off" placeholder="Ex.: café, arroz, feijão carioca"
              value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          {!q.trim() ? (
            <div className="empty">Digite um item, como &quot;café&quot;, e escolha na lista para ver o histórico.</div>
          ) : <>
            {itensAchados.length > 0 && <>
              <h2 className="evol-secao">Todas as marcas (pelo preço do quilo ou litro)</h2>
              <div className="lista">
                {itensAchados.map((i) => (
                  <button key={i.id} type="button" className="linha-escolha" onClick={() => setSel({ item: i })}>
                    <span><b>{i.nome}</b></span>
                    <span className="muted">todas as marcas</span>
                  </button>
                ))}
              </div>
            </>}
            {dados && grupoDaBusca.produtos.length > 1 && (
              <button type="button" className="linha-escolha linha-grupo" onClick={() => setSel({ grupo: { busca: q.trim(), produtos: grupoDaBusca.produtos } })}>
                <span><b>Comparar todos os {grupoDaBusca.produtos.length} encontrados</b>
                  <span className="muted"> · {grupoDaBusca.marcas} {grupoDaBusca.marcas === 1 ? 'marca' : 'marcas'}, pelo preço do {grupoDaBusca.ub === 'un' ? 'item' : grupoDaBusca.ub === 'l' ? 'litro' : 'quilo'}</span></span>
                <span className="mkt">ver →</span>
              </button>
            )}
            {erro ? <ErroCarga tentarDeNovo={tentarDeNovo} /> : !dados ? <Carregando /> : achados.length > 0 ? <>
              <h2 className="evol-secao">Ou um produto específico</h2>
              <div className="lista">
                {achados.map((o) => (
                  <button key={o.id} type="button" className="linha-escolha" onClick={() => setSel({ produto: o })}>
                    <span><b>{o.nome}</b>{o.marca && <span className="muted"> · {o.marca}</span>}</span>
                    <span className="muted">{emb(o)}</span>
                  </button>
                ))}
              </div>
            </> : !itensAchados.length && <div className="empty">Nada encontrado. Tente menos palavras.</div>}
          </>}
        </>
      ) : (
        <>
          <div className="card stack">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              {'grupo' in sel
                ? <span><b>&quot;{sel.grupo.busca}&quot;</b> <span className="muted">{sel.grupo.produtos.length} produtos, todas as marcas, preço do {nomeUnidade}</span></span>
                : 'item' in sel
                ? <span><b>{sel.item.nome}</b> <span className="muted">todas as marcas{unidade && `, preço do ${nomeUnidade}`}</span></span>
                : <span><b>{sel.produto.nome}</b> <span className="muted">{emb(sel.produto)}</span></span>}
              <button type="button" className="btn btn-link" onClick={() => { setSel(null); setSeries(null); }}>Trocar</button>
            </div>
            <div className="choice" role="radiogroup" aria-label="Período">
              {PERIODOS.map(([d, r]) => (
                <label key={d}><input type="radio" name="periodo" checked={dias === d} onChange={() => setDias(d)} /><span>{r}</span></label>
              ))}
            </div>
          </div>
          {falha ? <div className="alert alert-error" role="alert">{falha}</div> : !series ? <Carregando /> : !series.length ? (
            <div className="empty">Ainda não há histórico deste {porItem ? 'item' : 'produto'} no período.</div>
          ) : <Grafico series={series} sufixo={porItem && unidade ? `/${unidade}` : ''} />}
          {series && series.length > 0 && (
            <p className="muted">
              Variação: do primeiro ao último preço do período.
              {porItem && ` Em cada dia vale a opção mais barata pelo preço do ${nomeUnidade}, entre todas as marcas e tamanhos ${'grupo' in sel ? 'encontrados pela busca' : 'do item'}.`}
              {' '}Preços de site podem diferir da loja física.
            </p>
          )}
        </>
      )}
    </>
  );
}

function Grafico({ series, sufixo }: { series: Serie[]; sufixo: string }) {
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
              {s.pontos.map((p) => <circle key={p.dia} cx={x(p.dia)} cy={y(p.preco)} r="2.6" fill={s.cor}><title>{`${s.mercado} · ${dataBr(p.dia)}: ${brl(p.preco)}${sufixo}`}</title></circle>)}
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
              <span>{brl(ult)}{sufixo}<small className="muted"> {dataBr(s.pontos[s.pontos.length - 1].dia).slice(0, 5)}</small></span>
              <span>{brl(Math.min(...ps))}{sufixo}</span>
              <span>{brl(Math.max(...ps))}{sufixo}</span>
              <span className={v > 0.5 ? 'evol-sobe' : v < -0.5 ? 'evol-desce' : ''}>{v > 0 ? '+' : ''}{v.toFixed(1).replace('.', ',')}%</span>
            </div>
          );
        })}
      </div>
    </>
  );
}

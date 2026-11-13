'use client';
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { brl, dataBr, emb, filtrarFoco, norm, useOfertas, type Oferta } from '@/lib/ofertas';
import { Carregando, ErroCarga } from '../linha-oferta';
import { useSessao } from '@/lib/sessao';
import { adicionarNaCesta } from '@/lib/cesta';
import { mostrarAviso } from '../aviso';

const PERIODOS = [[30, '30 dias'], [90, '3 meses'], [180, '6 meses'], [365, '1 ano']] as const;
// Uma cor fixa e diferente por mercado (antes as cores se repetiam a partir do 10º mercado: Assaí e Savegnago
// quase iguais, Atacadão e Sumerbol iguais). A mesma rede tem sempre a mesma cor em qualquer gráfico.
const COR_MERCADO: Record<string, string> = {
  'Assaí': '#d1495b', 'Atacadão': '#1f5fbf', 'Cato': '#7a8b00', 'Covabra': '#2a9d8f', 'Goodbom': '#e07a00',
  'Pague Menos': '#8e44ad', 'Revolução': '#5d4037', 'Roldão': '#c2185b', "Sam's Club": '#0b7285', 'Savegnago': '#2e7d32',
  'São Vicente': '#b88400', 'Sonda': '#455a64', 'Sumerbol': '#6d8cff',
};
const CORES_EXTRA = ['#9c27b0', '#00897b', '#ff7043', '#3949ab', '#827717'];

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

// Características que viram selo no cartão do produto (e saem do título, para o nome ficar curto)
const SELOS: [RegExp, string][] = [
  [/\bsem\s+gl[uú]ten\b/i, 'Sem glúten'], [/\bsem\s+lactose\b|\bzero\s+lactose\b/i, 'Sem lactose'],
  [/\bintegral\b/i, 'Integral'], [/\bdiet\b/i, 'Diet'], [/\blight\b/i, 'Light'], [/\bzero\b(?!\s+lactose)/i, 'Zero'],
  [/\borg[aâ]nico\b/i, 'Orgânico'], [/\bvegano\b/i, 'Vegano'],
];
function cartaoProduto(o: Oferta) {
  let nome = o.nome;
  const selos: string[] = [];
  for (const [re, rotulo] of SELOS) if (re.test(nome)) { selos.push(rotulo); nome = nome.replace(re, ' '); }
  // tira a marca e o tamanho do título: aparecem à parte, no chip e à direita
  if (o.marca) nome = nome.replace(new RegExp(o.marca.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'ig'), ' ');
  nome = nome.replace(/\b\d+(?:[.,]\d+)?\s*(?:kg|g|gr|ml|l|lt|un|unid)\b/ig, ' ').replace(/\s*[-–]\s*$/, '').replace(/\s{2,}/g, ' ').trim();
  return { nome: nome || o.nome, selos };
}
// Ícone de minigráfico: avisa que o toque abre a linha do tempo de preços
const IconeTendencia = () => (
  <svg className="ico-tendencia" viewBox="0 0 32 20" aria-hidden="true"><path d="M2 16 10 9l6 4 8-9 6 3" /><path d="M2 19h28" opacity=".35" /></svg>
);

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
  const [escopo, setEscopo] = useState<'geral' | 'itens'>('geral');
  const sessao = useSessao();
  // Depois de ver onde está mais barato: pôr na cesta ou criar um alerta para o que foi escolhido
  const alvoDaEscolha = (e: Escolha) => 'produto' in e ? { termo: e.produto.nome, marca: e.produto.marca || null }
    : 'item' in e ? { termo: e.item.nome, marca: null } : { termo: e.grupo.busca, marca: null };
  const porNaCesta = async () => {
    if (!sel || !sessao) return;
    const { termo } = alvoDaEscolha(sel);
    mostrarAviso({ texto: await adicionarNaCesta(sessao.user.id, termo, 1) });
  };
  const criarAlerta = async () => {
    if (!sel || !sessao) return;
    const { termo, marca } = alvoDaEscolha(sel);
    if (!window.confirm(`Criar alerta para "${termo}"${marca ? `, marca ${marca}` : ''}? Avisamos quando ficar 15% abaixo do normal ou no menor preço do mês.`)) return;
    await supabase.rpc('garantir_familia');
    const { error } = await supabase.from('item_interesse').insert({ familia_id: sessao.user.id, termo, marca, preco_alvo: null, origem: 'manual' });
    mostrarAviso({ texto: error ? 'Não foi possível criar o alerta agora. Tente pela tela Alertas.' : `Alerta criado para "${termo}". Para pôr um preço-alvo, abra Alertas.` });
  };

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
        mercado, cor: COR_MERCADO[mercado] ?? CORES_EXTRA[i % CORES_EXTRA.length], pontos: [...m.entries()].map(([dia, preco]) => ({ dia, preco })).sort((a, b) => a.dia.localeCompare(b.dia)),
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
          <form className="busca-topo" role="search" onSubmit={(e) => e.preventDefault()}>
            <label htmlFor="q-evol" className="visually-hidden">Buscar item</label>
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
            <input id="q-evol" className="input" type="search" autoComplete="off" enterKeyHint="search" placeholder="Ex.: café, arroz, feijão carioca"
              value={q} onChange={(e) => setQ(e.target.value)} />
          </form>
          {!q.trim() ? (
            <div className="evol-intro">
              <IconeTendencia />
              <span>Digite um item, como &quot;café&quot;. Ao escolher, abre um gráfico com o preço em cada mercado ao longo do tempo.</span>
            </div>
          ) : <>
            <div className="segmentado segmentado-2" role="tablist" aria-label="O que ver">
              <button type="button" role="tab" aria-selected={escopo === 'geral'} className={escopo === 'geral' ? 'ativo' : ''} onClick={() => setEscopo('geral')}>Visão geral</button>
              <button type="button" role="tab" aria-selected={escopo === 'itens'} className={escopo === 'itens' ? 'ativo' : ''} onClick={() => setEscopo('itens')}>
                Produtos{dados && todosAchados.length ? ` (${todosAchados.length > 15 ? '15+' : todosAchados.length})` : ''}
              </button>
            </div>
            {escopo === 'geral' ? <>
              {dados && grupoDaBusca.produtos.length > 1 && (
                <button type="button" className="evol-banner" onClick={() => setSel({ grupo: { busca: q.trim(), produtos: grupoDaBusca.produtos } })}>
                  <span className="evol-banner-ico" aria-hidden="true"><IconeTendencia /></span>
                  <span className="evol-banner-texto">
                    <b>Comparar os {grupoDaBusca.produtos.length} produtos de &quot;{q.trim()}&quot;</b>
                    <small>{grupoDaBusca.marcas} {grupoDaBusca.marcas === 1 ? 'marca' : 'marcas'}, pelo preço do {grupoDaBusca.ub === 'un' ? 'item' : grupoDaBusca.ub === 'l' ? 'litro' : 'quilo'}, em todos os mercados</small>
                  </span>
                  <span className="evol-banner-cta">Ver evolução →</span>
                </button>
              )}
              {itensAchados.length > 0 && <>
                <h2 className="evol-secao">Por categoria, todas as marcas</h2>
                <div className="evol-cards">
                  {itensAchados.map((i) => (
                    <button key={i.id} type="button" className="evol-card" onClick={() => setSel({ item: i })}>
                      <span className="evol-card-texto"><b>{i.nome}</b><small>preço do quilo ou litro</small></span>
                      <IconeTendencia />
                    </button>
                  ))}
                </div>
              </>}
              {erro ? <ErroCarga tentarDeNovo={tentarDeNovo} /> : !dados ? <Carregando />
                : !itensAchados.length && grupoDaBusca.produtos.length <= 1 && (achados.length
                  ? <button type="button" className="link-dicas" onClick={() => setEscopo('itens')}>Ver os produtos →</button>
                  : <div className="empty">Nada encontrado. Tente menos palavras.</div>)}
            </> : erro ? <ErroCarga tentarDeNovo={tentarDeNovo} /> : !dados ? <Carregando /> : achados.length > 0 ? (
              <div className="evol-cards">
                {achados.map((o) => {
                  const c = cartaoProduto(o);
                  return (
                    <button key={o.id} type="button" className="evol-card evol-produto" onClick={() => setSel({ produto: o })}>
                      <span className="evol-card-texto">
                        <b>{c.nome}</b>
                        <span className="evol-chips">
                          {o.marca && <span className="chip-marca">{o.marca}</span>}
                          {c.selos.map((x) => <span key={x} className="chip-selo">{x}</span>)}
                        </span>
                      </span>
                      <span className="evol-peso">{emb(o)}</span>
                      <IconeTendencia />
                    </button>
                  );
                })}
              </div>
            ) : <div className="empty">Nenhum produto específico encontrado. Tente menos palavras.</div>}
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
            <div className="segmentado segmentado-4" role="tablist" aria-label="Período">
              {PERIODOS.map(([d, r]) => (
                <button key={d} type="button" role="tab" aria-selected={dias === d} className={dias === d ? 'ativo' : ''} onClick={() => setDias(d)}>{r}</button>
              ))}
            </div>
          </div>
          {falha ? <div className="alert alert-error" role="alert">{falha}</div> : !series ? <Carregando /> : !series.length ? (
            <div className="empty">Ainda não há histórico deste {porItem ? 'item' : 'produto'} no período.</div>
          ) : <>
            <Grafico series={series} sufixo={porItem && unidade ? `/${unidade}` : ''} />
            <div className="evol-acoes">
              <button type="button" className="btn btn-primary" onClick={porNaCesta}>+ Pôr na cesta</button>
              <button type="button" className="btn btn-secondary" onClick={criarAlerta}>🔔 Criar alerta</button>
            </div>
          </>}
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
  const [foco, setFoco] = useState<string | null>(null);   // mercado destacado pela legenda
  const dias = [...new Set(series.flatMap((s) => s.pontos.map((p) => p.dia)))].sort();
  const precos = series.flatMap((s) => s.pontos.map((p) => p.preco));
  const min = Math.min(...precos), max = Math.max(...precos);
  const W = 340, H = 200, E = 44, B = 24, T = 20;
  const pad = (max - min) * 0.1 || max * 0.05 || 1;
  const y0 = min - pad, y1 = max + pad;
  const x = (d: string) => E + (dias.length === 1 ? (W - E - 8) / 2 : (dias.indexOf(d) / (dias.length - 1)) * (W - E - 8));
  const y = (p: number) => T + (1 - (p - y0) / (y1 - y0)) * (H - T - B);
  const marcas = [y0 + (y1 - y0) * 0.1, (y0 + y1) / 2, y1 - (y1 - y0) * 0.1];
  // último preço de cada mercado, do menor para o maior: o primeiro é o "Melhor preço"
  const ultimos = series.map((s) => ({ s, p: s.pontos[s.pontos.length - 1] })).sort((a, b) => a.p.preco - b.p.preco);
  const melhor = ultimos[0];
  // ordem de desenho: o destacado por último, por cima dos outros
  const desenho = foco ? [...series.filter((s) => s.mercado !== foco), ...series.filter((s) => s.mercado === foco)] : series;

  return (
    <>
      {melhor && (
        <div className="evol-melhor">
          <span className="selo-melhor">Melhor preço</span>
          <span><b>{melhor.s.mercado}</b> · {brl(melhor.p.preco)}{sufixo}</span>
          <small className="muted">último preço, {dataBr(melhor.p.dia).slice(0, 5)}</small>
        </div>
      )}
      <p className="muted evol-desde">Dados desde {dataBr(dias[0]).slice(0, 5)}. Toque num mercado da legenda para destacar a linha.</p>
      <figure className="card evol-grafico" style={{ margin: 0 }}>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Preço por mercado ao longo do tempo">
          {marcas.map((m) => (
            <g key={m}>
              <line x1={E} x2={W - 4} y1={y(m)} y2={y(m)} className="evol-grade" />
              <text x={E - 6} y={y(m) + 4} textAnchor="end" className="evol-eixo">{m.toFixed(2).replace('.', ',')}</text>
            </g>
          ))}
          <text x={4} y={12} className="evol-eixo">R${sufixo || ''}</text>
          <text x={E} y={H - 6} className="evol-eixo">{dataBr(dias[0]).slice(0, 5)}</text>
          {dias.length > 1 && <text x={W - 4} y={H - 6} textAnchor="end" className="evol-eixo">{dataBr(dias[dias.length - 1]).slice(0, 5)}</text>}
          {desenho.map((s) => {
            const apagada = !!foco && foco !== s.mercado;
            const forte = foco === s.mercado;
            return (
              <g key={s.mercado} opacity={apagada ? 0.15 : 1}>
                {s.pontos.length > 1 && <polyline fill="none" stroke={s.cor} strokeWidth={forte ? 3.6 : 2.2} strokeLinejoin="round" strokeLinecap="round"
                  points={s.pontos.map((p) => `${x(p.dia)},${y(p.preco)}`).join(' ')} />}
                {s.pontos.map((p) => <circle key={p.dia} cx={x(p.dia)} cy={y(p.preco)} r={forte ? 3.4 : 2.6} fill={s.cor}><title>{`${s.mercado} · ${dataBr(p.dia)}: ${brl(p.preco)}${sufixo}`}</title></circle>)}
              </g>
            );
          })}
        </svg>
        <figcaption className="evol-legenda" role="group" aria-label="Destacar um mercado">
          {series.map((s) => (
            <button key={s.mercado} type="button" aria-pressed={foco === s.mercado} data-apagado={!!foco && foco !== s.mercado}
              onClick={() => setFoco(foco === s.mercado ? null : s.mercado)}>
              <i style={{ background: s.cor }} />{s.mercado}
            </button>
          ))}
        </figcaption>
      </figure>
      <div className="adm-tabela evol-tabela" role="table">
        <div role="row" className="cab"><span>Mercado</span><span>Último</span><span>Menor</span><span>Maior</span><span>Variação</span></div>
        {ultimos.map(({ s }, i) => {
          const ps = s.pontos.map((p) => p.preco);
          const ult = ps[ps.length - 1], pri = ps[0];
          const v = pri ? ((ult - pri) / pri) * 100 : 0;
          return (
            <div role="row" key={s.mercado} className={i === 0 ? 'evol-linha-melhor' : undefined}>
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

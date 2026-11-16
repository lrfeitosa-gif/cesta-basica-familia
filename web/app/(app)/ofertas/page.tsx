'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { agruparVariacoes, brl, carregarPrevia, dataBr, filtrarFoco, GRUPOS, grupo, norm, ordenarPorMedida, useOfertas, type Oferta } from '@/lib/ofertas';
import { supabase } from '@/lib/supabase';
import LinhaOferta, { Carregando, ErroCarga } from '../linha-oferta';
import { useSessao } from '@/lib/sessao';
import { useDistTexto } from '@/lib/locais';
import Fontes from '../fontes';
import BoasVindas from '../boas-vindas';
import PrimeirosPassos from '../primeiros-passos';
import PerguntaIA from './pergunta-ia';
import LinhaRolagem from '../linha-rolagem';
import ComparativoMercados, { OutrasFormas } from '../comparativo-mercados';

// Fora das oportunidades: ração e destilados (bebidas do dia a dia, como cerveja, continuam)
const RUIDO = /racao|caes|gatos|whisky|vodka|gin /;
const POR_PAGINA = 10;

// Exemplos tocáveis abaixo da busca: ensinam que dá para perguntar à IA.
const EXEMPLOS_IA = ['Qual o café mais barato?', 'Põe 2 arroz 5 kg na cesta', 'Me avise quando o feijão baixar'];

// Tela Preços (14/11): Ofertas e Comparar numa só. Sem busca, os maiores descontos do dia; com busca, o menor preço por
// quilo de cada mercado e todos os preços. A IA só responde pelo botão "Perguntar" (antes, frases com cara de pergunta
// iam sozinhas para a IA e mostravam só 3 resultados).
export default function Oportunidades() {
  const { dados, erro, tentarDeNovo } = useOfertas();
  const familiaId = useSessao()?.user.id;
  const distTxt = useDistTexto(familiaId);
  const [mercado, setMercado] = useState('Todos');
  // 15/11 (Fase 3): filtro por mercado e "Fontes de preço" ficam no botão Filtros, ao lado da busca
  const [filtrosAbertos, setFiltrosAbertos] = useState(false);
  const [limite, setLimite] = useState(POR_PAGINA);
  const [q, setQ] = useState('');
  const [forcarIA, setForcarIA] = useState(false);   // botão "Perguntar" ou exemplo tocado: manda para a IA mesmo sem cara de pergunta
  const [pedido, setPedido] = useState(0);           // cada toque em "Perguntar"/exemplo/Enter dispara a pergunta
  const [cat, setCat] = useState('Todas');
  const [semNotas, setSemNotas] = useState(false);
  // a carga completa às vezes trava (banco ocupado durante a coleta): depois de 25 s, oferece tentar de novo
  const [demorou, setDemorou] = useState(false);
  useEffect(() => {
    if (dados || erro) { setDemorou(false); return; }
    const t = setTimeout(() => setDemorou(true), 25_000);
    return () => clearTimeout(t);
  }, [dados, erro]);
  const [bvFechou, setBvFechou] = useState(0);   // boas-vindas fechadas agora: mostra os primeiros passos

  useEffect(() => {
    supabase.from('compra').select('id', { count: 'exact', head: true }).then(({ count }) => setSemNotas(!count));
  }, []);

  // enquanto a lista inteira carrega, mostra já os maiores descontos (consulta pequena e rápida)
  const [previa, setPrevia] = useState<Oferta[] | null>(null);
  useEffect(() => { carregarPrevia().then(setPrevia).catch(() => {}); }, []);

  // sugestões ao digitar: itens genéricos do cadastro base e nomes dos mercados
  const [itensBase, setItensBase] = useState<string[]>([]);
  useEffect(() => {
    supabase.from('item_base').select('nome').eq('ativo', true).order('nome')
      .then(({ data }) => setItensBase((data ?? []).map((i: { nome: string }) => i.nome)));
  }, []);
  const sugestoes = useMemo(() => {
    const t = norm(q.trim());
    if (t.length < 2) return [];
    return [...new Set([...itensBase, ...(dados?.mercados ?? [])])]
      .filter((n) => norm(n).includes(t) && norm(n) !== t)
      .sort((a, b) => Number(!norm(b).startsWith(t)) - Number(!norm(a).startsWith(t)) || a.localeCompare(b))
      .slice(0, 8);
  }, [q, itensBase, dados]);

  const opp = useMemo(() => (dados?.lista ?? previa ?? [])
    .filter((o) => o.de > o.preco && !RUIDO.test(o.busca))
    .map((o) => ({ o, desc: 1 - o.preco / o.de }))
    .filter((x) => x.desc >= 0.08 && x.desc <= 0.7)
    .sort((a, b) => b.desc - a.desc), [dados, previa]);

  // com busca: todos os preços que combinam, do menor preço por kg/litro ao maior; sem busca: maiores descontos
  // Preço do quilo não se compara com preço da unidade: a medida mais comum nos resultados vem primeiro
  // (é dela o "Mais barato"); as outras medidas aparecem depois, cada uma do menor para o maior.
  // pergunta em linguagem natural ("qual o café mais barato?"): vai para a IA, não para a busca por palavras
  const modoPergunta = !!q.trim() && forcarIA;
  // ?q= vindo de outra tela (Comparar antigo, links): já abre com a busca
  useEffect(() => { const v = new URLSearchParams(window.location.search).get('q'); if (v) setQ(v); }, []);
  const buscarTexto = (t: string) => { setQ(t); setForcarIA(false); setCat('Todas'); setMercado('Todos'); setLimite(POR_PAGINA); };
  const perguntarAgora = (texto?: string) => {
    const t = texto ?? q;
    if (texto !== undefined) setQ(texto);
    if (!t.trim()) { document.getElementById('busca')?.focus(); return; }
    setForcarIA(true); setPedido((n) => n + 1);
  };
  const busca = useMemo(() => (dados && q.trim() && !modoPergunta ? ordenarPorMedida(filtrarFoco(dados.lista, q)) : null), [dados, q, modoPergunta]);
  // com categoria escolhida: todos os preços dela (descontos primeiro, depois o menor preço por kg/litro)
  const comDesc = (o: Oferta) => ({ o, desc: o.de > o.preco ? 1 - o.preco / o.de : 0 });
  const porCategoria = useMemo(() => (dados && cat !== 'Todas'
    ? dados.lista.filter((o) => grupo(o.categoria) === cat).map(comDesc)
        .sort((a, b) => (b.desc >= 0.08 ? 1 : 0) - (a.desc >= 0.08 ? 1 : 0) || b.desc - a.desc || a.o.porUn - b.o.porUn)
    : null), [dados, cat]);
  const base = (busca ? busca.map(comDesc) : porCategoria ?? opp)
    .filter((x) => cat === 'Todas' || !busca || grupo(x.o.categoria) === cat);
  const categorias = ['Todas', ...GRUPOS.map(([g]) => g).filter((g) => dados?.lista.some((o) => grupo(o.categoria) === g))];
  const mercados = ['Todos', ...(dados?.mercados ?? []).filter((m) => base.some((x) => x.o.mercado === m))];
  const filtradas = base.filter((x) => mercado === 'Todos' || x.o.mercado === mercado);
  // variações quase iguais (mesmo mercado, preço, marca e tamanho) viram um card com "N opções" (Fase 3.2)
  const agrupadas = useMemo(() => agruparVariacoes(filtradas), [filtradas]);
  const lista = agrupadas.slice(0, limite);

  return (
    <>
      <BoasVindas familiaId={familiaId} aoFechar={() => setBvFechou((n) => n + 1)} />
      <div>
        <h1>Preços de hoje</h1>
        <p className="lead">
          {q.trim() ? 'Do menor para o maior preço por quilo, litro ou unidade' : 'Os maiores descontos de hoje, comparados ao preço normal de cada mercado'}
          {dados && <> · {dados.lista.length.toLocaleString('pt-BR')} preços de {dados.mercados.length} mercados em {dataBr(dados.dia)}</>}.
        </p>
      </div>
      <div className="busca-linha">
      <form className="busca-topo" role="search" onSubmit={(e) => { e.preventDefault(); if (modoPergunta) perguntarAgora(); }}>
        <label htmlFor="busca" className="visually-hidden">Buscar produto ou perguntar à IA</label>
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
        <input id="busca" className="input" type="search" autoComplete="off" enterKeyHint="search"
          placeholder="Buscar produto: arroz 5kg, café pilão"
          value={q} onChange={(e) => { setQ(e.target.value); setLimite(POR_PAGINA); setForcarIA(false); if (e.target.value.trim()) { setCat('Todas'); setMercado('Todos'); } }} />
        <button type="button" className="btn-ia" onClick={() => perguntarAgora()} aria-label="Perguntar à IA">✨ Perguntar</button>
      </form>
      <button type="button" className={`btn-filtros${mercado !== 'Todos' ? ' ativo' : ''}`} aria-expanded={filtrosAbertos} aria-controls="painel-filtros"
        onClick={() => setFiltrosAbertos(!filtrosAbertos)} aria-label={`Filtros${mercado !== 'Todos' ? ` (mercado: ${mercado})` : ''}`}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 5h18M6 12h12M10 19h4" /></svg>
        <span>Filtros{mercado !== 'Todos' ? ' (1)' : ''}</span>
      </button>
      </div>
      {filtrosAbertos && (
        <section className="painel-filtros" id="painel-filtros" aria-label="Filtros">
          <span className="painel-filtros-rotulo">Mercado</span>
          {dados ? (
            <div className="chips" role="group" aria-label="Filtrar por mercado">
              {mercados.map((m) => (
                <button key={m} type="button" className="chip" aria-pressed={m === mercado}
                  onClick={() => { setMercado(m); setLimite(POR_PAGINA); }}>{m}</button>
              ))}
            </div>
          ) : <span className="muted">Carregando os mercados…</span>}
          {dados && <Fontes dados={dados} />}
        </section>
      )}
      {mercado !== 'Todos' && !filtrosAbertos && (
        <div className="chips filtro-ativo">
          <button type="button" className="chip" aria-pressed="true" onClick={() => setMercado('Todos')} aria-label={`Tirar o filtro do mercado ${mercado}`}>
            {mercado} ×
          </button>
        </div>
      )}
      {!q.trim() && (
        <LinhaRolagem rotulo="Exemplos de perguntas à IA" className="exemplos-ia">
          {EXEMPLOS_IA.map((t) => (
            <button key={t} type="button" className="chip chip-ia" onClick={() => perguntarAgora(t)}>✨ {t}</button>
          ))}
        </LinhaRolagem>
      )}
      {sugestoes.length > 0 && (
        <div className="chips sugestoes" role="group" aria-label="Sugestões de busca">
          {sugestoes.map((n) => (
            <button key={n} type="button" className="chip" onClick={() => buscarTexto(n)}>{n}</button>
          ))}
        </div>
      )}
      {modoPergunta && <PerguntaIA pergunta={q.trim()} dados={dados} familiaId={familiaId} distTxt={distTxt} pedido={pedido} aoBuscar={buscarTexto} />}
      {q.trim() && !modoPergunta && !dados && !erro && (
        <p className="buscando" role="status"><span className="giro" aria-hidden="true" />Buscando &quot;{q.trim()}&quot; em todos os preços de hoje…</p>
      )}
      {!q && <PrimeirosPassos familiaId={familiaId} versao={bvFechou} />}

      {semNotas && !q && (
        <Link href="/compra?ver=lista" className="convite">
          <b>Monte a cesta pela nota da última compra</b>
          <span>Na Cesta, fotografe a nota fiscal: os itens viram a sua lista e você vê onde sai mais barato hoje.</span>
        </Link>
      )}

      {erro && !(previa && opp.length && !q.trim()) && <ErroCarga tentarDeNovo={tentarDeNovo} />}
      {!dados && !q.trim() && (previa && opp.length ? (
        <>
          <div className="lista">
            {opp.slice(0, POR_PAGINA).map(({ o, desc }) => (
              <LinhaOferta key={o.id} o={o} dist={distTxt(o.mercado)} extra={<>−{Math.round(desc * 100)}%</>} />
            ))}
          </div>
          {erro ? (
            <button type="button" className="btn btn-secondary btn-block" onClick={tentarDeNovo}>Carregar todos os preços</button>
          ) : demorou ? (
            <button type="button" className="btn btn-secondary btn-block" onClick={() => { setDemorou(false); tentarDeNovo(); }}>
              Está demorando. Tentar carregar todos os preços de novo
            </button>
          ) : <p className="buscando" role="status"><span className="giro" aria-hidden="true" />Carregando todos os preços para a busca e os filtros…</p>}
        </>
      ) : !erro && <Carregando />)}
      {dados && !modoPergunta && (
        <>
          {!busca && (
            <LinhaRolagem rotulo="Filtrar por categoria">
              {categorias.map((g) => (
                <button key={g} type="button" className="chip chip-cat" aria-pressed={g === cat}
                  onClick={() => { setCat(g); setLimite(POR_PAGINA); }}>{g}</button>
              ))}
            </LinhaRolagem>
          )}
          {busca && <OutrasFormas lista={dados.lista} consulta={q} aoEscolher={buscarTexto} />}
          {busca && mercado === 'Todos' && <ComparativoMercados todos={busca} distTxt={distTxt} />}
          {busca && !filtradas.length && (
            <div className="empty">Nenhum preço encontrado. Tente menos palavras, como &quot;arroz 5kg&quot;.</div>
          )}
          {busca && filtradas.length > 0 && (
            <h2 className="section-title">Todos os preços <small className="muted">· {filtradas.length} {filtradas.length === 1 ? 'encontrado' : 'encontrados'}{filtradas.some((x) => x.o.ub !== filtradas[0].o.ub) ? '; os vendidos por outra medida vêm no fim' : ''}</small></h2>
          )}
          <div className="lista">
            {lista.map(({ o, desc, opcoes, titulo }, i) => (
              <LinhaOferta key={i} o={o} opcoes={opcoes} titulo={titulo} dist={distTxt(o.mercado)} termo={busca ? q.trim() : undefined} extra={desc >= 0.01 ? <>−{Math.round(desc * 100)}%</> : undefined} />
            ))}
          </div>
          {agrupadas.length > limite && (
            <button type="button" className="btn btn-secondary btn-block" onClick={() => setLimite(limite + POR_PAGINA)}>
              Carregar mais ({agrupadas.length - limite} restantes)
            </button>
          )}
        </>
      )}
    </>
  );
}

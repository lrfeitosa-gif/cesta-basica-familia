'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { brl, carregarPrevia, dataBr, filtrarFoco, GRUPOS, grupo, norm, useOfertas, type Oferta } from '@/lib/ofertas';
import { supabase } from '@/lib/supabase';
import LinhaOferta, { Carregando, ErroCarga } from '../linha-oferta';
import { useSessao } from '@/lib/sessao';
import { useDistTexto } from '@/lib/locais';
import Fontes from '../fontes';
import BoasVindas from '../boas-vindas';

// Fora das oportunidades: ração e destilados (bebidas do dia a dia, como cerveja, continuam)
const RUIDO = /racao|caes|gatos|whisky|vodka|gin /;
const POR_PAGINA = 10;

export default function Oportunidades() {
  const { dados, erro, tentarDeNovo } = useOfertas();
  const distTxt = useDistTexto(useSessao()?.user.id);
  const [mercado, setMercado] = useState('Todos');
  const [limite, setLimite] = useState(POR_PAGINA);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('Todas');
  const [semNotas, setSemNotas] = useState(false);

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
  const busca = useMemo(() => (dados && q.trim() ? filtrarFoco(dados.lista, q).sort((a, b) => a.porUn - b.porUn) : null), [dados, q]);
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
  const lista = filtradas.slice(0, limite);
  const melhor = busca ? filtradas[0]?.o : undefined;

  return (
    <>
      <BoasVindas />
      <div>
        <h1>Oportunidades de hoje</h1>
        <p className="lead">
          Maiores descontos sobre o preço normal de cada mercado
          {dados && <> · {dados.lista.length.toLocaleString('pt-BR')} preços de {dados.mercados.length} mercados em {dataBr(dados.dia)}</>}.
        </p>
      </div>
      <div className="busca-topo">
        <label htmlFor="busca" className="visually-hidden">Buscar produto</label>
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
        <input id="busca" className="input" type="search" autoComplete="off" enterKeyHint="search"
          placeholder="Buscar e comparar: café pilão, arroz 5kg, Pague Menos"
          value={q} onChange={(e) => { setQ(e.target.value); setLimite(POR_PAGINA); }} />
      </div>
      {sugestoes.length > 0 && (
        <div className="chips sugestoes" role="group" aria-label="Sugestões de busca">
          {sugestoes.map((n) => (
            <button key={n} type="button" className="chip" onClick={() => { setQ(n); setLimite(POR_PAGINA); }}>{n}</button>
          ))}
        </div>
      )}
      {q.trim() && !dados && !erro && (
        <p className="buscando" role="status"><span className="giro" aria-hidden="true" />Buscando &quot;{q.trim()}&quot; em todos os preços de hoje…</p>
      )}
      {dados && !q && <Fontes dados={dados} />}

      {semNotas && !q && (
        <Link href="/notas" className="convite">
          <b>Envie suas notas fiscais</b>
          <span>Com 3 notas, o app aprende o que você compra e passa a avisar dos seus produtos.</span>
        </Link>
      )}

      {erro && !(previa && opp.length && !q.trim()) && <ErroCarga tentarDeNovo={tentarDeNovo} />}
      {!dados && !q.trim() && (previa && opp.length ? (
        <>
          <div className="lista">
            {opp.slice(0, POR_PAGINA).map(({ o, desc }) => (
              <LinhaOferta key={o.id} o={o} dist={distTxt(o.mercado)} extra={<span className="off">−{Math.round(desc * 100)}%</span>} />
            ))}
          </div>
          {erro ? (
            <button type="button" className="btn btn-secondary btn-block" onClick={tentarDeNovo}>Carregar todos os preços</button>
          ) : <p className="muted" role="status">Carregando a busca e os filtros…</p>}
        </>
      ) : !erro && <Carregando />)}
      {dados && (
        <>
          <div className="chips" role="group" aria-label="Filtrar por categoria">
            {categorias.map((g) => (
              <button key={g} type="button" className="chip chip-cat" aria-pressed={g === cat}
                onClick={() => { setCat(g); setLimite(POR_PAGINA); }}>{g}</button>
            ))}
          </div>
          <div className="chips" role="group" aria-label="Filtrar por mercado">
            {mercados.map((m) => (
              <button key={m} type="button" className="chip" aria-pressed={m === mercado}
                onClick={() => { setMercado(m); setLimite(POR_PAGINA); }}>{m}</button>
            ))}
          </div>
          {busca && !filtradas.length && (
            <div className="empty">Nenhum preço encontrado. Tente menos palavras, como &quot;arroz 5kg&quot;.</div>
          )}
          {melhor && (
            <div className="destaque">
              <span className="muted">Mais barato (pelo preço do {melhor.ub === 'un' ? 'item' : melhor.ub === 'l' ? 'litro' : 'quilo'}) · {filtradas.length} preços encontrados</span>
              <span className="grande">{brl(melhor.preco)}</span>
              <span>{melhor.nome} no <b>{melhor.mercado}</b>{distTxt(melhor.mercado) && <span className="dist"> · 📍 {distTxt(melhor.mercado)}</span>}</span>
              <span className="muted">{brl(melhor.porUn)}/{melhor.ub}</span>
            </div>
          )}
          <div className="lista">
            {lista.map(({ o, desc }, i) => (
              <LinhaOferta key={i} o={o} dist={distTxt(o.mercado)} extra={desc >= 0.01 ? <span className="off">−{Math.round(desc * 100)}%</span> : undefined} />
            ))}
          </div>
          {filtradas.length > limite && (
            <button type="button" className="btn btn-secondary btn-block" onClick={() => setLimite(limite + POR_PAGINA)}>
              Carregar mais ({filtradas.length - limite} restantes)
            </button>
          )}
        </>
      )}
    </>
  );
}

'use client';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useSessao } from '@/lib/sessao';
import { criarClassificador, normCat, type ItemBase } from '@/lib/catalogo';

type Produto = { id: number; nome: string; marca: string | null; item_base_id?: number | null; item_base_origem?: string | null };
type Resumo = { origens: Record<string, number>; itens: Record<string, number> };
const ORIGEM: Record<string, string> = {
  regra: 'ligados pela regra', admin: 'decididos no admin', sem: 'sem item base (fila)', fora: 'fora da cesta', pendente: 'ainda não verificados',
};

// Lê uma tabela inteira em páginas de 1000 (o banco devolve no máximo 1000 por vez).
async function todasPaginas<T extends { id: number }>(montar: (ultimo: number) => PromiseLike<{ data: unknown; error: unknown }>) {
  const out: T[] = [];
  let ultimo = 0;
  for (;;) {
    const { data, error } = await montar(ultimo);
    if (error) throw error;
    const lote = (data ?? []) as T[];
    out.push(...lote);
    if (lote.length < 1000) return out;
    ultimo = lote[lote.length - 1].id;
  }
}

// Gestão do cadastro base: itens genéricos, exclusões e a fila de produtos sem item.
export default function Catalogo() {
  const sessao = useSessao();
  const [permitido, setPermitido] = useState<boolean | null>(null);
  const [itens, setItens] = useState<ItemBase[]>([]);
  const [resumo, setResumo] = useState<Resumo | null>(null);
  const [busca, setBusca] = useState('');
  const [aberto, setAberto] = useState<number | null>(null);
  const [doItem, setDoItem] = useState<Produto[] | null>(null);
  const [fila, setFila] = useState<Produto[] | null>(null);
  const [grupo, setGrupo] = useState<string | null>(null);
  const [buscaFila, setBuscaFila] = useState('');
  const [msg, setMsg] = useState('');
  const [ocupado, setOcupado] = useState('');

  const carregar = async () => {
    const [i, r] = await Promise.all([
      supabase.from('item_base').select('id,termo,nome,exclusoes,ativo').order('nome'),
      supabase.rpc('admin_catalogo_resumo'),
    ]);
    if (r.error) return setPermitido(false);
    setPermitido(true);
    setItens((i.data ?? []) as ItemBase[]);
    setResumo(r.data as Resumo);
  };
  const carregarFila = async () => {
    setFila(null);
    try {
      setFila(await todasPaginas<Produto>((u) => supabase.from('produto').select('id,nome,marca')
        .eq('item_base_origem', 'sem').gt('id', u).order('id').limit(1000)));
    } catch { setMsg('Não conseguimos carregar a fila.'); }
  };
  useEffect(() => { if (sessao) { carregar(); carregarFila(); } }, [sessao]);   // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (aberto === null) return;
    setDoItem(null);
    supabase.from('produto').select('id,nome,marca').eq('item_base_id', aberto).order('nome').limit(500)
      .then(({ data }) => setDoItem((data ?? []) as Produto[]));
  }, [aberto]);

  const nomeItem = useMemo(() => new Map(itens.map((i) => [i.id, i.nome])), [itens]);
  const itensVisiveis = itens.filter((i) => !busca.trim() || normCat(i.nome).includes(normCat(busca)));

  // fila agrupada pela 1ª palavra do nome: um grupo inteiro costuma ir para o mesmo lugar
  const grupos = useMemo(() => {
    const g = new Map<string, Produto[]>();
    for (const p of fila ?? []) {
      if (buscaFila.trim() && !normCat(`${p.nome} ${p.marca ?? ''}`).includes(normCat(buscaFila))) continue;
      const k = normCat(p.nome).split(' ')[0] || '?';
      g.set(k, [...(g.get(k) ?? []), p]);
    }
    return [...g.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [fila, buscaFila]);

  // move produtos: valor do select = id do item, "fora" ou "sem"
  const mover = async (ids: number[], destino: string) => {
    if (!ids.length || !destino) return;
    const origem = destino === 'fora' ? 'fora' : destino === 'sem' ? 'sem' : 'admin';
    const item = origem === 'admin' ? Number(destino) : null;
    setOcupado('Gravando…');
    for (let i = 0; i < ids.length; i += 500) {
      const { error } = await supabase.rpc('admin_ligar', { p_ids: ids.slice(i, i + 500), p_item: item, p_origem: origem });
      if (error) { setOcupado(''); return setMsg(`Erro ao gravar: ${error.message}`); }
    }
    setOcupado('');
    setMsg(`${ids.length} ${ids.length === 1 ? 'produto movido' : 'produtos movidos'} para ${origem === 'fora' ? 'fora da cesta' : origem === 'sem' ? 'a fila' : nomeItem.get(item!)}.`);
    const fora = new Set(ids);
    setFila((f) => (f ? (origem === 'sem' ? f : f.filter((p) => !fora.has(p.id))) : f));
    setDoItem((d) => (d ? d.filter((p) => !fora.has(p.id)) : d));
    carregar();
  };

  const salvarItem = async (it: ItemBase) => {
    const { error } = await supabase.rpc('admin_item_salvar', { p_id: it.id, p_termo: it.termo, p_nome: it.nome, p_exclusoes: it.exclusoes, p_ativo: it.ativo });
    setMsg(error ? `Erro: ${error.message}` : `"${it.nome}" salvo. Use "Aplicar regras agora" para refazer as ligações.`);
    carregar();
  };

  const [novoItem, setNovoItem] = useState('');
  const criarItem = async (e: FormEvent) => {
    e.preventDefault();
    const nome = novoItem.trim();
    if (!nome) return;
    const { error } = await supabase.rpc('admin_item_salvar', { p_id: null, p_termo: normCat(nome), p_nome: nome, p_exclusoes: [], p_ativo: true });
    setMsg(error ? `Erro: ${error.message}` : `Item "${nome}" criado. Use "Aplicar regras agora" para ligar os produtos.`);
    setNovoItem('');
    carregar();
  };

  // Refaz as ligações automáticas com as regras atuais (não mexe no que foi decidido no admin).
  const aplicarRegras = async () => {
    try {
      setOcupado('Lendo os produtos…');
      const ps = await todasPaginas<Produto>((u) => supabase.from('produto').select('id,nome,marca,item_base_id,item_base_origem')
        .or('item_base_origem.is.null,item_base_origem.in.(regra,sem)').gt('id', u).order('id').limit(1000));
      const classificar = criarClassificador(itens);
      const mudar = new Map<string, number[]>();
      for (const p of ps) {
        const item = classificar(p.nome);
        const origem = item ? 'regra' : 'sem';
        if (p.item_base_id === item && p.item_base_origem === origem) continue;
        const k = `${item ?? ''}|${origem}`;
        mudar.set(k, [...(mudar.get(k) ?? []), p.id]);
      }
      let feitos = 0;
      const total = [...mudar.values()].reduce((s, l) => s + l.length, 0);
      for (const [k, ids] of mudar) {
        const [item, origem] = k.split('|');
        for (let i = 0; i < ids.length; i += 500) {
          setOcupado(`Gravando ${feitos} de ${total}…`);
          const { error } = await supabase.rpc('admin_ligar', { p_ids: ids.slice(i, i + 500), p_item: item ? Number(item) : null, p_origem: origem });
          if (error) throw error;
          feitos += Math.min(500, ids.length - i);
        }
      }
      setMsg(`Regras aplicadas: ${ps.length} produtos verificados, ${total} mudaram.`);
    } catch (e) {
      setMsg(`Erro ao aplicar as regras: ${(e as { message?: string })?.message ?? e}`);
    }
    setOcupado('');
    carregar(); carregarFila();
  };

  if (permitido === false) return <><h1>Cadastro base</h1><div className="empty">Área só para administradores.</div></>;
  if (permitido === null) return <><h1>Cadastro base</h1><div className="empty">Carregando…</div></>;

  const opcoes = (
    <>
      <option value="">Mover para…</option>
      <option value="fora">Fora da cesta</option>
      <option value="sem">Sem item (fila)</option>
      {itens.filter((i) => i.ativo).map((i) => <option key={i.id} value={i.id}>{i.nome}</option>)}
    </>
  );

  return (
    <>
      <div>
        <p><Link href="/admin">← Administração</Link></p>
        <h1>Cadastro base</h1>
        <p className="lead">Itens genéricos da cesta, as palavras que excluem produtos e a fila do que não foi ligado.</p>
      </div>

      {resumo && (
        <section className="adm-numeros">
          {Object.entries(ORIGEM).map(([k, r]) => (
            <div key={k}><b>{(resumo.origens[k] ?? 0).toLocaleString('pt-BR')}</b><span>{r}</span></div>
          ))}
        </section>
      )}
      <div className="row">
        <button type="button" className="btn btn-primary" disabled={!!ocupado} onClick={aplicarRegras}>Aplicar regras agora</button>
        {ocupado && <span className="muted" role="status">{ocupado}</span>}
      </div>
      {msg && <div className="alert alert-ok" role="status">{msg}</div>}

      <section className="card stack">
        <h2>Itens base ({itens.length})</h2>
        <form className="row" onSubmit={criarItem}>
          <input className="input" style={{ flex: 1 }} placeholder="Novo item, ex.: Frango em pedaços" value={novoItem} onChange={(e) => setNovoItem(e.target.value)} />
          <button className="btn btn-secondary">Criar item</button>
        </form>
        <input className="input" type="search" placeholder="Filtrar itens" value={busca} onChange={(e) => setBusca(e.target.value)} />
        <div className="cat-itens">
          {itensVisiveis.map((it) => (
            <ItemLinha key={it.id} it={it} qtd={resumo?.itens[it.id] ?? 0} aberto={aberto === it.id}
              abrir={() => setAberto(aberto === it.id ? null : it.id)} salvar={salvarItem}>
              {aberto === it.id && (!doItem ? <span className="muted">Carregando…</span> : !doItem.length ? <span className="muted">Nenhum produto ligado.</span> : (
                <ul className="cat-produtos">
                  {doItem.map((p) => (
                    <li key={p.id}>
                      <span>{p.nome}{p.marca && <span className="muted"> · {p.marca}</span>}</span>
                      <select className="marca-sel" aria-label={`Mover ${p.nome}`} value="" onChange={(e) => mover([p.id], e.target.value)}>{opcoes}</select>
                    </li>
                  ))}
                </ul>
              ))}
            </ItemLinha>
          ))}
        </div>
      </section>

      <section className="card stack">
        <h2>Fila: produtos sem item base {fila && `(${fila.length.toLocaleString('pt-BR')})`}</h2>
        <p className="muted">Agrupados pela primeira palavra. Mova um grupo inteiro para um item, ou para &quot;Fora da cesta&quot; quando não for produto de cesta.</p>
        <input className="input" type="search" placeholder="Buscar na fila" value={buscaFila} onChange={(e) => setBuscaFila(e.target.value)} />
        {!fila ? <span className="muted">Carregando…</span> : (
          <div className="cat-itens">
            {grupos.slice(0, 80).map(([k, ps]) => (
              <div key={k} className="cat-item">
                <div className="cat-cab">
                  <button type="button" className="btn-link" onClick={() => setGrupo(grupo === k ? null : k)}><b>{k}</b> · {ps.length}</button>
                  <select className="marca-sel" aria-label={`Mover o grupo ${k}`} value="" disabled={!!ocupado}
                    onChange={(e) => { if (confirm(`Mover os ${ps.length} produtos de "${k}"?`)) mover(ps.map((p) => p.id), e.target.value); }}>{opcoes}</select>
                </div>
                {grupo === k && (
                  <ul className="cat-produtos">
                    {ps.slice(0, 300).map((p) => (
                      <li key={p.id}>
                        <span>{p.nome}{p.marca && <span className="muted"> · {p.marca}</span>}</span>
                        <select className="marca-sel" aria-label={`Mover ${p.nome}`} value="" onChange={(e) => mover([p.id], e.target.value)}>{opcoes}</select>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
            {grupos.length > 80 && <span className="muted">Mostrando os 80 maiores grupos. Use a busca para achar os outros.</span>}
          </div>
        )}
      </section>
    </>
  );
}

function ItemLinha({ it, qtd, aberto, abrir, salvar, children }: {
  it: ItemBase; qtd: number; aberto: boolean; abrir: () => void; salvar: (i: ItemBase) => void; children: React.ReactNode;
}) {
  const [nome, setNome] = useState(it.nome);
  const [exc, setExc] = useState<string[]>(it.exclusoes ?? []);
  const [nova, setNova] = useState('');
  const [ativo, setAtivo] = useState(it.ativo);
  const mudou = nome !== it.nome || ativo !== it.ativo || exc.join('|') !== (it.exclusoes ?? []).join('|');
  return (
    <div className={`cat-item${ativo ? '' : ' cat-inativo'}`}>
      <div className="cat-cab">
        <button type="button" className="btn-link" onClick={abrir} aria-expanded={aberto}><b>{it.nome}</b> · {qtd} produtos</button>
      </div>
      {aberto && (
        <div className="stack" style={{ gap: 8 }}>
          <div className="row">
            <input className="input" style={{ flex: 1 }} aria-label="Nome do item" value={nome} onChange={(e) => setNome(e.target.value)} />
            <label className="row" style={{ gap: 6 }}><input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} /> ativo</label>
          </div>
          <div className="chips">
            <span className="muted">Exclusões:</span>
            {exc.map((e) => <button key={e} type="button" className="chip" onClick={() => setExc(exc.filter((x) => x !== e))}>{e} ×</button>)}
            <form className="row" style={{ gap: 6 }} onSubmit={(ev) => { ev.preventDefault(); const v = normCat(nova); if (v && !exc.includes(v)) setExc([...exc, v]); setNova(''); }}>
              <input className="input" style={{ width: 160 }} placeholder="nova palavra" value={nova} onChange={(e) => setNova(e.target.value)} />
              <button className="btn btn-secondary">Adicionar</button>
            </form>
          </div>
          {mudou && <button type="button" className="btn btn-primary" onClick={() => salvar({ ...it, nome, exclusoes: exc, ativo })}>Salvar item</button>}
          {children}
        </div>
      )}
    </div>
  );
}

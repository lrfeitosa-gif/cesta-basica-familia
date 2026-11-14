'use client';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { supabase } from '@/lib/supabase';
import { carregarExclusoes, filtrar, norm, temForma, useOfertas, type Exclusao } from '@/lib/ofertas';

// Administração → Busca: palavras que saem dos resultados de um termo (tabela exclusao_busca, migração 0029).
// Ex.: termo "heineken", excluir "sol" tira "Sol (Grupo Heineken)" de quem busca heineken. Vale para todo o app.
export default function ExclusoesBusca() {
  const { dados } = useOfertas();
  const [lista, setLista] = useState<Exclusao[]>([]);
  const [termo, setTermo] = useState('');
  const [excluir, setExcluir] = useState('');
  const [opcao, setOpcao] = useState(true);   // forma de sempre (0030): a palavra vira botão "Também tem"
  const [msg, setMsg] = useState<{ erro: boolean; texto: string } | null>(null);

  const carregar = async () => {
    const r = await supabase.from('exclusao_busca').select('id,termo,excluir,opcao').order('termo').order('excluir');
    const data: unknown[] | null = r.error ? (await supabase.from('exclusao_busca').select('id,termo,excluir').order('termo').order('excluir')).data : r.data;
    setLista((data ?? []) as Exclusao[]);
  };
  useEffect(() => { carregar(); }, []);

  // prévia: o que a busca pelo termo mostra hoje e quantos produtos a nova regra tiraria
  const previa = useMemo(() => {
    if (!dados || !termo.trim()) return null;
    const achados = filtrar(dados.lista, termo);
    const sai = excluir.trim() ? achados.filter((o) => temForma(o.busca, norm(excluir).trim())) : [];
    return { total: achados.length, sai, nomes: [...new Set(sai.map((o) => `${o.marca ? `${o.marca} · ` : ''}${o.nome}`))].slice(0, 5) };
  }, [dados, termo, excluir]);

  const salvar = async (e: FormEvent) => {
    e.preventDefault();
    if (termo.trim().length < 2 || excluir.trim().length < 2) return setMsg({ erro: true, texto: 'Preencha o termo e a palavra a excluir (2 letras ou mais).' });
    const { error } = await supabase.from('exclusao_busca').insert({ termo: norm(termo).trim(), excluir: norm(excluir).trim(), opcao });
    if (error) return setMsg({ erro: true, texto: /duplicate|unique/i.test(error.message) ? 'Essa regra já existe.' : 'Não foi possível salvar. Confira se a migração 0030 foi aplicada.' });
    setMsg({ erro: false, texto: opcao
      ? `Pronto: quem buscar "${termo.trim()}" vê primeiro a forma de sempre; "${excluir.trim()}" aparece como botão "Também tem".`
      : `Pronto: quem buscar "${termo.trim()}" não vê mais produtos com "${excluir.trim()}".` });
    setTermo(''); setExcluir('');
    await carregarExclusoes(true); carregar();
  };
  const alternar = async (x: Exclusao) => {
    await supabase.from('exclusao_busca').update({ opcao: !x.opcao }).eq('id', x.id!);
    await carregarExclusoes(true); carregar();
  };
  const apagar = async (x: Exclusao) => {
    if (!window.confirm(`Apagar a regra "${x.termo}" sem "${x.excluir}"?`)) return;
    await supabase.from('exclusao_busca').delete().eq('id', x.id!);
    await carregarExclusoes(true); carregar();
  };

  return (
    <>
      <p className="muted">Duas regras, para todas as famílias, em Preços, Cesta, histórico e alertas. Quem escrever a palavra (&quot;café cápsula&quot;) sempre vê o produto.</p>
      <ul className="muted" style={{ margin: 0, paddingLeft: 18 }}>
        <li><b>Forma de sempre:</b> buscar <b>café</b> mostra café em pó; <b>cápsula</b> aparece como botão &quot;Também tem&quot;.</li>
        <li><b>Exclusão:</b> buscar <b>heineken</b> não mostra <b>Sol</b>, que só cita Heineken no nome.</li>
      </ul>
      <form className="card stack" onSubmit={salvar} noValidate>
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <div className="field" style={{ flex: '1 1 140px' }}>
            <label htmlFor="exc-termo">Quando buscar</label>
            <input id="exc-termo" className="input" placeholder="heineken" value={termo} onChange={(e) => setTermo(e.target.value)} />
          </div>
          <div className="field" style={{ flex: '1 1 140px' }}>
            <label htmlFor="exc-excluir">Tirar produtos com</label>
            <input id="exc-excluir" className="input" placeholder="sol" value={excluir} onChange={(e) => setExcluir(e.target.value)} />
          </div>
        </div>
        <label className="row" style={{ gap: 8, flexWrap: 'nowrap', alignItems: 'flex-start' }}>
          <input type="checkbox" className="check" checked={opcao} onChange={(e) => setOpcao(e.target.checked)} />
          <span>Outra forma do produto: mostrar como botão &quot;Também tem&quot; (desmarcado: só tirar da busca)</span>
        </label>
        {previa && (
          <span className="help">
            Hoje a busca acha {previa.total} {previa.total === 1 ? 'preço' : 'preços'}.
            {excluir.trim() && ` A regra tiraria ${previa.sai.length}${previa.nomes.length ? `: ${previa.nomes.join('; ')}` : ''}.`}
          </span>
        )}
        {msg && <div className={`alert ${msg.erro ? 'alert-error' : 'alert-ok'}`} role="status">{msg.texto}</div>}
        <button className="btn btn-primary">Adicionar regra</button>
      </form>
      {lista.length ? (
        <ul className="exc-lista">
          {lista.map((x) => (
            <li key={x.id}>
              <span>Buscar <b>{x.termo}</b> sem <b>{x.excluir}</b> <small className="muted">{x.opcao ? '· forma (botão)' : '· exclusão'}</small></span>
              <span className="row" style={{ gap: 6 }}>
                <button type="button" className="btn-remover" onClick={() => alternar(x)}>{x.opcao ? 'virar exclusão' : 'virar forma'}</button>
                <button type="button" className="btn-remover" onClick={() => apagar(x)}>apagar</button>
              </span>
            </li>
          ))}
        </ul>
      ) : <div className="empty">Nenhuma regra cadastrada.</div>}
    </>
  );
}

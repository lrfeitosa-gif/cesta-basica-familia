'use client';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { supabase } from '@/lib/supabase';
import { carregarExclusoes, filtrar, norm, temPalavra, useOfertas, type Exclusao } from '@/lib/ofertas';

// Administração → Busca: palavras que saem dos resultados de um termo (tabela exclusao_busca, migração 0029).
// Ex.: termo "heineken", excluir "sol" tira "Sol (Grupo Heineken)" de quem busca heineken. Vale para todo o app.
export default function ExclusoesBusca() {
  const { dados } = useOfertas();
  const [lista, setLista] = useState<Exclusao[]>([]);
  const [termo, setTermo] = useState('');
  const [excluir, setExcluir] = useState('');
  const [msg, setMsg] = useState<{ erro: boolean; texto: string } | null>(null);

  const carregar = async () => {
    const { data } = await supabase.from('exclusao_busca').select('id,termo,excluir').order('termo').order('excluir');
    setLista((data ?? []) as Exclusao[]);
  };
  useEffect(() => { carregar(); }, []);

  // prévia: o que a busca pelo termo mostra hoje e quantos produtos a nova regra tiraria
  const previa = useMemo(() => {
    if (!dados || !termo.trim()) return null;
    const achados = filtrar(dados.lista, termo);
    const sai = excluir.trim() ? achados.filter((o) => temPalavra(o.busca, norm(excluir).trim())) : [];
    return { total: achados.length, sai, nomes: [...new Set(sai.map((o) => `${o.marca ? `${o.marca} · ` : ''}${o.nome}`))].slice(0, 5) };
  }, [dados, termo, excluir]);

  const salvar = async (e: FormEvent) => {
    e.preventDefault();
    if (termo.trim().length < 2 || excluir.trim().length < 2) return setMsg({ erro: true, texto: 'Preencha o termo e a palavra a excluir (2 letras ou mais).' });
    const { error } = await supabase.from('exclusao_busca').insert({ termo: termo.trim().toLowerCase(), excluir: excluir.trim().toLowerCase() });
    if (error) return setMsg({ erro: true, texto: /duplicate|unique/i.test(error.message) ? 'Essa regra já existe.' : 'Não foi possível salvar. Confira se a migração 0029 foi aplicada.' });
    setMsg({ erro: false, texto: `Pronto: quem buscar "${termo.trim()}" não vê mais produtos com "${excluir.trim()}".` });
    setTermo(''); setExcluir('');
    await carregarExclusoes(true); carregar();
  };
  const apagar = async (x: Exclusao) => {
    if (!window.confirm(`Apagar a regra "${x.termo}" sem "${x.excluir}"?`)) return;
    await supabase.from('exclusao_busca').delete().eq('id', x.id!);
    await carregarExclusoes(true); carregar();
  };

  return (
    <>
      <p className="muted">Tire da busca produtos que aparecem por engano. Ex.: termo <b>heineken</b>, excluir <b>sol</b>. Vale em Ofertas, Cesta, Comparar, Evolução e Alertas, para todas as famílias. Quem escrever a palavra excluída (&quot;heineken sol&quot;) ainda vê o produto.</p>
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
        {previa && (
          <span className="help">
            Hoje a busca acha {previa.total} {previa.total === 1 ? 'preço' : 'preços'}.
            {excluir.trim() && ` A regra tiraria ${previa.sai.length}${previa.nomes.length ? `: ${previa.nomes.join('; ')}` : ''}.`}
          </span>
        )}
        {msg && <div className={`alert ${msg.erro ? 'alert-error' : 'alert-ok'}`} role="status">{msg.texto}</div>}
        <button className="btn btn-primary">Adicionar exclusão</button>
      </form>
      {lista.length ? (
        <ul className="exc-lista">
          {lista.map((x) => (
            <li key={x.id}>
              <span>Buscar <b>{x.termo}</b> sem <b>{x.excluir}</b></span>
              <button type="button" className="btn-remover" onClick={() => apagar(x)}>apagar</button>
            </li>
          ))}
        </ul>
      ) : <div className="empty">Nenhuma exclusão cadastrada.</div>}
    </>
  );
}

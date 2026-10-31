'use client';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { supabase } from '@/lib/supabase';
import { useSessao } from '@/lib/sessao';
import { brl, carregarOfertas, chaveMarca, filtrar, type Oferta, type Ofertas } from '@/lib/ofertas';
import LinhaOferta, { Carregando } from '../linha-oferta';

type Alerta = { id: number; termo: string; marca: string | null; preco_alvo: number | null };
const DESCONTO_MIN = 0.15;   // mesmo ponto de partida do motor de regras: 15% abaixo do preço normal

// Situação de cada alerta com os preços de hoje. O aviso no celular (push) vem na próxima etapa.
function avaliar(a: Alerta, lista: Oferta[]) {
  let achados = filtrar(lista, a.termo);
  if (a.marca) achados = achados.filter((o) => chaveMarca(o.marca) === chaveMarca(a.marca!));
  achados.sort((x, y) => x.preco - y.preco);
  const melhor = achados[0];
  const motivo = !melhor ? null
    : a.preco_alvo != null && melhor.preco <= a.preco_alvo ? `abaixo do seu preço-alvo de ${brl(a.preco_alvo)}`
    : melhor.de > melhor.preco && 1 - melhor.preco / melhor.de >= DESCONTO_MIN ? `${Math.round((1 - melhor.preco / melhor.de) * 100)}% abaixo do preço normal`
    : null;
  return { achados, melhor, motivo };
}

export default function Alertas() {
  const sessao = useSessao();
  const [dados, setDados] = useState<Ofertas | null>(null);
  const [alertas, setAlertas] = useState<Alerta[]>([]);
  const [termo, setTermo] = useState('');
  const [marca, setMarca] = useState('');
  const [alvo, setAlvo] = useState('');
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  const carregar = async () => {
    const { data } = await supabase.from('item_interesse').select('id,termo,marca,preco_alvo')
      .not('termo', 'is', null).order('criado_em', { ascending: false });
    setAlertas((data as Alerta[]) ?? []);
  };
  useEffect(() => { carregarOfertas().then(setDados).catch(() => {}); }, []);
  useEffect(() => { if (sessao) carregar(); }, [sessao]);

  const previa = useMemo(() => (dados && termo.trim() ? filtrar(dados.lista, termo).length : null), [dados, termo]);

  const criar = async (e: FormEvent) => {
    e.preventDefault();
    if (!termo.trim()) return setErro('Descreva o produto, por exemplo "café pilão 500g".');
    const preco = alvo ? Number(alvo.replace(',', '.')) : null;
    if (alvo && (!preco || preco <= 0)) return setErro('Preço-alvo inválido. Use só números, como 15,90.');
    setErro(''); setSalvando(true);
    await supabase.rpc('garantir_familia');
    const { error } = await supabase.from('item_interesse').insert({
      familia_id: sessao!.user.id, termo: termo.trim(), marca: marca.trim() || null, preco_alvo: preco, origem: 'manual',
    });
    setSalvando(false);
    if (error) return setErro('Não foi possível salvar o alerta. Tente de novo.');
    setTermo(''); setMarca(''); setAlvo('');
    carregar();
  };

  const remover = async (id: number) => {
    await supabase.from('item_interesse').delete().eq('id', id);
    setAlertas((l) => l.filter((a) => a.id !== id));
  };

  if (!sessao) return null;
  const avaliados = dados ? alertas.map((a) => ({ a, ...avaliar(a, dados.lista) })) : [];
  const disparados = avaliados.filter((x) => x.motivo);

  return (
    <>
      <div>
        <h1>Meus alertas</h1>
        <p className="lead">Cadastre o que quer acompanhar. Avisamos quando o preço ficar abaixo do seu alvo ou {DESCONTO_MIN * 100}% abaixo do normal.</p>
      </div>

      <form className="card stack" onSubmit={criar} noValidate>
        <div className="field">
          <label htmlFor="termo">Produto</label>
          <input id="termo" className="input" placeholder="Ex.: heineken 350ml  ·  café -cápsula" autoComplete="off"
            value={termo} onChange={(e) => setTermo(e.target.value)} />
          <span className="help">
            {previa === null ? 'Combine palavras e use o sinal de menos para excluir.' : `${previa} preços encontrados hoje com essas palavras.`}
          </span>
        </div>
        <div className="row" style={{ alignItems: 'flex-start' }}>
          <div className="field" style={{ flex: '1 1 140px' }}>
            <label htmlFor="marca">Marca (opcional)</label>
            <input id="marca" className="input" placeholder="Ex.: Pilão" value={marca} onChange={(e) => setMarca(e.target.value)} />
          </div>
          <div className="field" style={{ flex: '1 1 120px' }}>
            <label htmlFor="alvo">Preço-alvo (opcional)</label>
            <input id="alvo" className="input" inputMode="decimal" placeholder="R$ 15,90" value={alvo} onChange={(e) => setAlvo(e.target.value)} />
          </div>
        </div>
        {erro && <div className="alert alert-error" role="alert">{erro}</div>}
        <button className="btn btn-primary" disabled={salvando}>{salvando ? 'Salvando…' : 'Criar alerta'}</button>
      </form>

      {!dados ? <Carregando /> : alertas.length === 0 ? (
        <div className="empty">Nenhum alerta ainda. Crie o primeiro acima, por exemplo &quot;arroz 5kg -integral&quot; com preço-alvo de R$ 20,00.</div>
      ) : (
        <>
          {disparados.length > 0 && <h2>{disparados.length === 1 ? '1 alerta disparado hoje' : `${disparados.length} alertas disparados hoje`}</h2>}
          {avaliados.map(({ a, achados, melhor, motivo }) => (
            <section key={a.id} className={`alerta-card ${motivo ? 'alerta-on' : ''}`}>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <div>
                  <b>{a.termo}</b>
                  <div className="muted">
                    {a.marca ? `Marca ${a.marca}` : 'Qualquer marca'}{a.preco_alvo != null ? ` · alvo ${brl(a.preco_alvo)}` : ''}
                  </div>
                </div>
                <button type="button" className="btn btn-link" onClick={() => remover(a.id)} aria-label={`Excluir alerta ${a.termo}`}>Excluir</button>
              </div>
              {motivo ? <div className="alert alert-ok">Oportunidade: {motivo}</div>
                : melhor ? <div className="muted">Sem oportunidade hoje. Menor preço: {brl(melhor.preco)} no {melhor.mercado}.</div>
                : <div className="muted">Nenhum preço encontrado hoje com essas palavras.</div>}
              {melhor && <div className="lista">{achados.slice(0, 3).map((o, i) => <LinhaOferta key={i} o={o} />)}</div>}
            </section>
          ))}
        </>
      )}
    </>
  );
}

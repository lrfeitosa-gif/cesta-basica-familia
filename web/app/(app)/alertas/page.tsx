'use client';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { supabase } from '@/lib/supabase';
import { useSessao } from '@/lib/sessao';
import { brl, filtrarFoco, norm, marcaCasa, useOfertas, type Oferta } from '@/lib/ofertas';
import LinhaOferta, { Carregando, ErroCarga } from '../linha-oferta';
import { useDistTexto } from '@/lib/locais';
import ComoAvisar, { HistoricoAvisos } from './avisos';
import { mostrarAviso } from '../aviso';
import { emb } from '@/lib/ofertas';

type Alerta = { id: number; termo: string; marca: string | null; preco_alvo: number | null };
const VERSOES = [/zero alcool|sem alcool|0,0%|0.0%/, /zero lactose|sem lactose/, /diet/, /light/, /zero/];
const DESCONTO_MIN = 0.15;   // mesmo ponto de partida do motor de regras: 15% abaixo do preço normal

// Situação de cada alerta com os preços de hoje. O aviso automático (celular e e-mail) sai do worker/avisos.py,
// que usa as mesmas regras e também compara com o menor preço típico do último mês.
function avaliar(a: Alerta, lista: Oferta[]) {
  let achados = filtrarFoco(lista, a.termo);
  if (a.marca) achados = achados.filter((o) => marcaCasa(o.marca, a.marca!));
  // versões diferentes do produto (zero álcool, sem lactose, diet…) só entram se a pessoa escreveu
  const t = norm(`${a.termo} ${a.marca ?? ''}`);
  achados = achados.filter((o) => VERSOES.every((v) => !v.test(norm(o.nome)) || v.test(t)));
  achados.sort((x, y) => x.preco - y.preco);
  const melhor = achados[0];
  // com preço-alvo, o alerta dispara só quando chega no alvo; sem alvo, quando está bem abaixo do preço normal
  const motivo: { tipo: 'alvo' | 'oportunidade'; texto: string } | null = !melhor ? null
    : a.preco_alvo != null ? (melhor.preco <= a.preco_alvo ? { tipo: 'alvo', texto: `Preço-alvo atingido: ${brl(melhor.preco)} (alvo ${brl(a.preco_alvo)})` } : null)
    : melhor.de > melhor.preco && 1 - melhor.preco / melhor.de >= DESCONTO_MIN ? { tipo: 'oportunidade', texto: `Oportunidade: ${Math.round((1 - melhor.preco / melhor.de) * 100)}% abaixo do preço normal` }
    : null;
  return { achados, melhor, motivo };
}

export default function Alertas() {
  const sessao = useSessao();
  const { dados, erro: erroCarga, tentarDeNovo } = useOfertas();
  const distTxt = useDistTexto(sessao?.user.id);
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
  useEffect(() => { if (sessao) carregar(); }, [sessao]);

  const previa = useMemo(() => (dados && termo.trim() ? filtrarFoco(dados.lista, termo).length : null), [dados, termo]);
  // Sugestão de preço-alvo a partir dos preços de hoje: na embalagem mais comum entre os achados (mesmo tamanho),
  // o menor preço e o preço do meio (mediana). Ajuda a escolher um alvo realista.
  const sugestao = useMemo(() => {
    if (!dados || !termo.trim()) return null;
    let l = filtrarFoco(dados.lista, termo);
    if (marca.trim()) l = l.filter((o) => marcaCasa(o.marca, marca.trim()));
    if (l.length < 2) return null;
    const conta = new Map<string, Oferta[]>();
    for (const o of l) { const k = `${o.q}${o.u}`; conta.set(k, [...(conta.get(k) ?? []), o]); }
    const [, grupo] = [...conta.entries()].sort((x, y) => y[1].length - x[1].length)[0];
    if (grupo.length < 2) return null;
    const ps = grupo.map((o) => o.preco).sort((x, y) => x - y);
    const meio = ps.length % 2 ? ps[(ps.length - 1) / 2] : (ps[ps.length / 2 - 1] + ps[ps.length / 2]) / 2;
    return { emb: emb(grupo[0]), menor: ps[0], media: Math.round(meio * 100) / 100, n: grupo.length };
  }, [dados, termo, marca]);
  const usarAlvo = (v: number) => setAlvo(v.toFixed(2).replace('.', ','));

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
    if (error) {
      const semAjuste = /termo|column|does not exist/i.test(error.message);
      return setErro(semAjuste
        ? 'Os alertas ainda não foram ativados no banco de dados (falta o ajuste 0004 no Supabase).'
        : 'Não foi possível salvar o alerta. Tente de novo.');
    }
    mostrarAviso({ texto: `Alerta criado: "${termo.trim()}"${preco ? ` com alvo de ${brl(preco)}` : ''}. Avisamos quando o preço ficar bom.` });
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
        <p className="lead">Cadastre o que quer acompanhar. Avisamos quando:</p>
        <ul className="regras-alerta">
          <li><span aria-hidden="true">🎯</span>chegar no seu preço-alvo</li>
          <li><span aria-hidden="true">🏷️</span>ficar {DESCONTO_MIN * 100}% abaixo do normal</li>
          <li><span aria-hidden="true">📉</span>for o menor do último mês</li>
        </ul>
      </div>

      <ComoAvisar familiaId={sessao.user.id} />

      <form className="card stack" onSubmit={criar} noValidate>
        <h2 className="section-title">Criar alerta</h2>
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
        {sugestao && (
          <div className="sugestao-alvo">
            <span className="muted">Hoje, {sugestao.emb} ({sugestao.n} preços):</span>
            <button type="button" className="chip" onClick={() => usarAlvo(sugestao.menor)}>Menor: {brl(sugestao.menor)}</button>
            <button type="button" className="chip" onClick={() => usarAlvo(sugestao.media)}>Média: {brl(sugestao.media)}</button>
          </div>
        )}
        {erro && <div className="alert alert-error" role="alert">{erro}</div>}
        <button className="btn btn-primary" disabled={salvando}>{salvando ? 'Salvando…' : 'Criar alerta'}</button>
      </form>

      {erroCarga ? <ErroCarga tentarDeNovo={tentarDeNovo} /> : !dados ? <Carregando /> : alertas.length === 0 ? (
        <div className="empty">Nenhum alerta ainda. Crie o primeiro acima, por exemplo &quot;arroz 5kg -integral&quot; com preço-alvo de R$ 20,00.</div>
      ) : (
        <>
          <h2 className="section-title">{disparados.length ? (disparados.length === 1 ? '1 alerta com preço bom hoje' : `${disparados.length} alertas com preço bom hoje`) : `Seus alertas (${alertas.length})`}</h2>
          {avaliados.map(({ a, achados, melhor, motivo }) => (
            <section key={a.id} className={`alerta-card ${motivo ? 'alerta-on' : ''}`}>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <div>
                  <b>{a.termo}</b>
                  <div className="muted">
                    {a.marca ? `Marca ${a.marca}` : 'Qualquer marca'}{a.preco_alvo != null ? ` · alvo ${brl(a.preco_alvo)}` : ''}
                  </div>
                </div>
                <button type="button" className="btn-remover" onClick={() => { if (window.confirm(`Excluir o alerta "${a.termo}"?`)) remover(a.id); }}
                  aria-label={`Excluir alerta ${a.termo}`}>Excluir</button>
              </div>
              {motivo ? <span className={`badge-alerta badge-${motivo.tipo}`}>{motivo.tipo === 'alvo' ? '🎯' : '🏷️'} {motivo.texto}</span>
                : melhor ? <div className="muted">Ainda não chegou{a.preco_alvo != null ? ' no alvo' : ''}. Menor preço hoje: {brl(melhor.preco)} no {melhor.mercado}{a.preco_alvo != null && melhor.preco > a.preco_alvo ? ` (${brl(melhor.preco - a.preco_alvo)} acima do alvo)` : ''}.</div>
                : <div className="muted">Nenhum preço encontrado hoje com essas palavras.</div>}
              {/* com preço-alvo, separa o que já está no alvo das outras opções (revisão de 12/11) */}
              {melhor && (() => {
                const noAlvo = a.preco_alvo != null ? achados.filter((o) => o.preco <= a.preco_alvo!) : [];
                const outras = achados.filter((o) => !noAlvo.includes(o)).slice(0, noAlvo.length ? 2 : 3);
                return <>
                  {noAlvo.length > 0 && <><span className="alerta-grupo">No seu alvo</span>
                    <div className="lista">{noAlvo.slice(0, 3).map((o) => <LinhaOferta key={o.id} o={o} dist={distTxt(o.mercado)} />)}</div></>}
                  {outras.length > 0 && <>{noAlvo.length > 0 && <span className="alerta-grupo">Outras opções</span>}
                    <div className="lista">{outras.map((o) => <LinhaOferta key={o.id} o={o} dist={distTxt(o.mercado)} />)}</div></>}
                </>;
              })()}
            </section>
          ))}
        </>
      )}
      <HistoricoAvisos />
    </>
  );
}

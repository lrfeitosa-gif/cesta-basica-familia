'use client';
import { useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { brl, filtrarFoco, marcaCasa, type Oferta, type Ofertas } from '@/lib/ofertas';
import { adicionarNaCesta } from '@/lib/cesta';
import LinhaOferta from '../linha-oferta';

type Interpretacao = {
  intencao: 'buscar' | 'cesta' | 'alerta' | 'outro'; busca: string; marca: string | null; mercado: string | null;
  ordenar: 'preco_medida' | 'preco' | 'desconto'; quantidade: number | null; preco_alvo: number | null; restam: number;
};

// Parece pergunta ou pedido, e não só palavras de busca?
export const parecePergunta = (t: string) => /\?\s*$/.test(t)
  || /^(qual|quais|onde|quanto|quanta|tem |existe|me avis|avise|avisa|p[oõ]e |coloca|adiciona|inclui|procura|mostra|cad[eê]|preciso|quero)/i.test(t.trim())
  || t.trim().split(/\s+/).length >= 6;

// Pergunta à IA (Groq): ela só traduz a pergunta em busca; os preços e a resposta saem dos dados de hoje do app.
// Pôr na cesta e criar alerta sempre pedem confirmação.
export default function PerguntaIA({ pergunta, dados, familiaId, distTxt }: {
  pergunta: string; dados: Ofertas | null; familiaId?: string; distTxt: (m: string) => string | null;
}) {
  const [estado, setEstado] = useState<'' | 'pensando' | 'erro'>('');
  const [erro, setErro] = useState('');
  const [r, setR] = useState<{ i: Interpretacao; achados: Oferta[]; feita: string } | null>(null);
  const [aviso, setAviso] = useState('');

  const perguntar = async () => {
    if (!dados || !familiaId) return;
    setEstado('pensando'); setErro(''); setAviso('');
    const { data } = await supabase.auth.getSession();
    const resp = await fetch('/api/perguntar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session?.access_token ?? ''}` },
      body: JSON.stringify({ pergunta, mercados: dados.mercados }),
    });
    const j = await resp.json().catch(() => ({ erro: 'Não consegui entender agora.' }));
    if (!resp.ok) { setEstado('erro'); setErro(j.erro); return; }
    const i = j as Interpretacao;
    let achados = i.busca ? filtrarFoco(dados.lista, i.busca) : [];
    if (i.marca) achados = achados.filter((o) => marcaCasa(o.marca, i.marca!));
    if (i.mercado) achados = achados.filter((o) => o.mercado === i.mercado);
    const desc = (o: Oferta) => (o.de > o.preco ? 1 - o.preco / o.de : 0);
    achados.sort(i.ordenar === 'desconto' ? (a, b) => desc(b) - desc(a)
      : i.ordenar === 'preco' ? (a, b) => a.preco - b.preco
      : (a, b) => (a.ub === b.ub ? a.porUn - b.porUn : 0) || a.preco - b.preco);
    setR({ i, achados, feita: pergunta }); setEstado('');
  };

  const confirmarCesta = async () => {
    if (!r || !familiaId) return;
    const termo = [r.i.busca, r.i.marca].filter(Boolean).join(' ');
    const qtd = r.i.quantidade ?? 1;
    if (!window.confirm(`Pôr ${qtd}× "${termo}" na sua cesta?`)) return;
    setAviso(await adicionarNaCesta(familiaId, termo, qtd));
  };
  const confirmarAlerta = async () => {
    if (!r || !familiaId) return;
    const alvo = r.i.preco_alvo;
    if (!window.confirm(`Criar alerta para "${r.i.busca}"${r.i.marca ? `, marca ${r.i.marca}` : ''}${alvo ? `, preço-alvo ${brl(alvo)}` : ''}?`)) return;
    await supabase.rpc('garantir_familia');
    const { error } = await supabase.from('item_interesse').insert({
      familia_id: familiaId, termo: r.i.busca, marca: r.i.marca, preco_alvo: alvo, origem: 'manual',
    });
    setAviso(error ? 'Não foi possível criar o alerta agora. Tente pela tela Alertas.' : 'Alerta criado. Você recebe o aviso quando o preço ficar bom.');
  };

  const atual = r && r.feita === pergunta ? r : null;
  const melhor = atual?.achados[0];
  return (
    <div className="ia">
      {!atual && (
        <button type="button" className="btn btn-secondary btn-block" onClick={perguntar} disabled={estado === 'pensando' || !dados}>
          {estado === 'pensando' ? 'Pensando…' : !dados ? 'Carregando os preços…' : 'Perguntar à IA'}
        </button>
      )}
      {estado === 'erro' && <div className="alert alert-error" role="alert">{erro}</div>}
      {atual && (
        <section className="ia-resposta" aria-live="polite">
          {atual.i.intencao === 'outro' ? (
            <p>Só consigo ajudar com preços dos mercados do app. Tente algo como &quot;qual o arroz 5 kg mais barato?&quot;.</p>
          ) : !melhor ? (
            <p>Não achei preços hoje para <b>{atual.i.busca}</b>{atual.i.marca ? ` da marca ${atual.i.marca}` : ''}{atual.i.mercado ? ` no ${atual.i.mercado}` : ''}.</p>
          ) : (
            <p>
              {atual.i.ordenar === 'desconto' ? 'Maior desconto hoje' : 'Mais barato hoje'}: <b>{melhor.nome}</b> no <b>{melhor.mercado}</b> por <b>{brl(melhor.preco)}</b>
              {atual.i.ordenar === 'preco_medida' && ` (${brl(melhor.porUn)}/${melhor.ub})`}
              {distTxt(melhor.mercado) && `, a ${distTxt(melhor.mercado)}`}.
              {' '}<span className="muted">{atual.achados.length} {atual.achados.length === 1 ? 'preço encontrado' : 'preços encontrados'} para &quot;{atual.i.busca}&quot;{atual.i.marca ? `, ${atual.i.marca}` : ''}.</span>
            </p>
          )}
          {melhor && <div className="lista">{atual.achados.slice(0, 3).map((o) => <LinhaOferta key={o.id} o={o} dist={distTxt(o.mercado)} />)}</div>}
          <div className="row">
            {atual.i.intencao === 'cesta' && <button type="button" className="btn btn-primary" onClick={confirmarCesta}>Pôr {atual.i.quantidade ?? 1}× na cesta</button>}
            {atual.i.intencao === 'alerta' && <button type="button" className="btn btn-primary" onClick={confirmarAlerta}>Criar alerta</button>}
            {atual.i.intencao === 'buscar' && melhor && <>
              <button type="button" className="btn btn-link" onClick={confirmarCesta}>Pôr na cesta</button>
              <button type="button" className="btn btn-link" onClick={confirmarAlerta}>Criar alerta</button>
            </>}
          </div>
          {aviso && <div className="alert alert-ok" role="status">{aviso}{aviso.includes('cesta') && <> <Link href="/compra">Ver cesta</Link></>}</div>}
          <p className="muted ia-nota">A IA só entende a pergunta; os preços são os coletados hoje. {atual.i.restam >= 0 && `Restam ${atual.i.restam} perguntas hoje.`}</p>
        </section>
      )}
    </div>
  );
}

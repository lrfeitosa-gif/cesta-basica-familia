'use client';
import { useState, type FormEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { brl, emb, marcarEsgotado, norm, SO_SOCIOS, type Oferta } from '@/lib/ofertas';
import { supabase } from '@/lib/supabase';
import { useSessao } from '@/lib/sessao';
import { adicionarNaCesta } from '@/lib/cesta';
import { mostrarAviso } from './aviso';
import HistoricoMini from './historico-mini';

// Cartão de um preço. Ações (14/11): Pôr na cesta, alerta (sininho com preço-alvo) e Ver histórico; o site/encarte
// e "Avisar que acabou" ficam como links menores. `termo` é o que vai para a cesta e para o alerta: a busca da
// pessoa quando houver ("café pilão"), senão o nome do produto.
export default function LinhaOferta({ o, extra, dist, termo }: { o: Oferta; extra?: ReactNode; dist?: string | null; termo?: string }) {
  const sessao = useSessao(false);   // a página já exige a conta; aqui só lê, sem redirecionar
  const [aberto, setAberto] = useState<'' | 'alerta' | 'hist'>('');
  const [alvo, setAlvo] = useState(() => (Math.floor(o.preco * 0.95 * 10) / 10).toFixed(2).replace('.', ','));
  const [salvando, setSalvando] = useState(false);
  const alvoTermo = (termo ?? o.nome).trim();
  const porNaCesta = async () => {
    if (!sessao) return;
    mostrarAviso({ texto: await adicionarNaCesta(sessao.user.id, alvoTermo, 1), acao: { rotulo: 'Ver cesta', fazer: () => { window.location.href = '/compra?ver=lista'; } } });
  };
  const criarAlerta = async (e: FormEvent) => {
    e.preventDefault();
    if (!sessao) return;
    const preco = alvo.trim() ? Number(alvo.replace(/\./g, '').replace(',', '.')) : null;
    if (alvo.trim() && (!preco || preco <= 0)) return mostrarAviso({ texto: 'Preço-alvo inválido. Use só números, como 15,90.' });
    setSalvando(true);
    await supabase.rpc('garantir_familia');
    const { error } = await supabase.from('item_interesse').insert({
      familia_id: sessao.user.id, termo: alvoTermo, marca: termo ? null : o.marca || null, preco_alvo: preco, origem: 'manual',
    });
    setSalvando(false);
    if (error) return mostrarAviso({ texto: 'Não foi possível criar o alerta agora. Tente de novo.' });
    setAberto('');
    mostrarAviso({ texto: `Alerta criado: "${alvoTermo}"${preco ? ` até ${brl(preco)}` : ''}. Avisamos quando o preço chegar.` });
  };
  const comMarca = o.marca && !norm(o.nome).includes(norm(o.marca)) ? `${o.marca} ` : '';
  // o tamanho já está no nome ("Biscoito 90G")? então não repete ao lado
  const nomeJunto = norm(o.nome).replace(/\s/g, '');
  const tamNoNome = [String(o.q), String(o.q).replace('.', ',')].some((q) => nomeJunto.includes(`${q}${o.u}`));
  return (
    <article className="product-card">
      <div className="product-header">
        <h3 className="product-title">{comMarca}{o.nome}{!tamNoNome && <> <small>{emb(o)}</small></>}</h3>
        <div className="price-tag-container">
          <b className="current-price">{brl(o.preco)}</b>
          {o.de > o.preco && <s className="old-price">de {brl(o.de)}</s>}
          {o.de > o.preco ? <span className="discount-badge">Economia de {brl(o.de - o.preco)}</span>
            : extra && <span className="discount-badge">{extra}</span>}
        </div>
      </div>
      <div className="product-meta">
        <span className="mkt">{o.mercado}</span>
        {SO_SOCIOS.has(o.mercado) && <TagSocios />}
        <span className={o.fonte === 'site' ? 'badge-site' : 'badge-encarte'} title={o.fonte === 'site' ? 'Preço do site do mercado' : 'Preço de promoção do encarte'}>
          {o.fonte === 'site' ? 'site' : 'encarte'}
        </span>
        <span className="unit">{brl(o.porUn)}/{o.ub}</span>
        {dist && <span className="dist">📍 {dist}</span>}
        {o.cond && <span className="cond">{o.cond}</span>}
      </div>
      <div className="product-actions">
        <button type="button" className="card-btn card-btn-primario" onClick={porNaCesta}>Pôr na cesta</button>
        <button type="button" className={`card-btn card-btn-secundario card-btn-sino${aberto === 'alerta' ? ' ativo' : ''}`} aria-expanded={aberto === 'alerta'}
          aria-label={`Criar alerta para ${o.nome}`} onClick={() => setAberto(aberto === 'alerta' ? '' : 'alerta')}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9a6 6 0 0 1 12 0c0 6 2 7 2 7H4s2-1 2-7" /><path d="M10 20a2 2 0 0 0 4 0" /></svg>
        </button>
        <button type="button" className="card-btn card-btn-secundario" aria-expanded={aberto === 'hist'} onClick={() => setAberto(aberto === 'hist' ? '' : 'hist')}>Ver histórico</button>
      </div>
      {aberto === 'alerta' && (
        <form className="alerta-rapido" onSubmit={criarAlerta}>
          <label htmlFor={`alvo-${o.id}`}>Avisar quando <b>{alvoTermo}</b> chegar a R$</label>
          <input id={`alvo-${o.id}`} className="input" inputMode="decimal" value={alvo} onChange={(e) => setAlvo(e.target.value)} />
          <button className="card-btn card-btn-primario" disabled={salvando}>{salvando ? 'Salvando…' : 'Criar alerta'}</button>
          <span className="muted">Os avisos chegam por e-mail ou no celular, como você escolher em <Link href="/conta#avisos">Meus dados</Link>.</span>
        </form>
      )}
      {aberto === 'hist' && <HistoricoMini o={o} termo={alvoTermo} />}
      <div className="product-links">
        {(o.url || PAGINA_ENCARTE[o.mercado]) && (
          <a className="link-origem" href={o.url || PAGINA_ENCARTE[o.mercado]} target="_blank" rel="noopener noreferrer">
            {o.fonte === 'site' ? `Ver no site do ${o.mercado}` : `Ver encarte do ${o.mercado}`} ↗
          </a>
        )}
        <button type="button" onClick={() => avisarEsgotado(o)}>Avisar que acabou</button>
      </div>
    </article>
  );
}

// Encartes carregados pelas tarefas agendadas (Cato, Tenda, Assaí) chegam sem o endereço da imagem:
// o link leva para a página de folhetos do mercado em Indaiatuba.
const PAGINA_ENCARTE: Record<string, string> = {
  'Cato': 'https://www.catosupermercados.com.br/folhetos',
  'Tenda': 'https://www.tendaatacado.com.br/institucional/nossas-ofertas',
  'Assaí': 'https://www.assai.com.br/ofertas/sao-paulo/assai-indaiatuba',
};

async function avisarEsgotado(o: Oferta) {
  const desfazer = await marcarEsgotado(o);
  if (!desfazer) return mostrarAviso({ texto: 'Não foi possível registrar agora. Tente de novo em instantes.' });
  mostrarAviso({
    texto: `${o.nome} no ${o.mercado} saiu das listas de hoje. Volta na próxima coleta.`,
    acao: { rotulo: 'Desfazer', fazer: desfazer },
  });
}

// Aviso de mercado que só vende para sócios (Sam's Club).
export function TagSocios() {
  return <span className="fonte fonte-socios" title="Para comprar é preciso ser sócio do clube">só sócios</span>;
}

// Esqueleto de linhas enquanto os preços chegam: a tela já mostra a forma do conteúdo.
export function Carregando() {
  return (
    <div className="lista carregando" role="status" aria-label="Carregando os preços de hoje">
      {[0, 1, 2, 3].map((i) => (
        <div className="item" key={i}>
          <span className="esq" style={{ width: `${70 - i * 8}%` }} />
          <span className="esq esq-preco" />
          <span className="esq" style={{ width: '40%', gridColumn: '1 / -1' }} />
        </div>
      ))}
    </div>
  );
}

export function ErroCarga({ tentarDeNovo }: { tentarDeNovo: () => void }) {
  return (
    <div className="alert alert-error stack" role="alert">
      <span>Não foi possível carregar os preços. Confira a internet e tente de novo.</span>
      <button type="button" className="btn btn-secondary" onClick={tentarDeNovo}>Tentar de novo</button>
    </div>
  );
}

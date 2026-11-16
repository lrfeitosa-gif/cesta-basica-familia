'use client';
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { brl, emb, marcarEsgotado, norm, SO_SOCIOS, type Oferta, type Opcao } from '@/lib/ofertas';
import { supabase } from '@/lib/supabase';
import { useSessao } from '@/lib/sessao';
import { adicionarNaCesta } from '@/lib/cesta';
import { mostrarAviso } from './aviso';
import HistoricoMini from './historico-mini';

// Cartão de um preço. Ações (15/11, Fase 3): só "+ Cesta" à vista; as outras quatro (alerta, histórico, site/encarte
// e "Avisar que acabou") ficam no botão "⋯", que fecha com Esc e com toque fora. `termo` é o que vai para a cesta e para o alerta: a busca da
// pessoa quando houver ("café pilão"), senão o nome do produto.
// `opcoes`/`titulo` (Fase 3.2): variações quase iguais juntas num card; a opção escolhida vale para a cesta, o alerta e os links.
export default function LinhaOferta({ o: oBase, extra, dist, termo, opcoes, titulo }:
  { o: Oferta; extra?: ReactNode; dist?: string | null; termo?: string; opcoes?: Opcao[]; titulo?: string }) {
  const sessao = useSessao(false);   // a página já exige a conta; aqui só lê, sem redirecionar
  const [escolhida, setEscolhida] = useState(0);
  const o = opcoes?.[escolhida]?.o ?? oBase;
  const nomeCard = opcoes && titulo ? titulo : o.nome;
  const [aberto, setAberto] = useState<'' | 'alerta' | 'hist'>('');
  const [alvo, setAlvo] = useState(() => (Math.floor(o.preco * 0.95 * 10) / 10).toFixed(2).replace('.', ','));
  const [salvando, setSalvando] = useState(false);
  const [menu, setMenu] = useState(false);
  const caixaMenu = useRef<HTMLDivElement>(null);
  const botaoMenu = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!menu) return;
    const fora = (e: PointerEvent) => { if (!caixaMenu.current?.contains(e.target as Node)) setMenu(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { setMenu(false); botaoMenu.current?.focus(); } };
    document.addEventListener('pointerdown', fora); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', fora); document.removeEventListener('keydown', esc); };
  }, [menu]);
  const escolher = (f: () => void) => { setMenu(false); f(); };
  const linkOrigem = o.url || PAGINA_ENCARTE[o.mercado];
  const pct = o.de > o.preco ? Math.round((1 - o.preco / o.de) * 100) : 0;
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
  const nomeJunto = norm(nomeCard).replace(/\s/g, '');
  const tamNoNome = [String(o.q), String(o.q).replace('.', ',')].some((q) => nomeJunto.includes(`${q}${o.u}`));
  return (
    <article className="product-card">
      <div className="product-header">
        <h3 className="product-title">{comMarca}{nomeCard}{!tamNoNome && <> <small>{emb(o)}</small></>}</h3>
        <div className="price-tag-container">
          <b className="current-price">{brl(o.preco)}</b>
          {o.de > o.preco && <s className="old-price">de {brl(o.de)}</s>}
          {pct > 0 ? <span className="discount-badge" aria-label={`${pct}% de desconto`}>−{pct}%</span>
            : extra && <span className="discount-badge">{extra}</span>}
        </div>
      </div>
      {opcoes && (
        <div className="opcoes-variacao" role="radiogroup" aria-label={`${opcoes.length} opções pelo mesmo preço`}>
          <span className="opcoes-rotulo">{opcoes.length} opções:</span>
          {opcoes.map((x, i) => (
            <button key={x.o.id} type="button" role="radio" aria-checked={i === escolhida} className="chip chip-opcao"
              onClick={() => setEscolhida(i)}>{x.rotulo}</button>
          ))}
        </div>
      )}
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
      <div className="product-actions" ref={caixaMenu}>
        <button type="button" className="card-btn card-btn-primario" onClick={porNaCesta} aria-label={`Pôr ${o.nome} na cesta`}>+ Cesta</button>
        <button type="button" ref={botaoMenu} className="card-btn card-btn-secundario card-btn-mais" aria-label="Mais ações" aria-expanded={menu}
          aria-controls={`acoes-${o.id}`} onClick={() => setMenu(!menu)}>
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" /></svg>
        </button>
        {menu && (
          <ul className="acoes-menu" id={`acoes-${o.id}`}>
            <li><button type="button" onClick={() => escolher(() => setAberto('alerta'))}>Criar alerta de preço</button></li>
            <li><button type="button" onClick={() => escolher(() => setAberto('hist'))}>Ver histórico de preço</button></li>
            {linkOrigem && (
              <li><a href={linkOrigem} target="_blank" rel="noopener noreferrer" onClick={() => setMenu(false)}>
                {o.fonte === 'site' ? `Ver no site do ${o.mercado}` : `Ver encarte do ${o.mercado}`} ↗
              </a></li>
            )}
            <li><button type="button" onClick={() => escolher(() => avisarEsgotado(o))}>Avisar que acabou</button></li>
          </ul>
        )}
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
      {aberto && <button type="button" className="fechar-painel" onClick={() => setAberto('')}>Fechar {aberto === 'hist' ? 'histórico' : 'alerta'}</button>}
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

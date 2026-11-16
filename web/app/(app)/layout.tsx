'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { sairDoApp, useEncerrarSemUso, useSessao } from '@/lib/sessao';
import { garantirDonoDaCesta } from '@/lib/cesta';
import { supabase } from '@/lib/supabase';
import Logo from '@/app/logo';
import Avisos from './aviso';
import { registrar } from '@/lib/eventos';
import CaixaOpiniao from './opiniao';

// Duas abas no topo, logo abaixo do cabeçalho (14/11): Preços (antes Ofertas e Comparar) e Cesta (com a nota
// e os alertas). Notas, alertas e histórico saíram da barra: ficam na Cesta, em Meus dados e nos cartões de preço.
const ABAS = [
  // 15/11 (Fase 2): Minha cesta vem primeiro e é a tela inicial; a aba de preços continua "Preços"
  { href: '/compra', rotulo: 'Minha cesta', outras: ['/notas', '/lista'] },
  { href: '/ofertas', rotulo: 'Preços', outras: ['/comparar', '/evolucao'] },
];

// Área logada: cabeçalho verde com a marca e a cidade, e as abas Preços e Cesta logo abaixo.
export default function AreaLogada({ children }: { children: ReactNode }) {
  const sessao = useSessao();
  const rota = usePathname();
  const [admin, setAdmin] = useState<boolean | null>(null);   // null: ainda conferindo
  const menu = useRef<HTMLDetailsElement>(null);
  const [opiniao, setOpiniao] = useState(false);
  // 15/11: a barra de abas ganha fundo de ponta a ponta e sombra só quando fica presa no topo (o conteúdo passava por baixo sem separação)
  const marcoAbas = useRef<HTMLDivElement>(null);
  const [abasPresas, setAbasPresas] = useState(false);
  useEffect(() => {
    const el = marcoAbas.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const obs = new IntersectionObserver(([e]) => setAbasPresas(!e.isIntersecting), { rootMargin: '-1px 0px 0px 0px' });
    obs.observe(el);
    return () => obs.disconnect();
  }, [!!sessao]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEncerrarSemUso(sessao, admin);
  // menu da conta: fecha ao trocar de tela, ao tocar fora dele ou com Esc
  useEffect(() => { if (menu.current) menu.current.open = false; }, [rota]);
  useEffect(() => {
    const fora = (e: PointerEvent) => { if (menu.current?.open && !menu.current.contains(e.target as Node)) menu.current.open = false; };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape' && menu.current) menu.current.open = false; };
    document.addEventListener('pointerdown', fora); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', fora); document.removeEventListener('keydown', esc); };
  }, []);
  useEffect(() => { if (sessao) supabase.rpc('eh_admin').then(({ data }) => setAdmin(!!data)); }, [sessao]);
  // outra conta entrou neste aparelho: a lista guardada aqui pertence à conta anterior e é apagada
  useEffect(() => { if (sessao) garantirDonoDaCesta(sessao.user.id); }, [sessao?.user.id]);   // eslint-disable-line react-hooks/exhaustive-deps
  // uso por tela (uma vez por tela em cada visita) e erros de tela, para o painel de administração
  useEffect(() => {
    if (!sessao) return;
    const chave = `ev-tela-${rota}`;
    try { if (sessionStorage.getItem(chave)) return; sessionStorage.setItem(chave, '1'); } catch {}
    registrar('tela', rota);
  }, [sessao, rota]);
  useEffect(() => {
    const erro = (e: ErrorEvent) => registrar('erro_app', `${location.pathname}: ${e.message}`);
    const promessa = (e: PromiseRejectionEvent) => registrar('erro_app', `${location.pathname}: ${String(e.reason).slice(0, 200)}`);
    window.addEventListener('error', erro); window.addEventListener('unhandledrejection', promessa);
    return () => { window.removeEventListener('error', erro); window.removeEventListener('unhandledrejection', promessa); };
  }, []);
  if (!sessao) return null;
  const fecharMenu = () => { if (menu.current) menu.current.open = false; };
  const sair = () => sairDoApp('/entrar');
  return (
    <>
      <header className="barra-topo">
        <span className="topo-marca">
          <Link href="/compra" className="logo-link" aria-label="Ir para o início (Minha cesta)"><Logo size={28} /></Link>
          <span className="topo-cidade">Indaiatuba</span>
        </span>
        <details className="menu-conta" ref={menu}>
          <summary aria-label="Conta">
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></svg>
          </summary>
          <div className="menu-conta-caixa">
            <span className="muted">{sessao.user.email}</span>
            {/* fecha também ao tocar no link da tela em que já está (a rota não muda) */}
            <Link href="/conta" onClick={fecharMenu}>Meus dados</Link>
            <Link href="/indicar" onClick={fecharMenu}>Indicar um mercado</Link>
            <button type="button" className="menu-opiniao" onClick={() => { fecharMenu(); setOpiniao(true); }}>Dar opinião</button>
            <Link href="/privacidade" onClick={fecharMenu}>Privacidade</Link>
            {admin && <Link href="/admin" onClick={fecharMenu}>Administração</Link>}
            <button type="button" className="btn btn-secondary" onClick={sair}>Sair</button>
          </div>
        </details>
      </header>
      <div ref={marcoAbas} className="abas-marco" aria-hidden="true" />
      <div className={`abas-faixa${abasPresas ? ' presa' : ''}`}>
        <nav className="abas-topo" aria-label="Seções">
          {ABAS.map((a) => {
            const ativa = rota.startsWith(a.href) || a.outras.some((o) => rota.startsWith(o));
            return <Link key={a.href} href={a.href} aria-current={ativa ? 'page' : undefined}>{a.rotulo}</Link>;
          })}
        </nav>
      </div>
      {children}
      <Avisos />
      <CaixaOpiniao tela={rota} aberta={opiniao} fechar={() => setOpiniao(false)} />
    </>
  );
}

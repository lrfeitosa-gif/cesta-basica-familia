'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { marcarSaida, useEncerrarSemUso, useSessao } from '@/lib/sessao';
import { supabase } from '@/lib/supabase';
import Logo from '@/app/logo';
import Avisos from './aviso';
import { registrar } from '@/lib/eventos';
import CaixaOpiniao from './opiniao';

const ABAS = [
  { href: '/ofertas', rotulo: 'Ofertas do dia', icone: <><path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8Z" /><circle cx="7.5" cy="7.5" r="1.5" /></> },
  { href: '/compra', rotulo: 'Cesta', icone: <><path d="M3 4h2l2.4 11.2a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.5L21 8H6" /><circle cx="10" cy="20" r="1.3" /><circle cx="17" cy="20" r="1.3" /></> },
  { href: '/comparar', rotulo: 'Comparar', icone: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></> },
  { href: '/notas', rotulo: 'Notas', icone: <><path d="M6 2h12v20l-3-2-3 2-3-2-3 2Z" /><path d="M9 7h6M9 11h6M9 15h4" /></> },
  { href: '/evolucao', rotulo: 'Evolução', icone: <><path d="M3 3v18h18" /><path d="m7 15 4-4 3 3 5-6" /></> },
  { href: '/alertas', rotulo: 'Alertas', icone: <><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></> },
];

// Área logada: barra de abas fixa embaixo, ao alcance do polegar.
export default function AreaLogada({ children }: { children: ReactNode }) {
  const sessao = useSessao();
  const rota = usePathname();
  const router = useRouter();
  const [admin, setAdmin] = useState<boolean | null>(null);   // null: ainda conferindo
  const menu = useRef<HTMLDetailsElement>(null);
  const [opiniao, setOpiniao] = useState(false);
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
  const sair = async () => { marcarSaida(); await supabase.auth.signOut(); router.replace('/'); };
  return (
    <>
      <header className="barra-topo">
        <Link href="/ofertas" className="logo-link" aria-label="Ir para as ofertas"><Logo size={30} /></Link>
        <details className="menu-conta" ref={menu}>
          <summary aria-label="Conta">
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></svg>
          </summary>
          <div className="menu-conta-caixa">
            <span className="muted">{sessao.user.email}</span>
            {/* fecha também ao tocar no link da tela em que já está (a rota não muda) */}
            <button type="button" className="menu-opiniao" onClick={() => { fecharMenu(); setOpiniao(true); }}>Dar opinião</button>
            <Link href="/conta" onClick={fecharMenu}>Meus dados</Link>
            {admin && <Link href="/admin" onClick={fecharMenu}>Administração</Link>}
            <Link href="/indicar" onClick={fecharMenu}>Indicar um mercado</Link>
            <Link href="/privacidade" onClick={fecharMenu}>Privacidade</Link>
            <button type="button" className="btn btn-secondary" onClick={sair}>Sair</button>
          </div>
        </details>
      </header>
      {children}
      <Avisos />
      <CaixaOpiniao tela={rota} aberta={opiniao} fechar={() => setOpiniao(false)} />
      <nav className="abas" aria-label="Seções">
        <div>
          {ABAS.map((a) => (
            <Link key={a.href} href={a.href} aria-current={rota.startsWith(a.href) ? 'page' : undefined}>
              <svg viewBox="0 0 24 24" aria-hidden="true">{a.icone}</svg>
              {a.rotulo}
            </Link>
          ))}
        </div>
      </nav>
    </>
  );
}

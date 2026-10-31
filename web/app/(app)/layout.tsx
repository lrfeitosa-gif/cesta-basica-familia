'use client';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useSessao } from '@/lib/sessao';
import { supabase } from '@/lib/supabase';
import Logo from '@/app/logo';

const ABAS = [
  { href: '/ofertas', rotulo: 'Ofertas', icone: <><path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8Z" /><circle cx="7.5" cy="7.5" r="1.5" /></> },
  { href: '/comparar', rotulo: 'Comparar', icone: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></> },
  { href: '/compra', rotulo: 'Compra', icone: <><path d="M3 4h2l2.4 11.2a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.5L21 8H6" /><circle cx="10" cy="20" r="1.3" /><circle cx="17" cy="20" r="1.3" /></> },
  { href: '/alertas', rotulo: 'Alertas', icone: <><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></> },
  { href: '/notas', rotulo: 'Notas', icone: <><path d="M6 2h12v20l-3-2-3 2-3-2-3 2Z" /><path d="M9 7h6M9 11h6M9 15h4" /></> },
];

// Área logada: barra de abas fixa embaixo, ao alcance do polegar.
export default function AreaLogada({ children }: { children: ReactNode }) {
  const sessao = useSessao();
  const rota = usePathname();
  const router = useRouter();
  if (!sessao) return null;
  const sair = async () => { await supabase.auth.signOut(); router.replace('/'); };
  return (
    <>
      <header className="barra-topo">
        <Link href="/ofertas" className="logo-link" aria-label="Ir para as ofertas"><Logo size={30} /></Link>
        <details className="menu-conta">
          <summary aria-label="Conta">
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></svg>
          </summary>
          <div className="menu-conta-caixa">
            <span className="muted">{sessao.user.email}</span>
            <Link href="/conta">Meus dados</Link>
            <Link href="/privacidade">Privacidade</Link>
            <button type="button" className="btn btn-secondary" onClick={sair}>Sair</button>
          </div>
        </details>
      </header>
      {children}
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

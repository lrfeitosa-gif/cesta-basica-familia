'use client';
import Logo, { Carrinho } from '@/app/logo';
import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export default function Inicio() {
  const router = useRouter();
  // quem já está logado vai direto para os preços
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { if (data.session) router.replace('/ofertas'); });
  }, [router]);

  return (
    <>
      <Logo />
      <Carrinho size={180} className="hero-carrinho" />
      <div className="stack" style={{ marginTop: 'auto' }}>
        <h1>Compre no preço de oportunidade</h1>
        <p className="lead">
          Diga o que sua família consome. Notificamos quando o preço de um item está bem mais em conta
          nos mercados de Indaiatuba.
        </p>
        <ul className="muted" style={{ paddingLeft: 18, margin: 0, display: 'grid', gap: 4 }}>
          <li>Preços de 8 mercados, atualizados todo dia às 7h</li>
          <li>Comparação por kg ou litro, sem confusão de embalagem</li>
          <li>Sem CPF, sem endereço exato</li>
        </ul>
      </div>
      <div className="stack">
        <Link href="/cadastro" className="btn btn-primary btn-block">Criar conta</Link>
        <Link href="/entrar" className="btn btn-secondary btn-block">Já tenho conta</Link>
      </div>
    </>
  );
}

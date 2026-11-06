'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Ilustracoes, PASSOS, CHAVE } from './(app)/boas-vindas';

// Tela inicial (antes do login) no design system de boas-vindas: 3 passos e, no último, criar conta ou entrar.
export default function Inicio() {
  const router = useRouter();
  const [passo, setPasso] = useState(0);
  // quem já está logado vai direto para os preços
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { if (data.session) router.replace('/ofertas'); });
  }, [router]);
  // quem viu a apresentação aqui não precisa vê-la de novo depois do cadastro
  useEffect(() => { if (passo === PASSOS.length - 1) try { localStorage.setItem(CHAVE, '1'); } catch {} }, [passo]);

  const p = PASSOS[passo];
  const ultimo = passo === PASSOS.length - 1;

  return (
    <div className="ob" role="region" aria-labelledby="ini-titulo">
      <div className="ob-card" key={passo}>
        <div className="ob-ilustra">{Ilustracoes[passo]}</div>
        <div className="ob-dots" aria-label={`Passo ${passo + 1} de ${PASSOS.length}`}>
          {PASSOS.map((_, i) => <span key={i} data-on={i === passo} />)}
        </div>
        <h1 id="ini-titulo" className="ob-titulo">{p.titulo}</h1>
        <p className="ob-texto">{p.texto}</p>
        {ultimo && <p className="ob-texto" style={{ fontSize: '.85rem' }}>Sem CPF e sem endereço exato.</p>}
        {ultimo ? (
          <div className="ob-acoes ob-acoes-fim" style={{ flexDirection: 'column', gap: 4 }}>
            <Link href="/cadastro" className="ob-pill ob-pill-larga ob-link">Criar conta</Link>
            <Link href="/entrar" className="ob-skip">Já tenho conta</Link>
          </div>
        ) : (
          <div className="ob-acoes">
            <Link href="/entrar" className="ob-skip">Entrar</Link>
            <button type="button" className="ob-pill" onClick={() => setPasso(passo + 1)}>Próximo</button>
          </div>
        )}
      </div>
    </div>
  );
}

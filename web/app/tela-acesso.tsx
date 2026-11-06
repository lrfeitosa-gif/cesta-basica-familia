'use client';
import { useEffect, useState, type InputHTMLAttributes, type ReactNode } from 'react';
import Link from 'next/link';
import Logo from '@/app/logo';
import { Ilustracoes, PASSOS } from './(app)/boas-vindas';

// Moldura das telas de acesso (entrar / criar conta) no design system de boas-vindas:
// logo, título com palavra em destaque, traço dourado, mini-carrossel com pontos e o formulário.
export function TelaAcesso({ titulo, destaque, sub, children, rodape }:
  { titulo: string; destaque: string; sub: string; children: ReactNode; rodape: ReactNode }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((x) => (x + 1) % PASSOS.length), 4500);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="ob au">
      <div className="ob-card au-card">
        <Link href="/" className="logo-link" aria-label="Início"><Logo size={30} /></Link>
        <h1 className="au-titulo">{titulo}<br /><span>{destaque}</span></h1>
        <span className="au-traco" aria-hidden="true" />
        <p className="au-sub">{sub}</p>
        <div className="au-mini">
          <div className="au-mini-ilustra" key={i}>{Ilustracoes[i]}</div>
          <b>{PASSOS[i].titulo}</b>
          <div className="ob-dots" aria-label="Destaques">
            {PASSOS.map((p, j) => (
              <button key={j} type="button" aria-label={p.titulo} aria-pressed={j === i} data-on={j === i} onClick={() => setI(j)} />
            ))}
          </div>
        </div>
        {children}
        <p className="au-rodape">{rodape}</p>
      </div>
    </div>
  );
}

const ICONE = {
  email: 'M4 6h16v12H4zM4 7l8 6 8-6',
  senha: 'M7 11V8a5 5 0 0 1 10 0v3M5 11h14v10H5zM12 15v2',
  convite: 'M3 8h18v4a2 2 0 0 0 0 4v4H3v-4a2 2 0 0 0 0-4zM10 8v12',
};

// Campo em pílula com ícone no círculo à esquerda; senha ganha o botão de mostrar.
export function CampoPilula({ icone, rotulo, ...props }:
  { icone: keyof typeof ICONE; rotulo: string } & InputHTMLAttributes<HTMLInputElement>) {
  const [ver, setVer] = useState(false);
  const senha = props.type === 'password';
  return (
    <label className="au-campo">
      <span className="au-ico" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round">
          <path d={ICONE[icone]} />
        </svg>
      </span>
      <span className="sr-only">{rotulo}</span>
      <input {...props} type={senha && ver ? 'text' : props.type} placeholder={rotulo} />
      {senha && (
        <button type="button" className="au-olho" onClick={() => setVer(!ver)} aria-label={ver ? 'Esconder senha' : 'Mostrar senha'}>
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.6">
            <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" />
            {ver && <path d="M4 4l16 16" />}
          </svg>
        </button>
      )}
    </label>
  );
}

export const Seta = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <path d="M4 12h16M14 6l6 6-6 6" />
  </svg>
);

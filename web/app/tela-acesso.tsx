'use client';
import { useState, type InputHTMLAttributes, type ReactNode } from 'react';
import Link from 'next/link';
import Logo from '@/app/logo';

// Moldura das telas de acesso (entrar / criar conta): marca Mercato, ilustração, título e o formulário.
export function TelaAcesso({ titulo, destaque = '', sub, selo, children, rodape }:
  { titulo: string; destaque?: string; sub?: string; selo?: string; children: ReactNode; rodape: ReactNode }) {
  return (
    <div className="ob au">
      <div className="ob-card au-card">
        <Link href="/" className="au-marca" aria-label="Mercato, início">
          <Logo size={34} />
          <span className="au-slogan">Preço bom nos mercados de Indaiatuba</span>
        </Link>
        <img className="au-ilustra" src="/img/entrada.webp" width={640} height={857}
          alt="Pessoa mostrando no celular os descontos do dia nos mercados" />
        <div className="au-hero">
          <h1 className="au-titulo">{titulo}{destaque && ` ${destaque}`}</h1>
          {sub && <p className="au-sub">{sub}</p>}
          {selo && (
            <p className="au-selo">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" aria-hidden="true">
                <path d="M12 3 5 6v5c0 4.5 3 8.3 7 10 4-1.7 7-5.5 7-10V6z" /><path d="m9 12 2 2 4-4" />
              </svg>
              {selo}
            </p>
          )}
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

// Campo com o rótulo visível acima (15/11: antes o nome do campo ficava dentro dele e sumia ao digitar).
// `acao` aparece à direita do rótulo (ex.: "Esqueci a senha"); senha ganha o botão de mostrar.
export function CampoRotulo({ rotulo, acao, ajuda, ...props }:
  { rotulo: string; acao?: ReactNode; ajuda?: ReactNode } & InputHTMLAttributes<HTMLInputElement>) {
  const [ver, setVer] = useState(false);
  const senha = props.type === 'password';
  return (
    <div className="au-field">
      <div className="au-rotulo-linha">
        <label htmlFor={props.id}>{rotulo}</label>
        {acao}
      </div>
      <div className="au-entrada">
        <input {...props} type={senha && ver ? 'text' : props.type} />
        {senha && (
          <button type="button" className="au-olho" onClick={() => setVer(!ver)} aria-label={ver ? 'Esconder senha' : 'Mostrar senha'}>
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.6">
              <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" />
              {ver && <path d="M4 4l16 16" />}
            </svg>
          </button>
        )}
      </div>
      {ajuda}
    </div>
  );
}

// Regras da senha conferidas enquanto a pessoa digita (as mesmas do Supabase: 8+, letras, números e símbolo).
export const REGRAS_SENHA: [string, (s: string) => boolean][] = [
  ['Pelo menos 8 caracteres', (s) => s.length >= 8],
  ['Letras', (s) => /\p{L}/u.test(s)],
  ['Números', (s) => /\d/.test(s)],
  ['Um símbolo (# ! @ $ …)', (s) => /[^\p{L}\d\s]/u.test(s)],
];
export function ChecklistSenha({ senha }: { senha: string }) {
  return (
    <ul className="au-checklist" aria-label="Regras da senha">
      {REGRAS_SENHA.map(([t, ok]) => (
        <li key={t} className={ok(senha) ? 'ok' : ''}><span aria-hidden="true">{ok(senha) ? '✓' : '○'}</span>{t}{ok(senha) && <span className="sr-only"> (ok)</span>}</li>
      ))}
    </ul>
  );
}

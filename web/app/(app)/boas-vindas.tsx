'use client';
import { useEffect, useState, type ReactNode } from 'react';

// Ilustrações próprias no estilo da referência: círculo em degradê, figura chapada em dourado/bege/escuro.
const Circulo = () => (
  <>
    <defs>
      <radialGradient id="bv-c" cx="50%" cy="30%" r="70%">
        <stop offset="0" stopColor="var(--ob-sand)" />
        <stop offset="1" stopColor="var(--ob-sand)" stopOpacity="0" />
      </radialGradient>
    </defs>
    <circle cx="120" cy="112" r="96" fill="url(#bv-c)" />
    <ellipse cx="120" cy="214" rx="78" ry="6" fill="var(--ob-floor)" />
  </>
);

export const Ilustracoes: ReactNode[] = [
  // 1. Relógio (7h e 13h) + pessoa vendo uma etiqueta de preço baixar
  <svg key="1" viewBox="0 0 240 230" aria-hidden="true">
    <Circulo />
    <circle cx="176" cy="44" r="22" fill="var(--ob-paper)" stroke="var(--ob-line)" strokeWidth="3" />
    <path d="M176 30v14l9 6" stroke="var(--ob-dark)" strokeWidth="3" fill="none" strokeLinecap="round" />
    <path d="M40 92h56l14 14-14 14H40z" fill="var(--ob-gold)" />
    <circle cx="50" cy="106" r="4" fill="var(--ob-paper)" />
    <path d="M62 100h26M62 110h18" stroke="var(--ob-dark)" strokeWidth="3" strokeLinecap="round" />
    <path d="M150 104v34m-8-8 8 8 8-8" stroke="var(--ob-line)" strokeWidth="3" fill="none" strokeLinecap="round" />
    <circle cx="112" cy="128" r="12" fill="var(--ob-dark)" />
    <path d="M100 130c0-10 24-10 24 0v14h-24z" fill="var(--ob-dark)" />
    <circle cx="112" cy="136" r="10" fill="var(--ob-skin)" />
    <path d="M94 156c0-10 36-10 36 0v32H94z" fill="var(--ob-gold)" />
    <path d="M120 166l16-12 4 6-16 12z" fill="var(--ob-skin)" />
    <rect x="134" y="146" width="10" height="16" rx="2" fill="var(--ob-dark)" />
    <path d="M96 188h32l4 24h-10l-6-16-6 16h-10z" fill="var(--ob-dark)" />
    <path d="M100 212h12M120 212h12" stroke="var(--ob-gold)" strokeWidth="4" strokeLinecap="round" />
  </svg>,
  // 2. Balança comparando duas embalagens pelo preço do quilo
  <svg key="2" viewBox="0 0 240 230" aria-hidden="true">
    <Circulo />
    <path d="M120 70v130M80 200h80" stroke="var(--ob-dark)" strokeWidth="5" strokeLinecap="round" />
    <path d="M58 92h124" stroke="var(--ob-dark)" strokeWidth="4" strokeLinecap="round" />
    <circle cx="120" cy="70" r="7" fill="var(--ob-gold)" />
    <path d="M58 92l-20 44h40zM182 92l-20 44h40z" fill="none" stroke="var(--ob-line)" strokeWidth="2" />
    <path d="M34 136h48a24 10 0 0 1-48 0zM158 136h48a24 10 0 0 1-48 0z" fill="var(--ob-dark)" />
    <rect x="44" y="104" width="28" height="32" rx="4" fill="var(--ob-gold)" />
    <rect x="48" y="112" width="20" height="8" rx="2" fill="var(--ob-paper)" />
    <rect x="166" y="92" width="32" height="44" rx="5" fill="var(--ob-sand-dark)" />
    <rect x="171" y="104" width="22" height="10" rx="2" fill="var(--ob-paper)" />
    <text x="120" y="182" textAnchor="middle" fontSize="16" fontWeight="800" fill="var(--ob-dark)" fontFamily="var(--display)">R$/kg</text>
  </svg>,
  // 3. Pessoa tranquila na poltrona com a cesta e o sino de aviso
  <svg key="3" viewBox="0 0 240 230" aria-hidden="true">
    <Circulo />
    <path d="M166 22c-12 0-18 10-18 22v14l-6 8h48l-6-8V44c0-12-6-22-18-22z" fill="var(--ob-paper)" stroke="var(--ob-line)" strokeWidth="3" />
    <circle cx="166" cy="70" r="5" fill="var(--ob-line)" />
    <path d="M196 30c6 6 6 16 0 22M204 24c10 10 10 26 0 36" stroke="var(--ob-line)" strokeWidth="2" fill="none" strokeLinecap="round" />
    <path d="M64 120l12 64h70l6-30" stroke="var(--ob-sand-dark)" strokeWidth="10" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M70 186l-10 24M140 186l10 24" stroke="var(--ob-sand-dark)" strokeWidth="6" strokeLinecap="round" />
    <circle cx="102" cy="108" r="11" fill="var(--ob-skin)" />
    <path d="M92 104c2-12 20-12 22 0z" fill="var(--ob-dark)" />
    <path d="M88 126c0-8 28-8 28 0v40H88z" fill="var(--ob-gold)" />
    <path d="M104 160h46l14 34" stroke="var(--ob-dark)" strokeWidth="12" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M160 196h14" stroke="var(--ob-gold)" strokeWidth="6" strokeLinecap="round" />
    <path d="M118 140h38l-6 22h-26z" fill="var(--ob-paper)" stroke="var(--ob-dark)" strokeWidth="3" strokeLinejoin="round" />
    <path d="M124 140c0-12 26-12 26 0" stroke="var(--ob-dark)" strokeWidth="3" fill="none" />
    <circle cx="130" cy="136" r="5" fill="var(--ob-gold)" />
    <circle cx="142" cy="135" r="5" fill="#c9d48a" />
  </svg>,
];

export const PASSOS = [
  {
    titulo: 'Preço de oportunidade',
    texto: 'Todo dia, às 7h e às 13h, buscamos os preços de 9 mercados de Indaiatuba e avisamos quando um item fica bem mais em conta.',
  },
  {
    titulo: 'Compare do jeito certo',
    texto: 'Comparamos pelo preço do quilo ou do litro. Embalagens de tamanhos diferentes ficam lado a lado de forma justa.',
  },
  {
    titulo: 'Sua cesta, seu mercado',
    texto: 'Monte sua compra e veja qual mercado sai mais barato. Envie suas notas quando quiser: o app aprende o que você compra.',
  },
];
export const CHAVE = 'boas-vindas-vista';

// Mostrada uma vez, no primeiro acesso após o cadastro.
export default function BoasVindas() {
  const [passo, setPasso] = useState<number | null>(null);
  useEffect(() => {
    try { if (!localStorage.getItem(CHAVE)) setPasso(0); } catch { /* sem armazenamento: não mostra */ }
  }, []);
  const fechar = () => { try { localStorage.setItem(CHAVE, '1'); } catch {} setPasso(null); };
  if (passo === null) return null;
  const p = PASSOS[passo];
  const ultimo = passo === PASSOS.length - 1;

  return (
    <div className="ob" role="dialog" aria-modal="true" aria-labelledby="bv-titulo">
      <div className="ob-card" key={passo}>
        <div className="ob-ilustra">{Ilustracoes[passo]}</div>
        <div className="ob-dots" aria-label={`Passo ${passo + 1} de ${PASSOS.length}`}>
          {PASSOS.map((_, i) => <span key={i} data-on={i === passo} />)}
        </div>
        <h1 id="bv-titulo" className="ob-titulo">{p.titulo}</h1>
        <p className="ob-texto">{p.texto}</p>
        <div className={`ob-acoes${ultimo ? ' ob-acoes-fim' : ''}`}>
          {!ultimo && <button type="button" className="ob-skip" onClick={fechar}>Pular</button>}
          <button type="button" className={`ob-pill${ultimo ? ' ob-pill-larga' : ''}`} onClick={() => (ultimo ? fechar() : setPasso(passo + 1))}>
            {ultimo ? 'Começar' : 'Próximo'}
          </button>
        </div>
      </div>
    </div>
  );
}

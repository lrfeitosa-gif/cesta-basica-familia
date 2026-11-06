'use client';
import { useEffect, useState, type ReactNode } from 'react';

// Ilustrações do onboarding (imagens em /public/img, recortadas das referências).
const ALT = ['Pessoa vendo no celular o preço de um produto baixar', 'Balança comparando duas embalagens pelo preço do quilo', 'Pessoa montando a compra no celular, com o carrinho ao lado'];
export const Ilustracoes: ReactNode[] = ALT.map((alt, i) => (
  // eslint-disable-next-line @next/next/no-img-element
  <img key={i} src={`/img/ob-${i + 1}.jpg`} alt={alt} width={572} height={i === 1 ? 650 : 610} />
));

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

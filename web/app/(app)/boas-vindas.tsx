'use client';
import { useEffect, useState } from 'react';

const PASSOS = [
  {
    titulo: 'Preço de oportunidade',
    texto: 'Todo dia às 7h buscamos os preços de 7 mercados de Indaiatuba. Notificamos quando o preço de um item está bem mais em conta: é a hora de comprar ou estocar.',
  },
  {
    titulo: 'Compare do jeito certo',
    texto: 'Fazemos a comparação de preço considerando o valor do produto por kg ou litro. Com isso, a comparação é justa.',
  },
  {
    titulo: 'Sua cesta, seu mercado',
    texto: 'Monte sua compra e veja qual mercado sai mais barato. Envie suas notas fiscais quando quiser: o app aprende o que você compra.',
  },
];
const CHAVE = 'boas-vindas-vista';

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
    <div className="boas-vindas" role="dialog" aria-modal="true" aria-labelledby="bv-titulo">
      <div className="boas-vindas-caixa">
        <button type="button" className="btn btn-link pular" onClick={fechar}>Pular</button>
        <div className="progress" aria-label={`Passo ${passo + 1} de ${PASSOS.length}`}>
          {PASSOS.map((_, i) => <span key={i} data-on={i <= passo} />)}
        </div>
        <span className="etiqueta" aria-hidden="true">{passo + 1}</span>
        <h1 id="bv-titulo">{p.titulo}</h1>
        <p className="lead">{p.texto}</p>
        <div className="row" style={{ marginTop: 'auto' }}>
          {passo > 0 && <button type="button" className="btn btn-secondary" onClick={() => setPasso(passo - 1)}>Voltar</button>}
          <button type="button" className="btn btn-primary" style={{ flex: 1 }} onClick={() => (ultimo ? fechar() : setPasso(passo + 1))}>
            {ultimo ? 'Começar' : 'Próximo'}
          </button>
        </div>
      </div>
    </div>
  );
}

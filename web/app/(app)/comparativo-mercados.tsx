'use client';
import { useEffect, useMemo, useRef } from 'react';
import { brl, emb, norm, outrasFormas, SO_SOCIOS, type Oferta } from '@/lib/ofertas';
import { TagSocios } from './linha-oferta';

const MEDIDA: Record<string, string> = { kg: 'quilo', l: 'litro', un: 'unidade' };
// o tamanho já está no nome ("Pacote 5kg")? então não repete ao lado
const tamNoNome = (o: Oferta) => { const n = norm(o.nome).replace(/\s/g, ''); return [String(o.q), String(o.q).replace('.', ',')].some((q) => n.includes(`${q}${o.u}`)); };

// Tela Preços, com busca (14/11): um cartão por mercado, lado a lado, com o menor preço por quilo/litro/unidade
// marcado com "/ kg"; o preço do pacote fica embaixo, junto do tamanho, para não ler "5 kg" ao lado de um valor por quilo.
// `todos` já vem ordenado por ordenarPorMedida: a medida do primeiro é a mais comum da busca.
export default function ComparativoMercados({ todos, distTxt }: { todos: Oferta[]; distTxt: (m: string) => string | null }) {
  const melhor = todos[0];
  const porMercado = useMemo(() => {
    if (!melhor) return [];
    const vistos = new Map<string, Oferta>();
    for (const o of todos) if (o.ub === melhor.ub && !vistos.has(o.mercado)) vistos.set(o.mercado, o);
    return [...vistos.values()];
  }, [todos, melhor]);
  // 15/11: o React reaproveita a mesma faixa entre uma busca e outra e a rolagem lateral ficava guardada
  // (a busca "arroz 5kg" abria em São Vicente, com o card "Menor preço" fora da tela). Volta ao início a cada resultado novo.
  const faixa = useRef<HTMLOListElement>(null);
  const assinatura = porMercado.map((o) => `${o.mercado}:${o.porUn}`).join('|');
  useEffect(() => { if (faixa.current) faixa.current.scrollLeft = 0; }, [assinatura]);
  if (!melhor || porMercado.length < 2) return null;
  const medida = MEDIDA[melhor.ub] ?? melhor.ub;
  return (
    <section className="comparativo" aria-label={`Menor preço por ${medida} em cada mercado`}>
      <div className="comparativo-cab">
        <h2>Menor preço por {medida} em cada mercado</h2>
        <span className="muted">{porMercado.length} mercados</span>
      </div>
      <ol className="compara-cards" ref={faixa}>
        {porMercado.map((o, i) => {
          const pct = melhor.porUn > 0 ? Math.round((o.porUn / melhor.porUn - 1) * 100) : 0;
          return (
            <li key={o.mercado} className={i === 0 ? 'compara-card vencedor' : 'compara-card'}>
              <div className="compara-card-topo">
                <b className="compara-mercado">{o.mercado}</b>
                {i === 0 ? <span className="selo-menor">Menor preço</span> : <span className="selo-dif">+{pct}%</span>}
              </div>
              <span className="compara-unit">{brl(o.porUn)} <small>/ {o.ub}</small></span>
              <span className="compara-pacote">{o.marca && !norm(o.nome).includes(norm(o.marca)) ? `${o.marca} · ` : ''}{o.nome}{!tamNoNome(o) && <> <small>{emb(o)}</small></>}: <b>{brl(o.preco)}</b></span>
              {(SO_SOCIOS.has(o.mercado) || distTxt(o.mercado)) && (
                <span className="compara-extra">{SO_SOCIOS.has(o.mercado) && <TagSocios />}{distTxt(o.mercado) && <span>📍 {distTxt(o.mercado)}</span>}</span>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

// "Também tem" (forma de sempre, 0030): as outras formas do produto que ficaram fora da busca, com o mais barato de
// cada uma. Um toque troca a busca ("café" → "café capsula").
export function OutrasFormas({ lista, consulta, aoEscolher }: { lista: Oferta[]; consulta: string; aoEscolher: (busca: string) => void }) {
  const formas = useMemo(() => outrasFormas(lista, consulta), [lista, consulta]);
  if (!formas.length) return null;
  return (
    <div className="outras-formas" role="group" aria-label="Outras formas do produto">
      <span className="muted">Também tem:</span>
      {formas.map((f) => (
        <button key={f.palavra} type="button" className="chip chip-forma" onClick={() => aoEscolher(f.busca)}>
          {f.palavra} <small>· {brl(f.melhor.porUn)}/{f.melhor.ub}</small>
        </button>
      ))}
    </div>
  );
}

'use client';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

// Linha de chips com rolagem para o lado e setas ‹ › nas pontas quando há mais itens escondidos
// (no computador não há gesto de arrastar; no celular as setas ajudam a perceber que a linha continua).
export default function LinhaRolagem({ rotulo, className = '', children }: { rotulo: string; className?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [esq, setEsq] = useState(false);
  const [dir, setDir] = useState(false);
  const medir = useCallback(() => {
    const el = ref.current; if (!el) return;
    setEsq(el.scrollLeft > 4);
    setDir(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);
  useEffect(() => {
    medir();
    const el = ref.current; if (!el) return;
    const ro = new ResizeObserver(medir); ro.observe(el);
    return () => ro.disconnect();
  }, [medir, children]);
  const rolar = (lado: 1 | -1) => ref.current?.scrollBy({ left: lado * ref.current.clientWidth * 0.7, behavior: 'smooth' });
  return (
    <div className="rolagem" data-esq={esq} data-dir={dir}>
      {esq && <button type="button" className="rolagem-seta rolagem-esq" aria-label={`Ver itens anteriores de ${rotulo}`} onClick={() => rolar(-1)}>‹</button>}
      <div ref={ref} className={`chips filtro-linha ${className}`} role="group" aria-label={rotulo} onScroll={medir}>{children}</div>
      {dir && <button type="button" className="rolagem-seta rolagem-dir" aria-label={`Ver mais itens de ${rotulo}`} onClick={() => rolar(1)}>›</button>}
    </div>
  );
}

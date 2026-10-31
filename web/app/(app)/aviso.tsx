'use client';
import { useEffect, useState } from 'react';

type Aviso = { texto: string; acao?: { rotulo: string; fazer: () => void | Promise<void> } };
const EVENTO = 'fp-aviso';

// Aviso curto no rodapé (acima das abas). Qualquer tela chama mostrarAviso().
export function mostrarAviso(a: Aviso) {
  window.dispatchEvent(new CustomEvent<Aviso>(EVENTO, { detail: a }));
}

export default function Avisos() {
  const [aviso, setAviso] = useState<Aviso | null>(null);
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const ouvir = (e: Event) => {
      setAviso((e as CustomEvent<Aviso>).detail);
      clearTimeout(t);
      t = setTimeout(() => setAviso(null), 7000);
    };
    window.addEventListener(EVENTO, ouvir);
    return () => { window.removeEventListener(EVENTO, ouvir); clearTimeout(t); };
  }, []);
  if (!aviso) return null;
  return (
    <div className="aviso" role="status" aria-live="polite">
      <span>{aviso.texto}</span>
      {aviso.acao && (
        <button type="button" onClick={async () => { await aviso.acao!.fazer(); setAviso(null); }}>{aviso.acao.rotulo}</button>
      )}
    </div>
  );
}

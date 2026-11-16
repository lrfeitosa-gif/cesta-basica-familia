'use client';
import { useEffect } from 'react';

// Comparar virou parte da tela Preços (14/11): a busca lá mostra o menor preço por quilo de cada mercado.
// Links antigos (/comparar?q=…) continuam funcionando.
export default function Comparar() {
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get('q');
    window.location.replace(q ? `/ofertas?q=${encodeURIComponent(q)}` : '/ofertas');
  }, []);
  return <p className="muted">Abrindo Preços…</p>;
}

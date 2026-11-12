'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { registrar } from '@/lib/eventos';
import { CHAVE as CHAVE_BOAS_VINDAS } from './boas-vindas';

export const CHAVE_CESTA = 'cesta-montada';           // gravada pela Cesta ao pôr o 1º item
const CHAVE_FECHADO = 'primeiros-passos-fechado';     // card fechado ou concluído neste aparelho

type Feito = { endereco: boolean; alerta: boolean; cesta: boolean };

const temCesta = () => {
  try {
    if (localStorage.getItem(CHAVE_CESTA)) return true;
    return Object.keys(JSON.parse(localStorage.getItem('cesta-sel') || '{}') ?? {}).length > 0;
  } catch { return false; }
};

// R2: depois das boas-vindas, a tela de ofertas mostra as 3 primeiras ações.
// Cada ação feita aparece marcada; o card some quando as 3 estão feitas ou quando a pessoa o fecha.
// "versao" muda quando as boas-vindas fecham, para o card aparecer sem recarregar a tela.
export default function PrimeirosPassos({ familiaId, versao = 0 }: { familiaId?: string; versao?: number }) {
  const [feito, setFeito] = useState<Feito | null>(null);
  const [visivel, setVisivel] = useState(false);

  useEffect(() => {
    if (!familiaId) return;
    try {
      if (localStorage.getItem(CHAVE_FECHADO) || !localStorage.getItem(CHAVE_BOAS_VINDAS)) return;
    } catch { return; }
    let ativo = true;
    Promise.all([
      supabase.from('regiao_interesse').select('id', { count: 'exact', head: true }).eq('familia_id', familiaId),
      supabase.from('item_interesse').select('id', { count: 'exact', head: true }).eq('familia_id', familiaId),
    ]).then(([r, a]) => {
      if (!ativo) return;
      const f = { endereco: !!r.count, alerta: !!a.count, cesta: temCesta() };
      if (f.endereco && f.alerta && f.cesta) {
        try { localStorage.setItem(CHAVE_FECHADO, 'completou'); } catch {}
        registrar('primeiros_passos', 'completou');
        return;
      }
      setFeito(f); setVisivel(true);
    });
    return () => { ativo = false; };
  }, [familiaId, versao]);

  if (!visivel || !feito) return null;
  const fechar = () => {
    try { localStorage.setItem(CHAVE_FECHADO, 'fechou'); } catch {}
    registrar('primeiros_passos', `fechou com ${Object.values(feito).filter(Boolean).length} de 3`);
    setVisivel(false);
  };
  const passos: { chave: keyof Feito; href: string; titulo: string; texto: string }[] = [
    { chave: 'endereco', href: '/compra', titulo: 'Cadastre um endereço', texto: 'Casa ou trabalho, para ver a distância até cada mercado.' },
    { chave: 'alerta', href: '/alertas', titulo: 'Crie seu primeiro alerta', texto: 'Escolha um produto que sua casa compra toda semana.' },
    { chave: 'cesta', href: '/compra', titulo: 'Monte sua primeira compra', texto: 'Veja qual mercado sai mais barato para a sua lista.' },
  ];
  const feitos = Object.values(feito).filter(Boolean).length;

  return (
    <section className="card passos" aria-labelledby="pp-titulo">
      <div className="passos-topo">
        <h2 id="pp-titulo">Primeiros passos <span className="muted">· {feitos} de 3</span></h2>
        <button type="button" className="passos-fechar" aria-label="Fechar primeiros passos" onClick={fechar}>×</button>
      </div>
      <ol className="passos-lista">
        {passos.map((p) => (
          <li key={p.chave} data-feito={feito[p.chave]}>
            <span className="passos-marca" aria-hidden="true">{feito[p.chave] ? '✓' : ''}</span>
            {feito[p.chave]
              ? <span><b>{p.titulo}</b><span className="visually-hidden"> (feito)</span></span>
              : <Link href={p.href}><b>{p.titulo}</b><span>{p.texto}</span></Link>}
          </li>
        ))}
      </ol>
      <p className="muted passos-nota">Quer comparar a sua compra? <Link href="/notas">Envie uma nota fiscal</Link> quando quiser. É opcional.</p>
    </section>
  );
}

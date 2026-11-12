'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { registrar } from '@/lib/eventos';
import { jaViu, marcarVisto } from '@/lib/visto';
import { CHAVE as CHAVE_BOAS_VINDAS } from './boas-vindas';

export const CHAVE_CESTA = 'cesta-montada';           // gravada pela Cesta ao pôr o 1º item
const CHAVE_FECHADO = 'primeiros-passos-fechado';     // card fechado ou concluído

type Feito = { endereco: boolean; alerta: boolean; cesta: boolean };
const PASSOS: { chave: keyof Feito; href: string; texto: string }[] = [
  { chave: 'endereco', href: '/compra', texto: 'Cadastre o endereço de casa' },
  { chave: 'alerta', href: '/alertas', texto: 'Crie um alerta para algo que você compra toda semana' },
  { chave: 'cesta', href: '/compra', texto: 'Monte sua compra e veja o mercado mais barato' },
];

const temCesta = () => {
  try {
    if (localStorage.getItem(CHAVE_CESTA)) return true;
    return Object.keys(JSON.parse(localStorage.getItem('cesta-sel') || '{}') ?? {}).length > 0;
  } catch { return false; }
};

// R2: uma linha só, com o progresso e o próximo passo. Os passos feitos não disputam atenção.
// Some quando os 3 estão feitos ou quando a pessoa fecha; contas com mais de 7 dias não veem.
// "versao" muda quando as boas-vindas fecham, para o card aparecer sem recarregar a tela.
export default function PrimeirosPassos({ familiaId, versao = 0 }: { familiaId?: string; versao?: number }) {
  const [feito, setFeito] = useState<Feito | null>(null);

  useEffect(() => {
    if (!familiaId) return;
    let ativo = true;
    (async () => {
      try { if (!localStorage.getItem(CHAVE_BOAS_VINDAS)) return; } catch { return; }
      if (await jaViu('passos', CHAVE_FECHADO)) return;
      const [r, a] = await Promise.all([
        supabase.from('regiao_interesse').select('id', { count: 'exact', head: true }).eq('familia_id', familiaId),
        supabase.from('item_interesse').select('id', { count: 'exact', head: true }).eq('familia_id', familiaId),
      ]);
      if (!ativo) return;
      const f = { endereco: !!r.count, alerta: !!a.count, cesta: temCesta() };
      if (f.endereco && f.alerta && f.cesta) {
        marcarVisto('passos', CHAVE_FECHADO, 'completou');
        registrar('primeiros_passos', 'completou');
        return;
      }
      setFeito(f);
    })();
    return () => { ativo = false; };
  }, [familiaId, versao]);

  if (!feito) return null;
  const feitos = PASSOS.filter((p) => feito[p.chave]).length;
  const proximo = PASSOS.find((p) => !feito[p.chave])!;
  const fechar = () => {
    marcarVisto('passos', CHAVE_FECHADO, 'fechou');
    registrar('primeiros_passos', `fechou com ${feitos} de 3`);
    setFeito(null);
  };

  return (
    <div className="passo">
      <Link href={proximo.href} className="passo-link">
        <span className="passo-barra" role="img" aria-label={`${feitos} de 3 primeiros passos feitos`}>
          {PASSOS.map((p) => <i key={p.chave} data-feito={feito[p.chave]} />)}
        </span>
        <span className="passo-texto">
          <small>Primeiro passo {feitos + 1} de 3</small>
          {proximo.texto}
        </span>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
      </Link>
      <button type="button" className="passo-fechar" aria-label="Dispensar primeiros passos" onClick={fechar}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
      </button>
    </div>
  );
}

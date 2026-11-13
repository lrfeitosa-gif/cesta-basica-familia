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
  { chave: 'endereco', href: '/compra?ver=onde', texto: 'Cadastre o endereço de casa' },
  { chave: 'alerta', href: '/alertas', texto: 'Crie um alerta para algo que você compra toda semana' },
  { chave: 'cesta', href: '/compra?ver=lista', texto: 'Monte sua compra e veja o mercado mais barato' },
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
  const [aberto, setAberto] = useState(false);   // lista com os 3 passos

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
    <div className="passo-bloco">
      <div className="passo">
        <Link href={proximo.href} className="passo-link">
          <span className="passo-barra" role="img" aria-label={`${feitos} de 3 primeiros passos feitos`}>
            {PASSOS.map((p) => <i key={p.chave} data-feito={feito[p.chave]} />)}
          </span>
          <span className="passo-texto">
            <small>Primeiros passos: {feitos} de 3 feitos · próximo</small>
            {proximo.texto}
          </span>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
        </Link>
        <button type="button" className="passo-fechar" aria-label={aberto ? 'Esconder os 3 passos' : 'Ver os 3 passos'} aria-expanded={aberto}
          onClick={() => setAberto(!aberto)}>
          <svg viewBox="0 0 24 24" aria-hidden="true" style={{ transform: aberto ? 'rotate(180deg)' : undefined }}><path d="m6 9 6 6 6-6" /></svg>
        </button>
      </div>
      {aberto && (
        <ol className="passo-lista">
          {PASSOS.map((p, i) => (
            <li key={p.chave} data-feito={feito[p.chave]}>
              <span className="passo-num" aria-hidden="true">{feito[p.chave] ? '✓' : i + 1}</span>
              {feito[p.chave] ? <span className="passo-feito">{p.texto}</span> : <Link href={p.href}>{p.texto}</Link>}
            </li>
          ))}
          <li className="passo-dispensar"><button type="button" onClick={fechar}>Não mostrar mais</button></li>
        </ol>
      )}
    </div>
  );
}

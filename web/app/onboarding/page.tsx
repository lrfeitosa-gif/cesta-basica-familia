'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase, arredondar, mensagemErro } from '@/lib/supabase';
import { useSessao } from '@/lib/sessao';

const FREQUENCIAS = [
  ['semanal', 'Semanal'],
  ['mensal', 'Mensal'],
  ['sob_demanda', 'Quando precisa'],
] as const;

// Passos 2 e 3 da jornada: família, frequência e região da casa. Depois segue para as notas.
export default function Onboarding() {
  const router = useRouter();
  const sessao = useSessao();
  const [membros, setMembros] = useState(3);
  const [frequencia, setFrequencia] = useState<string>('semanal');
  const [coord, setCoord] = useState<{ lat: number; lng: number } | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  const pegarRegiao = () => {
    setErro(''); setBuscando(true);
    navigator.geolocation.getCurrentPosition(
      (p) => { setCoord({ lat: arredondar(p.coords.latitude), lng: arredondar(p.coords.longitude) }); setBuscando(false); },
      () => { setErro('Não conseguimos sua localização. Permita o acesso no navegador ou tente de novo.'); setBuscando(false); },
      { enableHighAccuracy: false, timeout: 10000 }
    );
  };

  const salvar = async () => {
    if (!sessao) return;
    if (!coord) return setErro('Informe a região da casa para calcularmos a distância até os mercados.');
    setErro(''); setSalvando(true);
    const id = sessao.user.id;
    const { error } = await supabase.from('familia').upsert({ id, membros, frequencia });
    if (!error) {
      await supabase.from('regiao_interesse').delete().eq('familia_id', id).eq('principal', true);
      const r = await supabase.from('regiao_interesse').insert({ familia_id: id, rotulo: 'casa', principal: true, ...coord });
      if (r.error) { setSalvando(false); return setErro(mensagemErro(r.error.message)); }
    }
    setSalvando(false);
    if (error) return setErro(mensagemErro(error.message));
    router.push('/notas?onboarding=1');
  };

  if (!sessao) return null;

  return (
    <>
      <div className="progress" aria-label="Passo 1 de 2"><span data-on="true" /><span /></div>
      <div>
        <h1>Sua família</h1>
        <p className="lead">Usamos isso para sugerir quantidades e quanto vale estocar.</p>
      </div>

      <div className="card stack">
        <span id="membros-rotulo" style={{ fontWeight: 700 }}>Quantas pessoas moram na casa?</span>
        <div className="stepper" role="group" aria-labelledby="membros-rotulo">
          <button type="button" aria-label="Menos uma pessoa" onClick={() => setMembros((m) => Math.max(1, m - 1))}>−</button>
          <output aria-live="polite">{membros}</output>
          <button type="button" aria-label="Mais uma pessoa" onClick={() => setMembros((m) => Math.min(20, m + 1))}>+</button>
        </div>
      </div>

      <fieldset className="card stack" style={{ margin: 0 }}>
        <legend style={{ fontWeight: 700, padding: 0, float: 'left', marginBottom: 12 }}>Com que frequência faz compras?</legend>
        <div className="choice" style={{ clear: 'both' }}>
          {FREQUENCIAS.map(([v, l]) => (
            <label key={v}>
              <input type="radio" name="frequencia" value={v} checked={frequencia === v} onChange={() => setFrequencia(v)} />
              <span>{l}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="card stack">
        <span style={{ fontWeight: 700 }}>Região da casa</span>
        <span className="muted">Guardamos só a região aproximada (cerca de 1 km), nunca o endereço.</span>
        <button type="button" className="btn btn-secondary" onClick={pegarRegiao} disabled={buscando}>
          {buscando ? 'Localizando…' : coord ? 'Região registrada ✓ · atualizar' : 'Usar minha localização'}
        </button>
      </div>

      {erro && <div className="alert alert-error" role="alert">{erro}</div>}
      <button className="btn btn-primary btn-block" onClick={salvar} disabled={salvando} style={{ marginTop: 'auto' }}>
        {salvando ? 'Salvando…' : 'Continuar'}
      </button>
    </>
  );
}

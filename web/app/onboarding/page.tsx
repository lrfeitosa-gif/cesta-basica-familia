'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase, arredondar } from '@/lib/supabase';

// Passos 2 e 3 do onboarding: família, frequência e região da casa.
export default function Onboarding() {
  const router = useRouter();
  const [membros, setMembros] = useState(3);
  const [frequencia, setFrequencia] = useState('semanal');
  const [coord, setCoord] = useState<{ lat: number; lng: number } | null>(null);
  const [erro, setErro] = useState('');

  const pegarRegiao = () =>
    navigator.geolocation.getCurrentPosition(
      (p) => setCoord({ lat: arredondar(p.coords.latitude), lng: arredondar(p.coords.longitude) }),
      () => setErro('Não foi possível obter a localização.')
    );

  const salvar = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return setErro('Entre na sua conta primeiro.');
    if (!coord) return setErro('Informe a região da casa.');
    const { error } = await supabase.from('familia').upsert({ id: user.id, membros, frequencia });
    if (error) return setErro(error.message);
    await supabase.from('regiao_interesse').insert({ familia_id: user.id, rotulo: 'casa', principal: true, ...coord });
    router.push('/notas?onboarding=1');
  };

  return (
    <main>
      <h1>Sua família</h1>
      <label>Pessoas na casa{' '}
        <input type="number" min={1} max={20} value={membros} onChange={(e) => setMembros(+e.target.value)} />
      </label>
      <p>Com que frequência você faz compras?</p>
      {[['semanal', 'Semanal'], ['mensal', 'Mensal'], ['sob_demanda', 'Sob demanda']].map(([v, l]) => (
        <label key={v} style={{ display: 'block' }}>
          <input type="radio" checked={frequencia === v} onChange={() => setFrequencia(v)} /> {l}
        </label>
      ))}
      <p>Região da casa (guardamos só a região aproximada, ~1 km)</p>
      <button onClick={pegarRegiao}>{coord ? `Região: ${coord.lat}, ${coord.lng}` : 'Usar minha localização'}</button>
      {erro && <p style={{ color: 'crimson' }}>{erro}</p>}
      <p><button onClick={salvar}>Continuar: escanear notas</button></p>
    </main>
  );
}

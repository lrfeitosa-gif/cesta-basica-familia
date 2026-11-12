'use client';
import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';

export type Loja = { mercado: string; nome: string; lat: number; lng: number };
export type Referencia = { id: number; rotulo: string; lat: number; lng: number };
export const MAX_REFERENCIAS = 3;

// Distância em linha reta (km). Para trajeto de carro, some uns 30%.
export function km(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const r = (g: number) => (g * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}
export const fmtKm = (d: number) => `${d < 10 ? d.toFixed(1).replace('.', ',') : Math.round(d)} km`;

// Lojas físicas (públicas) e os endereços de referência da família (até 3).
export function useLocais(familiaId: string | undefined) {
  const [lojas, setLojas] = useState<Loja[]>([]);
  const [refs, setRefs] = useState<Referencia[]>([]);

  const carregar = useCallback(async () => {
    const [l, r] = await Promise.all([
      supabase.from('mercado_loja').select('nome,lat,lng,mercado(rede)'),
      familiaId ? supabase.from('regiao_interesse').select('id,rotulo,lat,lng').eq('familia_id', familiaId).order('id') : Promise.resolve({ data: [] }),
    ]);
    setLojas(((l.data ?? []) as unknown as { nome: string; lat: number; lng: number; mercado: { rede: string } | null }[])
      .filter((x) => x.mercado).map((x) => ({ mercado: x.mercado!.rede, nome: x.nome, lat: Number(x.lat), lng: Number(x.lng) })));
    setRefs(((r.data ?? []) as Referencia[]).map((x) => ({ ...x, lat: Number(x.lat), lng: Number(x.lng) })));
  }, [familiaId]);
  useEffect(() => { carregar(); }, [carregar]);

  const adicionar = async (rotulo: string, cep: string): Promise<string | null> => {
    if (!familiaId) return 'Entre na sua conta.';
    const resp = await fetch(`/api/cep?cep=${encodeURIComponent(cep)}`);
    const j = await resp.json().catch(() => ({ erro: 'Não conseguimos consultar o CEP agora.' }));
    if (!resp.ok) return j.erro;
    const nome = rotulo.trim() || j.bairro || 'Endereço';
    const chave = (t: string) => t.normalize('NFD').replace(/\p{Diacritic}/gu, '').trim().toLowerCase();
    // Sem duplicar: mesmo nome atualiza o endereço que já existe; mesma região com outro nome não entra de novo.
    const mesmoNome = refs.find((r) => chave(r.rotulo) === chave(nome));
    const mesmaRegiao = refs.find((r) => r !== mesmoNome && Number(r.lat) === Number(j.lat) && Number(r.lng) === Number(j.lng));
    if (mesmaRegiao) return `Este CEP já está salvo como "${mesmaRegiao.rotulo}".`;
    if (mesmoNome) {
      const { error } = await supabase.from('regiao_interesse').update({ lat: j.lat, lng: j.lng }).eq('id', mesmoNome.id);
      if (error) return 'Não foi possível atualizar o endereço. Tente de novo.';
      await carregar();
      return `Salvo: o endereço "${mesmoNome.rotulo}" foi atualizado.`;
    }
    if (refs.length >= MAX_REFERENCIAS) return `Você já tem ${MAX_REFERENCIAS} endereços. Remova um para incluir outro.`;
    await supabase.rpc('garantir_familia');
    const { error } = await supabase.from('regiao_interesse').insert({
      familia_id: familiaId, rotulo: nome, lat: j.lat, lng: j.lng, principal: refs.length === 0,
    });
    if (error) return /duplicate|unique/i.test(error.message) ? `Você já tem um endereço chamado "${nome}".` : 'Não foi possível salvar o endereço. Tente de novo.';
    await carregar();
    return j.precisao === 'cidade' ? 'Salvo, mas só achamos a cidade deste CEP: a distância fica aproximada.' : null;
  };
  const remover = async (id: number) => {
    await supabase.from('regiao_interesse').delete().eq('id', id);
    await carregar();
  };

  // Loja mais próxima de qualquer endereço de referência, para uma rede.
  const distancia = (mercado: string): { km: number; loja: Loja; ref: Referencia } | null => {
    let melhor: { km: number; loja: Loja; ref: Referencia } | null = null;
    for (const loja of lojas.filter((l) => l.mercado === mercado)) {
      for (const ref of refs) {
        const d = km(ref, loja);
        if (!melhor || d < melhor.km) melhor = { km: d, loja, ref };
      }
    }
    return melhor;
  };
  // Menor distância entre lojas de duas redes (para a compra dividida em 2 mercados).
  const entre = (a: string, b: string): number | null => {
    let m: number | null = null;
    for (const x of lojas.filter((l) => l.mercado === a)) for (const y of lojas.filter((l) => l.mercado === b)) {
      const d = km(x, y); if (m === null || d < m) m = d;
    }
    return m;
  };

  return { lojas, refs, adicionar, remover, distancia, entre };
}

// Texto curto da distância até a loja mais próxima ("2,6 km de Casa"), para as listas de ofertas.
export function useDistTexto(familiaId: string | undefined) {
  const { distancia } = useLocais(familiaId);
  return (mercado: string) => {
    const d = distancia(mercado);
    return d ? `${fmtKm(d.km)} de ${d.ref.rotulo}` : null;
  };
}

'use client';
import { supabase } from './supabase';
import { norm } from './ofertas';

// Põe um item na cesta de fora da tela da Cesta (pergunta à IA). Lê a versão da conta, junta o item e grava nos
// dois lugares (conta e aparelho), do mesmo jeito que a tela da Cesta faz (cesta_salva, migração 0026).
type Extra = { id: string; termo: string; horti?: boolean };
// A lista guardada no aparelho é de uma conta só: se outra conta entrar neste celular, a lista local é apagada
// antes de qualquer leitura (antes, a conta nova herdava a cesta da conta anterior).
const CHAVES_CESTA = ['cesta-sel', 'cesta-extra', 'cesta-marca', 'cesta-atualizada', 'cesta-montada', 'compra-aba'];
export function garantirDonoDaCesta(uid: string): boolean {
  try {
    const dono = localStorage.getItem('cesta-dono');
    if (dono === uid) return false;
    if (dono) CHAVES_CESTA.forEach((k) => localStorage.removeItem(k));
    localStorage.setItem('cesta-dono', uid);
    return !!dono;
  } catch { return false; }
}
const ler = <T,>(k: string, padrao: T): T => { try { return JSON.parse(localStorage.getItem(k) || 'null') ?? padrao; } catch { return padrao; } };

export async function adicionarNaCesta(familiaId: string, termo: string, quantidade: number): Promise<string> {
  garantirDonoDaCesta(familiaId);
  const { data } = await supabase.from('cesta_salva').select('sel,extras,marcas,atualizado_em').eq('familia_id', familiaId).maybeSingle();
  const local = Number(localStorage.getItem('cesta-atualizada')) || 0;
  const daConta = data && Date.parse(data.atualizado_em) > local;
  const sel: Record<string, number> = daConta ? data!.sel ?? {} : ler('cesta-sel', {});
  const extras: Extra[] = daConta ? data!.extras ?? [] : ler('cesta-extra', []);
  const marcas: Record<string, string> = daConta ? data!.marcas ?? {} : ler('cesta-marca', {});

  const existente = extras.find((x) => norm(x.termo).trim() === norm(termo).trim());
  const id = existente?.id ?? `x-${Date.now()}`;
  const novosExtras = existente ? extras : [...extras, { id, termo }];
  const novaSel = { ...sel, [id]: (existente ? sel[id] ?? 0 : 0) + quantidade };
  const agora = new Date();
  try {
    localStorage.setItem('cesta-sel', JSON.stringify(novaSel));
    localStorage.setItem('cesta-extra', JSON.stringify(novosExtras));
    localStorage.setItem('cesta-marca', JSON.stringify(marcas));
    localStorage.setItem('cesta-atualizada', String(agora.getTime()));
  } catch { /* fica só na conta */ }
  await supabase.rpc('garantir_familia');
  const { error } = await supabase.from('cesta_salva').upsert({
    familia_id: familiaId, sel: novaSel, extras: novosExtras, marcas, atualizado_em: agora.toISOString(),
  }, { onConflict: 'familia_id' });
  if (error) return 'Não foi possível salvar na sua conta agora; ficou neste aparelho.';
  return existente ? `"${existente.termo}" já estava na cesta: agora são ${novaSel[id]}.` : `"${termo}" foi para a sua cesta (${quantidade}).`;
}

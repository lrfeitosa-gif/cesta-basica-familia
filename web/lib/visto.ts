import { supabase } from './supabase';

// O que a pessoa já viu (boas-vindas, primeiros passos) fica guardado na conta, não só no aparelho:
// quem entra num celular novo não revê a apresentação. O aparelho guarda uma cópia para não esperar a rede.
export type Visto = 'boas_vindas' | 'passos';
const DIAS_CONTA_NOVA = 7;   // contas mais antigas que isso já conhecem o app

export async function jaViu(chave: Visto, chaveLocal: string): Promise<boolean> {
  try { if (localStorage.getItem(chaveLocal)) return true; } catch { /* sem armazenamento */ }
  const { data } = await supabase.auth.getSession();
  const u = data.session?.user;
  if (!u) return true;
  const visto = !!u.user_metadata?.[`visto_${chave}`]
    || Date.now() - Date.parse(u.created_at) > DIAS_CONTA_NOVA * 86_400_000;
  if (visto) { try { localStorage.setItem(chaveLocal, '1'); } catch {} }
  return visto;
}

export async function marcarVisto(chave: Visto, chaveLocal: string, valor = '1') {
  try { localStorage.setItem(chaveLocal, valor); } catch {}
  try {
    const { data } = await supabase.auth.getSession();
    const meta = data.session?.user.user_metadata ?? {};
    if (meta[`visto_${chave}`]) return;
    await supabase.auth.updateUser({ data: { ...meta, [`visto_${chave}`]: new Date().toISOString() } });
  } catch { /* fica só no aparelho */ }
}

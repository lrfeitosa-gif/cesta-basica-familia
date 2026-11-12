import { supabase } from './supabase';

export type TipoEvento = 'login_ok' | 'login_erro' | 'cadastro_inicio' | 'cadastro_erro' | 'cadastro_ok' | 'tela' | 'erro_app'
  | 'cesta_montada' | 'primeiros_passos';

// Registra um evento de uso para o painel de administração. Nunca atrapalha a tela: erros são ignorados.
// Sem conta, o e-mail entra só como domínio (gmail.com).
export async function registrar(tipo: TipoEvento, detalhe?: string) {
  try {
    const { data } = await supabase.auth.getSession();
    await supabase.from('evento').insert({ tipo, detalhe: detalhe?.slice(0, 300) ?? null, user_id: data.session?.user.id ?? null });
  } catch { /* sem registro */ }
}
export const dominio = (email: string) => email.trim().toLowerCase().split('@')[1] ?? '';

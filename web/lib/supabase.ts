import { createClient } from '@supabase/supabase-js';

// Chave anon/publishable: respeita o RLS. A service_role nunca entra no app.
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Arredonda para 2 casas (~1 km): nunca guardamos o endereço exato.
export const arredondar = (n: number) => Math.round(n * 100) / 100;

// Mensagens do Supabase Auth em português, com o que fazer.
export function mensagemErro(msg: string): string {
  if (/invalid login credentials/i.test(msg)) return 'E-mail ou senha incorretos. Confira os dados ou use "Esqueci a senha".';
  if (/email not confirmed/i.test(msg)) return 'Confirme seu e-mail pelo link que enviamos antes de entrar.';
  if (/already registered|already been registered/i.test(msg)) return 'Este e-mail já tem conta. Entre com sua senha.';
  if (/password should be at least/i.test(msg)) return 'A senha precisa ter pelo menos 8 caracteres.';
  // regra de senha forte ligada no Supabase (Authentication → Email) em 13/11
  if (/password should contain|weak.?password|password is too weak|known to be weak/i.test(msg))
    return 'Senha fraca. Use pelo menos 8 caracteres, misturando letras, números e um símbolo (ex.: mercado#2026).';
  if (/invalid.*email|email address .* is invalid|unable to validate email/i.test(msg)) return 'Este e-mail não parece válido. Confira se digitou certo.';
  if (/signups? not allowed|signup is disabled/i.test(msg)) return 'Os cadastros estão fechados no momento. Fale com quem te convidou.';
  if (/database error saving new user/i.test(msg)) return 'Código de convite inválido, esgotado ou o teste está lotado. Confira com quem te convidou.';
  if (/rate limit/i.test(msg)) return 'Muitas tentativas seguidas. Espere um minuto e tente de novo.';
  // erro não previsto: mostra o motivo técnico entre parênteses para dar para investigar
  return `Não foi possível concluir agora. Tente de novo em instantes.${msg ? ` (${msg.slice(0, 140)})` : ''}`;
}

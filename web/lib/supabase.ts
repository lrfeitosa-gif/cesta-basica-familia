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
  if (/rate limit/i.test(msg)) return 'Muitas tentativas seguidas. Espere um minuto e tente de novo.';
  return 'Não foi possível concluir agora. Tente de novo em instantes.';
}

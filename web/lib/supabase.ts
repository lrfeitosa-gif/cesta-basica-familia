import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Arredonda para 2 casas (~1 km): nunca guardamos o endereço exato.
export const arredondar = (n: number) => Math.round(n * 100) / 100;

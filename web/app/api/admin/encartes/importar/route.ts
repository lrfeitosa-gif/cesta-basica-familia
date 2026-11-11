import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

type Oferta = {
  chave: string; produto: string; marca: string | null; quantidade: number; unidade: string;
  categoria: string; preco: number; preco_de: number | null; condicao: string | null;
};

export async function POST(req: Request) {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return NextResponse.json({ erro: 'Entre na sua conta para continuar.' }, { status: 401 });
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });
  const { data: user, error: userError } = await db.auth.getUser(token);
  if (userError || !user.user) return NextResponse.json({ erro: 'Sessão expirada. Entre de novo.' }, { status: 401 });
  const { data: admin, error: adminError } = await db.rpc('eh_admin');
  if (adminError || !admin) return NextResponse.json({ erro: 'Área só para administradores.' }, { status: 403 });

  let mercado: string, inicio: string, fim: string, ofertas: Oferta[];
  try {
    const body = await req.json() as { mercado: string; inicio: string; fim: string; ofertas: Oferta[] };
    mercado = body.mercado;
    inicio = body.inicio;
    fim = body.fim;
    ofertas = body.ofertas;
    if (!['Assaí', 'Sonda', 'Revolução', 'Cato'].includes(mercado) || !/^\d{4}-\d{2}-\d{2}$/.test(inicio)
      || !/^\d{4}-\d{2}-\d{2}$/.test(fim) || !Array.isArray(ofertas) || !ofertas.length || ofertas.length > 500) {
      throw new Error('invalid');
    }
    if (ofertas.some((o) => !o || typeof o.chave !== 'string' || typeof o.produto !== 'string'
      || !Number.isFinite(o.quantidade) || !Number.isFinite(o.preco))) throw new Error('invalid');
  } catch {
    return NextResponse.json({ erro: 'Dados da carga inválidos. Revise as ofertas e a validade.' }, { status: 400 });
  }

  const { data, error } = await db.rpc('admin_importar_encarte', {
    p_mercado: mercado, p_inicio: inicio, p_fim: fim, p_ofertas: ofertas,
  });
  if (error) {
    console.error('admin/encartes: falha ao gravar', error.message);
    return NextResponse.json({ erro: error.message.includes('admin_importar_encarte')
      ? 'A migração 0013 ainda não foi aplicada no Supabase.' : `Não foi possível gravar o encarte: ${error.message}` }, { status: 400 });
  }
  return NextResponse.json({ ofertas: data });
}

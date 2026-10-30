import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { chaveDaUrl, parseHtml, validarUrl } from '@/lib/nfce';

// POST { url } com o token da sessão: lê a NFC-e no portal da Sefaz e grava compra + itens da família.
// Usa a chave anon com o token do usuário, então o RLS garante que só grava na própria família.
export async function POST(req: Request) {
  const token = req.headers.get('authorization')?.replace(/^Bearer /, '');
  if (!token) return NextResponse.json({ erro: 'Entre na sua conta para enviar notas.' }, { status: 401 });

  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });
  const { data: u, error: eu } = await db.auth.getUser(token);
  if (eu || !u.user) return NextResponse.json({ erro: 'Sessão expirada. Entre de novo.' }, { status: 401 });

  let url: URL, chave: string;
  try {
    const { url: bruto } = await req.json();
    url = validarUrl(String(bruto));
    chave = chaveDaUrl(url.toString());
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message || 'Link inválido.' }, { status: 400 });
  }

  const ja = await db.from('compra').select('id').eq('familia_id', u.user.id).eq('chave_nfce', chave).maybeSingle();
  if (ja.data) return NextResponse.json({ erro: 'Esta nota já foi registrada.' }, { status: 409 });

  let nota;
  try {
    const resp = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 CestaIndaiatuba/0.1' }, cache: 'no-store' });
    if (!resp.ok) throw new Error(String(resp.status));
    nota = parseHtml(await resp.text(), chave);
  } catch {
    return NextResponse.json({ erro: 'O portal da Sefaz não respondeu. Tente de novo em alguns minutos.' }, { status: 502 });
  }
  if (!nota.itens.length) {
    return NextResponse.json({ erro: 'Não encontramos itens nesta nota. Ela pode ainda não estar disponível na Sefaz; tente mais tarde.' }, { status: 422 });
  }

  const mercado = nota.cnpj ? (await db.from('mercado').select('id,rede').eq('cnpj', nota.cnpj).maybeSingle()).data : null;
  const { data: compra, error: ec } = await db.from('compra').insert({
    familia_id: u.user.id, mercado_id: mercado?.id ?? null, data: nota.data, total: nota.total, origem: 'nota', chave_nfce: chave,
  }).select('id').single();
  if (ec || !compra) {
    const semFamilia = ec?.message.includes('foreign key');
    return NextResponse.json({ erro: semFamilia ? 'Complete o cadastro da família antes de enviar notas.' : 'Não conseguimos salvar a nota.' }, { status: 400 });
  }
  await db.from('item_comprado').insert(nota.itens.map((i) => ({
    compra_id: compra.id, descricao_nota: i.descricao, quantidade: i.quantidade, preco_unitario: i.preco_unitario,
  })));

  return NextResponse.json({
    loja: mercado?.rede ?? nota.loja, data: nota.data, total: nota.total, itens: nota.itens.length,
    amostra: nota.itens.slice(0, 3).map((i) => i.descricao),
  });
}

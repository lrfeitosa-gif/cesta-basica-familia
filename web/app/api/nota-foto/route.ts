import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const maxDuration = 60;   // leitura da foto pela Groq leva poucos segundos; margem para notas longas

// Foto do cupom fiscal -> itens, preços, loja e data (modelo de visão qwen/qwen3.8-27b na Groq), gravados como compra da família.
// A foto não é guardada; CPF e pagamento que aparecem nela são ignorados pelo modelo e nunca gravados.

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['e_cupom', 'loja', 'cnpj', 'data', 'total', 'chave', 'itens'],
  properties: {
    e_cupom: { type: 'boolean', description: 'true se a imagem é um cupom/nota fiscal de compra' },
    loja: { type: ['string', 'null'], description: 'Nome fantasia do supermercado' },
    cnpj: { type: ['string', 'null'], description: 'CNPJ do estabelecimento, só dígitos' },
    data: { type: ['string', 'null'], description: 'Data da compra, AAAA-MM-DD' },
    total: { type: ['number', 'null'], description: 'Valor total pago' },
    chave: { type: ['string', 'null'], description: 'Chave de acesso de 44 dígitos, só dígitos, se legível' },
    itens: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['descricao', 'quantidade', 'preco_unitario'],
        properties: {
          descricao: { type: 'string', description: 'Descrição do item como impressa' },
          quantidade: { type: 'number' },
          preco_unitario: { type: 'number', description: 'Preço por unidade ou por kg, em reais' },
        },
      },
    },
  },
} as const;

const INSTRUCOES = `Você lê cupons fiscais (NFC-e) de supermercados brasileiros: foto do cupom de papel ou print da tela
da consulta da nota no site da Sefaz (aberta pelo QR Code). Os dois valem como cupom.
Extraia loja, CNPJ do estabelecimento, data, total, chave de acesso e cada item com quantidade e preço unitário.
- Itens pesados (kg): quantidade em kg e preço por kg.
- Descontos na linha do item: use o preço unitário já com desconto.
- Ignore CPF, nome do consumidor e forma de pagamento: não os inclua em nenhum campo.
- Se algo estiver ilegível, deixe null (ou fora da lista, no caso de itens). Não invente.
- Se a imagem não for um cupom fiscal nem a página de consulta da nota, responda e_cupom = false e itens vazios.`;

type Lida = {
  e_cupom: boolean; loja: string | null; cnpj: string | null; data: string | null; total: number | null;
  chave: string | null; itens: { descricao: string; quantidade: number; preco_unitario: number }[];
};

export async function POST(req: Request) {
  const token = req.headers.get('authorization')?.replace(/^Bearer /, '');
  if (!token) return NextResponse.json({ erro: 'Entre na sua conta para enviar notas.' }, { status: 401 });
  if (!process.env.GROQ_API_KEY) {
    return NextResponse.json({ erro: 'A leitura por foto ainda não foi ativada (falta a chave GROQ_API_KEY na Vercel).' }, { status: 503 });
  }

  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });
  const { data: u, error: eu } = await db.auth.getUser(token);
  if (eu || !u.user) return NextResponse.json({ erro: 'Sessão expirada. Entre de novo.' }, { status: 401 });

  let imagem: string, tipo: string;
  try {
    ({ imagem, tipo } = await req.json());
    if (!/^image\/(jpeg|png|webp)$/.test(tipo) || !imagem || imagem.length > 6_000_000) throw new Error();
  } catch {
    return NextResponse.json({ erro: 'Foto inválida ou grande demais. Tente de novo.' }, { status: 400 });
  }

  let lida: Lida;
  try {
    // Groq (API compatível com OpenAI), modo JSON; o formato esperado vai descrito no prompt.
    const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
      body: JSON.stringify({
        model: process.env.GROQ_MODELO_VISAO || 'qwen/qwen3.8-27b',
        temperature: 0.1,
        max_completion_tokens: 8000,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: `${INSTRUCOES}

Responda só com um objeto JSON neste formato (JSON Schema):
${JSON.stringify(SCHEMA)}` },
          { role: 'user', content: [
            { type: 'text', text: 'Leia este cupom fiscal e devolva o JSON.' },
            { type: 'image_url', image_url: { url: `data:${tipo};base64,${imagem}` } },
          ] },
        ],
      }),
    });
    if (!resp.ok) throw new Error(`groq ${resp.status}: ${(await resp.text()).slice(0, 300)}`);
    const corpo = await resp.json() as { choices?: { message?: { content?: string } }[] };
    const texto = (corpo.choices?.[0]?.message?.content ?? '').replace(/<think>[\s\S]*?<\/think>/g, '');
    const json = texto.slice(texto.indexOf('{'), texto.lastIndexOf('}') + 1);
    const bruto = JSON.parse(json || '{}') as Partial<Lida>;
    lida = {
      e_cupom: bruto.e_cupom !== false, loja: bruto.loja ?? null, cnpj: bruto.cnpj ?? null, data: bruto.data ?? null,
      total: typeof bruto.total === 'number' ? bruto.total : null, chave: bruto.chave ?? null,
      itens: (bruto.itens ?? []).filter((i) => i && i.descricao && Number(i.quantidade) > 0 && Number(i.preco_unitario) > 0)
        .map((i) => ({ descricao: String(i.descricao), quantidade: Number(i.quantidade), preco_unitario: Number(i.preco_unitario) })),
    };
  } catch (e) {
    console.error('nota-foto: falha na leitura', (e as Error).message);
    return NextResponse.json({ erro: 'Não conseguimos ler a foto agora. Tente de novo em instantes.' }, { status: 502 });
  }

  if (!lida.e_cupom) return NextResponse.json({ erro: 'A imagem não parece ser de um cupom fiscal. Envie a foto da nota inteira ou o print da página da nota no site da Sefaz.' }, { status: 422 });
  if (!lida.itens?.length) return NextResponse.json({ erro: 'Não conseguimos ler os itens. Fotografe de perto, com a nota reta e sem sombra.' }, { status: 422 });

  const chave = lida.chave?.replace(/\D/g, '');
  const chaveValida = chave && chave.length === 44 ? chave : null;
  if (chaveValida) {
    const ja = await db.from('compra').select('id').eq('familia_id', u.user.id).eq('chave_nfce', chaveValida).maybeSingle();
    if (ja.data) return NextResponse.json({ erro: 'Esta nota já foi registrada.' }, { status: 409 });
  }

  await db.rpc('garantir_familia');
  const cnpj = lida.cnpj?.replace(/\D/g, '') || null;
  const mercado = cnpj ? (await db.from('mercado').select('id,rede').eq('cnpj', cnpj).maybeSingle()).data : null;
  const data = lida.data && /^\d{4}-\d{2}-\d{2}$/.test(lida.data) ? lida.data : new Date().toISOString().slice(0, 10);
  const total = lida.total ?? lida.itens.reduce((s, i) => s + i.quantidade * i.preco_unitario, 0);

  const linha = {
    familia_id: u.user.id, mercado_id: mercado?.id ?? null, data, total, origem: 'nota', chave_nfce: chaveValida,
  };
  const lojaNota = mercado ? null : lida.loja?.slice(0, 80) ?? null;
  // loja_nota vem da migração 0009; enquanto ela não roda, grava sem o nome da loja
  let { data: compra, error: ec } = await db.from('compra').insert({ ...linha, loja_nota: lojaNota }).select('id').single();
  if (ec?.message.includes('loja_nota')) ({ data: compra, error: ec } = await db.from('compra').insert(linha).select('id').single());
  if (ec || !compra) return NextResponse.json({ erro: 'Não conseguimos salvar a nota.' }, { status: 400 });
  await db.from('item_comprado').insert(lida.itens.map((i) => ({
    compra_id: compra.id, descricao_nota: i.descricao, quantidade: i.quantidade, preco_unitario: i.preco_unitario,
  })));

  return NextResponse.json({ loja: mercado?.rede ?? lida.loja ?? 'Supermercado', data, total, itens: lida.itens.length });
}

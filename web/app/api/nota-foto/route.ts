import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';

export const runtime = 'nodejs';
export const maxDuration = 60;   // leitura da foto pelo Claude leva de 10 a 40 s

// Foto do cupom fiscal -> itens, preços, loja e data (Claude com visão), gravados como compra da família.
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
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ erro: 'A leitura por foto ainda não foi ativada (falta a chave ANTHROPIC_API_KEY na Vercel).' }, { status: 503 });
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
    const client = new Anthropic();
    // fallbacks: se o modelo recusar a imagem, a API tenta outro modelo na mesma chamada
    const resp = await client.beta.messages.create({
      model: 'claude-opus-5-5',
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: INSTRUCOES,
      output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: tipo as 'image/jpeg', data: imagem } },
          { type: 'text', text: 'Leia este cupom fiscal.' },
        ],
      }],
    } as unknown as Anthropic.Beta.Messages.MessageCreateParamsNonStreaming);
    if (resp.stop_reason === 'refusal') throw new Error('recusado');
    const texto = resp.content.find((b) => b.type === 'text');
    lida = JSON.parse(texto && 'text' in texto ? texto.text : '{}') as Lida;
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

  const { data: compra, error: ec } = await db.from('compra').insert({
    familia_id: u.user.id, mercado_id: mercado?.id ?? null, data, total, origem: 'nota', chave_nfce: chaveValida,
  }).select('id').single();
  if (ec || !compra) return NextResponse.json({ erro: 'Não conseguimos salvar a nota.' }, { status: 400 });
  await db.from('item_comprado').insert(lida.itens.map((i) => ({
    compra_id: compra.id, descricao_nota: i.descricao, quantidade: i.quantidade, preco_unitario: i.preco_unitario,
  })));

  return NextResponse.json({ loja: mercado?.rede ?? lida.loja ?? 'Supermercado', data, total, itens: lida.itens.length });
}

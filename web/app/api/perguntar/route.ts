import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Pergunta em português -> busca estruturada (Groq, modo JSON). A IA não vê preços nem dados da família:
// recebe só a pergunta e a lista de mercados, e devolve o que procurar. Os preços vêm sempre dos dados do app.
export const runtime = 'nodejs';
export const maxDuration = 20;

const LIMITE_DIA = 30;

const INSTRUCOES = `Você ajuda famílias de Indaiatuba (SP) a achar preços de supermercado num app.
Transforme a pergunta da pessoa numa busca. Responda só com JSON, neste formato:
{"intencao":"buscar"|"cesta"|"alerta"|"outro","busca":string,"marca":string|null,"mercado":string|null,
 "ordenar":"preco_medida"|"preco"|"desconto","quantidade":number|null,"preco_alvo":number|null}

Regras:
- "busca": as palavras do produto, em português, sem a marca e sem o mercado, com tamanho quando dito ("arroz 5kg", "cerveja 350ml", "café 500g"). Para tirar algo, use menos colado: "café -cápsula".
- "marca": só se a pessoa disse uma marca. "mercado": só se disse um destes mercados: {MERCADOS}.
- "ordenar": "desconto" quando pedir promoção ou desconto; "preco" quando pedir o preço do pacote; nos outros casos "preco_medida" (mais barato pelo quilo, litro ou unidade).
- "intencao": "cesta" quando pedir para pôr, colocar ou adicionar na cesta/lista/compra (preencha "quantidade", padrão 1);
  "alerta" quando pedir para avisar quando baixar ou chegar num preço (preencha "preco_alvo" se disse um valor);
  "outro" quando não for sobre produtos de supermercado (então "busca" vazia); senão "buscar".
- Nunca invente preços nem produtos.`;

export async function POST(req: Request) {
  const token = req.headers.get('authorization')?.replace(/^Bearer /, '');
  if (!token) return NextResponse.json({ erro: 'Entre na sua conta para perguntar.' }, { status: 401 });
  if (!process.env.GROQ_API_KEY) return NextResponse.json({ erro: 'A busca com IA ainda não foi ativada.' }, { status: 503 });

  let pergunta = '', mercados: string[] = [];
  try {
    const b = await req.json() as { pergunta?: string; mercados?: string[] };
    pergunta = String(b.pergunta ?? '').trim().slice(0, 300);
    mercados = (b.mercados ?? []).map(String).slice(0, 30);
  } catch { /* vazio abaixo */ }
  if (pergunta.length < 3) return NextResponse.json({ erro: 'Escreva a pergunta, por exemplo "qual o café mais barato?".' }, { status: 400 });

  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false },
  });
  const { data: restam, error: el } = await db.rpc('registrar_pergunta_ia', { p_limite: LIMITE_DIA });
  if (el) return NextResponse.json({ erro: 'Sessão expirada. Entre de novo.' }, { status: 401 });
  if (restam === -1) return NextResponse.json({ erro: `Você já fez ${LIMITE_DIA} perguntas hoje. Amanhã tem mais; a busca comum continua funcionando.` }, { status: 429 });

  try {
    const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
      body: JSON.stringify({
        model: process.env.GROQ_MODELO_TEXTO || process.env.GROQ_MODELO_VISAO || 'qwen/qwen3.8-27b',
        temperature: 0, max_completion_tokens: 400, response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: INSTRUCOES.replace('{MERCADOS}', mercados.join(', ') || 'os mercados do app') },
          { role: 'user', content: pergunta },
        ],
      }),
    });
    if (!resp.ok) throw new Error(`groq ${resp.status}`);
    const corpo = await resp.json() as { choices?: { message?: { content?: string } }[] };
    const texto = (corpo.choices?.[0]?.message?.content ?? '').replace(/<think>[\s\S]*?<\/think>/g, '');
    const j = JSON.parse(texto.slice(texto.indexOf('{'), texto.lastIndexOf('}') + 1) || '{}');
    const intencoes = ['buscar', 'cesta', 'alerta', 'outro'];
    const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null);
    return NextResponse.json({
      intencao: intencoes.includes(j.intencao) ? j.intencao : 'buscar',
      busca: typeof j.busca === 'string' ? j.busca.slice(0, 80) : '',
      marca: typeof j.marca === 'string' && j.marca.trim() ? j.marca.trim().slice(0, 40) : null,
      mercado: typeof j.mercado === 'string' && mercados.includes(j.mercado) ? j.mercado : null,
      ordenar: ['preco_medida', 'preco', 'desconto'].includes(j.ordenar) ? j.ordenar : 'preco_medida',
      quantidade: num(j.quantidade) ? Math.min(20, Math.round(num(j.quantidade)!)) : null,
      preco_alvo: num(j.preco_alvo),
      restam,
    });
  } catch (e) {
    console.error('perguntar:', (e as Error).message);
    return NextResponse.json({ erro: 'Não consegui entender agora. Tente de novo ou use a busca comum.' }, { status: 502 });
  }
}

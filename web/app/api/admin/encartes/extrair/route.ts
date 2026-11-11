import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const maxDuration = 60;

type OfertaExtraida = {
  produto: string;
  marca: string | null;
  quantidade: number;
  unidade: string;
  categoria: string;
  preco: number;
  preco_de: number | null;
  condicao: string | null;
};

const INSTRUCOES = `Leia esta página de um encarte de supermercado brasileiro e extraia todas as ofertas legíveis.
Responda somente JSON no formato {"ofertas":[...]}.
Cada oferta deve ter: produto (nome genérico sem marca), marca (texto ou null), quantidade (número),
unidade (g, kg, ml, l ou un), categoria (texto curto), preco (número em reais), preco_de (número ou null),
condicao (texto ou null).
Inclua somente itens com preço e embalagem legíveis. Não invente dados. Para frutas, legumes e carnes vendidos por quilo,
use quantidade 1 e unidade "kg". Preços condicionais devem usar o menor valor e explicar a condição.`;

const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  .replace(/[^a-z0-9 ]+/g, ' ').trim().replace(/\s+/g, ' ');
const tipoImagem = (arquivo: File) => {
  if (/^image\/(jpeg|png|webp)$/.test(arquivo.type)) return arquivo.type;
  if (!arquivo.type || arquivo.type === 'application/octet-stream') {
    if (/\.jpe?g$|\.jfif$/i.test(arquivo.name)) return 'image/jpeg';
    if (/\.png$/i.test(arquivo.name)) return 'image/png';
    if (/\.webp$/i.test(arquivo.name)) return 'image/webp';
  }
  return null;
};

async function verificarAdmin(req: Request): Promise<NextResponse | null> {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return NextResponse.json({ erro: 'Entre na sua conta para continuar.' }, { status: 401 });
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });
  const { data: user, error: userError } = await db.auth.getUser(token);
  if (userError || !user.user) return NextResponse.json({ erro: 'Sessão expirada. Entre de novo.' }, { status: 401 });
  const { data: admin, error } = await db.rpc('eh_admin');
  if (error || !admin) return NextResponse.json({ erro: 'Área só para administradores.' }, { status: 403 });
  return null;
}

export async function POST(req: Request) {
  const naoAutorizado = await verificarAdmin(req);
  if (naoAutorizado) return naoAutorizado;
  if (!process.env.GROQ_API_KEY) {
    return NextResponse.json({ erro: 'Leitura de encartes indisponível: falta configurar GROQ_API_KEY na Vercel.' }, { status: 503 });
  }

  let arquivos: File[];
  try {
    const form = await req.formData();
    arquivos = form.getAll('arquivos').filter((x): x is File => x instanceof File);
  } catch {
    return NextResponse.json({ erro: 'Não foi possível ler os arquivos enviados. Tente enviar menos páginas por vez.' }, { status: 400 });
  }
  if (!arquivos.length || arquivos.length > 5) {
    return NextResponse.json({ erro: 'Selecione de 1 a 5 imagens do encarte por envio.' }, { status: 400 });
  }
  const tipos = arquivos.map(tipoImagem);
  if (tipos.some((tipo) => !tipo)) {
    return NextResponse.json({ erro: 'Use imagens JPG/JFIF, PNG ou WEBP. PDFs ainda não são aceitos nesta tela.' }, { status: 415 });
  }
  if (arquivos.reduce((total, f) => total + f.size, 0) > 4_000_000) {
    return NextResponse.json({ erro: 'As imagens somam mais de 4 MB. Divida o encarte em lotes menores.' }, { status: 413 });
  }

  const deduplicadas = new Map<string, OfertaExtraida & { chave: string }>();
  try {
    for (const [i, arquivo] of arquivos.entries()) {
      const base64 = Buffer.from(await arquivo.arrayBuffer()).toString('base64');
      const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
        body: JSON.stringify({
          model: process.env.GROQ_MODELO_VISAO || 'qwen/qwen3.8-27b',
          temperature: 0.1,
          max_completion_tokens: 8000,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: `${INSTRUCOES}\nFormato esperado: {"ofertas":[{"produto":"Arroz","marca":"Marca","quantidade":5,"unidade":"kg","categoria":"mercearia","preco":25.9,"preco_de":null,"condicao":null}]}` },
            { role: 'user', content: [
              { type: 'text', text: `Extraia as ofertas da página ${arquivo.name}.` },
              { type: 'image_url', image_url: { url: `data:${tipos[i]};base64,${base64}` } },
            ] },
          ],
        }),
      });
      if (!resp.ok) throw new Error(`Groq ${resp.status}: ${(await resp.text()).slice(0, 300)}`);
      const corpo = await resp.json() as { choices?: { message?: { content?: string } }[] };
      const bruto = JSON.parse(corpo.choices?.[0]?.message?.content ?? '{}') as { ofertas?: Partial<OfertaExtraida>[] };
      for (const o of bruto.ofertas ?? []) {
        const produto = typeof o.produto === 'string' ? o.produto.trim() : '';
        const quantidade = Number(o.quantidade);
        const unidade = typeof o.unidade === 'string' ? o.unidade.trim().toLowerCase() : '';
        const preco = Number(o.preco);
        if (!produto || !Number.isFinite(quantidade) || quantidade <= 0
          || !['g', 'kg', 'ml', 'l', 'un'].includes(unidade)
          || !Number.isFinite(preco) || preco <= 0) continue;
        const marca = typeof o.marca === 'string' && o.marca.trim() ? o.marca.trim() : null;
        const chave = `${norm(produto)}|${norm(marca ?? '')}|${quantidade}${unidade}`;
        const oferta: OfertaExtraida & { chave: string } = {
          chave, produto, marca, quantidade, unidade,
          categoria: typeof o.categoria === 'string' ? o.categoria.trim().slice(0, 60) : 'outros',
          preco, preco_de: typeof o.preco_de === 'number' && o.preco_de > 0 ? o.preco_de : null,
          condicao: typeof o.condicao === 'string' ? o.condicao.trim().slice(0, 200) || null : null,
        };
        const anterior = deduplicadas.get(chave);
        if (!anterior || oferta.preco < anterior.preco) deduplicadas.set(chave, oferta);
      }
    }
  } catch (e) {
    console.error('admin/encartes: falha na extração', (e as Error).message);
    return NextResponse.json({ erro: 'Não foi possível extrair as ofertas. Confira a imagem e tente novamente.' }, { status: 502 });
  }

  if (!deduplicadas.size) return NextResponse.json({ erro: 'Nenhuma oferta legível foi encontrada nas imagens.' }, { status: 422 });
  return NextResponse.json({ ofertas: [...deduplicadas.values()] });
}

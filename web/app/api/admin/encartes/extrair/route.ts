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

  const inicio = Date.now();
  const deduplicadas = new Map<string, OfertaExtraida & { chave: string }>();
  const falhas: string[] = [];
  for (const [i, arquivo] of arquivos.entries()) {
    let ofertasPagina: Partial<OfertaExtraida>[];
    try {
      const base64 = Buffer.from(await arquivo.arrayBuffer()).toString('base64');
      ofertasPagina = await extrairPagina(arquivo.name, `data:${tipos[i]};base64,${base64}`, inicio);
    } catch (e) {
      console.error(`admin/encartes: falha na extração de ${arquivo.name}`, (e as Error).message);
      falhas.push(`${arquivo.name} (${motivoAmigavel(e as Error)})`);
      continue;
    }
    {
      for (const o of ofertasPagina) {
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
  }

  if (!deduplicadas.size) {
    if (falhas.length) {
      return NextResponse.json({ erro: `Não foi possível extrair as ofertas: ${falhas.join('; ')}. Tente de novo em instantes ou envie uma página por vez.` }, { status: 502 });
    }
    return NextResponse.json({ erro: 'Nenhuma oferta legível foi encontrada nas imagens.' }, { status: 422 });
  }
  return NextResponse.json({
    ofertas: [...deduplicadas.values()],
    aviso: falhas.length ? `Páginas não lidas: ${falhas.join('; ')}. Reenvie só essas.` : null,
  });
}

class ErroGroq extends Error {
  constructor(public status: number, corpo: string) { super(`Groq ${status}: ${corpo.slice(0, 300)}`); }
}

const motivoAmigavel = (e: Error) => {
  if (e instanceof ErroGroq) {
    if (e.status === 429) return 'limite de uso da IA atingido, aguarde 1 minuto';
    if (e.status === 413) return 'imagem grande demais para a IA';
    if (e.status === 401 || e.status === 403) return 'chave GROQ_API_KEY inválida';
    if (e.status >= 500) return 'serviço da IA instável';
    return `IA recusou a página (${e.status})`;
  }
  if (e.name === 'TimeoutError' || e.name === 'AbortError') return 'a IA demorou demais';
  return 'resposta da IA ilegível';
};

/** Pega o objeto JSON da resposta mesmo com <think>, cercas ``` ou texto em volta. */
function lerJson(texto: string): { ofertas?: Partial<OfertaExtraida>[] } {
  const limpo = texto.replace(/<think>[\s\S]*?(<\/think>|$)/gi, '').replace(/```(?:json)?/gi, '');
  try { return JSON.parse(limpo); } catch { /* tenta recortar */ }
  const ini = limpo.indexOf('{');
  const fim = limpo.lastIndexOf('}');
  if (ini >= 0 && fim > ini) {
    try { return JSON.parse(limpo.slice(ini, fim + 1)); } catch { /* tenta salvar itens */ }
  }
  // Resposta truncada: aproveita os objetos de oferta completos.
  const itens = limpo.match(/\{[^{}]*"produto"[^{}]*\}/g) ?? [];
  const ofertas = itens.flatMap((s) => { try { return [JSON.parse(s)]; } catch { return []; } });
  if (!ofertas.length) throw new Error('JSON inválido');
  return { ofertas };
}

async function chamarGroq(nome: string, imagem: string, modoJson: boolean, msRestantes: number) {
  const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    signal: AbortSignal.timeout(Math.max(5_000, msRestantes)),
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
    body: JSON.stringify({
      model: process.env.GROQ_MODELO_VISAO || 'qwen/qwen3.8-27b',
      temperature: 0.1,
      max_completion_tokens: 8000,
      ...(modoJson ? { response_format: { type: 'json_object' } } : {}),
      messages: [
        { role: 'system', content: `${INSTRUCOES}\nFormato esperado: {"ofertas":[{"produto":"Arroz","marca":"Marca","quantidade":5,"unidade":"kg","categoria":"mercearia","preco":25.9,"preco_de":null,"condicao":null}]}` },
        { role: 'user', content: [
          { type: 'text', text: `Extraia as ofertas da página ${nome}.` },
          { type: 'image_url', image_url: { url: imagem } },
        ] },
      ],
    }),
  });
  const texto = await resp.text();
  if (!resp.ok) {
    // No modo JSON o Groq devolve 400 json_validate_failed com o texto gerado; tenta aproveitá-lo.
    if (resp.status === 400) {
      try {
        const falha = (JSON.parse(texto) as { error?: { failed_generation?: string } }).error?.failed_generation;
        if (falha) return lerJson(falha).ofertas ?? [];
      } catch { /* segue para o erro */ }
    }
    throw new ErroGroq(resp.status, texto);
  }
  const corpo = JSON.parse(texto) as { choices?: { message?: { content?: string } }[] };
  return lerJson(corpo.choices?.[0]?.message?.content ?? '').ofertas ?? [];
}

/** Lê uma página com até 2 tentativas, respeitando o limite de 60 s da função. */
async function extrairPagina(nome: string, imagem: string, inicio: number) {
  const restante = () => 55_000 - (Date.now() - inicio);
  try {
    return await chamarGroq(nome, imagem, true, restante());
  } catch (e) {
    if (restante() < 15_000) throw e;
    if (e instanceof ErroGroq && [401, 403, 413].includes(e.status)) throw e;
    if (e instanceof ErroGroq && e.status === 429) {
      await new Promise((r) => setTimeout(r, Math.min(8_000, restante() - 12_000)));
    }
    console.warn(`admin/encartes: repetindo ${nome} sem modo JSON`, (e as Error).message);
    return await chamarGroq(nome, imagem, false, restante());
  }
}

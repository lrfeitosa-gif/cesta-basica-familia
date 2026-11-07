import { NextResponse } from 'next/server';
import { buscarOfertas } from '@/lib/ofertas';

// Preços do dia montados no servidor (perto do banco) e guardados no cache da Vercel por 10 minutos:
// o celular baixa um único arquivo compactado em vez de dezenas de consultas.
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET() {
  try {
    const o = await buscarOfertas();
    const lista = o.lista.map(({ busca, ...r }) => r);   // o campo de busca é refeito no aparelho
    return NextResponse.json({ ...o, lista }, {
      headers: { 'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=3600' },
    });
  } catch (e) {
    return NextResponse.json({ erro: 'falha', detalhe: String((e as { message?: string })?.message ?? e).slice(0, 300) }, { status: 502 });
  }
}

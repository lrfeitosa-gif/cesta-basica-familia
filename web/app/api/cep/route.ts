import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const preferredRegion = 'gru1';

// CEP -> coordenada aproximada (arredondada a ~1 km) para calcular a distância até os mercados.
// Endereço vem do ViaCEP/BrasilAPI; a coordenada, do OpenStreetMap (rua, depois bairro, depois cidade).
// Nada é guardado aqui: o app grava só o rótulo e a coordenada arredondada.

const UA = { 'User-Agent': 'FastPromotionsMK/0.1 (piloto Indaiatuba; lrfeitosa@gmail.com)' };
type Endereco = { rua: string; bairro: string; cidade: string; uf: string };

async function endereco(cep: string): Promise<Endereco | null> {
  try {
    const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`, { cache: 'no-store', signal: AbortSignal.timeout(8000) });
    const j = await r.json();
    if (!j.erro) return { rua: j.logradouro || '', bairro: j.bairro || '', cidade: j.localidade || '', uf: j.uf || '' };
  } catch { /* tenta a outra fonte */ }
  try {
    const r = await fetch(`https://brasilapi.com.br/api/cep/v2/${cep}`, { cache: 'no-store', signal: AbortSignal.timeout(8000) });
    if (r.ok) { const j = await r.json(); return { rua: j.street || '', bairro: j.neighborhood || '', cidade: j.city || '', uf: j.state || '' }; }
  } catch { /* sem endereço */ }
  return null;
}

async function localizar(params: Record<string, string>): Promise<{ lat: number; lng: number } | null> {
  const u = new URL('https://nominatim.openstreetmap.org/search');
  for (const [k, v] of Object.entries({ ...params, country: 'br', format: 'jsonv2', limit: '1' })) u.searchParams.set(k, v);
  try {
    const r = await fetch(u, { headers: UA, cache: 'no-store', signal: AbortSignal.timeout(8000) });
    const [x] = await r.json();
    return x ? { lat: Number(x.lat), lng: Number(x.lon) } : null;
  } catch { return null; }
}

export async function GET(req: Request) {
  const cep = (new URL(req.url).searchParams.get('cep') || '').replace(/\D/g, '');
  if (cep.length !== 8) return NextResponse.json({ erro: 'CEP inválido. Use 8 números, como 13330-000.' }, { status: 400 });
  const e = await endereco(cep);
  if (!e) return NextResponse.json({ erro: 'CEP não encontrado. Confira os números.' }, { status: 404 });

  // Rua + bairro é o mais preciso; rodovias e estradas são longas demais (o ponto pode cair a 10 km), então
  // para elas vale o bairro.
  const ruaLonga = /^(rodovia|estrada|rod\.)/i.test(e.rua);
  const tentativas: [Record<string, string>, string][] = [];
  if (e.rua && e.bairro && !ruaLonga) tentativas.push([{ q: `${e.rua}, ${e.bairro}, ${e.cidade}, ${e.uf}` }, 'rua']);
  if (e.bairro) tentativas.push([{ q: `${e.bairro}, ${e.cidade}, ${e.uf}` }, 'bairro']);
  if (e.rua && !ruaLonga) tentativas.push([{ street: e.rua, city: e.cidade, state: e.uf }, 'rua']);
  tentativas.push([{ city: e.cidade, state: e.uf }, 'cidade']);
  for (const [params, precisao] of tentativas) {
    const p = await localizar(params);
    if (p) {
      return NextResponse.json({
        lat: Math.round(p.lat * 100) / 100, lng: Math.round(p.lng * 100) / 100,   // ~1 km: nunca o ponto exato
        bairro: e.bairro, cidade: e.cidade, precisao,
      });
    }
  }
  return NextResponse.json({ erro: 'Não conseguimos localizar este CEP no mapa.' }, { status: 404 });
}

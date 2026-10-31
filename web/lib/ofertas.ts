'use client';
import { useEffect, useState } from 'react';
import { supabase } from './supabase';

export type Oferta = {
  id: number;
  nome: string; marca: string; q: number; u: string; categoria: string; ean: string;
  mercado: string; preco: number; de: number; cond: string; fonte: Fonte; url: string;
  porUn: number; ub: string; busca: string;
};
export type Fonte = 'site' | 'encarte';
export type InfoMercado = { mercado: string; fonte: Fonte; precos: number; atualizado: string };
export type Ofertas = { dia: string; atualizado: string; mercados: string[]; info: InfoMercado[]; lista: Oferta[] };

export const horaBr = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

// Grupos de categoria para os filtros. Cada mercado nomeia as categorias de um jeito; aqui viram um só nome.
export const GRUPOS: [string, RegExp][] = [
  ['Hortifruti', /horti|fruta|legume|verdura|feira/],
  ['Açougue', /acougue|carne|aves|frango|peixe|suino|bovino/],
  ['Laticínios e frios', /latic|frios|queijo|iogurte/],
  ['Padaria', /padaria|paes|bolo|rotisseria/],
  ['Bebidas', /bebida|cerveja|refrigerante|suco|agua/],
  ['Limpeza', /limpeza|lavanderia/],
  ['Higiene', /higiene|perfumaria|beleza|cuidados|fralda|bebe/],
  ['Congelados', /congelad/],
  ['Mercearia', /mercearia|alimento|matinal|cafe da manha|doce|biscoito|massa|grao|enlatad|tempero|suplement|vitamina/],
  ['Pet', /pet/],
];
export function grupo(categoria: string | null | undefined): string {
  const c = norm(categoria);
  return GRUPOS.find(([, re]) => re.test(c))?.[0] ?? 'Outros';
}

export const norm = (s: string | null | undefined) =>
  (s || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
export const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const emb = (o: Oferta) => `${String(o.q).replace('.', ',')} ${o.u}`;
export const dataBr = (iso: string) => iso.split('-').reverse().join('/');

type Linha = {
  id: number; preco: number; preco_de: number | null; condicao: string | null; fonte: string; coletado_em: string; url: string | null;
  mercado: { rede: string } | null;
  produto: { nome: string; marca: string | null; quantidade: number; unidade: string; categoria: string; ean: string | null } | null;
};

// Uma carga por sessão, compartilhada entre as abas.
let cache: Promise<Ofertas> | null = null;
const ouvintes = new Set<(o: Ofertas) => void>();

export function carregarOfertas(): Promise<Ofertas> {
  if (!cache) cache = buscar().catch((e) => { cache = null; throw e; });
  return cache;
}

// Preços do dia para as telas, com estado de erro e "tentar de novo".
// Atualiza sozinho quando alguém marca uma oferta como esgotada.
export function useOfertas() {
  const [dados, setDados] = useState<Ofertas | null>(null);
  const [erro, setErro] = useState(false);
  const [tentativa, setTentativa] = useState(0);
  useEffect(() => {
    setErro(false);
    carregarOfertas().then(setDados).catch(() => setErro(true));
  }, [tentativa]);
  useEffect(() => { ouvintes.add(setDados); return () => { ouvintes.delete(setDados); }; }, []);
  return { dados, erro, tentarDeNovo: () => setTentativa((t) => t + 1) };
}

// "Acabou na loja": tira a oferta das listas de hoje (para todos) até a próxima coleta.
// Devolve uma função para desfazer.
export async function marcarEsgotado(o: Oferta): Promise<(() => Promise<void>) | null> {
  const { error } = await supabase.from('esgotado').insert({ oferta_id: o.id });
  if (error && !/duplicate/i.test(error.message)) return null;
  const atual = await carregarOfertas();
  const sem = { ...atual, lista: atual.lista.filter((x) => x.id !== o.id) };
  cache = Promise.resolve(sem);
  ouvintes.forEach((f) => f(sem));
  return async () => {
    await supabase.from('esgotado').delete().eq('oferta_id', o.id);
    const agora = await carregarOfertas();
    const volta = { ...agora, lista: [...agora.lista, o] };
    cache = Promise.resolve(volta);
    ouvintes.forEach((f) => f(volta));
  };
}

async function buscar(): Promise<Ofertas> {
  // Último dia (até hoje, em Brasília) com coleta dos sites. Prints de encarte são gravados também para dias
  // futuros e, sozinhos, não podem virar "o dia mais recente"; no dia escolhido eles também estão presentes.
  const hoje = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
  const ult = await supabase.from('oferta').select('valido_de').eq('fonte', 'ecommerce').lte('valido_de', hoje)
    .order('valido_de', { ascending: false }).limit(1).single();
  if (ult.error) throw ult.error;
  const dia = ult.data.valido_de as string;
  const linhas: Linha[] = [];
  for (let i = 0; ; i += 1000) {
    const { data, error } = await supabase.from('oferta')
      .select('id,preco,preco_de,condicao,fonte,coletado_em,url,mercado(rede),produto(nome,marca,quantidade,unidade,categoria,ean)')
      .eq('valido_de', dia).range(i, i + 999);
    if (error) throw error;
    linhas.push(...(data as unknown as Linha[]));
    if (data.length < 1000) break;
  }
  // ofertas avisadas como esgotadas hoje ficam de fora (tabela da migração 0006; sem ela, ignora)
  const esg = await supabase.from('esgotado').select('oferta_id,oferta!inner(valido_de)').eq('oferta.valido_de', dia);
  const esgotadas = new Set((esg.data ?? []).map((e: { oferta_id: number }) => e.oferta_id));
  const lista: Oferta[] = [];
  for (const l of linhas) {
    if (esgotadas.has(l.id)) continue;
    const p = l.produto;
    if (!p || !l.mercado) continue;
    const base = p.unidade === 'g' || p.unidade === 'ml' ? p.quantidade / 1000 : p.quantidade;
    const ub = p.unidade === 'g' ? 'kg' : p.unidade === 'ml' ? 'l' : p.unidade;
    lista.push({
      id: l.id, nome: p.nome, marca: p.marca || '', q: p.quantidade, u: p.unidade, categoria: p.categoria, ean: p.ean || '',
      mercado: l.mercado.rede, preco: l.preco, de: l.preco_de || 0, cond: l.condicao || '',
      fonte: l.fonte === 'ecommerce' ? 'site' : 'encarte', url: l.url || '',
      porUn: l.preco / base, ub,
      busca: norm(`${p.nome} ${p.marca || ''} ${p.quantidade}${p.unidade} ${p.categoria} ${grupo(p.categoria)}`),
    });
  }
  padronizarMarcas(lista);
  const info = new Map<string, InfoMercado>();
  for (const l of linhas) {
    if (!l.mercado) continue;
    const i = info.get(l.mercado.rede) ?? { mercado: l.mercado.rede, fonte: l.fonte === 'ecommerce' ? 'site' : 'encarte', precos: 0, atualizado: l.coletado_em };
    i.precos += 1;
    if (l.coletado_em > i.atualizado) i.atualizado = l.coletado_em;
    info.set(l.mercado.rede, i);
  }
  const infos = [...info.values()].sort((a, b) => a.mercado.localeCompare(b.mercado));
  const atualizado = infos.reduce((m, i) => (i.atualizado > m ? i.atualizado : m), '');
  return { dia, atualizado, mercados: infos.map((i) => i.mercado), info: infos, lista };
}

// Chave da marca: ignora maiúsculas, acentos e pontuação ("LIZA", "Liza", "3 Corações" = "3 coracoes").
export const chaveMarca = (m: string) => norm(m).replace(/[^a-z0-9]+/g, ' ').trim();

const titulo = (m: string) => m.toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (_, a, b) => a + b.toUpperCase());

// Uma grafia por marca em todas as telas: a mais usada que não seja toda em maiúsculas.
function padronizarMarcas(lista: Oferta[]) {
  const contagem = new Map<string, Map<string, number>>();
  for (const o of lista) {
    const k = chaveMarca(o.marca);
    if (!k) continue;
    const m = contagem.get(k) ?? new Map<string, number>();
    m.set(o.marca.trim(), (m.get(o.marca.trim()) ?? 0) + 1);
    contagem.set(k, m);
  }
  const exibir = new Map<string, string>();
  for (const [k, grafias] of contagem) {
    const ordem = [...grafias.entries()].sort((a, b) => b[1] - a[1]).map(([g]) => g);
    const mista = ordem.find((g) => g !== g.toUpperCase() || g.length <= 3);
    exibir.set(k, mista ?? titulo(ordem[0]));
  }
  for (const o of lista) {
    const k = chaveMarca(o.marca);
    if (k) o.marca = exibir.get(k)!;
  }
}

// Marca digitada pela pessoa ("heine", "3 coracoes") casa com a marca da oferta por parte do nome.
export const marcaCasa = (marcaOferta: string, digitada: string) => {
  const d = chaveMarca(digitada);
  return !d || chaveMarca(marcaOferta).includes(d);
};

// Filtro composto: todas as palavras precisam aparecer; "-palavra" exclui.
export function filtrar(lista: Oferta[], consulta: string): Oferta[] {
  const partes = norm(consulta).replace(/(\d+)\s+(kg|g|ml|l)\b/g, '$1$2').split(/\s+/).filter(Boolean);
  const termos = partes.filter((t) => !t.startsWith('-'));
  const fora = partes.filter((t) => t.startsWith('-') && t.length > 1).map((t) => t.slice(1));
  if (!termos.length) return [];
  return lista.filter((o) => termos.every((t) => o.busca.includes(t)) && !fora.some((t) => o.busca.includes(t)));
}

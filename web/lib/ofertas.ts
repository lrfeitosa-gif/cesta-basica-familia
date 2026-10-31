'use client';
import { supabase } from './supabase';

export type Oferta = {
  nome: string; marca: string; q: number; u: string; categoria: string; ean: string;
  mercado: string; preco: number; de: number; cond: string;
  porUn: number; ub: string; busca: string;
};
export type Ofertas = { dia: string; mercados: string[]; lista: Oferta[] };

export const norm = (s: string | null | undefined) =>
  (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
export const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const emb = (o: Oferta) => `${String(o.q).replace('.', ',')} ${o.u}`;
export const dataBr = (iso: string) => iso.split('-').reverse().join('/');

type Linha = {
  preco: number; preco_de: number | null; condicao: string | null;
  mercado: { rede: string } | null;
  produto: { nome: string; marca: string | null; quantidade: number; unidade: string; categoria: string; ean: string | null } | null;
};

// Uma carga por sessão, compartilhada entre as abas.
let cache: Promise<Ofertas> | null = null;

export function carregarOfertas(): Promise<Ofertas> {
  if (!cache) cache = buscar().catch((e) => { cache = null; throw e; });
  return cache;
}

async function buscar(): Promise<Ofertas> {
  const ult = await supabase.from('oferta').select('valido_de').order('valido_de', { ascending: false }).limit(1).single();
  if (ult.error) throw ult.error;
  const dia = ult.data.valido_de as string;
  const linhas: Linha[] = [];
  for (let i = 0; ; i += 1000) {
    const { data, error } = await supabase.from('oferta')
      .select('preco,preco_de,condicao,mercado(rede),produto(nome,marca,quantidade,unidade,categoria,ean)')
      .eq('valido_de', dia).range(i, i + 999);
    if (error) throw error;
    linhas.push(...(data as unknown as Linha[]));
    if (data.length < 1000) break;
  }
  const lista: Oferta[] = [];
  for (const l of linhas) {
    const p = l.produto;
    if (!p || !l.mercado) continue;
    const base = p.unidade === 'g' || p.unidade === 'ml' ? p.quantidade / 1000 : p.quantidade;
    const ub = p.unidade === 'g' ? 'kg' : p.unidade === 'ml' ? 'l' : p.unidade;
    lista.push({
      nome: p.nome, marca: p.marca || '', q: p.quantidade, u: p.unidade, categoria: p.categoria, ean: p.ean || '',
      mercado: l.mercado.rede, preco: l.preco, de: l.preco_de || 0, cond: l.condicao || '',
      porUn: l.preco / base, ub,
      busca: norm(`${p.nome} ${p.marca || ''} ${p.quantidade}${p.unidade}`),
    });
  }
  return { dia, mercados: [...new Set(lista.map((o) => o.mercado))].sort(), lista };
}

// Filtro composto: todas as palavras precisam aparecer; "-palavra" exclui.
export function filtrar(lista: Oferta[], consulta: string): Oferta[] {
  const partes = norm(consulta).replace(/(\d+)\s+(kg|g|ml|l)\b/g, '$1$2').split(/\s+/).filter(Boolean);
  const termos = partes.filter((t) => !t.startsWith('-'));
  const fora = partes.filter((t) => t.startsWith('-') && t.length > 1).map((t) => t.slice(1));
  if (!termos.length) return [];
  return lista.filter((o) => termos.every((t) => o.busca.includes(t)) && !fora.some((t) => o.busca.includes(t)));
}

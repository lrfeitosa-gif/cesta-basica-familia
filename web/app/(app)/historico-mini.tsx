'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { brl, dataBr, type Oferta } from '@/lib/ofertas';

type Dia = { dia: string; preco: number; mercado: string };
const maisDias = (d: string, n: number) => new Date(Date.parse(d) + n * 86400000).toISOString().slice(0, 10);

// "Ver histórico" no cartão do produto (14/11, no lugar da aba Evolução): o menor preço por dia deste produto
// (mesmo nome e tamanho) entre todos os mercados, nos últimos 30 dias. Dias recentes vêm de `oferta`;
// os antigos, de `oferta_periodo` (migração 0019). O histórico completo, com cada mercado, continua em /evolucao.
export default function HistoricoMini({ o, termo }: { o: Oferta; termo: string }) {
  const [dias, setDias] = useState<Dia[] | null>(null);
  const [falha, setFalha] = useState(false);
  useEffect(() => {
    const desde = maisDias(new Date().toISOString().slice(0, 10), -30);
    const sel = 'mercado!inner(rede),produto!inner(nome,quantidade)';
    Promise.all([
      supabase.from('oferta').select(`preco,valido_de,${sel}`).eq('produto.nome', o.nome).eq('produto.quantidade', o.q).gte('valido_de', desde).limit(1000),
      supabase.from('oferta_periodo').select(`preco,de,ate,${sel}`).eq('produto.nome', o.nome).eq('produto.quantidade', o.q).gte('ate', desde).limit(1000),
    ]).then(([a, b]) => {
      if (a.error || b.error) return setFalha(true);
      const menor = new Map<string, Dia>();
      const por = (dia: string, preco: number, mercado: string) => {
        const x = menor.get(dia);
        if (!x || preco < x.preco) menor.set(dia, { dia, preco: Number(preco), mercado });
      };
      type L = { preco: number; mercado: { rede: string } };
      for (const r of (a.data ?? []) as unknown as (L & { valido_de: string })[]) por(r.valido_de, r.preco, r.mercado.rede);
      for (const r of (b.data ?? []) as unknown as (L & { de: string; ate: string })[]) {
        for (let d = r.de < desde ? desde : r.de; d <= r.ate; d = maisDias(d, 1)) por(d, r.preco, r.mercado.rede);
      }
      setDias([...menor.values()].sort((x, y) => x.dia.localeCompare(y.dia)));
    });
  }, [o.nome, o.q]);

  const completo = <Link className="hist-link" href={`/evolucao?q=${encodeURIComponent(termo)}`}>Ver histórico completo, mercado a mercado →</Link>;
  if (falha) return <div className="hist-mini"><span className="muted">Não foi possível carregar o histórico agora.</span>{completo}</div>;
  if (!dias) return <div className="hist-mini"><span className="muted">Carregando o histórico…</span></div>;
  if (dias.length < 2) return <div className="hist-mini"><span className="muted">Ainda não há histórico suficiente deste produto.</span>{completo}</div>;

  const ps = dias.map((d) => d.preco);
  const min = Math.min(...ps), max = Math.max(...ps);
  const L = 280, A = 56;
  const x = (i: number) => (i / (dias.length - 1)) * L;
  const y = (p: number) => (max === min ? A / 2 : 4 + (1 - (p - min) / (max - min)) * (A - 8));
  const menorDia = dias.find((d) => d.preco === min)!;
  const ultimo = dias[dias.length - 1];
  return (
    <div className="hist-mini">
      <span className="muted">Menor preço por dia, em qualquer mercado · {dias.length} dias</span>
      <svg viewBox={`0 0 ${L} ${A}`} width="100%" height={A} role="img"
        aria-label={`De ${brl(dias[0].preco)} em ${dataBr(dias[0].dia)} para ${brl(ultimo.preco)} hoje; menor ${brl(min)} em ${dataBr(menorDia.dia)}`}>
        <polyline fill="none" stroke="var(--marca)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round"
          points={dias.map((d, i) => `${x(i)},${y(d.preco)}`).join(' ')} />
        <circle cx={x(dias.indexOf(menorDia))} cy={y(min)} r="4" fill="var(--destaque-escuro)" />
      </svg>
      <span className="hist-resumo">
        Hoje <b>{brl(ultimo.preco)}</b> · menor <b>{brl(min)}</b> em {dataBr(menorDia.dia).slice(0, 5)} ({menorDia.mercado}) · maior {brl(max)}
      </span>
      {completo}
    </div>
  );
}

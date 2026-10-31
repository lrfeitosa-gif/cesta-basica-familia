'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useSessao } from '@/lib/sessao';

type Item = { descricao_nota: string; quantidade: number; preco_unitario: number };
type Agrupado = { descricao: string; vezes: number; ultimoPreco: number };
const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

// Primeira versão da lista de interesse: o que aparece nas notas, do mais comprado ao menos.
// A próxima etapa normaliza cada descrição da nota para um produto do catálogo e deixa ajustar marca e preço-alvo.
export default function Lista() {
  const sessao = useSessao();
  const [itens, setItens] = useState<Agrupado[] | null>(null);

  useEffect(() => {
    if (!sessao) return;
    supabase.from('item_comprado').select('descricao_nota,quantidade,preco_unitario').limit(1000).then(({ data }) => {
      const mapa = new Map<string, Agrupado>();
      for (const i of (data as Item[]) ?? []) {
        const k = i.descricao_nota.trim().toUpperCase();
        const a = mapa.get(k) ?? { descricao: i.descricao_nota, vezes: 0, ultimoPreco: i.preco_unitario };
        a.vezes += 1; a.ultimoPreco = i.preco_unitario;
        mapa.set(k, a);
      }
      setItens([...mapa.values()].sort((a, b) => b.vezes - a.vezes));
    });
  }, [sessao]);

  if (!sessao || itens === null) return null;

  return (
    <>
      <div>
        <h1>Sua lista de interesse</h1>
        <p className="lead">Montada a partir das suas notas. Em breve você poderá escolher marca e preço-alvo de cada item.</p>
      </div>
      {itens.length === 0 ? (
        <div className="card stack">
          <span>Ainda não há itens. Envie uma nota fiscal e os produtos aparecem aqui.</span>
          <Link href="/notas" className="btn btn-primary">Enviar nota</Link>
        </div>
      ) : (
        <div className="nota-lista">
          {itens.map((i) => (
            <div key={i.descricao}>
              <b>{i.descricao}</b>
              <span className="etiqueta">{brl(i.ultimoPreco)}</span>
              <span className="muted" style={{ gridColumn: '1 / -1' }}>comprado {i.vezes}× nas notas enviadas</span>
            </div>
          ))}
        </div>
      )}
      <Link href="/notas" className="btn btn-secondary btn-block" style={{ marginTop: 'auto' }}>Enviar mais notas</Link>
    </>
  );
}

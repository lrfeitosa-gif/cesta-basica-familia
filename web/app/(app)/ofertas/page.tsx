'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { carregarOfertas, dataBr, type Ofertas } from '@/lib/ofertas';
import { supabase } from '@/lib/supabase';
import LinhaOferta, { Carregando } from '../linha-oferta';

const RUIDO = /racao|cao |gato|pet|whisky|gin |vodka|vinho|cerveja|energetico/;

export default function Oportunidades() {
  const [dados, setDados] = useState<Ofertas | null>(null);
  const [erro, setErro] = useState('');
  const [mercado, setMercado] = useState('Todos');
  const [semNotas, setSemNotas] = useState(false);

  useEffect(() => {
    carregarOfertas().then(setDados).catch(() => setErro('Não foi possível carregar os preços. Confira a internet e tente de novo.'));
    supabase.from('compra').select('id', { count: 'exact', head: true }).then(({ count }) => setSemNotas(!count));
  }, []);

  const opp = useMemo(() => (dados?.lista ?? [])
    .filter((o) => o.de > o.preco && !RUIDO.test(o.busca))
    .map((o) => ({ o, desc: 1 - o.preco / o.de }))
    .filter((x) => x.desc >= 0.08 && x.desc <= 0.7)
    .sort((a, b) => b.desc - a.desc), [dados]);

  const mercados = ['Todos', ...(dados?.mercados ?? []).filter((m) => opp.some((x) => x.o.mercado === m))];
  const lista = opp.filter((x) => mercado === 'Todos' || x.o.mercado === mercado).slice(0, 60);

  return (
    <>
      <header className="topo">
        <div className="brand">Cesta <span>Indaiatuba</span></div>
        {dados && <div className="muted">{dados.lista.length.toLocaleString('pt-BR')} preços de {dados.mercados.length} mercados · {dataBr(dados.dia)}</div>}
      </header>

      {semNotas && (
        <Link href="/notas" className="convite">
          <b>Envie suas notas fiscais</b>
          <span>Com 3 notas o app aprende o que você compra e passa a avisar dos seus produtos.</span>
        </Link>
      )}

      <div>
        <h1>Oportunidades de hoje</h1>
        <p className="lead">Maiores descontos sobre o preço normal de cada mercado.</p>
      </div>

      {erro && <div className="alert alert-error" role="alert">{erro}</div>}
      {!dados && !erro && <Carregando />}
      {dados && (
        <>
          <div className="chips" role="group" aria-label="Filtrar por mercado">
            {mercados.map((m) => (
              <button key={m} type="button" className="chip" aria-pressed={m === mercado} onClick={() => setMercado(m)}>{m}</button>
            ))}
          </div>
          <div className="lista">
            {lista.map(({ o, desc }, i) => <LinhaOferta key={i} o={o} extra={<span className="off">−{Math.round(desc * 100)}%</span>} />)}
          </div>
        </>
      )}
    </>
  );
}

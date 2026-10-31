'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { dataBr, useOfertas } from '@/lib/ofertas';
import { supabase } from '@/lib/supabase';
import LinhaOferta, { Carregando, ErroCarga } from '../linha-oferta';
import Fontes from '../fontes';
import BoasVindas from '../boas-vindas';

// Fora das oportunidades: ração e destilados (bebidas do dia a dia, como cerveja, continuam)
const RUIDO = /racao|caes|gatos|whisky|vodka|gin /;
const POR_PAGINA = 40;

export default function Oportunidades() {
  const { dados, erro, tentarDeNovo } = useOfertas();
  const [mercado, setMercado] = useState('Todos');
  const [limite, setLimite] = useState(POR_PAGINA);
  const [semNotas, setSemNotas] = useState(false);

  useEffect(() => {
    supabase.from('compra').select('id', { count: 'exact', head: true }).then(({ count }) => setSemNotas(!count));
  }, []);

  const opp = useMemo(() => (dados?.lista ?? [])
    .filter((o) => o.de > o.preco && !RUIDO.test(o.busca))
    .map((o) => ({ o, desc: 1 - o.preco / o.de }))
    .filter((x) => x.desc >= 0.08 && x.desc <= 0.7)
    .sort((a, b) => b.desc - a.desc), [dados]);

  const mercados = ['Todos', ...(dados?.mercados ?? []).filter((m) => opp.some((x) => x.o.mercado === m))];
  const filtradas = opp.filter((x) => mercado === 'Todos' || x.o.mercado === mercado);
  const lista = filtradas.slice(0, limite);

  return (
    <>
      <BoasVindas />
      <div>
        <h1>Oportunidades de hoje</h1>
        <p className="lead">
          Maiores descontos sobre o preço normal de cada mercado
          {dados && <> · {dados.lista.length.toLocaleString('pt-BR')} preços de {dados.mercados.length} mercados em {dataBr(dados.dia)}</>}.
        </p>
      </div>
      {dados && <Fontes dados={dados} />}

      {semNotas && (
        <Link href="/notas" className="convite">
          <b>Envie suas notas fiscais</b>
          <span>Com 3 notas o app aprende o que você compra e passa a avisar dos seus produtos.</span>
        </Link>
      )}

      {erro && <ErroCarga tentarDeNovo={tentarDeNovo} />}
      {!dados && !erro && <Carregando />}
      {dados && (
        <>
          <div className="chips" role="group" aria-label="Filtrar por mercado">
            {mercados.map((m) => (
              <button key={m} type="button" className="chip" aria-pressed={m === mercado}
                onClick={() => { setMercado(m); setLimite(POR_PAGINA); }}>{m}</button>
            ))}
          </div>
          <div className="lista">
            {lista.map(({ o, desc }, i) => <LinhaOferta key={i} o={o} extra={<span className="off">−{Math.round(desc * 100)}%</span>} />)}
          </div>
          {filtradas.length > limite && (
            <button type="button" className="btn btn-secondary btn-block" onClick={() => setLimite(limite + POR_PAGINA)}>
              Mostrar mais ({filtradas.length - limite} restantes)
            </button>
          )}
        </>
      )}
    </>
  );
}

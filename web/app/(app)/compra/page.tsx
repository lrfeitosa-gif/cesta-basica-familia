'use client';
import { useEffect, useMemo, useState } from 'react';
import { brl, carregarOfertas, type Oferta, type Ofertas } from '@/lib/ofertas';
import { Carregando } from '../linha-oferta';

type ItemCesta = { id: string; rotulo: string; inc: string[]; q: number; u: string; exc: RegExp };

// Cesta básica de referência. Próxima etapa: montar a partir da lista de interesse da família.
const CESTA: ItemCesta[] = [
  { id: 'arroz', rotulo: 'Arroz branco 5 kg', inc: ['arroz'], q: 5, u: 'kg', exc: /integral|parboil|racao|arboreo|basmati|cateto|japon|7 graos|negro|vermelho/ },
  { id: 'feijao', rotulo: 'Feijão carioca 1 kg', inc: ['feijao', 'carioca'], q: 1, u: 'kg', exc: /pronto|cozido|caldo/ },
  { id: 'cafe', rotulo: 'Café torrado 500 g', inc: ['cafe'], q: 500, u: 'g', exc: /soluvel|capsul|cappuccino|bebida|graos/ },
  { id: 'oleo', rotulo: 'Óleo de soja 900 ml', inc: ['oleo', 'soja'], q: 900, u: 'ml', exc: /spray|composto/ },
  { id: 'acucar', rotulo: 'Açúcar refinado 1 kg', inc: ['acucar', 'refinado'], q: 1, u: 'kg', exc: /light|organico/ },
  { id: 'leite', rotulo: 'Leite longa vida 1 l', inc: ['leite'], q: 1, u: 'l', exc: /condensado|po |fermentado|coco|achocolat|creme|bebida|zero|sem lactose|desnatado|semi/ },
  { id: 'macarrao', rotulo: 'Macarrão espaguete 500 g', inc: ['macarrao', 'espaguete'], q: 500, u: 'g', exc: /instant|lamen|integral/ },
  { id: 'farinha', rotulo: 'Farinha de trigo 1 kg', inc: ['farinha', 'trigo'], q: 1, u: 'kg', exc: /integral|mistura/ },
  { id: 'molho', rotulo: 'Molho de tomate 300 g', inc: ['molho', 'tomate'], q: 300, u: 'g', exc: /pizza|picante/ },
  { id: 'detergente', rotulo: 'Detergente 500 ml', inc: ['detergente'], q: 500, u: 'ml', exc: /maquina|lava-loucas|lava loucas/ },
];
const PADRAO: Record<string, number> = { arroz: 1, feijao: 2, cafe: 1, oleo: 2, leite: 6, macarrao: 2 };

export default function MinhaCompra() {
  const [dados, setDados] = useState<Ofertas | null>(null);
  const [sel, setSel] = useState<Record<string, number>>(PADRAO);

  useEffect(() => {
    carregarOfertas().then(setDados).catch(() => {});
    try { const s = JSON.parse(localStorage.getItem('cesta-sel') || 'null'); if (s && Object.keys(s).length) setSel(s); } catch {}
  }, []);
  const mudar = (novo: Record<string, number>) => { setSel(novo); try { localStorage.setItem('cesta-sel', JSON.stringify(novo)); } catch {} };

  // menor preço de cada item em cada mercado
  const porItem = useMemo(() => {
    const r: Record<string, Record<string, Oferta>> = {};
    for (const c of CESTA) {
      r[c.id] = {};
      for (const o of dados?.lista ?? []) {
        if (o.u !== c.u || Math.abs(o.q - c.q) > 0.001 || !c.inc.every((t) => o.busca.includes(t)) || c.exc.test(o.busca)) continue;
        if (!r[c.id][o.mercado] || o.preco < r[c.id][o.mercado].preco) r[c.id][o.mercado] = o;
      }
    }
    return r;
  }, [dados]);

  if (!dados) return <><h1>Minha compra</h1><Carregando /></>;

  const itens = CESTA.filter((c) => sel[c.id]);
  const ranking = dados.mercados.map((m) => {
    let total = 0; const falta: string[] = [];
    for (const c of itens) { const o = porItem[c.id][m]; if (o) total += o.preco * sel[c.id]; else falta.push(c.rotulo); }
    return { m, total, falta };
  }).filter((r) => r.falta.length < itens.length).sort((a, b) => a.falta.length - b.falta.length || a.total - b.total);
  const completos = ranking.filter((r) => !r.falta.length);
  const top = completos[0], pior = completos[completos.length - 1];
  let ideal = 0; let idealOk = true;
  for (const c of itens) {
    const menor = Object.values(porItem[c.id]).sort((a, b) => a.preco - b.preco)[0];
    if (menor) ideal += menor.preco * sel[c.id]; else idealOk = false;
  }

  return (
    <>
      <div>
        <h1>Minha compra</h1>
        <p className="lead">Marque os itens. O app soma o mais barato de cada mercado e indica onde comprar.</p>
      </div>

      {!itens.length ? <div className="empty">Marque ao menos um item abaixo.</div> : top ? (
        <div className="destaque">
          <span className="muted">Melhor mercado único para esta compra</span>
          <span className="grande">{brl(top.total)}</span>
          <span><b>{top.m}</b>{completos.length > 1 && ` · ${brl(pior.total - top.total)} a menos que o ${pior.m}`}</span>
          {idealOk && <span className="muted">Comprando cada item no mais barato: {brl(ideal)}</span>}
        </div>
      ) : <div className="empty">Nenhum mercado tem todos os itens hoje. Veja abaixo o que falta em cada um.</div>}

      {itens.length > 0 && (
        <div className="ranking">
          {ranking.map((r) => (
            <div key={r.m}>
              <b>{r.m}</b><span className="total">{brl(r.total)}</span>
              {r.falta.length > 0 && <span className="falta">Falta: {r.falta.join(', ')}</span>}
            </div>
          ))}
        </div>
      )}

      <div className="lista cesta">
        {CESTA.map((c) => {
          const ativo = !!sel[c.id];
          const menor = Object.values(porItem[c.id]).sort((a, b) => a.preco - b.preco)[0];
          return (
            <div className="item" key={c.id}>
              <input type="checkbox" className="check" id={`ck-${c.id}`} checked={ativo}
                onChange={(e) => { const n = { ...sel }; if (e.target.checked) n[c.id] = 1; else delete n[c.id]; mudar(n); }} />
              <label className="nome" htmlFor={`ck-${c.id}`}>{c.rotulo}</label>
              <div className="qtd">
                {ativo && <>
                  <button type="button" aria-label={`Menos ${c.rotulo}`} onClick={() => mudar({ ...sel, [c.id]: Math.max(1, sel[c.id] - 1) })}>−</button>
                  <span>{sel[c.id]}</span>
                  <button type="button" aria-label={`Mais ${c.rotulo}`} onClick={() => mudar({ ...sel, [c.id]: sel[c.id] + 1 })}>+</button>
                </>}
              </div>
              <div className="meta">
                {menor ? <span>a partir de <b>{brl(menor.preco)}</b> no <span className="mkt">{menor.mercado}</span></span> : <span className="cond">sem preço hoje</span>}
                <span>{Object.keys(porItem[c.id]).length} mercados</span>
              </div>
            </div>
          );
        })}
      </div>
      <p className="muted">Item sem preço num mercado conta como faltando. Assaí e Pão de Açúcar só têm os itens dos encartes enviados.</p>
    </>
  );
}

'use client';
import { useEffect, useMemo, useState } from 'react';
import { brl, carregarOfertas, chaveMarca, type Oferta, type Ofertas } from '@/lib/ofertas';
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
// Mercados coletados só pelos encartes: item fora da promoção não aparece, mas a loja pode ter.
const ENCARTE = new Set(['Roldão', 'Sumerbol', 'Assaí', 'Pão de Açúcar']);
const PADRAO: Record<string, number> = { arroz: 1, feijao: 2, cafe: 1, oleo: 2, leite: 6, macarrao: 2 };

export default function MinhaCompra() {
  const [dados, setDados] = useState<Ofertas | null>(null);
  const [sel, setSel] = useState<Record<string, number>>(PADRAO);
  const [marcas, setMarcas] = useState<Record<string, string>>({});   // item -> marca fixada ('' = qualquer)

  useEffect(() => {
    carregarOfertas().then(setDados).catch(() => {});
    try { const s = JSON.parse(localStorage.getItem('cesta-sel') || 'null'); if (s && Object.keys(s).length) setSel(s); } catch {}
    try { setMarcas(JSON.parse(localStorage.getItem('cesta-marca') || '{}')); } catch {}
  }, []);
  const mudar = (novo: Record<string, number>) => { setSel(novo); try { localStorage.setItem('cesta-sel', JSON.stringify(novo)); } catch {} };
  const fixarMarca = (id: string, marca: string) => {
    const n = { ...marcas }; if (marca) n[id] = marca; else delete n[id];
    setMarcas(n); try { localStorage.setItem('cesta-marca', JSON.stringify(n)); } catch {}
  };

  // todas as ofertas que servem para cada item (qualquer marca)
  const candidatos = useMemo(() => {
    const r: Record<string, Oferta[]> = {};
    for (const c of CESTA) {
      r[c.id] = (dados?.lista ?? []).filter((o) =>
        o.u === c.u && Math.abs(o.q - c.q) < 0.001 && c.inc.every((t) => o.busca.includes(t)) && !c.exc.test(o.busca));
    }
    return r;
  }, [dados]);
  // marcas do item, sem repetir grafias e mostrando quantos mercados têm cada uma
  const marcasDe = (id: string) => {
    const m = new Map<string, { nome: string; mercados: Set<string> }>();
    for (const o of candidatos[id]) {
      const k = chaveMarca(o.marca);
      if (!k) continue;
      const v = m.get(k) ?? { nome: o.marca, mercados: new Set<string>() };
      v.mercados.add(o.mercado);
      m.set(k, v);
    }
    return [...m.entries()].map(([chave, v]) => ({ chave, nome: v.nome, mercados: v.mercados.size }))
      .sort((a, b) => b.mercados - a.mercados || a.nome.localeCompare(b.nome, 'pt-BR'));
  };

  // menor preço de cada item em cada mercado, respeitando a marca fixada
  const porItem = useMemo(() => {
    const r: Record<string, Record<string, Oferta>> = {};
    for (const c of CESTA) {
      r[c.id] = {};
      const marca = chaveMarca(marcas[c.id] ?? '');
      for (const o of candidatos[c.id]) {
        if (marca && chaveMarca(o.marca) !== marca) continue;
        if (!r[c.id][o.mercado] || o.preco < r[c.id][o.mercado].preco) r[c.id][o.mercado] = o;
      }
    }
    return r;
  }, [candidatos, marcas]);

  if (!dados) return <><h1>Minha compra</h1><Carregando /></>;

  const itens = CESTA.filter((c) => sel[c.id]);
  // média do item entre os mercados que têm preço: estimativa para quem não tem
  const media: Record<string, number> = {};
  for (const c of itens) {
    const ps = Object.values(porItem[c.id]).map((o) => o.preco);
    if (ps.length) media[c.id] = ps.reduce((s, p) => s + p, 0) / ps.length;
  }
  const ranking = dados.mercados.map((m) => {
    let total = 0; let estimado = 0; const falta: string[] = []; const escolhas: { c: ItemCesta; o: Oferta }[] = [];
    for (const c of itens) {
      const o = porItem[c.id][m];
      if (o) { total += o.preco * sel[c.id]; escolhas.push({ c, o }); }
      else { falta.push(c.rotulo); estimado += (media[c.id] ?? 0) * sel[c.id]; }
    }
    return { m, total, estimado, falta, escolhas };
  }).filter((r) => r.falta.length < itens.length)
    .sort((a, b) => a.falta.length - b.falta.length || a.total - b.total);
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
              <b>{r.m}</b>
              <span className="total">{r.falta.length ? `≈ ${brl(r.total + r.estimado)}` : brl(r.total)}</span>
              {r.falta.length > 0 && (
                <span className="falta">
                  Sem preço hoje: {r.falta.join(', ')}.{' '}
                  {ENCARTE.has(r.m) ? 'Este mercado só entra com os itens do encarte. ' : ''}
                  Estimado pela média dos outros mercados.
                </span>
              )}
              {r.escolhas.length > 0 && (
                <details>
                  <summary>Ver marcas e preços</summary>
                  <ul>
                    {r.escolhas.map(({ c, o }) => (
                      <li key={c.id}>{sel[c.id]}× {c.rotulo}: <b>{o.marca || 'marca não informada'}</b> {brl(o.preco)}</li>
                    ))}
                  </ul>
                </details>
              )}
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
                {menor
                  ? <span>a partir de <b>{brl(menor.preco)}</b> ({menor.marca || 'sem marca'}) no <span className="mkt">{menor.mercado}</span></span>
                  : <span className="cond">{marcas[c.id] ? 'esta marca não tem preço hoje' : 'sem preço hoje'}</span>}
                <span>{Object.keys(porItem[c.id]).length} mercados</span>
                {ativo && (marcasDe(c.id).length > 1 || marcas[c.id]) && (
                  <span className="row" style={{ gap: 6, flexBasis: '100%' }}>
                    <select className="marca-sel" aria-label={`Marca de ${c.rotulo}`} value={chaveMarca(marcas[c.id] ?? '')}
                      onChange={(e) => fixarMarca(c.id, e.target.value)}>
                      <option value="">Comparar qualquer marca</option>
                      {marcasDe(c.id).map((m) => (
                        <option key={m.chave} value={m.chave}>Só {m.nome} ({m.mercados} {m.mercados === 1 ? 'mercado' : 'mercados'})</option>
                      ))}
                    </select>
                    {marcas[c.id] && (
                      <button type="button" className="chip" onClick={() => fixarMarca(c.id, '')}>× qualquer marca</button>
                    )}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <p className="muted">
        Roldão, Sumerbol, Assaí e Pão de Açúcar entram só com os itens em promoção nos encartes. Quando falta preço,
        o total usa a média dos outros mercados e aparece com ≈. Os mercados com todos os itens vêm primeiro.
      </p>
    </>
  );
}

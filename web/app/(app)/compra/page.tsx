'use client';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { brl, chaveMarca, filtrar, grupo, norm, useOfertas, type Oferta } from '@/lib/ofertas';
import { Carregando, ErroCarga } from '../linha-oferta';

// Item fixo da cesta (regras de palavra + embalagem) ou item adicionado pela pessoa (busca por palavras).
type ItemCesta = { id: string; rotulo: string; inc?: string[]; q?: number; u?: string; exc?: RegExp; termo?: string; porKg?: boolean };
// "cebola kg": hortifruti vendido por unidade num mercado e por quilo em outro; compara pelo preço do quilo.
const PADRAO_KG = /(^|\s)kg(\s|$)/i;
const valor = (kg: boolean, o: Oferta) => (kg ? o.porUn : o.preco);
const ehHorti = (o: Oferta) => (o.u === 'g' || o.u === 'kg') && grupo(o.categoria) === 'Hortifruti';
// Frutas, legumes e verduras: item que começa com um destes nomes compara pelo preço do quilo, sem marca.
const HORTIFRUTI = new Set(('abacate abacaxi abobora abobrinha acelga agriao alface alho ameixa banana batata berinjela '
  + 'beterraba brocolis caqui cebola cebolinha cenoura cheiro chuchu coentro couve escarola espinafre gengibre goiaba '
  + 'inhame jilo kiwi laranja limao maca mamao mandioca mandioquinha manga maracuja melancia melao mexerica morango '
  + 'nabo pepino pera pessego pimentao ponkan quiabo rabanete repolho rucula salsa tangerina tomate uva vagem').split(' '));
const primeiraPalavra = (t: string) => norm(t).trim().split(/\s+/)[0] ?? '';
type Extra = { id: string; termo: string };

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
const ENCARTE = new Set(['Roldão', 'Sumerbol', 'Assaí']);
const PADRAO: Record<string, number> = { arroz: 1, feijao: 2, cafe: 1, oleo: 2, leite: 6, macarrao: 2 };

export default function MinhaCompra() {
  const { dados, erro, tentarDeNovo } = useOfertas();
  const [sel, setSel] = useState<Record<string, number>>(PADRAO);
  const [marcas, setMarcas] = useState<Record<string, string>>({});   // item -> marca fixada ('' = qualquer)
  const [extras, setExtras] = useState<Extra[]>([]);
  const [novo, setNovo] = useState('');

  useEffect(() => {
    try { const s = JSON.parse(localStorage.getItem('cesta-sel') || 'null'); if (s && Object.keys(s).length) setSel(s); } catch {}
    try { setMarcas(JSON.parse(localStorage.getItem('cesta-marca') || '{}')); } catch {}
    try { setExtras(JSON.parse(localStorage.getItem('cesta-extra') || '[]')); } catch {}
  }, []);
  const mudar = (novo: Record<string, number>) => { setSel(novo); try { localStorage.setItem('cesta-sel', JSON.stringify(novo)); } catch {} };
  const fixarMarca = (id: string, marca: string) => {
    const n = { ...marcas }; if (marca) n[id] = marca; else delete n[id];
    setMarcas(n); try { localStorage.setItem('cesta-marca', JSON.stringify(n)); } catch {}
  };

  const salvarExtras = (l: Extra[]) => { setExtras(l); try { localStorage.setItem('cesta-extra', JSON.stringify(l)); } catch {} };
  const adicionar = (e: FormEvent) => {
    e.preventDefault();
    const termo = novo.trim();
    if (!termo) return;
    const id = `x-${Date.now()}`;
    salvarExtras([...extras, { id, termo }]);
    mudar({ ...sel, [id]: 1 });
    setNovo('');
  };
  const remover = (id: string) => {
    salvarExtras(extras.filter((x) => x.id !== id));
    const n = { ...sel }; delete n[id]; mudar(n);
  };
  const todos: ItemCesta[] = useMemo(() => [...CESTA, ...extras.map((x) => ({ id: x.id, rotulo: x.termo, termo: x.termo, porKg: PADRAO_KG.test(x.termo) }))], [extras]);

  // todas as ofertas que servem para cada item (qualquer marca). Item de hortifruti (com "kg" no nome ou quando
  // a maior parte do que a busca encontra é fruta, legume ou verdura) compara pelo preço do quilo, sem marca.
  const { candidatos, kgs } = useMemo(() => {
    const r: Record<string, Oferta[]> = {};
    const kgs = new Set<string>();
    const lista = dados?.lista ?? [];
    for (const c of todos) {
      if (c.termo) {
        const termo = c.termo.replace(PADRAO_KG, ' ');
        if (c.porKg || HORTIFRUTI.has(primeiraPalavra(termo))) {
          // só a fruta/verdura in natura: categoria hortifruti, vendida por peso, com o nome começando pela palavra
          const inicio = primeiraPalavra(termo);
          kgs.add(c.id);
          r[c.id] = filtrar(lista, termo).filter((o) => ehHorti(o) && norm(o.nome).startsWith(inicio));
        } else {
          r[c.id] = filtrar(lista, termo);
        }
        continue;
      }
      r[c.id] = lista.filter((o) =>
        o.u === c.u && Math.abs(o.q - c.q!) < 0.001 && c.inc!.every((t) => o.busca.includes(t)) && !c.exc!.test(o.busca));
    }
    return { candidatos: r, kgs };
  }, [dados, todos]);
  const novoPrevia = useMemo(() => (dados && novo.trim() ? filtrar(dados.lista, novo).length : null), [dados, novo]);
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
    for (const c of todos) {
      r[c.id] = {};
      const marca = chaveMarca(marcas[c.id] ?? '');
      for (const o of candidatos[c.id]) {
        if (marca && chaveMarca(o.marca) !== marca) continue;
        if (!r[c.id][o.mercado] || valor(kgs.has(c.id), o) < valor(kgs.has(c.id), r[c.id][o.mercado])) r[c.id][o.mercado] = o;
      }
    }
    return r;
  }, [candidatos, kgs, marcas, todos]);

  if (erro) return <><h1>Minha compra</h1><ErroCarga tentarDeNovo={tentarDeNovo} /></>;
  if (!dados) return <><h1>Minha compra</h1><Carregando /></>;

  const itens = todos.filter((c) => sel[c.id]);
  // média do item entre os mercados que têm preço: estimativa para quem não tem
  const media: Record<string, number> = {};
  for (const c of itens) {
    const ps = Object.values(porItem[c.id]).map((o) => valor(kgs.has(c.id), o));
    if (ps.length) media[c.id] = ps.reduce((s, p) => s + p, 0) / ps.length;
  }
  const ranking = dados.mercados.map((m) => {
    let total = 0; let estimado = 0; const falta: string[] = []; const escolhas: { c: ItemCesta; o: Oferta }[] = [];
    for (const c of itens) {
      const o = porItem[c.id][m];
      if (o) { total += valor(kgs.has(c.id), o) * sel[c.id]; escolhas.push({ c, o }); }
      else { falta.push(c.rotulo); estimado += (media[c.id] ?? 0) * sel[c.id]; }
    }
    return { m, total, estimado, falta, escolhas };
  }).filter((r) => r.falta.length < itens.length)
    .sort((a, b) => a.falta.length - b.falta.length || a.total - b.total);
  const completos = ranking.filter((r) => !r.falta.length);
  // compara com o segundo mais barato (a alternativa real) e mostra também o mais caro
  const top = completos[0], segundo = completos[1], pior = completos[completos.length - 1];
  let ideal = 0; let idealOk = true;
  for (const c of itens) {
    const menor = Object.values(porItem[c.id]).sort((a, b) => valor(kgs.has(c.id), a) - valor(kgs.has(c.id), b))[0];
    if (menor) ideal += valor(kgs.has(c.id), menor) * sel[c.id]; else idealOk = false;
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
          <span><b>{top.m}</b>{segundo && ` · ${brl(segundo.total - top.total)} a menos que o 2º mais barato (${segundo.m})`}</span>
          {pior && pior !== segundo && pior !== top && (
            <span className="muted">Até {brl(pior.total - top.total)} a menos que o mais caro ({pior.m})</span>
          )}
          {idealOk && <span className="muted">Comprando cada item no mais barato: {brl(ideal)}</span>}
        </div>
      ) : <div className="empty">Nenhum mercado tem todos os itens hoje. Veja abaixo o que falta em cada um.</div>}

      <h2>Itens da compra</h2>
      <form className="card stack" onSubmit={adicionar}>
        <div className="field">
          <label htmlFor="novo-item">Adicionar item</label>
          <div className="row" style={{ flexWrap: 'nowrap' }}>
            <input id="novo-item" className="input" autoComplete="off" placeholder="Ex.: heineken 350ml, sabão em pó omo 1,6kg"
              value={novo} onChange={(e) => setNovo(e.target.value)} style={{ flex: 1, minWidth: 0 }} />
            <button className="btn btn-primary" disabled={!novo.trim()}>Adicionar</button>
          </div>
          <span className="help">
            {novoPrevia === null ? 'Inclua o tamanho (350ml, 1kg). Para frutas e verduras, termine com "kg" (ex.: cebola kg) para comparar pelo preço do quilo.'
              : novoPrevia ? `${novoPrevia} preços encontrados hoje.` : 'Nenhum preço hoje com essas palavras. Tente menos palavras.'}
          </span>
        </div>
      </form>
      <div className="lista cesta">
        {todos.map((c) => {
          const ativo = !!sel[c.id];
          const menor = Object.values(porItem[c.id]).sort((a, b) => valor(kgs.has(c.id), a) - valor(kgs.has(c.id), b))[0];
          return (
            <div className="item" key={c.id}>
              <input type="checkbox" className="check" id={`ck-${c.id}`} checked={ativo}
                onChange={(e) => { const n = { ...sel }; if (e.target.checked) n[c.id] = 1; else delete n[c.id]; mudar(n); }} />
              <label className="nome" htmlFor={`ck-${c.id}`}>
                {c.rotulo}
                {c.termo && (
                  <button type="button" className="btn-remover" onClick={() => remover(c.id)} aria-label={`Remover ${c.rotulo}`}>remover</button>
                )}
              </label>
              <div className="qtd">
                {ativo && <>
                  <button type="button" aria-label={`Menos ${c.rotulo}`} onClick={() => mudar({ ...sel, [c.id]: Math.max(1, sel[c.id] - 1) })}>−</button>
                  <span>{sel[c.id]}{kgs.has(c.id) ? ' kg' : ''}</span>
                  <button type="button" aria-label={`Mais ${c.rotulo}`} onClick={() => mudar({ ...sel, [c.id]: sel[c.id] + 1 })}>+</button>
                </>}
              </div>
              <div className="meta">
                {menor
                  ? <span>a partir de <b>{brl(valor(kgs.has(c.id), menor))}{kgs.has(c.id) ? '/kg' : ''}</b> ({kgs.has(c.id) ? menor.nome : menor.marca || 'sem marca'}) no <span className="mkt">{menor.mercado}</span></span>
                  : <span className="cond">{marcas[c.id] ? 'esta marca não tem preço hoje' : 'sem preço hoje'}</span>}
                <span>{Object.keys(porItem[c.id]).length} mercados</span>
                {kgs.has(c.id) && <span className="fonte fonte-site">por kg</span>}
                {ativo && !kgs.has(c.id) && (marcasDe(c.id).length > 1 || marcas[c.id]) && (
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

      {itens.length > 0 && <h2>Total em cada mercado</h2>}
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
                      <li key={c.id}>{sel[c.id]}{kgs.has(c.id) ? ' kg' : '×'} {c.rotulo}: <b>{kgs.has(c.id) ? o.nome : o.marca || 'marca não informada'}</b> {brl(valor(kgs.has(c.id), o))}{kgs.has(c.id) ? '/kg' : ''}</li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          ))}
        </div>
      )}
      <p className="muted">
        Roldão, Sumerbol e Assaí entram só com os itens em promoção nos encartes. Quando falta preço,
        o total usa a média dos outros mercados e aparece com ≈. Os mercados com todos os itens vêm primeiro.
      </p>
    </>
  );
}

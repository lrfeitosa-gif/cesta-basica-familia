'use client';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { brl, chaveMarca, filtrar, filtrarFoco, grupo, norm, useOfertas, type Oferta } from '@/lib/ofertas';
import { Carregando, ErroCarga } from '../linha-oferta';

// Item fixo da cesta (regras de palavra + embalagem) ou item adicionado pela pessoa (busca por palavras).
type ItemCesta = { id: string; rotulo: string; inc?: string[]; q?: number; u?: string; exc?: RegExp; termo?: string; porKg?: boolean };
// "cebola kg": hortifruti vendido por unidade num mercado e por quilo em outro; compara pelo preço do quilo.
const PADRAO_KG = /(^|\s)kg(\s|$)/i;
// Tamanho escrito pela pessoa ("azeite 500ml", "ovos 30un"); sem ele, o item compara pelo preço do litro/quilo/unidade.
const TEM_TAMANHO = /\d+(?:[.,]\d+)?\s*(kg|g|ml|l|lt|litros?|un)(\s|$)/i;
// Produtos diferentes que começam com a mesma palavra: ficam de fora, a menos que a pessoa escreva a variante.
const VARIANTES: [RegExp, RegExp][] = [
  [/^azeite(\s|$)/, /dende/],
  [/^oleo(\s|$)/, /composto|misto/],
  [/^leite(\s|$)/, /condensado|em po|fermentado|de coco|vegetal/],
  [/^acucar(\s|$)/, /confeiteiro|mascavo|demerara|organico/],
];
const tirarVariantes = (termo: string, l: Oferta[]) => {
  const t = norm(termo);
  const fora = VARIANTES.filter(([p, v]) => p.test(t) && !v.test(t)).map(([, v]) => v);
  return fora.length ? l.filter((o) => !fora.some((v) => v.test(norm(o.nome)))) : l;
};
// Tamanho mais comum entre as ofertas (litros, quilos ou unidades, como bandejas de ovos): vira a referência do item sem tamanho.
function tamanhoReferencia(l: Oferta[]): { base: number; ub: string } | null {
  const conta = new Map<string, number>();
  for (const o of l) {
    if (o.ub !== 'l' && o.ub !== 'kg' && o.ub !== 'un') continue;
    const base = o.porUn ? Math.round((o.preco / o.porUn) * 1000) / 1000 : 0;   // embalagem em litros/quilos
    if (!base) continue;
    const k = `${base}|${o.ub}`;
    conta.set(k, (conta.get(k) ?? 0) + 1);
  }
  const [k] = [...conta.entries()].sort((a, b) => b[1] - a[1])[0] ?? [];
  if (!k) return null;
  const [base, ub] = k.split('|');
  return { base: Number(base), ub };
}
const fmtTam = (r: { base: number; ub: string }) =>
  r.ub === 'un' ? `${r.base} un` : r.base < 1 ? `${Math.round(r.base * 1000)} ${r.ub === 'l' ? 'ml' : 'g'}` : `${String(r.base).replace('.', ',')} ${r.ub}`;
const ehHorti = (o: Oferta) => (o.u === 'g' || o.u === 'kg') && grupo(o.categoria) === 'Hortifruti';
// Frutas, legumes e verduras: item que começa com um destes nomes compara pelo preço do quilo, sem marca.
const HORTIFRUTI = new Set(('abacate abacaxi abobora abobrinha acelga agriao alface alho ameixa banana batata berinjela '
  + 'beterraba brocolis caqui cebola cebolinha cenoura cheiro chuchu coentro couve escarola espinafre gengibre goiaba '
  + 'inhame jilo kiwi laranja limao maca mamao mandioca mandioquinha manga maracuja melancia melao mexerica morango '
  + 'nabo pepino pera pessego pimentao ponkan quiabo rabanete repolho rucula salsa tangerina tomate uva vagem').split(' '));
const primeiraPalavra = (t: string) => norm(t).trim().split(/\s+/)[0] ?? '';
const pareceHortiFixo = (t: string) => PADRAO_KG.test(t) || HORTIFRUTI.has(primeiraPalavra(t.replace(PADRAO_KG, ' ')));
type Extra = { id: string; termo: string; horti?: boolean };   // horti: escolhido pela pessoa (caixa "é hortifruti")
// No modo hortifruti, só a fruta/verdura in natura: fora os processados.
const PROCESSADO = /triturad|picad|frit|desidrat|pasta|conserva|em po|chips|passa|polpa|congelad|molho|tempero|doce de|geleia|suco|creme|farinha|palha/;

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
  const [novoHorti, setNovoHorti] = useState<boolean | null>(null);   // null = o app decide pelo nome
  const [avisoNovo, setAvisoNovo] = useState('');

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
  const pareceHorti = (t: string) => PADRAO_KG.test(t) || HORTIFRUTI.has(primeiraPalavra(t.replace(PADRAO_KG, ' ')));
  const novoEhHorti = novoHorti ?? pareceHorti(novo);
  const adicionar = (e: FormEvent) => {
    e.preventDefault();
    const termo = novo.trim().replace(/\s+/g, ' ');
    if (!termo) return;
    const chave = norm(termo.replace(PADRAO_KG, ' ')).trim();
    const repetido = [...CESTA.map((c) => c.rotulo), ...extras.map((x) => x.termo)]
      .find((t) => norm(t.replace(PADRAO_KG, ' ')).trim() === chave);
    if (repetido) return setAvisoNovo(`"${repetido}" já está na sua compra. Ajuste a quantidade no item.`);
    const id = `x-${Date.now()}`;
    salvarExtras([...extras, { id, termo, horti: novoEhHorti }]);
    mudar({ ...sel, [id]: 1 });
    setNovo(''); setNovoHorti(null); setAvisoNovo('');
  };
  const trocarHorti = (id: string, horti: boolean) => salvarExtras(extras.map((x) => (x.id === id ? { ...x, horti } : x)));
  const remover = (id: string) => {
    salvarExtras(extras.filter((x) => x.id !== id));
    const n = { ...sel }; delete n[id]; mudar(n);
  };
  const todos: ItemCesta[] = useMemo(() => [...CESTA, ...extras.map((x) => ({ id: x.id, rotulo: x.termo, termo: x.termo, porKg: x.horti ?? pareceHortiFixo(x.termo) }))], [extras]);

  // todas as ofertas que servem para cada item (qualquer marca). Item de hortifruti (com "kg" no nome ou quando
  // a maior parte do que a busca encontra é fruta, legume ou verdura) compara pelo preço do quilo, sem marca.
  const { candidatos, kgs, refs } = useMemo(() => {
    const r: Record<string, Oferta[]> = {};
    const kgs = new Set<string>();
    const refs: Record<string, { base: number; ub: string }> = {};
    const lista = dados?.lista ?? [];
    for (const c of todos) {
      if (c.termo) {
        const termo = c.termo.replace(PADRAO_KG, ' ');
        if (c.porKg) {
          // só a fruta/verdura in natura: categoria hortifruti, vendida por peso, nome começando pela palavra, sem processados
          const inicio = primeiraPalavra(termo);
          kgs.add(c.id);
          r[c.id] = filtrar(lista, termo).filter((o) => ehHorti(o) && norm(o.nome).startsWith(inicio) && !PROCESSADO.test(norm(o.nome)));
        } else {
          r[c.id] = tirarVariantes(termo, filtrarFoco(lista, termo));
          if (!TEM_TAMANHO.test(termo)) {
            // sem tamanho: compara pelo preço do litro/quilo, com o tamanho mais comum como referência
            const ref = tamanhoReferencia(r[c.id]);
            if (ref) { refs[c.id] = ref; r[c.id] = r[c.id].filter((o) => o.ub === ref.ub); }
          }
        }
        continue;
      }
      r[c.id] = lista.filter((o) =>
        o.u === c.u && Math.abs(o.q - c.q!) < 0.001 && c.inc!.every((t) => o.busca.includes(t)) && !c.exc!.test(o.busca));
    }
    return { candidatos: r, kgs, refs };
  }, [dados, todos]);
  // preço usado na comparação: por kg (hortifruti), pelo tamanho de referência (sem tamanho) ou o da etiqueta
  const v = (c: ItemCesta, o: Oferta) => (kgs.has(c.id) ? o.porUn : refs[c.id] ? o.porUn * refs[c.id].base : o.preco);
  const novoPrevia = useMemo(() => (dados && novo.trim() ? filtrarFoco(dados.lista, novo).length : null), [dados, novo]);
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
        if (!r[c.id][o.mercado] || v(c, o) < v(c, r[c.id][o.mercado])) r[c.id][o.mercado] = o;
      }
    }
    return r;
  }, [candidatos, kgs, refs, marcas, todos]);

  if (erro) return <><h1>Minha compra</h1><ErroCarga tentarDeNovo={tentarDeNovo} /></>;
  if (!dados) return <><h1>Minha compra</h1><Carregando /></>;

  const itens = todos.filter((c) => sel[c.id]);
  // média do item entre os mercados que têm preço: estimativa para quem não tem
  const media: Record<string, number> = {};
  for (const c of itens) {
    const ps = Object.values(porItem[c.id]).map((o) => v(c, o));
    if (ps.length) media[c.id] = ps.reduce((s, p) => s + p, 0) / ps.length;
  }
  const ranking = dados.mercados.map((m) => {
    let total = 0; let estimado = 0; const falta: string[] = []; const escolhas: { c: ItemCesta; o: Oferta }[] = [];
    for (const c of itens) {
      const o = porItem[c.id][m];
      if (o) { total += v(c, o) * sel[c.id]; escolhas.push({ c, o }); }
      else { falta.push(c.rotulo); estimado += (media[c.id] ?? 0) * sel[c.id]; }
    }
    return { m, total, estimado, falta, escolhas, valor: total + estimado };
  }).filter((r) => r.falta.length < itens.length)
    .sort((a, b) => a.valor - b.valor);   // do menor para o maior valor mostrado (≈ inclui os itens estimados)
  const completos = ranking.filter((r) => !r.falta.length);
  // compara com o segundo mais barato (a alternativa real) e mostra também o mais caro
  const top = ranking[0], segundo = ranking[1], pior = ranking[ranking.length - 1];
  const melhorCompleto = top?.falta.length ? completos[0] : undefined;
  const fmt = (r: { valor: number; falta: string[] }) => `${r.falta.length ? '≈ ' : ''}${brl(r.valor)}`;
  let ideal = 0; let idealOk = true;
  for (const c of itens) {
    const menor = Object.values(porItem[c.id]).sort((a, b) => v(c, a) - v(c, b))[0];
    if (menor) ideal += v(c, menor) * sel[c.id]; else idealOk = false;
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
          <span className="grande">{fmt(top)}</span>
          <span><b>{top.m}</b>{segundo && ` · ${brl(segundo.valor - top.valor)} a menos que o 2º mais barato (${segundo.m})`}</span>
          {top.falta.length > 0 && (
            <span className="cond">
              Sem preço hoje no {top.m}: {top.falta.join(', ')} (estimado pela média dos outros mercados).
            </span>
          )}
          {melhorCompleto && (
            <span className="muted">Melhor com todos os itens: <b>{melhorCompleto.m}</b>, {brl(melhorCompleto.valor)}</span>
          )}
          {pior && pior !== segundo && pior !== top && (
            <span className="muted">Até {brl(pior.valor - top.valor)} a menos que o mais caro ({pior.m})</span>
          )}
          {idealOk && <span className="muted">Comprando cada item no mais barato: {brl(ideal)}</span>}
        </div>
      ) : null}

      <h2>Itens da compra</h2>
      <form className="card stack" onSubmit={adicionar}>
        <div className="field">
          <label htmlFor="novo-item">Adicionar item</label>
          <div className="row" style={{ flexWrap: 'nowrap' }}>
            <input id="novo-item" className="input" autoComplete="off" placeholder="Ex.: heineken 350ml, alho, sabão em pó omo 1,6kg"
              value={novo} onChange={(e) => { setNovo(e.target.value); setAvisoNovo(''); }} style={{ flex: 1, minWidth: 0 }} />
            <button className="btn btn-primary" disabled={!novo.trim()}>Adicionar</button>
          </div>
          <label className="row" style={{ gap: 8, fontWeight: 600 }}>
            <input type="checkbox" className="check" checked={novoEhHorti} onChange={(e) => setNovoHorti(e.target.checked)} />
            É fruta, legume ou verdura (compara pelo preço do quilo, sem marca)
          </label>
          <span className="help">
            {novoPrevia === null ? 'Para produtos embalados, inclua o tamanho (350ml, 1kg). A caixa de hortifruti é marcada sozinha quando reconhecemos o nome.'
              : novoPrevia ? `${novoPrevia} preços encontrados hoje.` : 'Nenhum preço hoje com essas palavras. Tente menos palavras.'}
          </span>
          {avisoNovo && <div className="alert alert-error" role="alert">{avisoNovo}</div>}
        </div>
      </form>
      <div className="lista cesta">
        {todos.map((c) => {
          const ativo = !!sel[c.id];
          const menor = Object.values(porItem[c.id]).sort((a, b) => v(c, a) - v(c, b))[0];
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
                  ? <span>a partir de <b>{brl(v(c, menor))}{kgs.has(c.id) ? '/kg' : ''}</b>{refs[c.id] ? ` por ${fmtTam(refs[c.id])}` : ''} ({kgs.has(c.id) ? menor.nome : menor.marca || 'sem marca'}) no <span className="mkt">{menor.mercado}</span></span>
                  : <span className="cond">{marcas[c.id] ? 'esta marca não tem preço hoje' : 'sem preço hoje'}</span>}
                <span>{Object.keys(porItem[c.id]).length} mercados</span>
                {c.termo && (
                  <label className="row" style={{ gap: 6 }}>
                    <input type="checkbox" checked={kgs.has(c.id)} onChange={(e) => trocarHorti(c.id, e.target.checked)} />
                    hortifruti (por kg)
                  </label>
                )}
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
              <span className="total">{fmt(r)}</span>
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
                      <li key={c.id}>{sel[c.id]}{kgs.has(c.id) ? ' kg' : '×'} {c.rotulo}{refs[c.id] ? ` (${fmtTam(refs[c.id])})` : ''}: <b>{o.nome}</b>{' '}
                        {brl(o.preco)}{(kgs.has(c.id) || refs[c.id]) && <> · {brl(o.porUn)}/{o.ub}</>}</li>
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
        o total usa a média dos outros mercados e aparece com ≈. A lista vai do menor para o maior valor.
      </p>
    </>
  );
}

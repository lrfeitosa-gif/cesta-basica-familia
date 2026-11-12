'use client';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { brl, chaveMarca, filtrar, filtrarFoco, grupo, norm, SO_SOCIOS, useOfertas, type Oferta } from '@/lib/ofertas';
import { Carregando, ErroCarga, TagSocios } from '../linha-oferta';
import { useSessao } from '@/lib/sessao';
import { supabase } from '@/lib/supabase';
import { fmtKm, km, useLocais } from '@/lib/locais';
import Enderecos from './enderecos';
import { registrar } from '@/lib/eventos';
import { CHAVE_CESTA } from '../primeiros-passos';

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
  [/^ovos?(\s|$)/, /codorna|pascoa|chocolate|conserva/],
  // "chocolate barra" não é barra de cereal/fruta/proteína sabor chocolate
  [/^(chocolate|barra)(\s|$)/, /cereal|fruta|granola|prote|nutry|sucrilhos|cookie|biscoito|bolo|wafer|achocolatado|bebida/],
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
// Itens contados por unidade mesmo quando o site informa o peso (cápsulas: "10 Cápsulas 110g", "18x4,4g").
const POR_UNIDADE = /(^|\s)capsulas?(\s|$)/;
const contagem = (o: Oferta) => {
  if (o.u === 'un') return o.q;
  const n = norm(o.nome);
  const m = n.match(/(\d+)\s*(capsulas?|unidades?|unid|un)\b/) ?? n.match(/(\d+)\s*x\s*\d/);
  return m ? Number(m[1]) : 0;
};
// Mediana: um preço fora da curva (cadastro errado num mercado) não puxa a estimativa.
const mediana = (xs: number[]) => {
  const o = [...xs].sort((a, b) => a - b), k = Math.floor(o.length / 2);
  return o.length % 2 ? o[k] : (o[k - 1] + o[k]) / 2;
};
const ehHorti = (o: Oferta) => (o.u === 'g' || o.u === 'kg') && grupo(o.categoria) === 'Hortifruti';
// Frutas, legumes e verduras: item que começa com um destes nomes compara pelo preço do quilo, sem marca.
const HORTIFRUTI = new Set(('abacate abacaxi abobora abobrinha acelga agriao alface alho ameixa banana batata berinjela '
  + 'beterraba brocolis caqui cebola cebolinha cenoura cheiro chuchu coentro couve escarola espinafre gengibre goiaba '
  + 'inhame jilo kiwi laranja limao maca mamao mandioca mandioquinha manga maracuja melancia melao mexerica morango '
  + 'nabo pepino pera pessego pimentao ponkan quiabo rabanete repolho rucula salsa tangerina tomate uva vagem').split(' '));
const primeiraPalavra = (t: string) => norm(t).trim().split(/\s+/)[0] ?? '';
const pareceHortiFixo = (t: string) => PADRAO_KG.test(t) || HORTIFRUTI.has(primeiraPalavra(t.replace(PADRAO_KG, ' ')));
// Abreviações comuns nas notas fiscais (NFC-e) -> palavra inteira para a busca.
const ABREV: Record<string, string> = {
  choc: 'chocolate', chocol: 'chocolate', achoc: 'achocolatado', desinf: 'desinfetante', deterg: 'detergente',
  salg: 'salgadinho', refrig: 'refrigerante', refri: 'refrigerante', cerv: 'cerveja', bisc: 'biscoito', biscr: 'biscoito',
  bol: 'bolacha', iog: 'iogurte', qjo: 'queijo', qj: 'queijo', pres: 'presunto', mort: 'mortadela', marg: 'margarina',
  requeij: 'requeijao', req: 'requeijao', amac: 'amaciante', macarr: 'macarrao', mac: 'macarrao', extr: 'extrato',
  lte: 'leite', cond: 'condensado', frgo: 'frango', fgo: 'frango', sab: 'sabao', sabon: 'sabonete', esp: 'esponja',
  hig: 'higienico', pap: 'papel', ref: 'refrigerante', tom: 'tomate', ceb: 'cebola', bat: 'batata', ban: 'banana',
  azeit: 'azeite', marac: 'maracuja', moz: 'mussarela', mus: 'mussarela', muss: 'mussarela', mussar: 'mussarela',
  cr: 'creme', sach: 'sache', limp: 'limpador', past: 'pasta', dent: 'dental', shamp: 'shampoo',
  linguic: 'linguica', ling: 'linguica', hamb: 'hamburguer', salsic: 'salsicha',
};
// Aplica as abreviações palavra a palavra ("Choc barra" -> "chocolate barra").
const semAbrev = (t: string) => norm(t).split(/\s+/).map((w) => ABREV[w] ?? w).join(' ');
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
const ENCARTE = new Set(['Roldão', 'Sumerbol', 'Assaí', 'Sonda', 'Revolução', 'Cato']);
const PADRAO: Record<string, number> = { arroz: 1, feijao: 2, cafe: 1, oleo: 2, leite: 6, macarrao: 2 };

export default function MinhaCompra() {
  const { dados, erro, tentarDeNovo } = useOfertas();
  const sessao = useSessao();
  const locais = useLocais(sessao?.user.id);
  const [sel, setSel] = useState<Record<string, number>>(PADRAO);
  const [marcas, setMarcas] = useState<Record<string, string>>({});   // item -> marca fixada ('' = qualquer)
  const [extras, setExtras] = useState<Extra[]>([]);
  const [novo, setNovo] = useState('');
  const [novoHorti, setNovoHorti] = useState<boolean | null>(null);   // null = o app decide pelo nome
  const [avisoNovo, setAvisoNovo] = useState('');
  const [aba, setAbaEstado] = useState<'lista' | 'comparar'>('lista');
  // a aba escolhida vale durante a visita: voltar de outra tela não perde o lugar
  const setAba = (a: 'lista' | 'comparar') => { setAbaEstado(a); try { sessionStorage.setItem('compra-aba', a); } catch {} };
  useEffect(() => { try { if (sessionStorage.getItem('compra-aba') === 'comparar') setAbaEstado('comparar'); } catch {} }, []);

  useEffect(() => {
    try { const s = JSON.parse(localStorage.getItem('cesta-sel') || 'null'); if (s) setSel(s); } catch {}
    try { setMarcas(JSON.parse(localStorage.getItem('cesta-marca') || '{}')); } catch {}
    try { setExtras(JSON.parse(localStorage.getItem('cesta-extra') || '[]')); } catch {}
  }, []);
  const mudar = (novo: Record<string, number>) => {
    setSel(novo); try { localStorage.setItem('cesta-sel', JSON.stringify(novo)); } catch {}
    // 1º item na Cesta: registra uma vez (card de primeiros passos e lista "precisa de ajuda" do painel)
    if (Object.keys(novo).length) { try { if (!localStorage.getItem(CHAVE_CESTA)) { localStorage.setItem(CHAVE_CESTA, '1'); registrar('cesta_montada'); } } catch {} }
  };
  const fixarMarca = (id: string, marca: string) => {
    const n = { ...marcas }; if (marca) n[id] = marca; else delete n[id];
    setMarcas(n); try { localStorage.setItem('cesta-marca', JSON.stringify(n)); } catch {}
  };

  const salvarExtras = (l: Extra[]) => { setExtras(l); try { localStorage.setItem('cesta-extra', JSON.stringify(l)); } catch {} };
  // A lista já é gravada a cada mudança (neste aparelho); o botão grava de novo e confirma para a pessoa.
  const [salvo, setSalvo] = useState('');
  const salvarLista = () => {
    try {
      localStorage.setItem('cesta-sel', JSON.stringify(sel));
      localStorage.setItem('cesta-extra', JSON.stringify(extras));
      localStorage.setItem('cesta-marca', JSON.stringify(marcas));
      const n = Object.keys(sel).length;
      setSalvo(`Lista salva neste aparelho: ${n} ${n === 1 ? 'item' : 'itens'}.`);
    } catch {
      setSalvo('Não foi possível salvar: o navegador está bloqueando o armazenamento (modo anônimo?).');
    }
  };
  useEffect(() => { setSalvo(''); }, [sel, extras, marcas]);
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
  // Monta a compra com os itens da última nota enviada: cada linha vira o item da cesta com a mesma palavra
  // principal (ou um item novo), com a quantidade comprada. Linhas sem oferta parecida nos mercados ficam de fora.
  const [avisoNota, setAvisoNota] = useState('');
  // Com itens já marcados, pergunta antes: juntar a nota à lista ou trocar a lista pela nota.
  const [notaPendente, setNotaPendente] = useState<{ id?: number } | null>(null);
  const usarNota = async (notaId?: number, modo?: 'juntar' | 'substituir') => {
    if (!dados) return setAvisoNota('Aguarde um instante: os preços de hoje ainda estão carregando.');
    if (!modo && Object.keys(sel).length) { setAvisoNota(''); setNotaPendente({ id: notaId }); return; }
    setNotaPendente(null);
    const juntar = modo === 'juntar';
    setAvisoNota(notaId ? 'Lendo a nota…' : 'Lendo sua última nota…');
    let q = supabase.from('compra').select('data,itens:item_comprado(descricao_nota,quantidade)');
    if (notaId) q = q.eq('id', notaId);
    const { data } = await q.order('data', { ascending: false }).order('id', { ascending: false }).limit(1);
    setAba('lista');
    const itensNota = (data?.[0]?.itens ?? []) as { descricao_nota: string; quantidade: number }[];
    if (!itensNota.length) return setAvisoNota('Nenhuma nota enviada ainda. Envie uma na aba Notas.');
    const lista = dados?.lista ?? [];
    const vocab = new Map<string, number>();
    for (const o of lista) for (const w of norm(o.nome).split(/[^a-z]+/)) if (w.length >= 3) vocab.set(w, (vocab.get(w) ?? 0) + 1);
    const expandir = (w: string) => {
      if (ABREV[w]) return ABREV[w];
      // palavra rara ("desinf", "salg", "choc" aparecem em poucos nomes) vira a mais comum que começa com ela
      let melhor = w, n = vocab.get(w) ?? 0;
      if (n >= 20) return w;
      for (const [k, c] of vocab) if (k !== w && k.startsWith(w) && c > n) { melhor = k; n = c; }
      return melhor;
    };
    // juntar: parte da lista atual; item que já está nela fica com a maior quantidade (lista ou nota)
    const novoSel: Record<string, number> = juntar ? { ...sel } : {};
    const novosExtras: Extra[] = juntar ? [...extras] : [];
    const daNota: Record<string, number> = {};
    const somar = (id: string, qtd: number) => { daNota[id] = (daNota[id] ?? 0) + qtd; };
    const ignorados: string[] = [];
    itensNota.forEach((it, i) => {
      // palavras da nota ("DESINF BAK YPE 2L", "TOALHA PAPEL SNOB"): abreviações viram a palavra inteira mais comum
      // nas ofertas ("desinf" -> "desinfetante"); usa as 2 primeiras se juntas acham ofertas ("toalha papel"), senão 1.
      const ws = norm(it.descricao_nota).split(/[^a-z]+/).filter((w) => w.length >= 3).slice(0, 2).map(expandir);
      const palavra = ws.length > 1 && filtrar(lista, ws.join(' ')).length ? ws.join(' ') : ws[0];
      const qtd = Math.max(1, Math.round(Number(it.quantidade) || 1));
      const fixo = palavra && CESTA.find((c) => c.inc?.[0] === palavra.split(' ')[0]);
      if (fixo) { somar(fixo.id, qtd); return; }
      const ja = palavra && novosExtras.find((x) => norm(semAbrev(x.termo)) === palavra);
      if (ja) { somar(ja.id, qtd); return; }
      if (!palavra || !filtrar(lista, palavra).length) { ignorados.push(it.descricao_nota); return; }
      const id = `x-${Date.now()}-${i}`;
      novosExtras.push({ id, termo: palavra[0].toUpperCase() + palavra.slice(1), horti: pareceHorti(palavra) });
      somar(id, qtd);
    });
    const antes = Object.keys(novoSel).length;
    for (const [id, qtd] of Object.entries(daNota)) novoSel[id] = Math.max(novoSel[id] ?? 0, qtd);
    salvarExtras(novosExtras);
    mudar(novoSel);
    const dataNota = String(data![0].data).split('-').reverse().join('/');
    setAvisoNota((juntar
      ? `Nota de ${dataNota} juntada à lista: ${Object.keys(novoSel).length - antes} itens novos, ${Object.keys(novoSel).length} no total.`
      : `Lista montada com ${Object.keys(novoSel).length} itens da nota de ${dataNota}.`)
      + (ignorados.length ? ` Sem oferta parecida: ${ignorados.slice(0, 5).join(', ')}${ignorados.length > 5 ? '…' : ''}.` : ''));
  };
  // Vindo de "Notas registradas" (/compra?nota=ID): monta a compra com aquela nota assim que os preços carregarem.
  useEffect(() => {
    if (!dados || !sessao) return;
    const id = Number(new URLSearchParams(window.location.search).get('nota'));
    if (!id) return;
    window.history.replaceState(null, '', '/compra');
    usarNota(id);
  }, [dados, sessao]);   // eslint-disable-line react-hooks/exhaustive-deps
  const trocarHorti = (id: string, horti: boolean) => salvarExtras(extras.map((x) => (x.id === id ? { ...x, horti } : x)));
  const remover = (id: string) => {
    salvarExtras(extras.filter((x) => x.id !== id));
    const n = { ...sel }; delete n[id]; mudar(n);
  };
  // itens vindos de notas antigas ainda podem ter abreviações: a busca usa a palavra inteira
  const todos: ItemCesta[] = useMemo(() => [...CESTA, ...extras.map((x) => ({ id: x.id, rotulo: semAbrev(x.termo) === norm(x.termo) ? x.termo : semAbrev(x.termo).replace(/^./, (c) => c.toUpperCase()), termo: semAbrev(x.termo), porKg: x.horti ?? pareceHortiFixo(x.termo) }))], [extras]);

  // todas as ofertas que servem para cada item (qualquer marca). Item de hortifruti (com "kg" no nome ou quando
  // a maior parte do que a busca encontra é fruta, legume ou verdura) compara pelo preço do quilo, sem marca.
  const { candidatos, kgs, unis, refs } = useMemo(() => {
    const r: Record<string, Oferta[]> = {};
    const kgs = new Set<string>();
    const unis = new Set<string>();   // comparados pelo preço de cada unidade (cápsulas)
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
          if (POR_UNIDADE.test(norm(termo)) && !TEM_TAMANHO.test(termo)) {
            // cápsulas: pelo preço de cada uma; referência = caixa mais comum (geralmente 10)
            r[c.id] = r[c.id].filter((o) => contagem(o) > 0);
            const conta = new Map<number, number>();
            for (const o of r[c.id]) conta.set(contagem(o), (conta.get(contagem(o)) ?? 0) + 1);
            const [n] = [...conta.entries()].sort((a, b) => b[1] - a[1])[0] ?? [];
            if (n) { unis.add(c.id); refs[c.id] = { base: n, ub: 'un' }; }
          } else if (!TEM_TAMANHO.test(termo)) {
            // sem tamanho: compara pelo preço do litro/quilo, com o tamanho mais comum como referência
            const ref = tamanhoReferencia(r[c.id]);
            // por unidade (ovos, rolos, folhas), só pacotes de tamanho parecido (até 3x maior ou menor): a bandeja de
            // 20 ovos entra na comparação da de 10 pelo preço de cada ovo, mas 1000 folhas de interfolha não se
            // comparam a 2 rolos pelo preço de cada "unidade"
            const base = (o: Oferta) => Math.round((o.preco / o.porUn) * 1000) / 1000;
            if (ref) {
              refs[c.id] = ref;
              r[c.id] = r[c.id].filter((o) => o.ub === ref.ub && (ref.ub !== 'un' || (base(o) >= ref.base / 3 && base(o) <= ref.base * 3)));
            }
          }
        }
        continue;
      }
      // embalagens parecidas (de 70% a 140% do tamanho: molho de 240 g conta para o de 300 g) entram
      // comparadas pelo preço do quilo/litro, convertido para o tamanho de referência do item
      r[c.id] = lista.filter((o) =>
        o.u === c.u && o.q >= c.q! * 0.7 && o.q <= c.q! * 1.4 && c.inc!.every((t) => norm(o.nome).includes(t)) && !c.exc!.test(o.busca));
      if (r[c.id].some((o) => Math.abs(o.q - c.q!) > 0.001)) {
        refs[c.id] = { base: c.u === 'g' || c.u === 'ml' ? c.q! / 1000 : c.q!, ub: c.u === 'g' ? 'kg' : c.u === 'ml' ? 'l' : c.u! };
      }
    }
    return { candidatos: r, kgs, unis, refs };
  }, [dados, todos]);
  // preço usado na comparação: por kg (hortifruti), pelo tamanho de referência (sem tamanho) ou o da etiqueta
  // pu: preço por quilo/litro/unidade (cápsula: preço de cada uma)
  const pu = (c: ItemCesta, o: Oferta) => (unis.has(c.id) ? o.preco / contagem(o) : o.porUn);
  const v = (c: ItemCesta, o: Oferta) => (kgs.has(c.id) ? o.porUn : refs[c.id] ? pu(c, o) * refs[c.id].base : o.preco);
  // como o item é medido, para mostrar junto do nome ("1,9 kg", "10 un") e na base da estimativa
  const tamTxt = (c: ItemCesta) => (refs[c.id] && !c.q ? ` (${fmtTam(refs[c.id])})` : '');
  const unTxt = (c: ItemCesta) => (unis.has(c.id) ? 'cápsula' : kgs.has(c.id) ? 'kg' : refs[c.id]?.ub ?? '');
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
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
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
  }, [candidatos, kgs, unis, refs, marcas, todos]);

  if (erro) return <><h1>Minha compra</h1><ErroCarga tentarDeNovo={tentarDeNovo} /></>;

  const itens = todos.filter((c) => sel[c.id]);
  // mediana do item entre os mercados que têm preço: estimativa para quem não tem
  const media: Record<string, number> = {};
  const nMedia: Record<string, number> = {};
  for (const c of itens) {
    const ps = Object.values(porItem[c.id]).map((o) => v(c, o));
    if (ps.length) { media[c.id] = mediana(ps); nMedia[c.id] = ps.length; }
  }
  const ranking = (dados?.mercados ?? []).map((m) => {
    let total = 0; let estimado = 0; const falta: string[] = []; const escolhas: { c: ItemCesta; o: Oferta }[] = [];
    const estimados: { c: ItemCesta; valor: number; outrasMarcas: boolean }[] = [];
    for (const c of itens) {
      const o = porItem[c.id][m];
      if (o) { total += v(c, o) * sel[c.id]; escolhas.push({ c, o }); }
      else {
        // marca fixada e ausente aqui: estima pela mediana das outras marcas deste mercado, se houver
        const outras = marcas[c.id] ? candidatos[c.id].filter((x) => x.mercado === m) : [];
        const un = outras.length ? mediana(outras.map((x) => v(c, x))) : (media[c.id] ?? 0);
        falta.push(c.rotulo);
        estimado += un * sel[c.id];
        estimados.push({ c, valor: un * sel[c.id], outrasMarcas: outras.length > 0 });
      }
    }
    return { m, total, estimado, falta, escolhas, estimados, valor: total + estimado };
  }).filter((r) => r.falta.length < itens.length)
    // Primeiro quem tem preço para a maioria dos itens (no máximo 30% estimado), do menor para o maior valor;
    // mercados com poucos itens com preço (ex.: só o encarte) vêm depois, porque o total deles é quase só estimativa.
    .map((x) => ({ ...x, confiavel: x.falta.length <= Math.floor(itens.length * 0.3) }))
    .sort((a, b) => Number(b.confiavel) - Number(a.confiavel) || a.valor - b.valor);
  const completos = ranking.filter((r) => !r.falta.length);
  // compara com o segundo mais barato (a alternativa real) e mostra também o mais caro
  const top = ranking[0], segundo = ranking[1], pior = ranking[ranking.length - 1];
  const melhorCompleto = top?.falta.length ? completos[0] : undefined;
  const fmt = (r: { valor: number; falta: string[] }) => `${r.falta.length ? '≈ ' : ''}${brl(r.valor)}`;
  // Compra dividida em 2 mercados: cada item no mais barato dos dois. Só pares com preço para a maioria dos itens.
  type Dupla = { a: string; b: string; valor: number; emA: { c: ItemCesta; o: Oferta; valor: number }[]; emB: { c: ItemCesta; o: Oferta; valor: number }[]; estimado: number };
  let dupla: Dupla | null = null;
  const nomes = ranking.map((x) => x.m);
  for (let i = 0; i < nomes.length; i++) for (let j = i + 1; j < nomes.length; j++) {
    const [a, b] = [nomes[i], nomes[j]];
    const d: Dupla = { a, b, valor: 0, emA: [], emB: [], estimado: 0 };
    let faltam = 0;
    for (const c of itens) {
      const oa = porItem[c.id][a], ob = porItem[c.id][b];
      const va = oa ? v(c, oa) * sel[c.id] : Infinity, vb = ob ? v(c, ob) * sel[c.id] : Infinity;
      if (va === Infinity && vb === Infinity) { faltam++; d.estimado += (media[c.id] ?? 0) * sel[c.id]; continue; }
      if (va <= vb) d.emA.push({ c, o: oa!, valor: va }); else d.emB.push({ c, o: ob!, valor: vb });
      d.valor += Math.min(va, vb);
    }
    d.valor += d.estimado;
    if (faltam > Math.floor(itens.length * 0.3) || !d.emA.length || !d.emB.length) continue;
    if (!dupla || d.valor < dupla.valor) dupla = d;
  }
  const economiaDupla = dupla && top ? top.valor - dupla.valor : 0;
  const distTxt = (m: string) => {
    const d = locais.distancia(m);
    return d ? `${fmtKm(d.km)} de ${d.ref.rotulo}` : null;
  };

  let ideal = 0; let idealOk = true;
  for (const c of itens) {
    const menor = Object.values(porItem[c.id]).sort((a, b) => v(c, a) - v(c, b))[0];
    if (menor) ideal += v(c, menor) * sel[c.id]; else idealOk = false;
  }

  return (
    <>
      <div>
        <h1>Minha compra</h1>
        <p className="lead">Monte a lista e veja em qual mercado ela sai mais barata.</p>
      </div>
      <div className="choice" role="radiogroup" aria-label="Ver">
        <label><input type="radio" name="aba" checked={aba === 'lista'} onChange={() => setAba('lista')} /><span>Lista ({itens.length})</span></label>
        <label><input type="radio" name="aba" checked={aba === 'comparar'} onChange={() => setAba('comparar')} /><span>Comparação</span></label>
      </div>

      {aba === 'lista' && !dados && !erro && (
        <p className="buscando" role="status"><span className="giro" aria-hidden="true" />Buscando os preços de hoje nos mercados…</p>
      )}
      {aba === 'lista' && (top ? (
        <button type="button" className="resumo-compra" onClick={() => { setAba('comparar'); window.scrollTo(0, 0); }}>
          <span>Mais barato hoje: <b>{top.m}</b>{SO_SOCIOS.has(top.m) && <> <TagSocios /></>} {fmt(top)}</span>
          <span className="mkt">Ver comparação →</span>
        </button>
      ) : !itens.length ? <div className="empty">Marque ao menos um item abaixo.</div> : null)}

      {aba === 'comparar' && !dados && <Carregando />}
      {aba === 'comparar' && dados && <>

      {!itens.length ? <div className="empty">Sua lista está vazia.<br /><button type="button" className="btn btn-primary" onClick={() => setAba('lista')}>Montar a lista</button></div> : top ? (
        <div className="destaque">
          <span className="muted">Melhor mercado único para esta compra</span>
          <span className="grande">{fmt(top)}</span>
          <span><b>{top.m}</b>{SO_SOCIOS.has(top.m) && <> <TagSocios /></>}{segundo && ` · ${brl(segundo.valor - top.valor)} a menos que o 2º mais barato (${segundo.m})`}</span>
          {(() => { const d = locais.distancia(top.m); return d && <span className="dist">📍 {fmtKm(d.km)} de {d.ref.rotulo} ({d.loja.nome})</span>; })()}
          {top.falta.length > 0 && (
            <span className="cond">
              Sem preço hoje no {top.m}: {top.falta.join(', ')} (estimado pelo preço do meio dos outros mercados).
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

      <Enderecos refs={locais.refs} adicionar={locais.adicionar} remover={locais.remover} />

      {dupla && economiaDupla >= 1 && (() => {
        const totA = dupla.emA.reduce((t, x) => t + x.valor, 0), totB = dupla.emB.reduce((t, x) => t + x.valor, 0);
        const pct = (x: number) => Math.round((x / (totA + totB)) * 100);
        const da = locais.distancia(dupla.a), db = locais.distancia(dupla.b);
        const entre = da && db ? km(da.loja, db.loja) : locais.entre(dupla.a, dupla.b);
        return (
          <div className="dupla">
            <span className="muted">Dividindo a compra em 2 mercados</span>
            <span className="grande">{dupla.estimado > 0 ? '≈ ' : ''}{brl(dupla.valor)}</span>
            <span><b>{brl(economiaDupla)} a menos</b> que comprar tudo no {top!.m}</span>
            <div className="dupla-lados">
              {([[dupla.a, dupla.emA, totA, da], [dupla.b, dupla.emB, totB, db]] as const).map(([m, l, tot, d]) => (
                <div key={m}>
                  <b>{m}</b>
                  <span>{l.length} {l.length === 1 ? 'item' : 'itens'} · {brl(tot)} ({pct(tot)}%)</span>
                  {d && <span className="muted">📍 {fmtKm(d.km)} de {d.ref.rotulo}</span>}
                  <details><summary>Ver itens</summary>
                    <ul>{l.map(({ c, o, valor }) => <li key={c.id}>{sel[c.id]}{kgs.has(c.id) ? ' kg' : '×'} {c.rotulo}: <b>{o.nome}</b> · {brl(o.preco)}{sel[c.id] !== 1 ? ` cada = ${brl(valor)}` : ''}</li>)}</ul>
                  </details>
                </div>
              ))}
            </div>
            {entre !== null && <span className="muted">Distância entre as duas lojas: {fmtKm(entre)} em linha reta.</span>}
          </div>
        );
      })()}

      {itens.length > 0 && <h2>Total em cada mercado</h2>}
      {itens.length > 0 && (
        <div className="ranking">
          {ranking.map((r, i) => (
            <div key={r.m} className={r.confiavel ? '' : 'poucos-precos'}>
              {!r.confiavel && (i === 0 || ranking[i - 1].confiavel) && (
                <span className="grupo-ranking">Poucos itens com preço hoje (total quase todo estimado)</span>
              )}
              <b>{r.m}{SO_SOCIOS.has(r.m) && <> <TagSocios /></>}{distTxt(r.m) && <span className="dist"> · 📍 {distTxt(r.m)}</span>}</b>
              <span className="total">{fmt(r)}</span>
              {r.falta.length > 0 && (
                <span className="falta">
                  Sem preço hoje: {r.falta.join(', ')}.{' '}
                  {ENCARTE.has(r.m) ? 'Este mercado só entra com os itens do encarte. ' : ''}
                  Estimado pelo preço do meio dos outros mercados.
                </span>
              )}
              {r.escolhas.length > 0 && (
                <details>
                  <summary>Ver marcas e preços</summary>
                  <ul>
                    {r.escolhas.map(({ c, o }) => (
                      <li key={c.id}>{sel[c.id]}{kgs.has(c.id) ? ' kg' : '×'} {c.rotulo}{tamTxt(c)}: <b>{!kgs.has(c.id) && o.marca && !norm(o.nome).includes(norm(o.marca)) ? `${o.marca} · ` : ''}{o.nome}</b>{' '}
                        {brl(o.preco)}{(kgs.has(c.id) || refs[c.id]) && <> · {brl(pu(c, o))}/{unis.has(c.id) ? 'cápsula' : o.ub}</>}
                        {' '}<span className="subtotal">= {brl(v(c, o) * sel[c.id])}</span></li>
                    ))}
                    {r.estimados.map(({ c, valor, outrasMarcas }) => (
                      <li key={c.id} className="estimado">
                        {sel[c.id]}{kgs.has(c.id) ? ' kg' : '×'} {c.rotulo}{tamTxt(c)}: {!marcas[c.id] ? 'sem preço neste mercado'
                          : 'sem preço para esta marca'}, estimado pelo preço do meio {outrasMarcas ? 'das outras marcas deste mercado'
                          : `de ${nMedia[c.id] ?? 0} ${nMedia[c.id] === 1 ? 'mercado' : 'mercados'}`}
                        {refs[c.id] && !kgs.has(c.id) && valor > 0 && <> ({brl(valor / sel[c.id] / refs[c.id].base)}/{unTxt(c)} × {fmtTam(refs[c.id])})</>}{' '}
                        <span className="subtotal">≈ {brl(valor)}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="soma">
                    Itens com preço: <b>{brl(r.total)}</b>
                    {r.estimado > 0 && <> + estimados: <b>≈ {brl(r.estimado)}</b></>}
                    {' '}= <b>{fmt(r)}</b>
                  </div>
                </details>
              )}
            </div>
          ))}
        </div>
      )}
      <p className="muted">
        Roldão, Sumerbol, Assaí, Sonda, Revolução e Cato entram só com os itens em promoção nos encartes. Quando falta preço,
        o total usa o preço do meio (mediana) dos outros mercados e aparece com ≈. A lista vai do menor para o maior valor.
      </p>
      </>}

      {aba === 'lista' && <>
      {sessao && (
        <div className="card stack">
          <button type="button" className="btn btn-secondary" onClick={() => usarNota()}>Usar os itens da nota mais recente</button>
          <span className="muted">Junta à sua lista, ou troca a lista, pelos itens e quantidades da nota. Para usar outra nota, vá em Notas e toque em &quot;Usar estes itens&quot;.</span>
          {notaPendente && (
            <div className="alert stack" role="group" aria-label="Como usar a nota">
              <span>Sua lista já tem {Object.keys(sel).length} itens. O que fazer com eles?</span>
              <button type="button" className="btn btn-primary" onClick={() => usarNota(notaPendente.id, 'juntar')}>Juntar a nota à minha lista</button>
              <button type="button" className="btn btn-secondary" onClick={() => usarNota(notaPendente.id, 'substituir')}>Trocar a lista pelos itens da nota</button>
              <button type="button" className="btn btn-link" onClick={() => setNotaPendente(null)}>Cancelar</button>
            </div>
          )}
          {avisoNota && <div className="alert alert-ok" role="status">{avisoNota}</div>}
        </div>
      )}
      <div className="row" style={{ gap: 8, alignItems: 'center' }}>
        <button type="button" className="btn btn-primary" onClick={salvarLista}>Salvar lista</button>
        {itens.length > 0 && (
          <button type="button" className="btn btn-link" onClick={() => {
            if (!window.confirm('Limpar a lista? Os itens adicionados saem e os da cesta ficam desmarcados.')) return;
            salvarExtras([]); mudar({}); setMarcas({}); setAvisoNota(''); setSalvo('');
            try { localStorage.setItem('cesta-marca', '{}'); } catch {}
          }}>Limpar lista</button>
        )}
      </div>
      {salvo && <div className={`alert ${salvo.startsWith('Não') ? 'alert-error' : 'alert-ok'}`} role="status">{salvo}</div>}
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
            {novoPrevia === null ? 'Para produtos embalados, inclua o tamanho (350ml, 1kg). Use - para tirar o que não quer: café -cápsula. A caixa de hortifruti é marcada sozinha quando reconhecemos o nome.'
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
                  : !dados ? <span className="esq-texto" aria-hidden="true" />
                  : <span className="cond">{marcas[c.id] ? 'esta marca não tem preço hoje' : 'sem preço hoje'}</span>}
                {dados && <span>{Object.keys(porItem[c.id]).length} mercados</span>}
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

      </>}
    </>
  );
}

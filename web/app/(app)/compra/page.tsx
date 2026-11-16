'use client';
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { brl, chaveMarca, filtrar, filtrarFoco, grupo, norm, SO_SOCIOS, useOfertas, type Oferta } from '@/lib/ofertas';
import { Carregando, ErroCarga, TagSocios } from '../linha-oferta';
import { useSessao } from '@/lib/sessao';
import { supabase } from '@/lib/supabase';
import { fmtKm, fmtTempo, km, minCarro, useLocais } from '@/lib/locais';
import Enderecos from './enderecos';
import { registrar } from '@/lib/eventos';
import { CHAVE_CESTA } from '../primeiros-passos';
import { garantirDonoDaCesta } from '@/lib/cesta';
import EnviarNota from '../enviar-nota';
import { mostrarAviso } from '../aviso';
import Link from 'next/link';

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
  r.ub === 'un' ? `${r.base}\u00a0un` : r.base < 1 ? `${Math.round(r.base * 1000)}\u00a0${r.ub === 'l' ? 'ml' : 'g'}` : `${String(r.base).replace('.', ',')}\u00a0${r.ub}`;
// Itens contados por unidade mesmo quando o site informa o peso (cápsulas: "10 Cápsulas 110g", "18x4,4g").
const POR_UNIDADE = /(^|\s)capsulas?(\s|$)/;
const contagem = (o: Oferta) => {
  if (o.u === 'un') return o.q;
  const n = norm(o.nome);
  const m = n.match(/(\d+)\s*(capsulas?|unidades?|unid|un)\b/) ?? n.match(/(\d+)\s*x\s*\d/);
  return m ? Number(m[1]) : 0;
};
// Mediana: um preço fora da curva (cadastro errado num mercado) não puxa a estimativa.
// Fração máxima de itens estimados (sem preço no mercado) para o mercado entrar no topo do ranking por menor preço.
// Acima disso ele vai para o fim, em "Poucos itens com preço hoje". Decisão de 15/11: 20%.
const LIMITE_ESTIMADOS = 0.2;
// Opção destacada como "Equilíbrio" no resumo de Onde comprar (decisão de 15/11: 2 mercados).
const OPCAO_EQUILIBRIO: 'roteiro' | 'dupla' | 'um' | 'perto' = 'dupla';
const estTxt = (n: number, valor: number) => n ? `${n} ${n === 1 ? 'item estimado' : 'itens estimados'}${valor > 0 ? ` (≈ ${brl(valor)})` : ''}` : '';
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
const CHAVE_SYNC = 'cesta-atualizada';   // quando a lista deste aparelho mudou pela última vez (ms)
const PET = /racao|pet\b|caes|gatos|pedigree|baw waw|whiskas|golden formula|premier pet|petisco|dog\b|cat\b/;
// marca sem espaços: "La Sante" = "Lasante"
const marcaCompacta = (m: string) => chaveMarca(m).replace(/ /g, '');

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
// 15/11 (Fase 2): conta nova começa com a cesta vazia e vê as boas-vindas, com os itens básicos para marcar.
// Antes, começava com 6 itens marcados e a tela de boas-vindas nunca aparecia.
const PADRAO: Record<string, number> = {};
// Itens básicos da cesta vazia (lista única; decisão de 15/11). `id` = item fixo da cesta; `termo` = item adicionado.
// Os 6 primeiros já vêm marcados: "Adicionar 6 itens" monta a cesta num toque.
const BASICOS: { rotulo: string; id?: string; termo?: string }[] = [
  { rotulo: 'Arroz 5 kg', id: 'arroz' }, { rotulo: 'Feijão 1 kg', id: 'feijao' }, { rotulo: 'Café 500 g', id: 'cafe' },
  { rotulo: 'Leite 1 l', id: 'leite' }, { rotulo: 'Óleo 900 ml', id: 'oleo' }, { rotulo: 'Açúcar 1 kg', id: 'acucar' },
  { rotulo: 'Macarrão 500 g', id: 'macarrao' }, { rotulo: 'Ovos 20 un', termo: 'Ovos 20 un' },
];
const BASICOS_MARCADOS = 6;

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
  const [notaAberta, setNotaAberta] = useState(false);   // painel da nota, recolhido quando a cesta já tem itens (2.5)
  const [basicos, setBasicos] = useState<string[]>(BASICOS.slice(0, BASICOS_MARCADOS).map((b) => b.rotulo));
  const [aba, setAbaEstado] = useState<'lista' | 'comparar'>('lista');
  const [todosMercados, setTodosMercados] = useState(false);   // mostra também os mercados com poucos preços hoje
  // Preferências de lojas (filtros da comparação), guardadas neste aparelho: valem para toda a análise de "Onde comprar".
  type Pref = { ordem: 'preco' | 'perto' | 'completo'; semSocios: boolean; maxKm: number | null };
  const [pref, setPrefEstado] = useState<Pref>({ ordem: 'preco', semSocios: false, maxKm: null });
  const [foraRoteiro, setForaRoteiro] = useState<string[]>([]);   // mercados tirados do roteiro de vários mercados
  const [filtrosAbertos, setFiltrosAbertos] = useState(false);
  useEffect(() => {
    try { const p = JSON.parse(localStorage.getItem('cesta-pref') || 'null'); if (p) setPrefEstado((x) => ({ ...x, ...p })); } catch {}
    try { setForaRoteiro(JSON.parse(localStorage.getItem('cesta-fora-roteiro') || '[]')); } catch {}
  }, []);
  const setPref = (p: Partial<Pref>) => setPrefEstado((x) => { const n = { ...x, ...p }; try { localStorage.setItem('cesta-pref', JSON.stringify(n)); } catch {} return n; });
  const trocarRoteiro = (m: string) => setForaRoteiro((x) => { const n = x.includes(m) ? x.filter((y) => y !== m) : [...x, m]; try { localStorage.setItem('cesta-fora-roteiro', JSON.stringify(n)); } catch {} return n; });
  // a aba escolhida vale durante a visita: voltar de outra tela não perde o lugar
  const setAba = (a: 'lista' | 'comparar') => { setAbaEstado(a); try { sessionStorage.setItem('compra-aba', a); } catch {} window.scrollTo(0, 0); };
  // Passo inicial: ?nota=ID (Usar na cesta) e ?ver=lista abrem a Lista, para editar; ?ver=onde abre Onde comprar;
  // sem nada, volta ao passo em que a pessoa estava nesta visita.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.get('nota') || p.get('ver') === 'lista') return setAba('lista');
    if (p.get('ver') === 'onde') return setAba('comparar');
    try { if (sessionStorage.getItem('compra-aba') === 'comparar') setAbaEstado('comparar'); } catch {}
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps

  // lista guardada neste aparelho: só depois de saber de quem é a conta (outra conta no mesmo celular não herda a lista)
  useEffect(() => {
    if (!sessao) return;
    if (garantirDonoDaCesta(sessao.user.id)) { setSel(PADRAO); setMarcas({}); setExtras([]); return; }
    try { const s = JSON.parse(localStorage.getItem('cesta-sel') || 'null'); if (s) setSel(s); } catch {}
    try { setMarcas(JSON.parse(localStorage.getItem('cesta-marca') || '{}')); } catch {}
    try { setExtras(JSON.parse(localStorage.getItem('cesta-extra') || '[]')); } catch {}
  }, [sessao?.user.id]);   // eslint-disable-line react-hooks/exhaustive-deps
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
  // A lista é gravada neste aparelho a cada mudança (mudar, fixarMarca, salvarExtras). Aqui só se confere
  // se o navegador deixa gravar (o modo anônimo pode bloquear), sem regravar a lista.
  const [salvo, setSalvo] = useState('');
  useEffect(() => {
    try { localStorage.setItem('cesta-teste', '1'); localStorage.removeItem('cesta-teste'); setSalvo(''); }
    catch { setSalvo('Não foi possível salvar: o navegador está bloqueando o armazenamento (modo anônimo?).'); }
  }, [sel, extras, marcas]);

  // Cesta salva na conta (tabela cesta_salva, migração 0026): itens, quantidades, itens adicionados e marcas
  // escolhidas abrem iguais no celular e no computador. Ao abrir, vale a versão mais recente (conta ou aparelho);
  // depois, cada mudança é gravada na conta 1,5 s após a última alteração.
  const [nuvem, setNuvem] = useState<'carregando' | 'ok' | 'salvando' | 'erro'>('carregando');
  const sincronizada = useRef(false);
  const aplicandoDaConta = useRef(false);
  useEffect(() => {
    if (!sessao) return;
    let ativo = true;
    (async () => {
      const { data, error } = await supabase.from('cesta_salva').select('sel,extras,marcas,atualizado_em')
        .eq('familia_id', sessao.user.id).maybeSingle();
      if (!ativo) return;
      if (error) { setNuvem('erro'); sincronizada.current = true; return; }
      let local = 0;
      try { local = Number(localStorage.getItem(CHAVE_SYNC)) || 0; } catch {}
      if (data && Date.parse(data.atualizado_em) > local) {
        aplicandoDaConta.current = true;
        setSel(data.sel ?? {}); setExtras(data.extras ?? []); setMarcas(data.marcas ?? {});
        try {
          localStorage.setItem('cesta-sel', JSON.stringify(data.sel ?? {}));
          localStorage.setItem('cesta-extra', JSON.stringify(data.extras ?? []));
          localStorage.setItem('cesta-marca', JSON.stringify(data.marcas ?? {}));
          localStorage.setItem(CHAVE_SYNC, String(Date.parse(data.atualizado_em)));
        } catch {}
        sincronizada.current = true; setNuvem('ok');
      } else {
        sincronizada.current = true;
        setNuvem(data ? 'ok' : 'salvando');
        if (!data) await gravarNaConta();   // primeira vez: a lista deste aparelho vai para a conta
      }
    })();
    return () => { ativo = false; };
  }, [sessao?.user.id]);   // eslint-disable-line react-hooks/exhaustive-deps

  const atual = useRef({ sel, extras, marcas });
  atual.current = { sel, extras, marcas };
  const gravarNaConta = async () => {
    if (!sessao) return;
    const agora = new Date();
    try { localStorage.setItem(CHAVE_SYNC, String(agora.getTime())); } catch {}
    await supabase.rpc('garantir_familia');
    const { error } = await supabase.from('cesta_salva').upsert({
      familia_id: sessao.user.id, ...atual.current, atualizado_em: agora.toISOString(),
    }, { onConflict: 'familia_id' });
    setNuvem(error ? 'erro' : 'ok');
  };
  useEffect(() => {
    if (!sincronizada.current) return;
    if (aplicandoDaConta.current) { aplicandoDaConta.current = false; return; }   // veio da conta: não regrava
    try { localStorage.setItem(CHAVE_SYNC, String(Date.now())); } catch {}
    setNuvem('salvando');
    const t = setTimeout(gravarNaConta, 1500);
    return () => clearTimeout(t);
  }, [sel, extras, marcas]);   // eslint-disable-line react-hooks/exhaustive-deps
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
  // Cesta vazia (2.3): os básicos marcados entram de uma vez, com quantidade 1
  const adicionarBasicos = () => {
    const escolhidos = BASICOS.filter((b) => basicos.includes(b.rotulo));
    if (!escolhidos.length) return;
    const n = { ...sel }; const novosExtras = [...extras];
    escolhidos.forEach((b, i) => {
      if (b.id) { n[b.id] = n[b.id] ?? 1; return; }
      const ja = novosExtras.find((x) => norm(x.termo) === norm(b.termo!));
      const id = ja?.id ?? `x-${Date.now()}-${i}`;
      if (!ja) novosExtras.push({ id, termo: b.termo!, horti: false });
      n[id] = n[id] ?? 1;
    });
    salvarExtras(novosExtras); mudar(n);
    window.scrollTo(0, 0);   // volta ao topo: o resumo de onde comprar aparece logo
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
    if (!itensNota.length) return setAvisoNota('Nenhuma nota enviada ainda. Fotografe uma nota acima.');
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
  // Alertas na própria cesta (14/11, no lugar da aba Alertas): o sino do item cria um alerta com preço-alvo.
  // O alerta guarda as palavras do item (as mesmas da busca) e a marca fixada, se houver.
  type AlertaCesta = { id: number; termo: string; marca: string | null; preco_alvo: number | null };
  const [alertas, setAlertas] = useState<AlertaCesta[]>([]);
  const [sinoAberto, setSinoAberto] = useState<string | null>(null);
  const [alvoTxt, setAlvoTxt] = useState('');
  useEffect(() => {
    if (!sessao) return;
    supabase.from('item_interesse').select('id,termo,marca,preco_alvo').not('termo', 'is', null)
      .then(({ data }) => setAlertas((data ?? []) as AlertaCesta[]));
  }, [sessao]);
  const termoDoItem = (c: ItemCesta) => (c.termo ?? (c.inc ?? []).join(' ')).trim();
  const alertaDoItem = (c: ItemCesta) => alertas.find((a) => norm(a.termo).trim() === norm(termoDoItem(c)));
  const abrirSino = (c: ItemCesta, sugestao?: number) => {
    if (sinoAberto === c.id) return setSinoAberto(null);
    const a = alertaDoItem(c);
    const base = a?.preco_alvo ?? (sugestao ? Math.floor(sugestao * 0.95 * 10) / 10 : null);
    setAlvoTxt(base ? base.toFixed(2).replace('.', ',') : '');
    setSinoAberto(c.id);
  };
  const salvarAlerta = async (c: ItemCesta) => {
    if (!sessao) return;
    const preco = alvoTxt.trim() ? Number(alvoTxt.replace(/\./g, '').replace(',', '.')) : null;
    if (alvoTxt.trim() && (!preco || preco <= 0)) return mostrarAviso({ texto: 'Preço-alvo inválido. Use só números, como 15,90.' });
    await supabase.rpc('garantir_familia');
    const existente = alertaDoItem(c);
    const marca = marcas[c.id] ? (marcasDe(c.id).find((m) => m.chave === marcaCompacta(marcas[c.id]))?.nome ?? marcas[c.id]) : null;
    const { data, error } = existente
      ? await supabase.from('item_interesse').update({ preco_alvo: preco, marca }).eq('id', existente.id).select('id,termo,marca,preco_alvo').single()
      : await supabase.from('item_interesse').insert({ familia_id: sessao.user.id, termo: termoDoItem(c), marca, preco_alvo: preco, origem: 'manual' })
        .select('id,termo,marca,preco_alvo').single();
    if (error || !data) return mostrarAviso({ texto: 'Não foi possível salvar o alerta agora. Tente de novo.' });
    setAlertas((l) => [...l.filter((a) => a.id !== data.id), data as AlertaCesta]);
    setSinoAberto(null);
    mostrarAviso({ texto: `Alerta de ${c.rotulo}${preco ? ` até ${brl(preco)}` : ''} salvo. Os avisos chegam como você escolheu em Meus dados.` });
  };
  const removerAlerta = async (c: ItemCesta) => {
    const a = alertaDoItem(c);
    if (!a) return;
    await supabase.from('item_interesse').delete().eq('id', a.id);
    setAlertas((l) => l.filter((x) => x.id !== a.id));
    setSinoAberto(null);
  };

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
    // ração e petiscos (Pedigree, Baw Waw…) têm "arroz", "carne", "frango" no nome: ficam fora dos itens da casa,
    // a menos que a pessoa esteja procurando produto de pet (revisão de 12/11)
    for (const c of todos) {
      const busca = norm(`${c.rotulo} ${c.termo ?? ''}`);
      if (!PET.test(busca)) r[c.id] = r[c.id].filter((o) => grupo(o.categoria) !== 'Pet' && !PET.test(o.busca));
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
  // "Farinha" como marca da farinha de trigo não é marca: fica de fora; "La Sante" e "Lasante" viram uma só
  const marcasDe = (id: string) => {
    const m = new Map<string, { nome: string; mercados: Set<string> }>();
    const palavrasDoItem = new Set(norm(todos.find((c) => c.id === id)?.rotulo).split(/[^a-z0-9]+/));
    for (const o of candidatos[id]) {
      const k = marcaCompacta(o.marca);
      if (!k || chaveMarca(o.marca).split(' ').every((w) => palavrasDoItem.has(w))) continue;
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
      const marca = marcaCompacta(marcas[c.id] ?? '');
      for (const o of candidatos[c.id]) {
        if (marca && marcaCompacta(o.marca) !== marca) continue;
        if (!r[c.id][o.mercado] || v(c, o) < v(c, r[c.id][o.mercado])) r[c.id][o.mercado] = o;
      }
    }
    return r;
  }, [candidatos, kgs, unis, refs, marcas, todos]);

  if (erro) return <><h1>Minha cesta</h1><ErroCarga tentarDeNovo={tentarDeNovo} /></>;

  const itens = todos.filter((c) => sel[c.id]);
  // mediana do item entre os mercados que têm preço: estimativa para quem não tem
  const media: Record<string, number> = {};
  const nMedia: Record<string, number> = {};
  for (const c of itens) {
    const ps = Object.values(porItem[c.id]).map((o) => v(c, o));
    if (ps.length) { media[c.id] = mediana(ps); nMedia[c.id] = ps.length; }
  }
  // Filtros de lojas: sócios e distância máxima (mercado sem loja localizada não é cortado pela distância)
  const permitido = (m: string) => {
    if (pref.semSocios && SO_SOCIOS.has(m)) return false;
    if (pref.maxKm !== null) { const d = locais.distancia(m); if (d && d.km > pref.maxKm) return false; }
    return true;
  };
  const ocultosFiltro = (dados?.mercados ?? []).filter((m) => !permitido(m)).length;
  const ranking = (dados?.mercados ?? []).map((m) => {
    let total = 0; let estimado = 0; const falta: string[] = []; const escolhas: { c: ItemCesta; o: Oferta }[] = [];
    const estimados: { c: ItemCesta; valor: number; outrasMarcas: boolean }[] = [];
    for (const c of itens) {
      const o = porItem[c.id][m];
      if (o) { total += v(c, o) * sel[c.id]; escolhas.push({ c, o }); }
      else {
        // Sem preço aqui: estima pela mediana dos mercados que têm o item (com marca fixada, só essa marca).
        // Antes, com marca fixada, usava as outras marcas deste mercado, mais baratas: o mercado parecia mais barato
        // que comprar cada item no mais barato (12/11: Covabra R$ 119,85 com o leite Ninho estimado por outras marcas).
        const un = media[c.id] ?? 0;
        falta.push(c.rotulo);
        estimado += un * sel[c.id];
        estimados.push({ c, valor: un * sel[c.id], outrasMarcas: false });
      }
    }
    return { m, total, estimado, falta, escolhas, estimados, valor: total + estimado };
  }).filter((r) => r.falta.length < itens.length && permitido(r.m))
    // Primeiro quem tem preço para a maioria dos itens (no máximo LIMITE_ESTIMADOS do total de itens estimado), do menor
    // para o maior valor; mercados com muitos itens estimados (ex.: só o encarte) vêm depois. 15/11: limite de 30% para 20%.
    .map((x) => ({ ...x, confiavel: x.falta.length <= itens.length * LIMITE_ESTIMADOS }))
    .sort((a, b) => Number(b.confiavel) - Number(a.confiavel) || a.valor - b.valor);
  const completos = ranking.filter((r) => !r.falta.length);
  // compara com o segundo mais barato (a alternativa real) e mostra também o mais caro
  const top = ranking[0], segundo = ranking[1], pior = ranking[ranking.length - 1];
  const melhorCompleto = top?.falta.length ? completos[0] : undefined;
  const fmt = (r: { valor: number; falta: string[] }) => `${r.falta.length ? '≈ ' : ''}${brl(r.valor)}`;
  // Compra dividida em 2 mercados: cada item no mais barato dos dois. Só pares com preço para a maioria dos itens.
  type Dupla = { a: string; b: string; valor: number; emA: { c: ItemCesta; o: Oferta; valor: number }[]; emB: { c: ItemCesta; o: Oferta; valor: number }[]; estimado: number; fora: { c: ItemCesta; valor: number }[] };
  let dupla: Dupla | null = null;
  const nomes = ranking.map((x) => x.m);
  for (let i = 0; i < nomes.length; i++) for (let j = i + 1; j < nomes.length; j++) {
    const [a, b] = [nomes[i], nomes[j]];
    const d: Dupla = { a, b, valor: 0, emA: [], emB: [], estimado: 0, fora: [] };
    let faltam = 0;
    for (const c of itens) {
      const oa = porItem[c.id][a], ob = porItem[c.id][b];
      const va = oa ? v(c, oa) * sel[c.id] : Infinity, vb = ob ? v(c, ob) * sel[c.id] : Infinity;
      if (va === Infinity && vb === Infinity) {
        // Sem preço nos dois: entra no total pela mediana e aparece em "Fora destes 2 mercados" (14/11: arroz e café sumiam da lista)
        faltam++; const est = (media[c.id] ?? 0) * sel[c.id]; d.estimado += est; d.fora.push({ c, valor: est }); continue;
      }
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
    return d ? `${fmtKm(d.km)} de ${d.ref.rotulo} · ${fmtTempo(d.km)}` : null;
  };

  // Cada item no mercado mais barato (item 5 de 12/11): total, mercados do roteiro e o percurso aproximado
  // a partir do endereço cadastrado (linha reta, casa → lojas → casa, sempre indo para a loja mais perto).
  let ideal = 0;
  const porMercadoIdeal = new Map<string, { c: ItemCesta; o: Oferta; valor: number }[]>();
  // mercados que podem entrar no roteiro (passam nos filtros) e os que a pessoa tirou do roteiro
  const candidatosRoteiro = [...new Set(itens.flatMap((c) => Object.keys(porItem[c.id])))].filter(permitido).sort();
  const semItem: string[] = [];
  for (const c of itens) {
    const menor = Object.values(porItem[c.id]).filter((o) => permitido(o.mercado) && !foraRoteiro.includes(o.mercado))
      .sort((a, b) => v(c, a) - v(c, b))[0];
    // item sem preço em nenhum mercado hoje fica fora do roteiro; sem preço só nos mercados tirados, avisa
    // sem preço nos mercados que ficaram (ou em nenhum): o item fica fora do roteiro, com aviso de onde ele tem preço
    if (!menor) { const onde = Object.keys(porItem[c.id]).filter((m) => foraRoteiro.includes(m) || !permitido(m)); if (onde.length) semItem.push(`${c.rotulo} (só no ${onde.join(' ou ')})`); continue; }
    const valor = v(c, menor) * sel[c.id];
    ideal += valor;
    porMercadoIdeal.set(menor.mercado, [...(porMercadoIdeal.get(menor.mercado) ?? []), { c, o: menor, valor }]);
  }
  const roteiro = [...porMercadoIdeal.entries()].map(([m, l]) => ({ m, l, total: l.reduce((t, x) => t + x.valor, 0), d: locais.distancia(m) }))
    .sort((a, b) => b.total - a.total);
  // mercados sem loja com localização (Sam's, Roldão…) ficam fora do percurso, e a tela diz quais
  const semLocal = roteiro.filter((r) => !r.d).map((r) => r.m);
  const percurso = (() => {
    const casa = locais.refs[0];
    if (!casa || roteiro.every((r) => !r.d)) return null;
    let aqui: { lat: number; lng: number } = casa; let total = 0; const falta = roteiro.filter((r) => r.d).map((r) => r.d!.loja);
    while (falta.length) {
      falta.sort((a, b) => km(aqui, a) - km(aqui, b));
      const prox = falta.shift()!; total += km(aqui, prox); aqui = prox;
    }
    return { km: total + km(aqui, casa), de: casa.rotulo };
  })();

  // mercados com poucos preços hoje: ficam escondidos atrás do botão "Mostrar todos"
  const poucos = ranking.filter((r) => !r.confiavel).length;
  const slug = (m: string) => norm(m).replace(/[^a-z0-9]+/g, '-');

  // Mapa: loja do mercado (a mais perto do endereço cadastrado) e roteiro com várias lojas no Google Maps
  const pontoLoja = (m: string) => {
    const d = locais.distancia(m);
    if (d) return `${d.loja.lat},${d.loja.lng}`;
    const l = locais.lojas.find((x) => x.mercado === m);
    return l ? `${l.lat},${l.lng}` : `${m} Indaiatuba SP`;
  };
  const linkLoja = (m: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(pontoLoja(m))}`;
  const linkRoteiro = (ms: string[]) => {
    const pts = ms.map(pontoLoja);
    const destino = pts[pts.length - 1];
    const meio = pts.slice(0, -1).join('|');
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destino)}${meio ? `&waypoints=${encodeURIComponent(meio)}` : ''}`;
  };
  // Mercado recomendado conforme o critério escolhido (14/11): menor preço (padrão), mais perto entre os que têm preço
  // para a maior parte da cesta, ou o mais barato entre os que têm tudo.
  const confiaveis = ranking.filter((r) => r.confiavel);
  const rec = pref.ordem === 'perto' && locais.refs.length
    ? [...(confiaveis.length ? confiaveis : ranking)].sort((a, b) => (locais.distancia(a.m)?.km ?? 999) - (locais.distancia(b.m)?.km ?? 999))[0] ?? top
    : pref.ordem === 'completo' ? (completos[0] ?? [...ranking].sort((a, b) => a.falta.length - b.falta.length || a.valor - b.valor)[0]) : top;
  const tituloRec = pref.ordem === 'perto' ? 'Mais perto de você, com a cesta quase toda'
    : pref.ordem === 'completo' ? (completos.length ? 'Mais barato entre os que têm todos os itens' : 'Nenhum mercado tem todos os itens hoje; este é o que tem mais')
    : 'Mais barato para comprar tudo num lugar só';

  // Ordem da lista (14/11): mais barato (padrão), mais perto, ou "tem tudo" = menos itens sem preço primeiro e, empatados, o mais barato
  const lista = pref.ordem === 'perto'
    ? [...ranking].sort((a, b) => (locais.distancia(a.m)?.km ?? 999) - (locais.distancia(b.m)?.km ?? 999))
    : pref.ordem === 'completo'
      ? [...ranking].sort((a, b) => a.falta.length - b.falta.length || a.valor - b.valor)
      : ranking;

  // Resumo das formas de comprar (15/11, item 1.1): as quatro opções lado a lado, com a economia em relação ao
  // "Mais perto". Sem endereço cadastrado, não há "Mais perto": a referência passa a ser "Um mercado só".
  const maisPerto = locais.refs.length
    ? [...(confiaveis.length ? confiaveis : ranking)].sort((a, b) => (locais.distancia(a.m)?.km ?? 999) - (locais.distancia(b.m)?.km ?? 999))[0]
    : undefined;
  type Opcao = { k: typeof OPCAO_EQUILIBRIO; titulo: string; valor: number; nMerc: number; dist: string | null; est: string; destino: string; aoTocar?: () => void };
  const opcoes: Opcao[] = [];
  if (roteiro.length > 1) opcoes.push({ k: 'roteiro', titulo: 'Menor preço total', valor: ideal, nMerc: roteiro.length,
    dist: percurso ? `${fmtKm(percurso.km)} ida e volta` : null,
    est: semItem.length ? `${semItem.length} ${semItem.length === 1 ? 'item fora' : 'itens fora'}` : '', destino: 'opcao-roteiro' });
  if (dupla && economiaDupla >= 1) {
    const da = locais.distancia(dupla.a), db = locais.distancia(dupla.b);
    opcoes.push({ k: 'dupla', titulo: '2 mercados', valor: dupla.valor, nMerc: 2,
      dist: da && db ? `${fmtKm(da.km)} e ${fmtKm(db.km)}` : null, est: estTxt(dupla.fora.length, dupla.estimado), destino: 'opcao-dupla' });
  }
  if (top) opcoes.push({ k: 'um', titulo: 'Um mercado só', valor: top.valor, nMerc: 1,
    dist: locais.distancia(top.m) ? fmtKm(locais.distancia(top.m)!.km) : null, est: estTxt(top.falta.length, top.estimado),
    destino: 'opcao-mercado', aoTocar: () => setPref({ ordem: 'preco' }) });
  if (maisPerto) opcoes.push({ k: 'perto', titulo: 'Mais perto', valor: maisPerto.valor, nMerc: 1,
    dist: locais.distancia(maisPerto.m) ? fmtKm(locais.distancia(maisPerto.m)!.km) : null, est: estTxt(maisPerto.falta.length, maisPerto.estimado),
    destino: 'opcao-mercado', aoTocar: () => setPref({ ordem: 'perto' }) });
  const referencia = opcoes.find((o) => o.k === 'perto') ?? opcoes.find((o) => o.k === 'um');
  const nomeOpcao = (o: Opcao) => o.k === 'um' ? top!.m : o.k === 'perto' ? maisPerto!.m : o.k === 'dupla' ? `${dupla!.a} e ${dupla!.b}` : `${o.nMerc} mercados`;
  const irPara = (o: Opcao) => {
    o.aoTocar?.();
    if (aba !== 'comparar') setAba('comparar');   // tocado no resumo da Minha cesta (2.1): abre Onde comprar no detalhe
    const reduzir = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    setTimeout(() => document.getElementById(o.destino)?.scrollIntoView({ behavior: reduzir ? 'auto' : 'smooth', block: 'start' }), 60);
  };

  // Novidades na sua cesta (2.4): alerta atingido, alerta a menos de 10% do alvo e item com preço "de/por" hoje.
  // Usa o menor preço do item (o mesmo valor que o sino sugere como alvo).
  type Novidade = { k: string; ordem: number; texto: ReactNode };
  const novidades: Novidade[] = [];
  if (dados) for (const c of itens) {
    const menor = Object.values(porItem[c.id]).sort((a, b) => v(c, a) - v(c, b))[0];
    if (!menor) continue;
    const valor = v(c, menor); const a = alertaDoItem(c);
    if (a?.preco_alvo != null && valor <= a.preco_alvo) {
      novidades.push({ k: `a-${c.id}`, ordem: 0, texto: <><b>{c.rotulo}</b> chegou ao seu alvo: {brl(valor)} no {menor.mercado} (alvo {brl(a.preco_alvo)})</> });
    } else if (a?.preco_alvo != null && valor <= a.preco_alvo * 1.1) {
      novidades.push({ k: `p-${c.id}`, ordem: 1, texto: <><b>{c.rotulo}</b>: {brl(valor)} no {menor.mercado}, faltam {brl(valor - a.preco_alvo)} para o seu alvo de {brl(a.preco_alvo)}</> });
    }
    if (menor.de > menor.preco) {
      novidades.push({ k: `b-${c.id}`, ordem: 2, texto: <><b>{c.rotulo}</b> baixou: {brl(menor.preco)} no {menor.mercado} (era {brl(menor.de)}, −{Math.round((1 - menor.preco / menor.de) * 100)}%)</> });
    }
  }
  novidades.sort((x, y) => x.ordem - y.ordem);

  // Cesta vazia (2.3): só depois de ler a cesta do aparelho e da conta, para quem tem itens não ver as boas-vindas piscarem
  const vazia = !itens.length && nuvem !== 'carregando';
  const ofertasHoje = (dados?.lista ?? []).filter((o) => o.de > o.preco && o.preco / o.de >= 0.4)
    .sort((a, b) => a.preco / a.de - b.preco / b.de).slice(0, 3);

  const blocoResumo = itens.length > 0 && opcoes.length > 1 && referencia ? (
    <section className="resumo-opcoes" aria-labelledby="resumo-titulo">
      <h2 id="resumo-titulo" className="section-title">{aba === 'lista' ? 'Onde a sua cesta sai mais barata' : 'Quanto sai cada forma de comprar'}</h2>
      <ul>
        {opcoes.map((o) => {
          const economia = referencia.valor - o.valor;
          return (
            <li key={o.k}>
              <button type="button" className={`opcao${o.k === OPCAO_EQUILIBRIO ? ' equilibrio' : ''}`} onClick={() => irPara(o)}
                aria-label={`${o.titulo}: ${brl(o.valor)}, ${nomeOpcao(o)}. Ver detalhes`}>
                <span className="opcao-titulo">{o.titulo}{o.k === OPCAO_EQUILIBRIO && <span className="selo-equilibrio">Equilíbrio</span>}</span>
                <span className="opcao-total">{o.est && o.k !== 'roteiro' ? '≈ ' : ''}{brl(o.valor)}</span>
                <span className="opcao-onde">{nomeOpcao(o)}</span>
                {o.dist && <span className="opcao-info">📍 {o.dist}</span>}
                {o === referencia ? <span className="opcao-info">Referência da economia</span>
                  : economia >= 0.01 ? <span className="opcao-economia">{brl(economia)} a menos</span>
                  : <span className="opcao-info">{brl(-economia)} a mais</span>}
                {o.est && <span className="opcao-est">{o.est}</span>}
              </button>
            </li>
          );
        })}
      </ul>
      <span className="muted">Economia comparada com {referencia.k === 'perto' ? `comprar tudo no mais perto (${maisPerto!.m})` : `comprar tudo no ${top!.m}`}. Toque numa opção para ver a lista, o mapa e o PDF.</span>
    </section>
  ) : null;

  // Lista de compras em PDF (14/11): a lista da opção escolhida (um mercado, dois ou o roteiro), agrupada por mercado,
  // com caixinhas para marcar. Abre numa janela própria e chama a impressão do navegador ("Salvar como PDF";
  // no iPhone, Compartilhar → Salvar em Arquivos).
  type ItemPdf = { c: ItemCesta; o: Oferta; valor: number };
  const grupoDe = (m: string, l: ItemPdf[], estimados: { c: ItemCesta; valor: number }[] = []) => {
    const d = locais.distancia(m);
    return {
      mercado: m, onde: d ? `${d.loja.nome} · ${fmtKm(d.km)} de ${d.ref.rotulo} · ${fmtTempo(d.km)} (estimativa)` : '',
      linhas: [
        ...l.map(({ c, o, valor }) => ({ txt: `${sel[c.id]}${kgs.has(c.id) ? ' kg' : '×'} ${c.rotulo}`, prod: `${!kgs.has(c.id) && o.marca && !norm(o.nome).includes(norm(o.marca)) ? `${o.marca} · ` : ''}${o.nome}`, valor: brl(valor) })),
        ...estimados.map(({ c, valor }) => ({ txt: `${sel[c.id]}${kgs.has(c.id) ? ' kg' : '×'} ${c.rotulo}`, prod: 'sem preço hoje neste mercado', valor: `≈ ${brl(valor)}` })),
      ],
      total: brl(l.reduce((t, x) => t + x.valor, 0) + estimados.reduce((t, x) => t + x.valor, 0)),
    };
  };
  const pdfLista = (titulo: string, grupos: ReturnType<typeof grupoDe>[], total: number, avisos: string[] = []) => {
    const esc = (t: string) => t.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]!));
    const dia = dados?.dia ? dados.dia.split('-').reverse().join('/') : '';
    const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Lista de compras - Mercato</title>
<style>body{font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#0F172A;margin:24px;font-size:14px}
h1{font-size:20px;margin:0 0 2px;color:#047857}h2{font-size:16px;margin:18px 0 2px}.m{color:#475569;font-size:12px}
ul{list-style:none;padding:0;margin:6px 0}li{display:flex;gap:10px;padding:6px 0;border-bottom:1px solid #E2E8F0}
.cx{width:14px;height:14px;border:1.5px solid #0F172A;border-radius:3px;flex:none;margin-top:2px}.p{flex:1}.v{white-space:nowrap;font-weight:600}
.t{text-align:right;font-weight:700;margin-top:4px}.g{font-size:18px;font-weight:800;margin-top:16px}@media print{body{margin:12mm}}</style></head><body>
<h1>Lista de compras · Mercato</h1><div class="m">${esc(titulo)} · preços de ${esc(dia)} coletados nos sites e encartes; podem mudar na loja.</div>
${grupos.map((g) => `<h2>${esc(g.mercado)}</h2>${g.onde ? `<div class="m">${esc(g.onde)}</div>` : ''}<ul>${g.linhas.map((x) => `<li><span class="cx"></span><span class="p"><b>${esc(x.txt)}</b><br><span class="m">${esc(x.prod)}</span></span><span class="v">${esc(x.valor)}</span></li>`).join('')}</ul><div class="t">Subtotal: ${esc(g.total)}</div>`).join('')}
${avisos.length ? `<p class="m">${avisos.map(esc).join('<br>')}</p>` : ''}
<div class="g">Total: ${esc(brl(total))}</div></body></html>`;
    const w = window.open('', '_blank');
    if (!w) return mostrarAviso({ texto: 'O navegador bloqueou a nova janela. Permita pop-ups deste site para gerar o PDF.' });
    w.document.write(html); w.document.close();
    // espera o navegador desenhar a página antes de abrir a impressão (uma vez só)
    setTimeout(() => { try { w.focus(); w.print(); } catch { /* a pessoa imprime pelo menu */ } }, 500);
  };

  return (
    <>
      {aba === 'lista' ? (vazia ? (
        <div className="boas-vindas-cesta">
          <h1>Monte sua cesta e veja onde ela sai mais barata</h1>
          {dados && <p className="lead">{dados.lista.length.toLocaleString('pt-BR')} preços de hoje em {dados.mercados.length} mercados de Indaiatuba.</p>}
        </div>
      ) : (
        <div>
          <h1>Minha cesta</h1>
          <p className="lead">Marque os itens e ajuste as quantidades. Depois, veja onde sai mais barato.</p>
        </div>
      )) : (
        <div className="passo-topo">
          <button type="button" className="voltar-lista" onClick={() => setAba('lista')}>← Editar lista ({itens.length} {itens.length === 1 ? 'item' : 'itens'})</button>
          <h1>Onde comprar</h1>
        </div>
      )}

      {aba === 'lista' && !dados && !erro && (
        <p className="buscando" role="status"><span className="giro" aria-hidden="true" />Buscando os preços de hoje nos mercados…</p>
      )}

      {aba === 'comparar' && !dados && <Carregando />}
      {aba === 'comparar' && dados && <>

      {blocoResumo}

      {/* Critério de compra no topo (14/11): a pessoa escolhe antes de ver a recomendação; vale para o mercado
          recomendado e para a ordem da lista. Os filtros de lojas ficam junto. */}
      {itens.length > 0 && (
        <div className="criterio-topo">
          <div className="section-header-bar">
            <h2 className="section-title">Como você quer comprar?</h2>
            <button type="button" className="btn-filter-toggle" aria-expanded={filtrosAbertos} onClick={() => setFiltrosAbertos(!filtrosAbertos)}>
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M3 5h18M6 12h12M10 19h4" /></svg>
              Filtros{ocultosFiltro > 0 ? ` (${ocultosFiltro} ocultos)` : ''} {filtrosAbertos ? '▴' : '▾'}
            </button>
          </div>
      {itens.length > 0 && (
        <div className="segmentado ordem-mercados" role="radiogroup" aria-label="Critério de compra">
          {([['preco', 'Menor preço'], ['perto', 'Mais perto'], ['completo', 'Tem tudo']] as const).map(([k, t]) => (
            <button key={k} type="button" role="radio" aria-checked={pref.ordem === k} className={pref.ordem === k ? 'ativo' : ''}
              disabled={k === 'perto' && !locais.refs.length} title={k === 'perto' && !locais.refs.length ? 'Cadastre um endereço para ordenar pela distância' : undefined}
              onClick={() => setPref({ ordem: k })}>{t}</button>
          ))}
        </div>
      )}
      {itens.length > 0 && (
        <span className="muted ordem-ajuda">{pref.ordem === 'perto' ? 'Mostra primeiro o mercado mais perto do seu endereço que tem preço para a maior parte da cesta.'
          : pref.ordem === 'completo' ? 'Mostra primeiro o mercado mais barato entre os que têm preço para todos os itens da cesta.'
          : 'Mostra primeiro o mercado onde a cesta inteira sai mais barata.'}</span>
      )}
      {itens.length > 0 && filtrosAbertos && (
        <div className="filtros-painel">
          <div className="filtro-grupo" role="radiogroup" aria-label="Distância máxima">
            <span>Distância máxima</span>
            {([null, 2, 3, 5] as const).map((k) => (
              <button key={String(k)} type="button" className={`tab-button${pref.maxKm === k ? ' active' : ''}`} aria-pressed={pref.maxKm === k}
                disabled={k !== null && !locais.refs.length} onClick={() => setPref({ maxKm: k })}>{k === null ? 'Sem limite' : `até ${k} km`}</button>
            ))}
          </div>
          <label className="filtro-check"><input type="checkbox" checked={pref.semSocios} onChange={(e) => setPref({ semSocios: e.target.checked })} /> Ocultar mercados só para sócios (Sam&apos;s Club)</label>
          {poucos > 0 && ranking.length > poucos && (
            <label className="filtro-check"><input type="checkbox" checked={todosMercados} onChange={(e) => setTodosMercados(e.target.checked)} /> Mostrar mercados com poucos preços hoje ({poucos})</label>
          )}
          <span className="muted">{!locais.refs.length ? 'Cadastre um endereço para ordenar e filtrar pela distância. ' : ''}Os filtros valem para toda a comparação (mais barato, 2 mercados e roteiro) e ficam guardados neste aparelho.</span>
        </div>
      )}
        </div>
      )}
      {!itens.length ? <div className="empty">Sua lista está vazia.<br /><button type="button" className="btn btn-primary" onClick={() => setAba('lista')}>Montar a lista</button></div> : rec ? (
        <div className="recommendation-card" id="opcao-mercado">
          <span className="muted">{tituloRec}</span>
          <span className="recommendation-price">{fmt(rec)}</span>
          {rec.falta.length > 0 && <span className="est-resumo">{rec.falta.length === 1 ? '1 item estimado' : `${rec.falta.length} itens estimados`}: ≈ {brl(rec.estimado)} do total</span>}
          <span><b>{rec.m}</b>{SO_SOCIOS.has(rec.m) && <> <TagSocios /></>}{rec === top ? segundo && ` · ${brl(segundo.valor - top.valor)} a menos que o 2º mais barato (${segundo.m})` : top && ` · ${brl(rec.valor - top.valor)} a mais que o mais barato (${top.m})`}</span>
          {(() => { const d = locais.distancia(rec.m); return d && <span className="dist">📍 {fmtKm(d.km)} de {d.ref.rotulo} ({d.loja.nome}) · {fmtTempo(d.km)}</span>; })()}
          {rec.falta.length > 0 && (
            <span className="cond">
              Sem preço hoje no {rec.m}: {rec.falta.join(', ')} (estimado pelo preço mediano dos outros mercados).
            </span>
          )}
          {rec === top && melhorCompleto && (
            <span className="muted">Melhor com todos os itens: <b>{melhorCompleto.m}</b>, {brl(melhorCompleto.valor)}</span>
          )}
          {rec === top && pior && pior !== segundo && pior !== top && (
            <span className="muted">{brl(pior.valor - top.valor)} a menos que o mais caro ({pior.m}{pior.falta.length ? ', total estimado' : ''})</span>
          )}
          {!semItem.length && roteiro.length > 1 && <span className="muted">Comprando cada item no mais barato: {brl(ideal)} ({roteiro.length} mercados, veja o roteiro inteligente no fim)</span>}
          <a className="btn-action-primary" href={linkLoja(rec.m)} target="_blank" rel="noopener noreferrer">Como chegar ao {rec.m} ↗</a>
          <span className="muted rec-tempo">O tempo com o trânsito de agora aparece no Google Maps.</span>
          <button type="button" className="btn-action-secundario" onClick={() => pdfLista(`Comprar tudo no ${rec.m}`, [grupoDe(rec.m, rec.escolhas.map(({ c, o }) => ({ c, o, valor: v(c, o) * sel[c.id] })), rec.estimados)], rec.valor)}>Gerar PDF da lista</button>
          <details className="rec-itens">
            <summary className="market-expand-link">Ver itens</summary>
            <ul>
              {rec.escolhas.map(({ c, o }) => (
                <li key={c.id}>{sel[c.id]}{kgs.has(c.id) ? ' kg' : '×'} {c.rotulo}: <b>{!kgs.has(c.id) && o.marca && !norm(o.nome).includes(norm(o.marca)) ? `${o.marca} · ` : ''}{o.nome}</b> · {brl(v(c, o) * sel[c.id])}</li>
              ))}
              {rec.estimados.map(({ c, valor }) => (
                <li key={c.id} className="estimado">{sel[c.id]}{kgs.has(c.id) ? ' kg' : '×'} {c.rotulo}: sem preço hoje, estimado ≈ {brl(valor)}</li>
              ))}
            </ul>
          </details>
        </div>
      ) : null}

      <Enderecos refs={locais.refs} adicionar={locais.adicionar} remover={locais.remover} />

      {dupla && economiaDupla >= 1 && (() => {
        const totA = dupla.emA.reduce((t, x) => t + x.valor, 0), totB = dupla.emB.reduce((t, x) => t + x.valor, 0);
        const pct = (x: number) => Math.round((x / (totA + totB)) * 100);
        const da = locais.distancia(dupla.a), db = locais.distancia(dupla.b);
        const entre = da && db ? km(da.loja, db.loja) : locais.entre(dupla.a, dupla.b);
        return (
          <div className="dupla" id="opcao-dupla">
            <span className="muted">Dividindo em 2 mercados</span>
            <span className="grande">{dupla.estimado > 0 ? '≈ ' : ''}{brl(dupla.valor)}</span>
            {dupla.fora.length > 0 && <span className="est-resumo">{dupla.fora.length === 1 ? '1 item estimado' : `${dupla.fora.length} itens estimados`}: ≈ {brl(dupla.estimado)} do total</span>}
            <span><b>{brl(economiaDupla)} a menos</b> que comprar tudo no {top!.m}</span>
            <div className="dupla-lados">
              {([[dupla.a, dupla.emA, totA, da], [dupla.b, dupla.emB, totB, db]] as const).map(([m, l, tot, d]) => (
                <div key={m}>
                  <b>{m}</b>
                  <span>{l.length} {l.length === 1 ? 'item' : 'itens'} · {brl(tot)} ({pct(tot)}%)</span>
                  {d && <span className="muted">📍 {fmtKm(d.km)} de {d.ref.rotulo} · {fmtTempo(d.km)}</span>}
                  <details><summary>Ver itens</summary>
                    <ul>{l.map(({ c, o, valor }) => <li key={c.id}>{sel[c.id]}{kgs.has(c.id) ? ' kg' : '×'} {c.rotulo}: <b>{o.nome}</b> · {brl(o.preco)}{sel[c.id] !== 1 ? ` cada = ${brl(valor)}` : ''}</li>)}</ul>
                  </details>
                </div>
              ))}
            </div>
            {dupla.fora.length > 0 && (
              <div className="dupla-fora">
                <b>{dupla.fora.length === 1 ? '1 item sem preço' : `${dupla.fora.length} itens sem preço`} no {dupla.a} e no {dupla.b}</b>
                <span className="muted">Entram no total com o preço do meio dos outros mercados (≈ {brl(dupla.estimado)}).</span>
                <ul>{dupla.fora.map(({ c, valor }) => {
                  const melhor = Object.values(porItem[c.id]).sort((x, y) => v(c, x) - v(c, y))[0];
                  return <li key={c.id}>{sel[c.id]}{kgs.has(c.id) ? ' kg' : '×'} {c.rotulo}: ≈ {brl(valor)}{melhor ? <> · mais barato no <b>{melhor.mercado}</b> ({brl(melhor.preco)})</> : ''}</li>;
                })}</ul>
              </div>
            )}
            {entre !== null && <span className="muted">Distância entre as duas lojas: {fmtKm(entre)} em linha reta.</span>}
            <a className="btn-action-primary" href={linkRoteiro([dupla.a, dupla.b])} target="_blank" rel="noopener noreferrer">Ver roteiro de compra no mapa ↗</a>
            <button type="button" className="btn-action-secundario" onClick={() => pdfLista(`Dividir entre ${dupla!.a} e ${dupla!.b}`,
              [grupoDe(dupla!.a, dupla!.emA), grupoDe(dupla!.b, dupla!.emB)], dupla!.valor,
              dupla!.fora.map(({ c, valor }) => `${sel[c.id]}${kgs.has(c.id) ? ' kg' : '×'} ${c.rotulo}: sem preço nos dois (≈ ${brl(valor)})`))}>Gerar PDF da lista</button>
          </div>
        );
      })()}

      {itens.length > 0 && (
        <div className="section-header-bar">
          <h2 className="section-title">Total em cada mercado</h2>
        </div>
      )}
      {itens.length > 0 && (
        <div className="market-list">
          {lista.filter((r) => todosMercados || r.confiavel || poucos === ranking.length).map((r, i, vis) => (
            <div key={r.m} id={`mercado-${slug(r.m)}`} className={`market-card${r.confiavel ? '' : ' poucos-precos'}`}>
              {!r.confiavel && pref.ordem === 'preco' && (i === 0 || vis[i - 1].confiavel) && (
                <span className="grupo-ranking">Poucos itens com preço hoje (total quase todo estimado)</span>
              )}
              <div className="market-card-header">
                <span><span className="market-name">{r.m}</span>{SO_SOCIOS.has(r.m) && <> <TagSocios /></>}{distTxt(r.m) && <span className="market-distance">📍 {distTxt(r.m)}</span>}</span>
                <span className="market-total">{fmt(r)}</span>
              </div>
              {r.falta.length > 0 && <span className="est-resumo">{r.falta.length === 1 ? '1 item estimado' : `${r.falta.length} itens estimados`} de {itens.length}: ≈ {brl(r.estimado)} do total</span>}
              {r.falta.length > 0 && (
                <span className="market-warning">
                  <span aria-hidden="true">⚠</span>
                  <span>Sem preço hoje: {r.falta.join(', ')}. Estimado pelo preço mediano dos outros mercados.</span>
                </span>
              )}
              {r.escolhas.length > 0 && (
                <details>
                  <summary className="market-expand-link">Ver marcas e preços</summary>
                  <ul>
                    {r.escolhas.map(({ c, o }) => (
                      <li key={c.id}>{sel[c.id]}{kgs.has(c.id) ? ' kg' : '×'} {c.rotulo}{tamTxt(c)}: <b>{!kgs.has(c.id) && o.marca && !norm(o.nome).includes(norm(o.marca)) ? `${o.marca} · ` : ''}{o.nome}</b>{' '}
                        {brl(o.preco)}{(kgs.has(c.id) || refs[c.id]) && <> · {brl(pu(c, o))}/{unis.has(c.id) ? 'cápsula' : o.ub}</>}
                        {' '}<span className="subtotal">= {brl(v(c, o) * sel[c.id])}</span></li>
                    ))}
                    {r.estimados.map(({ c, valor, outrasMarcas }) => (
                      <li key={c.id} className="estimado">
                        {sel[c.id]}{kgs.has(c.id) ? ' kg' : '×'} {c.rotulo}{tamTxt(c)}: {!marcas[c.id] ? 'sem preço neste mercado'
                          : 'sem preço para esta marca'}, estimado pelo preço mediano {outrasMarcas ? 'das outras marcas deste mercado'
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
      {candidatosRoteiro.length > 1 && top && (
        <section className="ideal" id="opcao-roteiro">
          <span className="ideal-titulo">Roteiro inteligente <span className="muted">(opcional)</span></span>
          <span className="muted">Cada item no mercado mais barato. Toque nos mercados para tirar do roteiro os que você não quer visitar; o total se ajusta na hora.</span>
          <div className="chips roteiro-mercados" role="group" aria-label="Mercados do roteiro">
            {candidatosRoteiro.map((m) => (
              <button key={m} type="button" className="chip" aria-pressed={!foraRoteiro.includes(m)} onClick={() => trocarRoteiro(m)}>
                {foraRoteiro.includes(m) ? '＋' : '✓'} {m}
              </button>
            ))}
          </div>
          {semItem.length > 0 && <span className="cond">Fora do roteiro por falta de preço nos mercados escolhidos: {semItem.join('; ')}.</span>}
          {!roteiro.length ? <span className="cond">Escolha ao menos um mercado.</span> : <>
          <span className="grande">{brl(ideal)}</span>
          {semItem.length > 0 && <span className="muted">Total sem os itens que ficaram fora do roteiro.</span>}
          <span>{top.valor - ideal > 0 ? <><b>{brl(top.valor - ideal)} a menos</b> que tudo no {top.m}</> : <>Não compensa: sai {brl(ideal - top.valor)} a mais que tudo no {top.m}</>}, passando por {roteiro.length} {roteiro.length === 1 ? 'mercado' : 'mercados'}</span>
          <ul className="ideal-mercados">
            {roteiro.map((r) => (
              <li key={r.m}>
                <span><b>{r.m}</b>{SO_SOCIOS.has(r.m) && <> <TagSocios /></>}{r.d && <span className="dist"> · 📍 {fmtKm(r.d.km)} de {r.d.ref.rotulo} · {fmtTempo(r.d.km)}</span>}</span>
                <span>{r.l.length} {r.l.length === 1 ? 'item' : 'itens'} · {brl(r.total)}</span>
                <details><summary>Ver itens</summary>
                  <ul>{r.l.map(({ c, o, valor }) => <li key={c.id}>{sel[c.id]}{kgs.has(c.id) ? ' kg' : '×'} {c.rotulo}: <b>{o.nome}</b> · {brl(valor)}</li>)}</ul>
                </details>
              </li>
            ))}
          </ul>
          {percurso ? <span className="muted">Percurso aproximado: {fmtKm(percurso.km)} em linha reta (≈ {minCarro(percurso.km) + 2 * (roteiro.length - 1)} min de carro, sem contar o tempo dentro das lojas), saindo de {percurso.de} e voltando
            {semLocal.length ? ` (sem ${semLocal.join(' e ')}, que ainda não ${semLocal.length === 1 ? 'tem' : 'têm'} o endereço da loja no app)` : ''}.</span>
            : !locais.refs.length ? <span className="muted">Cadastre um endereço para ver a distância até cada mercado.</span> : null}
          {roteiro.length > 1 && <a className="btn-action-primary" href={linkRoteiro(roteiro.map((r) => r.m))} target="_blank" rel="noopener noreferrer">Abrir roteiro no mapa ↗</a>}
          <button type="button" className="btn-action-secundario" onClick={() => pdfLista(`Roteiro por ${roteiro.length} ${roteiro.length === 1 ? 'mercado' : 'mercados'}`,
            roteiro.map((r) => grupoDe(r.m, r.l)), ideal, semItem.map((x) => `${x}: fora do roteiro`))}>Gerar PDF da lista</button>
          </>}
        </section>
      )}

      <p className="muted">
        {(() => { const enc = ranking.map((r) => r.m).filter((m) => ENCARTE.has(m));
          return enc.length ? `${enc.join(', ').replace(/, ([^,]*)$/, ' e $1')} ${enc.length === 1 ? 'entra' : 'entram'} só com os itens em promoção no encarte. ` : ''; })()}
        Quando falta preço, o total usa o preço mediano dos outros mercados e aparece com ≈. A lista vai do menor para o maior valor.
      </p>
      </>}

      {aba === 'lista' && <>
      {vazia && (
        <section className="card stack basicos" aria-labelledby="basicos-titulo">
          <h2 id="basicos-titulo" className="section-title">Começar pelos básicos</h2>
          <div className="chips" role="group" aria-label="Itens básicos">
            {BASICOS.map((b) => {
              const on = basicos.includes(b.rotulo);
              return (
                <button key={b.rotulo} type="button" className="chip" aria-pressed={on}
                  onClick={() => setBasicos((x) => on ? x.filter((y) => y !== b.rotulo) : [...x, b.rotulo])}>{on ? '✓ ' : '＋ '}{b.rotulo}</button>
              );
            })}
          </div>
          <button type="button" className="btn btn-primary" disabled={!basicos.length} onClick={adicionarBasicos}>
            {basicos.length ? `Adicionar ${basicos.length} ${basicos.length === 1 ? 'item' : 'itens'}` : 'Escolha ao menos um item'}
          </button>
        </section>
      )}
      {sessao && (vazia || notaAberta || notaPendente || avisoNota) && (
        <section className="card stack cesta-nota" id="painel-nota" aria-label="Montar a cesta pela nota fiscal">
          <h2 className="section-title">{vazia ? 'Usar a nota da última compra' : 'Montar pela nota da compra'}</h2>
          {vazia && <span className="muted">Fotografe a nota ou leia o QR Code: os itens que você comprou viram a sua cesta.</span>}
          <EnviarNota textoBotao="Ler a nota e montar a cesta" aoLer={(id) => usarNota(id)} />
          <button type="button" className="btn btn-link" onClick={() => usarNota()}>Usar de novo a última nota enviada</button>
          {notaPendente && (
            <div className="alert stack" role="group" aria-label="Como usar a nota">
              <span>Sua lista já tem {Object.keys(sel).length} itens. O que fazer com eles?</span>
              <button type="button" className="btn btn-primary" onClick={() => usarNota(notaPendente.id, 'juntar')}>Juntar a nota à minha lista</button>
              <button type="button" className="btn btn-secondary" onClick={() => usarNota(notaPendente.id, 'substituir')}>Trocar a lista pelos itens da nota</button>
              <button type="button" className="btn btn-link" onClick={() => setNotaPendente(null)}>Cancelar</button>
            </div>
          )}
          {avisoNota && <div className="alert alert-ok" role="status">{avisoNota}</div>}
          <Link href="/notas" className="muted cesta-nota-link">Ver as notas enviadas</Link>
        </section>
      )}
      {!vazia && !itens.length && nuvem === 'carregando' && <p className="buscando" role="status"><span className="giro" aria-hidden="true" />Carregando a sua cesta…</p>}
      {!vazia && blocoResumo}
      {!vazia && novidades.length > 0 && (
        <section className="novidades" aria-labelledby="novidades-titulo">
          <h2 id="novidades-titulo" className="section-title">Novidades na sua cesta</h2>
          <ul>{novidades.slice(0, 5).map((n) => <li key={n.k}>{n.texto}</li>)}</ul>
        </section>
      )}
      {vazia ? <h2 className="section-title">Ou digite um item</h2>
        : <h2 className="section-title">Itens da cesta <small className="muted">· toque no sino para receber alerta de preço</small></h2>}
      <form className="card stack" onSubmit={adicionar}>
        <div className="field">
          <label htmlFor="novo-item">Adicionar item</label>
          <div className="row" style={{ flexWrap: 'nowrap' }}>
            <input id="novo-item" className="input" autoComplete="off" placeholder="Ex.: heineken 350 ml, alho, sabão em pó omo 1,6 kg"
              value={novo} onChange={(e) => { setNovo(e.target.value); setAvisoNovo(''); }} style={{ flex: 1, minWidth: 0 }} />
            <button className="btn btn-primary" disabled={!novo.trim()}>Adicionar</button>
            {sessao && !vazia && (
              <button type="button" className="btn btn-secondary btn-camera" aria-expanded={notaAberta} aria-controls="painel-nota"
                aria-label="Montar pela nota da compra" title="Montar pela nota da compra"
                onClick={() => { setNotaAberta(!notaAberta); if (!notaAberta) setTimeout(() => document.getElementById('painel-nota')?.scrollIntoView({ block: 'start' }), 60); }}>
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true">
                  <path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" />
                </svg>
              </button>
            )}
          </div>
          <label className="row" style={{ gap: 8, fontWeight: 600, flexWrap: 'nowrap', alignItems: 'flex-start' }}>
            <input type="checkbox" className="check" checked={novoEhHorti} onChange={(e) => setNovoHorti(e.target.checked)} />
            <span>Hortifrúti (compara pelo preço do quilo, sem marca)</span>
          </label>
          <span className="help">
            {novoPrevia === null ? 'Para produtos embalados, inclua o tamanho (350 ml, 1 kg). Use o sinal de menos para excluir: café -cápsula. Marcamos Hortifrúti sozinhos quando reconhecemos o item.'
              : novoPrevia ? `${novoPrevia} preços encontrados hoje.` : 'Nenhum preço hoje com essas palavras. Tente menos palavras.'}
          </span>
          {avisoNovo && <div className="alert alert-error" role="alert">{avisoNovo}</div>}
        </div>
      </form>
      {vazia && ofertasHoje.length > 0 && (
        <section className="ofertas-hoje" aria-labelledby="ofertas-hoje-titulo">
          <div className="section-header-bar">
            <h2 id="ofertas-hoje-titulo" className="section-title">Ofertas de hoje</h2>
            <Link href="/ofertas" className="ver-todas">Ver todas</Link>
          </div>
          <ul>
            {ofertasHoje.map((o) => (
              <li key={o.id}>
                <span className="oh-nome">{o.marca && !norm(o.nome).includes(norm(o.marca)) ? `${o.marca} · ` : ''}{o.nome}</span>
                <span className="oh-onde">{o.mercado}</span>
                <span className="oh-preco"><s>{brl(o.de)}</s> <b>{brl(o.preco)}</b> <span className="oh-pct">−{Math.round((1 - o.preco / o.de) * 100)}%</span></span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {!vazia && <>
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
                {sessao && (
                  <button type="button" className={`sino${alertaDoItem(c) ? ' ligado' : ''}`} aria-expanded={sinoAberto === c.id}
                    aria-label={alertaDoItem(c) ? `Alerta de ${c.rotulo} ligado: mudar` : `Criar alerta para ${c.rotulo}`}
                    onClick={() => abrirSino(c, menor && v(c, menor))}>
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9a6 6 0 0 1 12 0c0 6 2 7 2 7H4s2-1 2-7" /><path d="M10 20a2 2 0 0 0 4 0" /></svg>
                  </button>
                )}
              </div>
              {(sinoAberto === c.id || alertaDoItem(c)) && (() => {
                const a = alertaDoItem(c);
                return sinoAberto === c.id ? (
                  <form className="alvo-item" onSubmit={(e) => { e.preventDefault(); salvarAlerta(c); }}>
                    <label htmlFor={`alvo-${c.id}`}>Avisar quando chegar a R$</label>
                    <input id={`alvo-${c.id}`} className="input" inputMode="decimal" placeholder="sem alvo" value={alvoTxt} onChange={(e) => setAlvoTxt(e.target.value)} />
                    <button className="btn btn-primary">{a ? 'Salvar' : 'Criar alerta'}</button>
                    {a && <button type="button" className="btn btn-link" onClick={() => removerAlerta(c)}>Desligar alerta</button>}
                    <span className="help">Sem preço-alvo, avisamos quando ficar 15% abaixo do normal.</span>
                  </form>
                ) : a && (
                  <button type="button" className="alvo-resumo" onClick={() => abrirSino(c)}>
                    Alerta ligado{a.preco_alvo != null ? ` · até ${brl(a.preco_alvo)}` : ' · 15% abaixo do normal'}{a.marca ? ` · ${a.marca}` : ''}
                  </button>
                );
              })()}
              <div className="meta">
                {menor
                  ? <span>{kgs.has(c.id) ? menor.nome : menor.marca || 'Sem marca'} · <b>{brl(v(c, menor))}{kgs.has(c.id) ? '/kg' : ''}</b>{refs[c.id] ? ` por ${fmtTam(refs[c.id])}` : ''} no <span className="mkt">{menor.mercado}</span></span>
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
                    <select className="marca-sel" aria-label={`Marca de ${c.rotulo}`} value={marcaCompacta(marcas[c.id] ?? '')}
                      onChange={(e) => fixarMarca(c.id, e.target.value)}>
                      <option value="">Qualquer marca</option>
                      {marcasDe(c.id).map((m) => (
                        <option key={m.chave} value={m.chave}>{m.nome} ({m.mercados} {m.mercados === 1 ? 'mercado' : 'mercados'})</option>
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

      {/* A lista grava sozinha a cada mudança: no fim dela fica só a confirmação, sem botão de salvar no caminho */}
      <div className="lista-rodape">
        <span className={salvo.startsWith('Não') ? 'erro' : ''} role="status">
          {salvo || (nuvem === 'salvando' ? 'Salvando na sua conta…'
            : nuvem === 'erro' ? 'Não foi possível salvar na sua conta agora. A lista ficou salva neste aparelho.'
            : nuvem === 'carregando' ? 'Carregando a cesta da sua conta…'
            : `Cesta salva na sua conta${itens.length ? ` (${itens.length} ${itens.length === 1 ? 'item' : 'itens'})` : ''}: abre igual no celular e no computador.`)}
        </span>
        {itens.length > 0 && (
          <button type="button" className="btn btn-link" onClick={() => {
            if (!window.confirm('Limpar a lista? Os itens adicionados saem e os da cesta ficam desmarcados.')) return;
            salvarExtras([]); mudar({}); setMarcas({}); setAvisoNota(''); setSalvo('');
            try { localStorage.setItem('cesta-marca', '{}'); } catch {}
          }}>Limpar lista</button>
        )}
      </div>
      </>}
      {itens.length > 0 && (
        <div className="cta-fixo">
          <button type="button" className="cta-fixo-btn" onClick={() => setAba('comparar')}>
            <span>Ver onde comprar mais barato ➔</span>
            {top && <small>{itens.length} {itens.length === 1 ? 'item' : 'itens'} · a partir de {fmt(top)} no {top.m}</small>}
          </button>
        </div>
      )}
      </>}
    </>
  );
}

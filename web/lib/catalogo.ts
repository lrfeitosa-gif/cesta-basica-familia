// Mesma regra do worker/catalogo.py: liga o nome de um produto a um item base do cadastro.
// A 1ª palavra do nome é a 1ª do item e as outras palavras do item aparecem (ou o nome começa com o item inteiro);
// nenhuma exclusão aparece. Vale o item mais específico (mais palavras).
export type ItemBase = { id: number; termo: string; nome: string; exclusoes: string[]; ativo: boolean };

const LIGACAO = new Set(['de', 'do', 'da', 'em', 'com', 'e', 'tipo', '1', '500g']);

export const normCat = (s: string | null | undefined) =>
  (s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(Boolean).join(' ');

const raiz = (w: string) => (w.endsWith('es') && w.length > 4 ? w.slice(0, -2) : w.endsWith('s') && w.length > 3 ? w.slice(0, -1) : w);

export function criarClassificador(itens: ItemBase[]) {
  const regras = itens.filter((i) => i.ativo).map((i) => ({
    id: i.id,
    t: normCat(i.termo).split(' ').filter((w) => w && !LIGACAO.has(w)).map(raiz),
    exc: (i.exclusoes ?? []).map(normCat).filter(Boolean).map((e) => ` ${e} `),
  })).filter((r) => r.t.length).sort((a, b) => b.t.length - a.t.length);
  return (nome: string): number | null => {
    const n = normCat(nome);
    const ws = n.split(' ').filter(Boolean).map(raiz);
    if (!ws.length) return null;
    const comEspaco = ` ${n} `;
    for (const r of regras) {
      const casa = (ws[0] === r.t[0] && r.t.slice(1).every((x) => ws.includes(x))) || (r.t.length > 1 && ws.slice(0, r.t.length).join(' ') === r.t.join(' '));
      if (casa && !r.exc.some((e) => comEspaco.includes(e))) return r.id;
    }
    return null;
  };
}

import * as cheerio from 'cheerio';

// Leitura da NFC-e de SP pela URL do QR Code (mesma lógica de worker/motor/nfce.py).
// Lê só itens, quantidades, preços, CNPJ da loja, data e total. CPF e nome do consumidor nunca são lidos.

export type ItemNota = { descricao: string; quantidade: number; unidade: string; preco_unitario: number };
export type Nota = { chave: string; cnpj: string; loja: string; data: string; total: number; itens: ItemNota[] };

const HOSTS_SEFAZ = /(^|\.)fazenda\.sp\.gov\.br$/;

export function chaveDaUrl(url: string): string {
  const m = url.match(/p=(\d{44})/);
  if (!m) throw new Error('Este QR Code não é de nota fiscal (NFC-e).');
  return m[1];
}

export function validarUrl(url: string): URL {
  const u = new URL(url);
  // Só consultamos o portal da Sefaz-SP: evita que o servidor busque endereços arbitrários.
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error('Link inválido.');
  if (!HOSTS_SEFAZ.test(u.hostname)) throw new Error('Por enquanto só lemos notas de São Paulo (portal da Sefaz-SP).');
  return u;
}

const num = (t: string) => Number(t.replace(/[^\d,]/g, '').replace(',', '.'));

export function parseHtml(html: string, chave: string): Nota {
  const $ = cheerio.load(html);
  const itens: ItemNota[] = [];
  $('#tabResult tr').each((_, tr) => {
    const nome = $(tr).find('.txtTit').first().text().trim();
    if (!nome) return;
    itens.push({
      descricao: nome,
      quantidade: num($(tr).find('.Rqtd').text()),
      unidade: $(tr).find('.RUN').text().split(':').pop()!.trim(),
      preco_unitario: num($(tr).find('.RvlUnit').text()),
    });
  });
  const texto = $('body').text().replace(/\s+/g, ' ');
  const cnpj = texto.match(/CNPJ:\s*([\d./-]+)/)?.[1]?.replace(/\D/g, '') ?? '';
  const emissao = texto.match(/Emissão:\s*(\d{2})\/(\d{2})\/(\d{4})/);
  const totalTxt = $('.totalNumb.txtMax').first().text();
  return {
    chave,
    cnpj,
    loja: $('#u20').first().text().trim() || $('.txtTopo').first().text().trim(),
    data: emissao ? `${emissao[3]}-${emissao[2]}-${emissao[1]}` : new Date().toISOString().slice(0, 10),
    total: totalTxt ? num(totalTxt) : itens.reduce((s, i) => s + i.quantidade * i.preco_unitario, 0),
    itens,
  };
}

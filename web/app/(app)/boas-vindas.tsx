'use client';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useLocais } from '@/lib/locais';

// Ilustrações do onboarding (imagens em /public/img, recortadas das referências).
const ALT = ['Pessoa vendo no celular o preço de um produto baixar', 'Balança comparando duas embalagens pelo preço do quilo', 'Pessoa montando a compra no celular, com o carrinho ao lado'];
export const Ilustracoes: ReactNode[] = ALT.map((alt, i) => (
  // eslint-disable-next-line @next/next/no-img-element
  <img key={i} src={`/img/ob-${i + 1}.jpg`} alt={alt} width={572} height={i === 1 ? 650 : 610} />
));

export const PASSOS = [
  {
    titulo: 'Preço de oportunidade',
    texto: 'Todo dia, às 7h e às 13h, buscamos os preços de 9 mercados de Indaiatuba e avisamos quando um item fica bem mais em conta.',
  },
  {
    titulo: 'Compare do jeito certo',
    texto: 'Dividimos o preço pelo tamanho da embalagem e mostramos quanto sai o quilo, o litro ou a unidade. Assim, embalagens de tamanhos diferentes ficam lado a lado de forma justa.',
  },
  {
    titulo: 'Sua cesta, seu mercado',
    texto: 'Monte sua compra e veja qual mercado sai mais barato. Envie suas notas fiscais para deixar a comparação da sua cesta mais completa.',
  },
];
export const CHAVE = 'boas-vindas-vista';

// Mostrada uma vez, no primeiro acesso após o cadastro. Depois dos passos de apresentação, pede o CEP
// (opcional) para mostrar a distância até cada mercado; dá para mudar depois na Cesta.
export default function BoasVindas({ familiaId, aoFechar }: { familiaId?: string; aoFechar?: () => void }) {
  const [passo, setPasso] = useState<number | null>(null);
  useEffect(() => {
    try { if (!localStorage.getItem(CHAVE)) setPasso(0); } catch { /* sem armazenamento: não mostra */ }
  }, []);
  const fechar = () => { try { localStorage.setItem(CHAVE, '1'); } catch {} setPasso(null); aoFechar?.(); };
  if (passo === null) return null;
  const total = PASSOS.length + 1;

  return (
    <div className="ob" role="dialog" aria-modal="true" aria-labelledby="bv-titulo">
      <div className="ob-card" key={passo}>
        {passo < PASSOS.length ? <>
          <div className="ob-ilustra">{Ilustracoes[passo]}</div>
          <Pontos passo={passo} total={total} />
          <h1 id="bv-titulo" className="ob-titulo">{PASSOS[passo].titulo}</h1>
          <p className="ob-texto">{PASSOS[passo].texto}</p>
          <div className="ob-acoes">
            <button type="button" className="ob-skip" onClick={() => setPasso(PASSOS.length)}>Pular</button>
            <button type="button" className="ob-pill" onClick={() => setPasso(passo + 1)}>Próximo</button>
          </div>
        </> : <PassoCep familiaId={familiaId} total={total} fechar={fechar} />}
      </div>
    </div>
  );
}

function Pontos({ passo, total }: { passo: number; total: number }) {
  return (
    <div className="ob-dots" aria-label={`Passo ${passo + 1} de ${total}`}>
      {Array.from({ length: total }, (_, i) => <span key={i} data-on={i === passo} />)}
    </div>
  );
}

function PassoCep({ familiaId, total, fechar }: { familiaId?: string; total: number; fechar: () => void }) {
  const { adicionar } = useLocais(familiaId);
  const [rotulo, setRotulo] = useState('');
  const [cep, setCep] = useState('');
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  const salvar = async (e: FormEvent) => {
    e.preventDefault();
    if (!cep.trim()) return fechar();
    if (cep.replace(/\D/g, '').length !== 8) return setErro('CEP inválido. Use 8 números, como 13330-000.');
    setSalvando(true); setErro('');
    const r = await adicionar(rotulo || 'Casa', cep);
    setSalvando(false);
    if (r && !r.startsWith('Salvo')) return setErro(r);
    fechar();
    window.location.reload();   // as telas abertas passam a mostrar as distâncias
  };

  return (
    <form className="ob-cep" onSubmit={salvar}>
      <div className="ob-pino" aria-hidden="true">📍</div>
      <Pontos passo={total - 1} total={total} />
      <h1 id="bv-titulo" className="ob-titulo">Onde você compra?</h1>
      <p className="ob-texto">Informe o CEP de casa (ou do trabalho) para ver a distância até cada mercado.</p>
      <div className="ob-campos">
        <div className="field">
          <label htmlFor="ob-cep">CEP</label>
          <input id="ob-cep" className="input" inputMode="numeric" autoComplete="postal-code" placeholder="13330-000"
            value={cep} onChange={(e) => { setCep(e.target.value); setErro(''); }} />
        </div>
        <div className="field">
          <label htmlFor="ob-rotulo">Nome (opcional)</label>
          <input id="ob-rotulo" className="input" placeholder="Casa, Trabalho…" value={rotulo} onChange={(e) => setRotulo(e.target.value)} />
        </div>
        {erro && <div className="alert alert-error" role="alert">{erro}</div>}
        <span className="muted">Guardamos só o nome e a região aproximada (cerca de 1 km), nunca o CEP ou a rua. Dá para mudar depois na Cesta.</span>
      </div>
      <div className="ob-acoes">
        <button type="button" className="ob-skip" onClick={fechar}>Agora não</button>
        <button className="ob-pill" disabled={salvando}>{salvando ? 'Buscando…' : 'Começar'}</button>
      </div>
    </form>
  );
}

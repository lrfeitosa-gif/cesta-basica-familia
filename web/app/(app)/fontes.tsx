import Link from 'next/link';
import { horaBr, type Ofertas } from '@/lib/ofertas';

// Todos os mercados acompanhados. Quem não tiver preço no dia aparece como "sem preço hoje", com o motivo.
const MERCADOS: { mercado: string; motivo: string }[] = [
  { mercado: 'Assaí', motivo: 'O site bloqueia leitura automática. Entra pelos encartes enviados.' },
  { mercado: 'Atacadão', motivo: 'A coleta do site ainda não rodou ou falhou hoje.' },
  { mercado: 'Covabra', motivo: 'A coleta do site ainda não rodou ou falhou hoje.' },
  { mercado: 'Goodbom', motivo: 'A coleta do site ainda não rodou ou falhou hoje.' },
  { mercado: 'Pague Menos', motivo: 'A coleta do site ainda não rodou ou falhou hoje.' },
  { mercado: 'Roldão', motivo: 'Nenhum encarte válido encontrado no site hoje.' },
  { mercado: 'Savegnago', motivo: 'A coleta do site ainda não rodou ou falhou hoje.' },
  { mercado: 'São Vicente', motivo: 'A coleta do site ainda não rodou ou falhou hoje.' },
  { mercado: 'Sumerbol', motivo: 'Nenhum encarte válido encontrado no site hoje.' },
];

// Data da última coleta e de onde vem o preço de cada mercado.
export default function Fontes({ dados }: { dados: Ofertas }) {
  const semHoje = MERCADOS.filter((s) => !dados.info.some((i) => i.mercado === s.mercado));
  return (
    <details className="fontes">
      <summary>
        <span>Atualizado {dados.atualizado ? horaBr(dados.atualizado) : '—'}</span>
        <span className="muted">Fontes de preço</span>
      </summary>
      <div className="fontes-lista">
        {dados.info.map((i) => (
          <div key={i.mercado}>
            <b>{i.mercado}</b>
            <span className={`fonte fonte-${i.fonte}`}>{i.fonte === 'site' ? 'site do mercado' : 'encarte'}</span>
            <span className="muted">{i.precos.toLocaleString('pt-BR')} preços · {horaBr(i.atualizado)}</span>
          </div>
        ))}
        {semHoje.map((s) => (
          <div key={s.mercado}>
            <b>{s.mercado}</b>
            <span className="fonte fonte-sem">sem preço hoje</span>
            <span className="muted">{s.motivo}</span>
          </div>
        ))}
      </div>
      <p className="muted">
        <b>Site:</b> preço de prateleira da loja online, todos os produtos, com ou sem promoção.{' '}
        <b>Encarte:</b> só os itens em promoção do folheto da semana. A loja física pode ter outros preços.
      </p>
      <Link href="/indicar" className="btn btn-link">Falta algum mercado? Indique aqui</Link>
    </details>
  );
}

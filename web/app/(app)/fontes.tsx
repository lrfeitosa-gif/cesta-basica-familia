import { horaBr, type Ofertas } from '@/lib/ofertas';

const SEM_COLETA = [
  { mercado: 'Assaí', motivo: 'O site bloqueia leitura automática. Entra pelos encartes enviados.' },
  { mercado: 'Pão de Açúcar', motivo: 'O site bloqueia leitura automática. Entra pelos encartes enviados.' },
];

// Data da última coleta e de onde vem o preço de cada mercado.
export default function Fontes({ dados }: { dados: Ofertas }) {
  const semHoje = SEM_COLETA.filter((s) => !dados.info.some((i) => i.mercado === s.mercado));
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
    </details>
  );
}

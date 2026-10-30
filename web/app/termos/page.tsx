import Link from 'next/link';

export default function Termos() {
  return (
    <>
      <Link href="/cadastro" className="btn btn-link">← Voltar</Link>
      <h1>Termos de uso</h1>
      <div className="alert" style={{ background: 'var(--accent-soft)' }}>
        Rascunho para o piloto em Indaiatuba. O texto final será revisado por um profissional antes de abrir para o público.
      </div>
      <div className="stack lead">
        <p>O app mostra preços coletados de sites e encartes dos mercados. Os preços podem mudar ou diferir da loja física; confira antes de comprar.</p>
        <p>As sugestões de quando comprar e quanto estocar são estimativas a partir do histórico de preços e das notas que você envia.</p>
        <p>Você pode excluir sua conta e exportar seus dados a qualquer momento.</p>
      </div>
    </>
  );
}

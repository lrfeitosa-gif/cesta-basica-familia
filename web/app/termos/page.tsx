import Link from 'next/link';

export default function Termos() {
  return (
    <>
      <Link href="/" className="btn btn-link">← Voltar</Link>
      <h1>Termos de uso</h1>
      <div className="alert" style={{ background: 'var(--accent-soft)' }}>
        Rascunho para o piloto em Indaiatuba. O texto final será revisado por um profissional antes de abrir para o público.
      </div>
      <div className="stack lead">
        <p>O app mostra preços coletados de sites e encartes dos mercados. Os preços podem mudar ou diferir da loja física; confira antes de comprar.</p>
        <p>Os alertas e comparações são estimativas a partir dos preços coletados no dia.</p>
        <p>Em Meus dados você baixa um arquivo com sua conta, notas e alertas, e pode excluir a conta a qualquer momento.</p>
      </div>
    </>
  );
}

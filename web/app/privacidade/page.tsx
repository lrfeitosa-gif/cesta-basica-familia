import Link from 'next/link';

export default function Privacidade() {
  return (
    <>
      <Link href="/cadastro" className="btn btn-link">← Voltar</Link>
      <h1>Política de privacidade</h1>
      <div className="alert" style={{ background: 'var(--accent-soft)' }}>
        Rascunho para o piloto em Indaiatuba. O texto final será revisado por um profissional antes de abrir para o público.
      </div>
      <div className="stack lead">
        <p><b>O que guardamos:</b> seu e-mail, o número de pessoas da casa, a frequência de compra e a região aproximada da casa (arredondada para cerca de 1 km).</p>
        <p><b>Das notas fiscais:</b> só itens, quantidades, preços, loja e data. CPF, nome e dados de pagamento que aparecem na nota nunca são gravados.</p>
        <p><b>Preços:</b> os preços das suas notas podem entrar, sem identificação, na média regional que todos veem.</p>
        <p><b>Seus direitos:</b> você pode excluir a conta e exportar seus dados pelo próprio app.</p>
      </div>
    </>
  );
}

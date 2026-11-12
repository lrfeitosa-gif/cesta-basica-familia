import Link from 'next/link';

export default function Privacidade() {
  return (
    <>
      <Link href="/" className="btn btn-link">← Voltar</Link>
      <h1>Política de privacidade</h1>
      <div className="alert" style={{ background: 'var(--accent-soft)' }}>
        Rascunho para o piloto em Indaiatuba. O texto final será revisado por um profissional antes de abrir para o público.
      </div>
      <div className="stack lead">
        <p><b>Conta:</b> guardamos só o seu e-mail. Não pedimos CPF, nome, endereço nem dados de pagamento.</p>
        <p><b>Notas fiscais que você envia:</b> loja, data, total e os itens com quantidade e preço. CPF, nome e forma de pagamento que aparecem na nota nunca são gravados.</p>
        <p><b>Alertas:</b> os produtos, marcas e preços-alvo que você cadastra.</p>
        <p><b>Endereços de referência (até 3):</b> só o nome que você der ("Casa", "Trabalho") e a região aproximada,
          arredondada para cerca de 1 km, usada para mostrar a distância até os mercados. O CEP e a rua não são guardados.</p>
        <p><b>Na sua conta:</b> a sua cesta (itens, quantidades e marcas escolhidas) fica salva na conta, para abrir igual no celular e no computador. Ela é apagada junto com a conta.</p>
        <p><b>Preços:</b> os preços das notas podem entrar, sem identificação, na média de preços da região que todos veem.</p>
        <p>
          <b>Seus direitos:</b> em <Link href="/conta">Meus dados</Link> você baixa um arquivo com tudo o que está guardado
          (conta, notas e alertas) e pode excluir a conta a qualquer momento.
        </p>
      </div>
    </>
  );
}

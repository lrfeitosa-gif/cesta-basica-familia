import Link from 'next/link';

export default function Inicio() {
  return (
    <>
      <div className="brand">Cesta <span>Indaiatuba</span></div>
      <div className="stack" style={{ marginTop: 'auto' }}>
        <h1>Compre no preço de oportunidade</h1>
        <p className="lead">
          Diga o que sua família consome. O app avisa quando o preço está abaixo do normal nos mercados de
          Indaiatuba e lembra o que você já tem em casa.
        </p>
        <ul className="muted" style={{ paddingLeft: 18, margin: 0, display: 'grid', gap: 4 }}>
          <li>Preços de 8 mercados, atualizados todo dia às 7h</li>
          <li>Comparação por kg ou litro, sem confusão de embalagem</li>
          <li>Sem CPF, sem endereço exato</li>
        </ul>
      </div>
      <div className="stack">
        <Link href="/cadastro" className="btn btn-primary btn-block">Criar conta</Link>
        <Link href="/entrar" className="btn btn-secondary btn-block">Já tenho conta</Link>
      </div>
    </>
  );
}

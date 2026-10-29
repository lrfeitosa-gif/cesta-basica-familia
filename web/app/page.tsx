import Link from 'next/link';

export default function Home() {
  return (
    <main>
      <h1>Cesta Básica Família</h1>
      <p>Diga o que sua família consome; o app avisa quando o preço está em oportunidade — e lembra o que você já tem.</p>
      <nav style={{ display: 'grid', gap: 8 }}>
        <Link href="/onboarding">Começar</Link>
        <Link href="/notas">Escanear nota fiscal</Link>
        <Link href="/alertas">Alertas</Link>
        <Link href="/compra">Minha compra</Link>
      </nav>
    </main>
  );
}

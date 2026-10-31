// Carrinho de supermercado cheio: caixa, garrafa, baguete, maçã e etiqueta de oferta.
// Desenhado em 64x64; as cores vêm dos tokens do tema (funciona no claro e no escuro).
export function Carrinho({ size = 40, className, mono = false }: { size?: number; className?: string; mono?: boolean }) {
  const prod = mono ? 'currentColor' : undefined;
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={className} aria-hidden="true">
      {/* compras */}
      <rect x="18" y="14" width="13" height="16" rx="2" fill={prod ?? 'var(--logo-caixa, #f59e0b)'} />
      <rect x="20.5" y="17" width="8" height="3" rx="1" fill={prod ? 'none' : 'var(--logo-detalhe, #fff7e6)'} opacity=".9" />
      <path d="M34 9h5v5l2 3v13h-9V17l2-3Z" fill={prod ?? 'var(--logo-garrafa, #16a34a)'} />
      <rect x="33.5" y="7" width="6" height="3" rx="1" fill={prod ?? 'var(--logo-garrafa-tampa, #15803d)'} />
      <path d="M41 30 52 9.5a2.6 2.6 0 0 1 4.5 2.4L46.5 30Z" fill={prod ?? 'var(--logo-pao, #d97706)'} />
      <path d="M49 15.5l2.4 1.4M47 19.2l2.4 1.4M45 23l2.4 1.3" stroke={prod ? 'none' : 'var(--logo-detalhe, #fff7e6)'} strokeWidth="1.2" strokeLinecap="round" />
      <circle cx="27" cy="27.5" r="5" fill={prod ?? 'var(--logo-maca, #dc2626)'} />
      <path d="M27 22.5c0-1.6.8-2.8 2.2-3.4" stroke={prod ?? 'var(--logo-garrafa-tampa, #15803d)'} strokeWidth="1.4" fill="none" strokeLinecap="round" />
      {/* etiqueta de oferta */}
      <path d="M8 6h9.5l4 4-4 4H8a1.5 1.5 0 0 1-1.5-1.5v-5A1.5 1.5 0 0 1 8 6Z" fill={prod ?? 'var(--tag)'} />
      <circle cx="10" cy="10" r="1.2" fill={prod ? 'none' : 'var(--tag-ink)'} />
      {/* carrinho */}
      <path d="M3 22h7l6.2 24.5a3 3 0 0 0 2.9 2.3h29.6a3 3 0 0 0 2.9-2.2L57 30H13.3"
        fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M17 38h36" stroke="currentColor" strokeWidth="3" strokeLinecap="round" opacity=".55" />
      <circle cx="22" cy="56" r="4.2" fill="currentColor" />
      <circle cx="46" cy="56" r="4.2" fill="currentColor" />
    </svg>
  );
}

export const NOME = 'fast-promotions-mk';

// Marca completa: carrinho + nome. "mk" em destaque, como etiqueta.
export default function Logo({ size = 36 }: { size?: number }) {
  return (
    <span className="logo">
      <Carrinho size={size} className="logo-carrinho" />
      <span className="logo-nome">fast-promotions<span>-mk</span></span>
    </span>
  );
}

// Carrinho grande e apagado no fundo da tela.
export function FundoCarrinho() {
  return (
    <div className="fundo-carrinho" aria-hidden="true">
      <Carrinho size={420} mono />
    </div>
  );
}

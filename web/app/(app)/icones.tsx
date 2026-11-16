// Ícones de traço (16/11): substituem os emojis usados como ícone na Compra e na leitura da nota.
// Mesmo desenho dos ícones já existentes no app: viewBox 24, traço 1.8, pontas arredondadas, cor do texto.
type P = { className?: string; tamanho?: number };
const base = (tamanho: number, className?: string) => ({
  viewBox: '0 0 24 24', width: tamanho, height: tamanho, fill: 'none', stroke: 'currentColor', strokeWidth: 1.8,
  strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true, className: `icone${className ? ` ${className}` : ''}`,
});

export const IconeLocal = ({ className, tamanho = 16 }: P) => (
  <svg {...base(tamanho, className)}><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z" /><circle cx="12" cy="10" r="2.3" /></svg>
);
export const IconeAtencao = ({ className, tamanho = 16 }: P) => (
  <svg {...base(tamanho, className)}><path d="M12 4 2.8 19.5h18.4z" /><path d="M12 10v4.2M12 17h.01" /></svg>
);
export const IconeNota = ({ className, tamanho = 20 }: P) => (
  <svg {...base(tamanho, className)}><path d="M6 3h12v18l-2-1.4-2 1.4-2-1.4-2 1.4-2-1.4L6 21z" /><path d="M9 8h6M9 11.5h6M9 15h3.5" /></svg>
);
export const IconeLuz = ({ className, tamanho = 20 }: P) => (
  <svg {...base(tamanho, className)}><path d="M9 17h6M10 20.5h4" /><path d="M8.6 13.6A5.5 5.5 0 1 1 15.4 13.6c-.8.7-1.4 1.6-1.4 2.6v.8h-4v-.8c0-1-.6-1.9-1.4-2.6z" /></svg>
);
export const IconeReta = ({ className, tamanho = 20 }: P) => (
  <svg {...base(tamanho, className)}><rect x="5" y="3.5" width="14" height="17" rx="1.5" /><path d="M2.5 7v10M21.5 7v10" /></svg>
);
export const IconeCelular = ({ className, tamanho = 20 }: P) => (
  <svg {...base(tamanho, className)}><rect x="7" y="2.5" width="10" height="19" rx="2.2" /><path d="M11 18.5h2" /></svg>
);

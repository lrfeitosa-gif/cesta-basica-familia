import type { ReactNode } from 'react';
import RegistrarSW from './registrar-sw';

export const metadata = {
  title: 'Cesta Básica Família',
  manifest: '/manifest.json',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <body style={{ fontFamily: 'system-ui, sans-serif', margin: 0, padding: 16, maxWidth: 560 }}>
        <RegistrarSW />
        {children}
      </body>
    </html>
  );
}

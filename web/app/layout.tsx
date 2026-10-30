import type { ReactNode } from 'react';
import type { Metadata, Viewport } from 'next';
import { Barlow_Condensed, Nunito_Sans } from 'next/font/google';
import RegistrarSW from './registrar-sw';
import './globals.css';

const display = Barlow_Condensed({ subsets: ['latin'], weight: ['600', '700', '800'], variable: '--font-display' });
const body = Nunito_Sans({ subsets: ['latin'], variable: '--font-body' });

export const metadata: Metadata = {
  title: 'Cesta Indaiatuba',
  description: 'Avisa quando o preço do que sua família consome está em oportunidade.',
  manifest: '/manifest.json',
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#1d4ed8' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" className={`${display.variable} ${body.variable}`}>
      <body>
        <RegistrarSW />
        <main className="app">{children}</main>
      </body>
    </html>
  );
}

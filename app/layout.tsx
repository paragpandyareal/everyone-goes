import './globals.css';
import type { Metadata, Viewport } from 'next';
import { Nunito } from 'next/font/google';
import { Nav, Main } from '@/components/nav';
import { LensProvider, DemoBanner } from '@/components/lens';

const nunito = Nunito({ subsets: ['latin', 'latin-ext'], variable: '--font-nunito', weight: ['400', '600', '700', '800', '900'] });

export const metadata: Metadata = {
  title: 'Everyone Goes',
  description: 'School and club money through PayPal invoices, with a private way to ask for help, covered by local sponsors.',
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={nunito.variable}>
      <body className="min-h-screen">
        <LensProvider>
          <DemoBanner />
          <Nav />
          <Main>{children}</Main>
        </LensProvider>
      </body>
    </html>
  );
}

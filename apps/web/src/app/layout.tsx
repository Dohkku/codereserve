import type { Metadata } from 'next';
import './globals.css';
import { Providers } from './providers';
import { Header } from '@/components/Header';

export const metadata: Metadata = {
  metadataBase: new URL('https://app.codereserve.org'),
  title: 'CodeReserve - PR Spam Protection',
  description: 'Reputation-based PR filtering for open source projects. Manage your repos, view reputation scores, and handle deposits.',
  openGraph: {
    title: 'CodeReserve - PR Spam Protection',
    description: 'Reputation-based PR filtering for open source projects.',
    siteName: 'CodeReserve',
    type: 'website',
    images: ['/og-image.svg'],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'CodeReserve - PR Spam Protection',
    description: 'Reputation-based PR filtering for open source projects.',
    images: ['/og-image.svg'],
  },
  robots: {
    index: false,
    follow: false,
  },
  icons: {
    icon: '/favicon.svg',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <div className="min-h-screen bg-white">
            <Header />
            <main className="max-w-content mx-auto px-8 py-8">
              {children}
            </main>
            <footer className="border-t border-primary-200 mt-8">
              <div className="max-w-content mx-auto px-8 py-6 text-sm text-primary-500">
                © 2026 CodeReserve
              </div>
            </footer>
          </div>
        </Providers>
      </body>
    </html>
  );
}

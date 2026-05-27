import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';

export const metadata: Metadata = {
  title: {
    default: 'Floxcy — Dubai Real Estate Investment Intelligence',
    template: '%s · Floxcy',
  },
  description:
    'AI-powered investment intelligence for Dubai real estate. Explore curated areas, model ROI, and make data-driven decisions.',
  metadataBase: new URL('https://floxcy.com'),
  openGraph: {
    title: 'Floxcy — Dubai Real Estate Investment Intelligence',
    description:
      'AI-powered investment intelligence for Dubai real estate. Explore curated areas, model ROI, and make data-driven decisions.',
    type: 'website',
    locale: 'en_US',
  },
  icons: {
    icon: [{ url: '/favicon.svg', type: 'image/svg+xml' }],
  },
};

export const viewport: Viewport = {
  themeColor: '#0A0E1A',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen flex flex-col font-sans">
        <Navbar />
        <main className="flex-1">{children}</main>
        <Footer />
      </body>
    </html>
  );
}

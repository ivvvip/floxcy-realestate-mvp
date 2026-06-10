import type { Metadata, Viewport } from 'next';
import { Inter, JetBrains_Mono, Tajawal } from 'next/font/google';
import './globals.css';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';
import { FeedbackWidget } from '@/components/FeedbackWidget';
import { dirFor } from '@/i18n';
import { getLocale } from '@/i18n/server';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const mono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
});

// Arabic font — Tajawal (clean, modern Arabic geometric sans). Exposed as the
// `--font-arabic` CSS variable; globals.css flips the body font stack to it
// whenever `<html lang="ar">` is set, so no per-component change is needed.
const arabic = Tajawal({
  subsets: ['arabic'],
  variable: '--font-arabic',
  display: 'swap',
  weight: ['400', '500', '700'],
});

export const metadata: Metadata = {
  title: {
    default: 'Floxcy — UAE Real Estate Investment Intelligence',
    template: '%s · Floxcy',
  },
  description:
    'AI-powered investment intelligence for UAE real estate. Market data, yield analytics, area comparisons, and ROI modelling.',
  metadataBase: new URL('https://floxcy.com'),
  openGraph: {
    title: 'Floxcy — UAE Real Estate Investment Intelligence',
    description:
      'AI-powered investment intelligence for UAE real estate. Market data, yield analytics, area comparisons, and ROI modelling.',
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
  const locale = getLocale();
  const dir = dirFor(locale);

  return (
    <html
      lang={locale}
      dir={dir}
      className={`${inter.variable} ${mono.variable} ${arabic.variable}`}
      suppressHydrationWarning
    >
      <body className="min-h-screen flex flex-col font-sans">
        <Navbar locale={locale} />
        <main className="flex-1">{children}</main>
        <Footer />
        <FeedbackWidget locale={locale} />
      </body>
    </html>
  );
}

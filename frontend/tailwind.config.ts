import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx,js,jsx,mdx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: '#0A0E1A',
          card: '#131725',
          elev: '#1A2032',
        },
        border: {
          DEFAULT: '#1F2937',
          strong: '#2A3441',
        },
        accent: {
          DEFAULT: '#00D4AA',
          fg: '#001A14',
          muted: 'rgba(0, 212, 170, 0.10)',
        },
        positive: '#10B981',
        negative: '#EF4444',
        warning: '#F59E0B',
        warn: {
          DEFAULT: '#EF4444',
          muted: 'rgba(239, 68, 68, 0.10)',
        },
        fg: {
          DEFAULT: '#F8F9FA',
          muted: '#9CA3AF',
          subtle: '#6B7280',
        },
      },
      fontFamily: {
        sans: [
          'var(--font-inter)',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
        mono: [
          'var(--font-mono)',
          'ui-monospace',
          'SFMono-Regular',
          'Menlo',
          'Consolas',
          'monospace',
        ],
      },
      boxShadow: {
        card: '0 1px 0 rgba(255,255,255,0.03) inset',
      },
      borderRadius: {
        lg: '0.5rem',
        xl: '0.625rem',
        '2xl': '0.75rem',
      },
    },
  },
  plugins: [],
};

export default config;

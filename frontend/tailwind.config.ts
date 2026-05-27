import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx,js,jsx,mdx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: '#0A0E1A',
          card: '#131725',
          elev: '#1A1F30',
        },
        border: {
          DEFAULT: 'rgba(255,255,255,0.08)',
          strong: 'rgba(255,255,255,0.14)',
        },
        accent: {
          DEFAULT: '#00D4AA',
          fg: '#001A14',
          muted: 'rgba(0, 212, 170, 0.12)',
        },
        warn: {
          DEFAULT: '#FF6B6B',
          muted: 'rgba(255, 107, 107, 0.12)',
        },
        fg: {
          DEFAULT: '#F8F9FA',
          muted: '#A0A8B8',
          subtle: '#6B7280',
        },
      },
      fontFamily: {
        sans: [
          'Inter',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
        display: [
          'Inter',
          'ui-sans-serif',
          'system-ui',
          'sans-serif',
        ],
      },
      backgroundImage: {
        'grid-fade':
          'radial-gradient(ellipse 80% 60% at 50% -10%, rgba(0,212,170,0.15), transparent 60%)',
        'card-shine':
          'linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0) 60%)',
      },
      boxShadow: {
        glow: '0 0 0 1px rgba(0,212,170,0.25), 0 8px 32px -8px rgba(0,212,170,0.35)',
        card: '0 1px 0 rgba(255,255,255,0.04) inset, 0 8px 24px -12px rgba(0,0,0,0.6)',
      },
      borderRadius: {
        xl: '0.875rem',
        '2xl': '1.125rem',
      },
    },
  },
  plugins: [],
};

export default config;

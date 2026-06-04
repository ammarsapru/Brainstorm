/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './**/*.{ts,tsx}',
    '!./node_modules/**',
    '!./dist/**',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Manrope"', 'sans-serif'],
        display: ['"Manrope"', 'sans-serif'],
        cursive: ['"Patrick Hand"', 'cursive'],
        inter: ['"Inter"', 'sans-serif'],
        serif: ['"Merriweather"', 'serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
        hand: ['"Caveat"', 'cursive'],
        playfair: ['"Playfair Display"', 'serif'],
        slab: ['"Roboto Slab"', 'serif'],
        bebas: ['"Bebas Neue"', 'sans-serif'],
        comic: ['"Comic Neue"', 'cursive'],
      },
      colors: {
        brand: {
          50: '#f0f9ff',
          100: '#e0f2fe',
          500: '#0ea5e9',
          600: '#0284c7',
          900: '#0c4a6e',
        },
      },
      backgroundImage: {
        'dot-pattern': 'radial-gradient(#cbd5e1 1px, transparent 1px)',
        'grid-pattern':
          'linear-gradient(to right, #f1f5f9 1px, transparent 1px), linear-gradient(to bottom, #f1f5f9 1px, transparent 1px)',
      },
      animation: {
        blob: 'blob 10s infinite',
        float: 'float 6s ease-in-out infinite',
        'float-delayed': 'float 6s ease-in-out 3s infinite',
        'pulse-slow': 'pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        glow: 'glow 2s ease-in-out infinite alternate',
      },
      keyframes: {
        blob: {
          '0%': { transform: 'translate(0px, 0px) scale(1)' },
          '33%': { transform: 'translate(30px, -50px) scale(1.1)' },
          '66%': { transform: 'translate(-20px, 20px) scale(0.9)' },
          '100%': { transform: 'translate(0px, 0px) scale(1)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-20px)' },
        },
        glow: {
          '0%': { boxShadow: '0 0 5px rgba(139, 92, 246, 0.5)' },
          '100%': {
            boxShadow:
              '0 0 20px rgba(139, 92, 246, 0.8), 0 0 10px rgba(139, 92, 246, 0.6)',
          },
        },
      },
    },
  },
  plugins: [
    require('tailwindcss-animate'),
    require('@tailwindcss/typography'),
  ],
};

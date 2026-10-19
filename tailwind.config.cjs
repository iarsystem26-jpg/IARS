/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './index.html',
    './App.tsx',
    './index.tsx',
    './components/**/*.{ts,tsx}',
    './views/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      screens: { xs: '360px' },
      transitionDuration: { DEFAULT: 'var(--motion-fast)', fast: 'var(--motion-fast)', base: 'var(--motion-base)' },
      transitionTimingFunction: { DEFAULT: 'var(--motion-snappy)', standard: 'var(--motion-standard)' },
      fontFamily: {
        sans: ['Nunito', 'Outfit', 'system-ui', '-apple-system', 'sans-serif'],
        display: ['Outfit', 'Nunito', 'sans-serif'],
      },
      colors: {
        rmc: {
          blue: 'rgb(var(--palette-brand-500))', 'blue-dark': 'rgb(var(--palette-brand-700))', green: 'rgb(var(--palette-emerald-500))',
          orange: 'rgb(var(--palette-gold-500))', dark: 'rgb(var(--palette-slate-900))', light: 'rgb(var(--palette-slate-50))',
        },
        brand: {
          50: 'rgb(var(--palette-brand-50) / <alpha-value>)', 100: 'rgb(var(--palette-brand-100) / <alpha-value>)', 200: 'rgb(var(--palette-brand-200) / <alpha-value>)', 300: 'rgb(var(--palette-brand-300) / <alpha-value>)',
          400: 'rgb(var(--palette-brand-400) / <alpha-value>)', 500: 'rgb(var(--palette-brand-500) / <alpha-value>)', 600: 'rgb(var(--palette-brand-600) / <alpha-value>)', 700: 'rgb(var(--palette-brand-700) / <alpha-value>)',
          800: 'rgb(var(--palette-brand-800) / <alpha-value>)', 900: 'rgb(var(--palette-brand-900) / <alpha-value>)', 950: 'rgb(var(--palette-brand-950) / <alpha-value>)',
        },
        gold: {
          50: 'rgb(var(--palette-gold-50) / <alpha-value>)', 100: 'rgb(var(--palette-gold-100) / <alpha-value>)', 200: 'rgb(var(--palette-gold-200) / <alpha-value>)', 300: 'rgb(var(--palette-gold-300) / <alpha-value>)',
          400: 'rgb(var(--palette-gold-400) / <alpha-value>)', 500: 'rgb(var(--palette-gold-500) / <alpha-value>)', 600: 'rgb(var(--palette-gold-600) / <alpha-value>)', 700: 'rgb(var(--palette-gold-700) / <alpha-value>)',
        },
        emerald: {
          50: 'rgb(var(--palette-emerald-50) / <alpha-value>)', 100: 'rgb(var(--palette-emerald-100) / <alpha-value>)', 200: 'rgb(var(--palette-emerald-200) / <alpha-value>)', 300: 'rgb(var(--palette-emerald-300) / <alpha-value>)',
          400: 'rgb(var(--palette-emerald-400) / <alpha-value>)', 500: 'rgb(var(--palette-emerald-500) / <alpha-value>)', 600: 'rgb(var(--palette-emerald-600) / <alpha-value>)', 700: 'rgb(var(--palette-emerald-700) / <alpha-value>)',
        },
        slate: {
          50: 'rgb(var(--palette-slate-50) / <alpha-value>)', 100: 'rgb(var(--palette-slate-100) / <alpha-value>)', 200: 'rgb(var(--palette-slate-200) / <alpha-value>)', 300: 'rgb(var(--palette-slate-300) / <alpha-value>)',
          400: 'rgb(var(--palette-slate-400) / <alpha-value>)', 500: 'rgb(var(--palette-slate-500) / <alpha-value>)', 600: 'rgb(var(--palette-slate-600) / <alpha-value>)', 700: 'rgb(var(--palette-slate-700) / <alpha-value>)',
          800: 'rgb(var(--palette-slate-800) / <alpha-value>)', 850: 'rgb(var(--palette-slate-850) / <alpha-value>)', 900: 'rgb(var(--palette-slate-900) / <alpha-value>)', 950: 'rgb(var(--palette-slate-950) / <alpha-value>)',
        },
      },
      boxShadow: {
        'glow-gold': '0 0 25px -5px rgba(255, 140, 0, 0.4)',
        'glow-brand': '0 0 25px -5px rgba(0, 129, 200, 0.4)',
        panel: '0 20px 50px -10px rgba(17, 24, 39, 0.15)',
        modal: '0 25px 60px -15px rgba(17, 24, 39, 0.35)',
      },
      backgroundImage: {
        'gold-gradient': 'linear-gradient(135deg, rgb(var(--palette-gold-400)) 0%, rgb(var(--palette-gold-500)) 100%)',
        'brand-gradient': 'linear-gradient(135deg, rgb(var(--palette-brand-400)) 0%, rgb(var(--palette-brand-700)) 100%)',
        'brand-dark-gradient': 'linear-gradient(135deg, rgb(var(--palette-brand-900)) 0%, rgb(var(--palette-slate-900)) 100%)',
        'green-gradient': 'linear-gradient(135deg, rgb(var(--palette-emerald-500)) 0%, rgb(var(--palette-emerald-700)) 100%)',
        'glass-gradient': 'linear-gradient(135deg, rgba(255, 255, 255, 0.9) 0%, rgba(255, 255, 255, 0.7) 100%)',
      },
    },
  },
  plugins: [],
};

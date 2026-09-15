/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Outfit', 'ui-sans-serif', 'system-ui', 'Segoe UI', 'sans-serif'],
      },
      colors: {
        cyber: {
          cyan: '#00FFFF',
          dark: '#0B0E14',
          darker: '#070A0F',
          teal: '#006b6b',
          card: 'rgba(255,255,255,0.04)',
        },
        ink: {
          950: '#05070B',
          900: '#070A0F',
          850: '#0B0E14',
          800: '#0E141D',
          700: '#131C28',
        },
        aurora: {
          cyan: '#67e8f9',
          sky: '#7DD3FC',
          violet: '#A78BFA',
          fuchsia: '#F0ABFC',
          indigo: '#818CF8',
        }
      },
      boxShadow: {
        'cyan-glow':   '0 0 20px rgba(0,255,255,0.2)',
        'cyan-glow-lg':'0 0 40px rgba(0,255,255,0.3)',
        'green-glow':  '0 0 20px rgba(34,197,94,0.2)',
        'red-glow':    '0 0 20px rgba(239,68,68,0.2)',
        'purple-glow': '0 0 20px rgba(168,85,247,0.2)',
        'inner-top':   'inset 0 1px 0 rgba(255,255,255,0.06)',
        'inner-cyan':  'inset 0 1px 0 rgba(0,255,255,0.08)',
        'glass-sm': 'inset 0 1px 0 rgba(255,255,255,0.07), 0 8px 24px rgba(0,0,0,0.28)',
        'glass-md': 'inset 0 1px 0 rgba(255,255,255,0.08), 0 16px 44px rgba(0,0,0,0.34)',
        'glass-lg': 'inset 0 1px 0 rgba(255,255,255,0.09), 0 28px 80px rgba(0,0,0,0.5)',
        'popover': 'inset 0 1px 0 rgba(255,255,255,0.08), 0 24px 64px rgba(0,0,0,0.55), 0 0 0 1px rgba(103,232,249,0.06)',
        'active-pill': 'inset 0 1px 0 rgba(255,255,255,0.1), 0 0 24px rgba(34,211,238,0.18)',
      },
      animation: {
        'pulse-cyan':  'pulse-cyan 2s ease-in-out infinite',
        'fade-in':     'fadeIn 0.3s cubic-bezier(0.16,1,0.3,1) both',
        'slide-up':    'slideUp 0.35s cubic-bezier(0.16,1,0.3,1) both',
        'slide-in':    'slideIn 0.25s cubic-bezier(0.16,1,0.3,1) both',
        'slide-right': 'slideRight 0.25s cubic-bezier(0.16,1,0.3,1) both',
        'toast-in':    'toastIn 0.4s cubic-bezier(0.34,1.56,0.64,1) both',
        'toast-out':   'toastOut 0.22s ease-in forwards',
        'shimmer':     'shimmer 1.8s ease-in-out infinite',
        'spin-slow':   'spin 3s linear infinite',
        'bounce-soft': 'bounceSoft 0.4s cubic-bezier(0.34,1.56,0.64,1)',
        'scale-in':    'scaleIn 0.2s cubic-bezier(0.34,1.56,0.64,1) both',
        'palette-in':  'paletteIn 0.28s cubic-bezier(0.16,1,0.3,1) both',
        'float-slow':  'floatSlow 7s ease-in-out infinite',
        'aurora-drift':'auroraDrift 26s ease-in-out infinite alternate',
        'glow-pulse':  'glowPulse 3.2s ease-in-out infinite',
      },
      keyframes: {
        'pulse-cyan': {
          '0%, 100%': { boxShadow: '0 0 8px rgba(0,255,255,0.25)' },
          '50%':       { boxShadow: '0 0 28px rgba(0,255,255,0.65)' },
        },
        fadeIn: {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        slideUp: {
          from: { opacity: '0', transform: 'translateY(18px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        slideIn: {
          from: { opacity: '0', transform: 'translateX(-10px)' },
          to:   { opacity: '1', transform: 'translateX(0)' },
        },
        slideRight: {
          from: { opacity: '0', transform: 'translateX(18px)' },
          to:   { opacity: '1', transform: 'translateX(0)' },
        },
        toastIn: {
          from: { transform: 'translateX(110%) scale(0.9)', opacity: '0' },
          to:   { transform: 'translateX(0) scale(1)',     opacity: '1' },
        },
        toastOut: {
          from: { transform: 'translateX(0) scale(1)',      opacity: '1', maxHeight: '120px', marginBottom: '0.5rem' },
          to:   { transform: 'translateX(110%) scale(0.9)',opacity: '0', maxHeight: '0',    marginBottom: '0' },
        },
        shimmer: {
          '0%':   { backgroundPosition: '-600px 0' },
          '100%': { backgroundPosition: '600px 0' },
        },
        bounceSoft: {
          '0%':   { transform: 'scale(0.94)' },
          '60%':  { transform: 'scale(1.03)' },
          '100%': { transform: 'scale(1)' },
        },
        scaleIn: {
          from: { opacity: '0', transform: 'scale(0.92)' },
          to:   { opacity: '1', transform: 'scale(1)' },
        },
        paletteIn: {
          from: { opacity: '0', transform: 'translateY(-10px) scale(0.98)' },
          to:   { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        floatSlow: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%':      { transform: 'translateY(-8px)' },
        },
        auroraDrift: {
          from: { transform: 'translate3d(0,0,0) scale(1)', opacity: '0.9' },
          to:   { transform: 'translate3d(-2%,2%,0) scale(1.08)', opacity: '1' },
        },
        glowPulse: {
          '0%, 100%': { opacity: '0.55' },
          '50%':      { opacity: '1' },
        },
      }
    },
  },
  plugins: [],
};

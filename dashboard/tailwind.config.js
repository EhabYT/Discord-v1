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
      }
    },
  },
  plugins: [],
};

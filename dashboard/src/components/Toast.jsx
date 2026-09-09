import React, { createContext, useContext, useState, useCallback } from 'react';
import { CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-react';

const ToastContext = createContext(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside ToastProvider');
  return ctx;
}

let _id = 0;

const VARIANTS = {
  success: { icon: CheckCircle, border: 'border-emerald-300/25', glow: '0 0 28px rgba(52,211,153,0.12)', icon_cls: 'text-emerald-300', bar: 'from-emerald-300 to-teal-300' },
  error:   { icon: XCircle,     border: 'border-red-300/25',      glow: '0 0 28px rgba(248,113,113,0.12)',  icon_cls: 'text-red-300',     bar: 'from-red-300 to-rose-300' },
  warning: { icon: AlertTriangle,border: 'border-amber-300/25',   glow: '0 0 28px rgba(250,204,21,0.12)',  icon_cls: 'text-amber-200',    bar: 'from-amber-200 to-yellow-300' },
  info:    { icon: Info,         border: 'border-cyan-300/25',    glow: '0 0 28px rgba(34,211,238,0.14)',   icon_cls: 'text-cyan-200',    bar: 'from-cyan-200 to-indigo-300' },
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((id) => {
    setToasts(p => p.map(t => t.id === id ? { ...t, out: true } : t));
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 260);
  }, []);

  const push = useCallback((message, type = 'info', duration = 3800) => {
    const id = ++_id;
    setToasts(p => [...p, { id, message, type, out: false }]);
    setTimeout(() => dismiss(id), duration);
    return id;
  }, [dismiss]);

  const toast = {
    success: (msg, dur) => push(msg, 'success', dur),
    error:   (msg, dur) => push(msg, 'error',   dur ?? 5000),
    warning: (msg, dur) => push(msg, 'warning', dur),
    info:    (msg, dur) => push(msg, 'info',    dur),
  };

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div
        className="fixed bottom-24 md:bottom-6 left-4 right-4 sm:left-auto sm:right-6 z-[9999] flex flex-col gap-2 items-stretch sm:items-end pointer-events-none"
        style={{ maxWidth: 400 }}
        aria-live="polite"
        aria-atomic="false"
      >
        {toasts.map(t => {
          const v = VARIANTS[t.type] || VARIANTS.info;
          const Icon = v.icon;
          return (
            <div
              key={t.id}
              role="status"
              className={`relative pointer-events-auto w-full flex items-start gap-3 pl-3 pr-2.5 py-3 rounded-2xl border backdrop-blur-2xl
                bg-gradient-to-b from-[#131C2A]/95 to-[#0A0F17]/95 ${v.border}
                ${t.out ? 'animate-toast-out' : 'animate-toast-in'}`}
              style={{ boxShadow: `inset 0 1px 0 rgba(255,255,255,0.08), 0 20px 50px rgba(0,0,0,0.5), ${v.glow}` }}
            >
              <span className={`w-8 h-8 rounded-xl flex items-center justify-center bg-white/[0.05] border border-white/10 flex-shrink-0 ${v.icon_cls}`}>
                <Icon size={15} />
              </span>
              <p className="text-[13px] text-zinc-100 flex-1 leading-snug pt-1">{t.message}</p>
              <button
                onClick={() => dismiss(t.id)}
                aria-label="Dismiss notification"
                className="w-7 h-7 flex items-center justify-center rounded-lg text-zinc-500 hover:text-zinc-100 hover:bg-white/[0.07] transition-colors flex-shrink-0"
              >
                <X size={13} />
              </button>
              <span className={`absolute bottom-0 left-3 right-3 h-px bg-gradient-to-r opacity-30 ${v.bar}`} aria-hidden="true" />
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

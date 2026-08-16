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
  success: { icon: CheckCircle, border: 'border-green-500/40',  bg: 'bg-green-500/[0.08]',  icon_cls: 'text-green-400' },
  error:   { icon: XCircle,     border: 'border-red-500/40',    bg: 'bg-red-500/[0.08]',    icon_cls: 'text-red-400' },
  warning: { icon: AlertTriangle,border: 'border-yellow-500/40',bg: 'bg-yellow-500/[0.08]', icon_cls: 'text-yellow-400' },
  info:    { icon: Info,         border: 'border-cyan-500/40',  bg: 'bg-cyan-500/[0.08]',   icon_cls: 'text-cyan-400' },
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
        className="fixed bottom-20 md:bottom-5 left-4 right-4 sm:left-auto sm:right-5 z-[9999] flex flex-col gap-2 items-end pointer-events-none"
        style={{ maxWidth: 380 }}
        aria-live="polite"
        aria-atomic="false"
      >
        {toasts.map(t => {
          const v = VARIANTS[t.type] || VARIANTS.info;
          const Icon = v.icon;
          return (
            <div
              key={t.id}
              className={`pointer-events-auto w-full flex items-start gap-3 px-4 py-3 rounded-xl border backdrop-blur-xl
                bg-[#0d1219]/95 ${v.border} ${v.bg} shadow-2xl
                ${t.out ? 'animate-toast-out' : 'animate-toast-in'}`}
            >
              <Icon size={15} className={`${v.icon_cls} flex-shrink-0 mt-0.5`} />
              <p className="text-sm text-gray-100 flex-1 leading-snug">{t.message}</p>
              <button
                onClick={() => dismiss(t.id)}
                className="text-gray-600 hover:text-gray-300 transition-colors flex-shrink-0 ml-1"
              >
                <X size={13} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

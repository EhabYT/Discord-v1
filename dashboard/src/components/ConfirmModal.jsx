import React, { useEffect, useRef } from 'react';
import { AlertTriangle, Trash2, X } from 'lucide-react';

export default function ConfirmModal({ open, title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', variant = 'danger', onConfirm, onCancel }) {
  const cancelRef = useRef(null);
  const describedId = useRef(`confirm-${Math.random().toString(36).slice(2)}`);

  useEffect(() => {
    if (!open) return;
    // Focus the safe action first (Cancel), lock body scroll behind modal.
    cancelRef.current?.focus();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => { if (e.key === 'Escape') onCancel?.(); };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onCancel]);

  if (!open) return null;
  const isDanger = variant === 'danger';
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4" role="alertdialog" aria-modal="true" aria-label={title} aria-describedby={describedId.current}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-md animate-fade-in" onClick={onCancel} />
      <div className="palette-glass gradient-border relative p-6 w-full max-w-sm animate-palette-in">
        <button
          onClick={onCancel}
          aria-label="Close dialog"
          className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center rounded-xl text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.07] transition-all"
        >
          <X size={14} aria-hidden="true" />
        </button>
        <div className={`relative p-3 rounded-2xl flex items-center justify-center mb-4 mx-auto border w-fit
          ${isDanger ? 'bg-gradient-to-br from-red-400/25 to-rose-500/10 border-red-300/25 shadow-[0_0_24px_rgba(239,68,68,0.2)]' : 'bg-gradient-to-br from-amber-300/25 to-yellow-500/10 border-amber-300/25 shadow-[0_0_24px_rgba(250,204,21,0.2)]'}`}>
          {isDanger
            ? <Trash2 size={20} className="text-red-200" />
            : <AlertTriangle size={20} className="text-amber-200" />}
        </div>
        <h2 className="text-base font-bold text-white text-center mb-2 tracking-tight">{title}</h2>
        <p id={describedId.current} className="text-sm text-zinc-400 text-center mb-6 leading-relaxed">{message}</p>
        <div className="flex gap-2">
          <button ref={cancelRef} onClick={onCancel} className="cyber-button flex-1 text-sm py-2.5 !rounded-xl min-h-[44px]">
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={`flex-1 min-h-[44px] text-sm rounded-xl px-4 py-2.5 font-semibold transition-all duration-200 active:scale-95
              ${isDanger
                ? 'bg-gradient-to-r from-red-400 to-rose-400 hover:from-red-300 hover:to-rose-300 text-white shadow-[0_0_24px_rgba(239,68,68,0.3)]'
                : 'bg-gradient-to-r from-amber-200 to-yellow-300 hover:from-amber-100 hover:to-yellow-200 text-black'}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

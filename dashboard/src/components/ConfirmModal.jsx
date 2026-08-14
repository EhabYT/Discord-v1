import React from 'react';
import { AlertTriangle, Trash2, X } from 'lucide-react';

export default function ConfirmModal({ open, title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', variant = 'danger', onConfirm, onCancel }) {
  if (!open) return null;
  const isDanger = variant === 'danger';
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative cyber-card border-white/10 p-6 w-full max-w-sm animate-scale-in shadow-2xl">
        <button
          onClick={onCancel}
          className="absolute top-3 right-3 w-7 h-7 flex items-center justify-center rounded-lg text-gray-600 hover:text-gray-300 hover:bg-white/[0.08] transition-all"
        >
          <X size={14} />
        </button>
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 mx-auto border
          ${isDanger ? 'bg-red-500/10 border-red-500/25' : 'bg-yellow-500/10 border-yellow-500/25'}`}>
          {isDanger
            ? <Trash2 size={20} className="text-red-400" />
            : <AlertTriangle size={20} className="text-yellow-400" />}
        </div>
        <h2 className="text-base font-bold text-white text-center mb-2">{title}</h2>
        <p className="text-sm text-gray-400 text-center mb-6 leading-relaxed">{message}</p>
        <div className="flex gap-2">
          <button onClick={onCancel} className="cyber-button flex-1 text-sm py-2">
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={`flex-1 text-sm rounded-lg px-4 py-2 font-semibold transition-all duration-200 active:scale-95
              ${isDanger
                ? 'bg-red-500 hover:bg-red-400 text-white shadow-red-glow'
                : 'bg-yellow-500 hover:bg-yellow-400 text-black'}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

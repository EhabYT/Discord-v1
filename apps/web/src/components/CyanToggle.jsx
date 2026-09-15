import React from 'react';
import clsx from 'clsx';

export default function CyanToggle({ enabled, onChange, label, description, disabled = false }) {
  return (
    <div className="flex items-center justify-between gap-4 group">
      <div className="flex-1 min-w-0">
        {label && (
          <p className={clsx(
            'text-sm font-medium leading-snug transition-colors',
            enabled ? 'text-white' : 'text-zinc-200',
            disabled && 'opacity-50'
          )}>
            {label}
          </p>
        )}
        {description && (
          <p className={clsx('text-xs mt-0.5 leading-relaxed', disabled ? 'text-zinc-600' : 'text-zinc-400')}>
            {description}
          </p>
        )}
      </div>

      <button
        onClick={() => !disabled && onChange(!enabled)}
        disabled={disabled}
        role="switch"
        aria-checked={enabled}
        aria-label={typeof label === 'string' ? label : undefined}
        className={clsx(
          'relative w-11 h-6 rounded-full flex-shrink-0 transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#070A0F]',
          'after:absolute after:-inset-3 after:rounded-lg after:content-[""]',
          enabled
            ? 'bg-gradient-to-r from-cyan-300 to-sky-400'
            : 'bg-white/[0.08] border border-white/[0.15] hover:border-white/25',
          disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'
        )}
        style={enabled ? { boxShadow: '0 0 16px rgba(34,211,238,0.4), inset 0 1px 0 rgba(255,255,255,0.3)' } : undefined}
      >
        <span
          aria-hidden="true"
          className={clsx(
            'absolute top-0.5 w-5 h-5 rounded-full transition-all duration-300',
            enabled
              ? 'left-[22px] bg-[#06121A] shadow-[0_2px_6px_rgba(0,0,0,0.5)]'
              : 'left-0.5 bg-zinc-300 shadow-[0_2px_4px_rgba(0,0,0,0.3)]'
          )}
        />
      </button>
    </div>
  );
}

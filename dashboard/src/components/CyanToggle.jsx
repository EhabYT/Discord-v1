import React from 'react';
import clsx from 'clsx';

export default function CyanToggle({ enabled, onChange, label, description, disabled = false }) {
  return (
    <div className="flex items-center justify-between gap-4 group">
      <div className="flex-1 min-w-0">
        {label && (
          <p className={clsx(
            'text-sm font-medium leading-snug transition-colors',
            enabled ? 'text-white' : 'text-gray-300',
            disabled && 'opacity-50'
          )}>
            {label}
          </p>
        )}
        {description && (
          <p className={clsx('text-xs mt-0.5 leading-relaxed', disabled ? 'text-gray-700' : 'text-gray-500')}>
            {description}
          </p>
        )}
      </div>

      <button
        onClick={() => !disabled && onChange(!enabled)}
        disabled={disabled}
        role="switch"
        aria-checked={enabled}
        className={clsx(
          'relative w-11 h-6 rounded-full flex-shrink-0 transition-all duration-300 focus:outline-none',
          enabled
            ? 'bg-cyan-500'
            : 'bg-white/[0.08] border border-white/[0.15]',
          disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'
        )}
        style={enabled ? { boxShadow: '0 0 14px rgba(0,255,255,0.35), inset 0 1px 0 rgba(255,255,255,0.2)' } : undefined}
      >
        <span
          className={clsx(
            'absolute top-0.5 w-5 h-5 rounded-full transition-all duration-300',
            enabled
              ? 'left-[22px] bg-black shadow-[0_2px_4px_rgba(0,0,0,0.4)]'
              : 'left-0.5 bg-gray-400 shadow-[0_2px_4px_rgba(0,0,0,0.3)]'
          )}
        />
      </button>
    </div>
  );
}

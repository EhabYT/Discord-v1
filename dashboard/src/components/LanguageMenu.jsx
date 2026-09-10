import React, { useEffect, useRef, useState } from 'react';
import { Check, Languages } from 'lucide-react';
import clsx from 'clsx';
import { useI18n } from '../i18n.jsx';

// Premium language switcher: globe button + glass popover listing every
// registered locale with its native name. Replaces the old binary EN⇄AR
// toggle now that six locales exist.
export default function LanguageMenu({ className = '' }) {
  const { locale, locales, setLocale, t } = useI18n();
  const [open, setOpen] = useState(false);
  const popRef = useRef(null);
  const active = locales.find((l) => l.id === locale) || locales[0];

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    const onPointer = (e) => {
      if (popRef.current && !popRef.current.contains(e.target)) setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onPointer);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onPointer);
    };
  }, [open ]);

  return (
    <div className={clsx('relative', className)} ref={popRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={`${t('common.language', 'Language')}: ${active.native}`}
        title={active.native}
        className="w-9 h-9 flex items-center justify-center rounded-xl text-zinc-400 hover:text-cyan-200 hover:bg-white/[0.07] border border-transparent hover:border-cyan-300/20 transition-all"
      >
        <Languages size={15} aria-hidden="true" />
      </button>
      {open && (
        <div
          role="listbox"
          aria-label={t('common.language', 'Language')}
          className="glass-popover absolute end-0 top-full mt-2 w-52 p-1.5 z-50 animate-palette-in"
        >
          <p className="px-2.5 pt-1.5 pb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-400" aria-hidden="true">
            {t('common.language', 'Language')}
          </p>
          {locales.map((l) => {
            const selected = l.id === locale;
            return (
              <button
                key={l.id}
                role="option"
                aria-selected={selected}
                onClick={() => { setLocale(l.id); setOpen(false); }}
                className={clsx(
                  'w-full flex items-center gap-2.5 px-2.5 py-2.5 min-h-[48px] rounded-xl text-left text-xs transition-all border border-transparent',
                  selected
                    ? 'bg-cyan-400/[0.09] border-cyan-300/20 text-cyan-100'
                    : 'text-zinc-300 hover:bg-white/[0.05] hover:border-white/[0.06]'
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold truncate">{l.native}</span>
                  <span className="block text-[10px] text-zinc-400">{l.name}</span>
                </span>
                {selected && <Check size={13} className="text-cyan-300 flex-shrink-0" aria-hidden="true" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

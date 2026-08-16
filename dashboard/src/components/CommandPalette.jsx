import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Clock3, Copy, CornerDownLeft, Search } from 'lucide-react';
import clsx from 'clsx';
import { SEARCHABLE_PAGES } from '../nav.js';
import { copyText, readRecentPages } from '../lib/clipboard.js';

export default function CommandPalette({ open, onClose, onNavigate, permLevel = 0, page, publicUrl }) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const recents = useMemo(() => (open ? readRecentPages() : []), [open]);

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    const pages = SEARCHABLE_PAGES.filter((item) => {
      if (item.minLevel && !item.always && permLevel < item.minLevel) return false;
      if (!q) return true;
      const hay = `${item.label} ${item.id} ${item.hint || ''} ${item.keywords || ''}`.toLowerCase();
      return hay.includes(q);
    });

    if (q) return pages.map((p) => ({ ...p, kind: 'page' }));

    const recentItems = recents
      .map((id) => pages.find((p) => p.id === id))
      .filter(Boolean)
      .map((p) => ({ ...p, kind: 'recent' }));
    const rest = pages.filter((p) => !recents.includes(p.id)).map((p) => ({ ...p, kind: 'page' }));
    const actions = publicUrl ? [{
      id: '__copy_url',
      kind: 'action',
      label: 'Copy dashboard URL',
      hint: publicUrl,
      icon: Copy,
    }] : [];
    return [...actions, ...recentItems, ...rest];
  }, [query, permLevel, recents, publicUrl]);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setActive(0);
    const t = setTimeout(() => inputRef.current?.focus(), 20);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => { setActive(0); }, [query]);

  useEffect(() => {
    const el = listRef.current?.querySelector('[data-active="true"]');
    el?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const run = async (item) => {
    if (!item) return;
    if (item.kind === 'action' && item.id === '__copy_url') {
      await copyText(publicUrl);
      onClose();
      return;
    }
    onNavigate(item.id);
    onClose();
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); }
      if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(items.length - 1, i + 1)); }
      if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(0, i - 1)); }
      if (e.key === 'Enter' && items[active]) {
        e.preventDefault();
        run(items[active]);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, items, active, onClose, onNavigate, publicUrl]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center px-4 pt-[12vh]">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-md" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-white/10 bg-[#0B1018]/95 shadow-[0_30px_80px_rgba(0,0,0,0.55)] animate-scale-in"
      >
        <div className="flex items-center gap-3 px-4 py-3 border-b border-white/[0.06]">
          <Search size={16} className="text-cyan-300 flex-shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Jump to a page, warn, music, tickets…"
            className="flex-1 bg-transparent text-sm text-white placeholder:text-zinc-600 outline-none"
          />
          <kbd className="hidden sm:inline-flex kbd">ESC</kbd>
        </div>

        <div ref={listRef} className="max-h-[52vh] overflow-y-auto p-2">
          {items.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-zinc-500">No matching pages</p>
          ) : (
            items.map((item, i) => {
              const Icon = item.icon;
              const isActive = i === active;
              const isCurrent = page === item.id;
              const showRecent = item.kind === 'recent';
              return (
                <button
                  key={`${item.kind}-${item.id}`}
                  data-active={isActive}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => run(item)}
                  className={clsx(
                    'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors',
                    isActive ? 'bg-cyan-400/10 text-white' : 'text-zinc-300 hover:bg-white/[0.04]'
                  )}
                >
                  <span className={clsx(
                    'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 border',
                    isActive ? 'bg-cyan-400/15 border-cyan-400/25 text-cyan-200' : 'bg-white/[0.04] border-white/[0.06] text-zinc-500'
                  )}>
                    <Icon size={15} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">{item.label}</span>
                      {isCurrent && <span className="cyber-badge-cyan">Here</span>}
                      {showRecent && (
                        <span className="inline-flex items-center gap-1 text-[10px] text-zinc-500">
                          <Clock3 size={9} /> Recent
                        </span>
                      )}
                    </span>
                    {item.hint && <span className="block text-[11px] text-zinc-500 truncate mt-0.5">{item.hint}</span>}
                  </span>
                  {isActive && <ArrowRight size={14} className="text-cyan-300 flex-shrink-0" />}
                </button>
              );
            })
          )}
        </div>

        <div className="flex items-center gap-3 px-4 py-2.5 border-t border-white/[0.06] text-[10px] text-zinc-600">
          <span className="inline-flex items-center gap-1"><kbd className="kbd">↑</kbd><kbd className="kbd">↓</kbd> navigate</span>
          <span className="inline-flex items-center gap-1"><kbd className="kbd"><CornerDownLeft size={9} /></kbd> open</span>
        </div>
      </div>
    </div>
  );
}

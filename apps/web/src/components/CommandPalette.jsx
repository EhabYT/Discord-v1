import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Clock3, Copy, CornerDownLeft, Search, SearchX, Sparkles } from 'lucide-react';
import clsx from 'clsx';
import { SEARCHABLE_PAGES, SHORTCUT_BY_ID, isNavItemVisible } from '../nav.js';
import { copyText, readRecentPages } from '../lib/clipboard.js';
import { useI18n } from '../i18n.jsx';

export default function CommandPalette({ open, onClose, onNavigate, permLevel = 0, developerAccess = {}, page, publicUrl }) {
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const recents = useMemo(() => (open ? readRecentPages() : []), [open]);
  const canSeeDeveloper = developerAccess.baseRole !== 'NONE'
    || developerAccess.role !== 'NONE'
    || developerAccess.canUnlock === true;
  const canSeeMusicDesk = ['DEVELOPER', 'SUPER_ADMIN'].includes(developerAccess.baseRole)
    || ['DEVELOPER', 'SUPER_ADMIN'].includes(developerAccess.role);

  const flatItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    const visibility = { permLevel, canSeeDeveloper, canSeeMusicDesk };
    const pages = SEARCHABLE_PAGES.filter((item) => {
      if (!isNavItemVisible(item, visibility)) return false;
      if (!q) return true;
      const hay = `${item.label} ${item.id} ${item.hint || ''} ${item.keywords || ''} ${item.group || ''} ${item.section || ''} ${item.area || ''}`.toLowerCase();
      // Tokenized match: every word must appear somewhere (e.g. "dev log" → Logs).
      return q.split(/\s+/).every((tok) => hay.includes(tok));
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
      label: t('pal.copyDashboardUrl', 'Copy dashboard URL'),
      hint: publicUrl,
      icon: Copy,
    }] : [];
    return [...actions, ...recentItems, ...rest];
  }, [query, permLevel, recents, publicUrl, canSeeDeveloper, canSeeMusicDesk, t]);

  // Group flat results into labeled sections for scannability.
  const sections = useMemo(() => {
    if (query.trim()) {
      const pub = flatItems.filter((i) => i.kind !== 'action' && i.area !== 'developer');
      const dev = flatItems.filter((i) => i.kind !== 'action' && i.area === 'developer');
      const acts = flatItems.filter((i) => i.kind === 'action');
      const out = [];
      if (acts.length) out.push({ key: 'actions', title: t('pal.actions', 'Actions'), items: acts });
      if (pub.length) out.push({ key: 'public', title: t('section.Public Dashboard', 'Public Dashboard'), items: pub });
      if (dev.length) out.push({ key: 'developer', title: t('section.Developer Area', 'Developer Area'), items: dev });
      return out;
    }
    const acts = flatItems.filter((i) => i.kind === 'action');
    const recent = flatItems.filter((i) => i.kind === 'recent');
    const rest = flatItems.filter((i) => i.kind === 'page');
    const pub = rest.filter((i) => i.area !== 'developer');
    const dev = rest.filter((i) => i.area === 'developer');
    const out = [];
    if (acts.length) out.push({ key: 'actions', title: t('pal.actions', 'Actions'), items: acts });
    if (recent.length) out.push({ key: 'recent', title: t('common.recent', 'Recent'), icon: Clock3, items: recent });
    if (pub.length) out.push({ key: 'public', title: t('section.Public Dashboard', 'Public Dashboard'), items: pub });
    if (dev.length) out.push({ key: 'developer', title: t('section.Developer Area', 'Developer Area'), items: dev });
    return out;
  }, [flatItems, query, t]);

  // Flatten sections for arrow-key navigation while keeping section context.
  const ordered = useMemo(() => sections.flatMap((s) => s.items), [sections]);

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
      if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(ordered.length - 1, i + 1)); }
      if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(0, i - 1)); }
      if (e.key === 'Enter' && ordered[active]) {
        e.preventDefault();
        run(ordered[active]);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, ordered, active, onClose, onNavigate, publicUrl]);

  if (!open) return null;

  let cursor = -1;

  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center px-4 pt-[10vh] sm:pt-[12vh]">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-md animate-fade-in" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="palette-glass gradient-border relative w-full max-w-xl overflow-hidden rounded-3xl animate-palette-in"
      >
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300/60 to-transparent pointer-events-none" />
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-white/[0.07]">
          <span className="w-8 h-8 rounded-xl flex items-center justify-center bg-gradient-to-br from-cyan-400/20 to-indigo-400/20 border border-cyan-300/20 flex-shrink-0">
            <Search size={15} className="text-cyan-200" />
          </span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('pal.placeholder', 'Jump to a page, group, or action…  (try “dev log”)')}
            aria-label={t('common.search', 'Search')}
            className="flex-1 bg-transparent text-sm text-white placeholder:text-zinc-500 outline-none min-w-0"
          />
          {query ? (
            <button
              onClick={() => setQuery('')}
              className="text-[11px] text-zinc-500 hover:text-zinc-200 px-2 py-1 rounded-lg hover:bg-white/[0.06] transition-colors flex-shrink-0"
            >
              {t('pal.clear', 'Clear')}
            </button>
          ) : (
            <span className="hidden sm:flex items-center gap-1 flex-shrink-0">
              <kbd className="kbd">ESC</kbd>
            </span>
          )}
        </div>

        <div ref={listRef} className="max-h-[54vh] overflow-y-auto p-2.5 space-y-3">
          {ordered.length === 0 ? (
            <div className="px-3 py-10 text-center">
              <span className="w-12 h-12 rounded-2xl mx-auto mb-3 flex items-center justify-center bg-white/[0.04] border border-white/[0.07]">
                <SearchX size={20} className="text-zinc-500" aria-hidden="true" />
              </span>
              <p className="text-sm font-semibold text-zinc-300">{t('pal.emptyTitle', 'No matching pages')}</p>
              <p className="text-xs text-zinc-500 mt-1">
                {query ? t('pal.emptyHintQuery', 'Nothing matches "{q}". Try a group like "music" or "security".').replace('{q}', query) : t('pal.emptyHint', 'Type to filter every dashboard desk.')}
              </p>
            </div>
          ) : (
            sections.map((section) => (
              <div key={section.key}>
                <p className="flex items-center gap-1.5 px-2.5 pb-1.5 pt-1 text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-400">
                  {section.icon && <section.icon size={10} />}
                  {section.title}
                  <span className="ml-auto text-[9px] tabular-nums text-zinc-500 bg-white/[0.04] border border-white/[0.06] rounded-md px-1.5 py-0.5">
                    {section.items.length}
                  </span>
                </p>
                <div className="space-y-0.5">
                  {section.items.map((item) => {
                    cursor += 1;
                    const i = cursor;
                    const Icon = item.icon;
                    const isActive = i === active;
                    const isCurrent = page === item.id;
                    const showRecent = item.kind === 'recent';
                    const shortcut = SHORTCUT_BY_ID[item.id];
                    return (
                      <button
                        key={`${item.kind}-${item.id}`}
                        data-active={isActive}
                        onMouseEnter={() => setActive(i)}
                        onClick={() => run(item)}
                        className={clsx(
                          'w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl text-left transition-all duration-150 border',
                          isActive
                            ? 'bg-gradient-to-r from-cyan-400/[0.14] to-indigo-400/[0.08] border-cyan-300/25 text-white shadow-[0_0_24px_rgba(34,211,238,0.1)]'
                            : 'text-zinc-300 hover:bg-white/[0.04] border-transparent hover:border-white/[0.06]'
                        )}
                      >
                        <span className={clsx(
                          'w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 border transition-all',
                          isActive
                            ? 'bg-gradient-to-br from-cyan-400/25 to-indigo-400/25 border-cyan-300/30 text-cyan-100'
                            : 'bg-white/[0.04] border-white/[0.07] text-zinc-500'
                        )}>
                          <Icon size={15} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2">
                            <span className="text-sm font-semibold truncate">{item.kind === 'action' ? item.label : t(`nav.${item.id}`, item.label)}</span>
                            {item.group && (
                              <span className="hidden sm:inline-flex text-[9px] uppercase tracking-wider text-zinc-500 border border-white/[0.08] bg-white/[0.02] rounded-md px-1.5 py-0.5 flex-shrink-0">
                                {t(`group.${item.group}`, item.group)}
                              </span>
                            )}
                            {isCurrent && <span className="cyber-badge-cyan flex-shrink-0">{t('pal.here', 'Here')}</span>}
                            {showRecent && (
                              <span className="inline-flex items-center gap-1 text-[10px] text-cyan-300/70 flex-shrink-0">
                                <Sparkles size={9} /> {t('common.recent', 'Recent')}
                              </span>
                            )}
                          </span>
                          {item.hint && <span className="block text-[11px] text-zinc-500 truncate mt-0.5">{item.hint}</span>}
                        </span>
                        {shortcut && (
                          <kbd className="kbd hidden sm:inline-flex flex-shrink-0">{shortcut}</kbd>
                        )}
                        {isActive && <ArrowRight size={14} className="text-cyan-200 flex-shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>

        <div className="flex items-center gap-3 px-4 py-2.5 border-t border-white/[0.07] bg-white/[0.015] text-[10px] text-zinc-500">
          <span className="inline-flex items-center gap-1.5"><span className="flex gap-0.5"><kbd className="kbd">↑</kbd><kbd className="kbd">↓</kbd></span> {t('pal.navigate', 'navigate')}</span>
          <span className="inline-flex items-center gap-1.5"><kbd className="kbd"><CornerDownLeft size={9} /></kbd> {t('pal.open', 'open')}</span>
          <span className="ml-auto tabular-nums">{ordered.length} {t('pal.results', 'results')}{query ? ` ${t('pal.for', 'for')} “${query}”` : ''}</span>
        </div>
      </div>
    </div>
  );
}

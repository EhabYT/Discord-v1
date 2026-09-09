import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, ChevronLeft, ChevronRight, Clock3, Crown, LogIn, LogOut, Menu, Search, UserRound, X } from 'lucide-react';
import clsx from 'clsx';
import { LEVEL_LABELS, LEVEL_COLORS, NAV, GROUP_ORDER, SHORTCUT_BY_ID, isNavItemVisible, visibleNavNodes } from '../nav.js';
import { readRecentPages } from '../lib/clipboard.js';
import { useI18n } from '../i18n.jsx';

function readCollapsedGroups() {
  try {
    const raw = JSON.parse(localStorage.getItem('eb.navCollapsed') || '[]');
    return Array.isArray(raw) ? raw : [];
  } catch { return []; }
}

export default function Sidebar({
  page, setPage, guilds, selectedGuild, setSelectedGuild, me, account,
  permLevel = 0, auth = {}, developerAccess = {}, mobileOpen, setMobileOpen, collapsed, onToggleCollapsed,
}) {
  const { t } = useI18n();
  const [guildOpen, setGuildOpen] = useState(false);
  const [guildQuery, setGuildQuery] = useState('');
  const [collapsedGroups, setCollapsedGroups] = useState(readCollapsedGroups);
  const [recents, setRecents] = useState([]);
  const guildPopRef = useRef(null);
  const navRef = useRef(null);
  const canSeeDeveloper = developerAccess.baseRole !== 'NONE'
    || developerAccess.role !== 'NONE'
    || developerAccess.canUnlock === true;
  // The Music desk is developer-only: unlike the Developer Area above,
  // SUPPORT identities are excluded here to mirror the backend gate.
  const canSeeMusicDesk = ['DEVELOPER', 'SUPER_ADMIN'].includes(developerAccess.baseRole)
    || ['DEVELOPER', 'SUPER_ADMIN'].includes(developerAccess.role);

  const visibility = useMemo(
    () => ({ permLevel, canSeeDeveloper, canSeeMusicDesk }),
    [permLevel, canSeeDeveloper, canSeeMusicDesk]
  );

  const filteredGuilds = useMemo(() => {
    const q = guildQuery.trim().toLowerCase();
    if (!q) return guilds;
    return guilds.filter((g) => (g.name || '').toLowerCase().includes(q) || String(g.id || '').includes(q));
  }, [guilds, guildQuery]);

  useEffect(() => {
    try { localStorage.setItem('eb.navCollapsed', JSON.stringify(collapsedGroups)); } catch { /* ignore */ }
  }, [collapsedGroups]);

  // Refresh recents whenever the active page changes (palette writes eb.recent).
  useEffect(() => {
    try { setRecents(readRecentPages().slice(0, 4)); } catch { setRecents([]); }
  }, [page, mobileOpen]);

  // Keep the active page visible: when navigation lands inside a collapsed
  // group (palette, dock, shortcuts), expand that group again. User-collapsed
  // groups without the active page are never touched.
  useEffect(() => {
    setCollapsedGroups((prev) => {
      if (prev.length === 0) return prev;
      const activeGroups = new Set();
      NAV.forEach((entry) => {
        if (entry.id === page && entry.group) {
          const section = [...NAV].slice(0, NAV.indexOf(entry)).reverse().find((n) => n.section);
          if (section) activeGroups.add(`${section.section}:${entry.group}`);
        }
      });
      if (activeGroups.size === 0) return prev;
      const next = prev.filter((g) => !activeGroups.has(g));
      return next.length === prev.length ? prev : next;
    });
  }, [page]);

  // Restore the nav scroll position across remounts (mobile drawer, collapse).
  useEffect(() => {
    const el = navRef.current;
    if (!el) return;
    let saved = 0;
    try { saved = Number(sessionStorage.getItem('eb.navScroll') || 0); } catch { /* ignore */ }
    if (saved > 0) el.scrollTop = saved;
    const onScroll = () => {
      try { sessionStorage.setItem('eb.navScroll', String(el.scrollTop)); } catch { /* ignore */ }
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [mobileOpen, collapsed]);

  // Close the guild popover on Escape / outside click.
  useEffect(() => {
    if (!guildOpen) return;
    const onKey = (e) => { if (e.key === 'Escape') { setGuildOpen(false); setGuildQuery(''); } };
    const onPointer = (e) => {
      if (guildPopRef.current && !guildPopRef.current.contains(e.target)) {
        setGuildOpen(false);
        setGuildQuery('');
      }
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onPointer);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onPointer);
    };
  }, [guildOpen]);

  const toggleGroup = (key) => {
    setCollapsedGroups((prev) => (prev.includes(key) ? prev.filter((g) => g !== key) : [...prev, key]));
  };

  const go = (id) => {
    setPage(id);
    setMobileOpen(false);
    setGuildOpen(false);
  };

  const GuildButton = ({ compact }) => (
    <div className="relative" ref={guildPopRef}>
      <button
        onClick={() => setGuildOpen(!guildOpen)}
        title={selectedGuild?.name || t('side.selectServer', 'Select server')}
        aria-expanded={guildOpen}
        aria-haspopup="listbox"
        className={clsx(
          'w-full flex items-center rounded-2xl border transition-all duration-200',
          'bg-gradient-to-b from-white/[0.06] to-white/[0.02] border-white/[0.08] hover:border-cyan-300/30 hover:shadow-[0_0_24px_rgba(34,211,238,0.1)]',
          compact ? 'justify-center p-2' : 'gap-2.5 px-3 py-2.5'
        )}
      >
        {selectedGuild?.icon
          ? <img src={selectedGuild.icon} alt="" className="w-7 h-7 rounded-full ring-1 ring-white/15" />
          : <div className="w-7 h-7 rounded-full bg-gradient-to-br from-cyan-400/30 to-indigo-400/30 border border-cyan-300/20 flex items-center justify-center text-xs text-cyan-200 font-bold">
              {selectedGuild?.name?.[0] || '?'}
            </div>
        }
        {!compact && (
          <>
            <span className="min-w-0 flex-1 text-left">
              <span className="block text-xs text-zinc-100 truncate font-semibold leading-tight">
                {selectedGuild?.name || t('side.selectServer', 'Select server')}
              </span>
              <span className="block text-[10px] text-zinc-500 truncate">
                {guilds.length > 0 ? `${guilds.length} ${guilds.length === 1 ? t('side.server', 'server') : t('side.servers', 'servers')}` : t('side.noServers', 'No servers yet')}
              </span>
            </span>
            <ChevronDown size={14} className={clsx('text-zinc-500 transition-transform duration-200', guildOpen && 'rotate-180')} />
          </>
        )}
      </button>
      {guildOpen && (
        <div
          role="listbox"
          aria-label={t('side.selectServer', 'Select server')}
          className={clsx(
            'glass-popover overflow-hidden z-50 animate-palette-in',
            compact ? 'absolute start-16 top-0 w-72' : 'absolute inset-x-0 top-full mt-2 z-50'
          )}
        >
          <div className="p-2 border-b border-white/[0.06]">
            <div className="relative">
              <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" aria-hidden="true" />
              <input
                ref={(el) => {
                  // Autofocus only on precise pointers: on touch devices it
                  // pops the keyboard and covers the server list (bad UX).
                  if (el && window.matchMedia?.('(pointer: fine)').matches) el.focus();
                }}
                value={guildQuery}
                onChange={(e) => setGuildQuery(e.target.value)}
                placeholder={t('side.findServer', 'Find a server… (name or id)')}
                aria-label={t('side.findServer', 'Find a server… (name or id)')}
                className="cyber-input pl-7 py-2 min-h-[40px] text-xs"
              />
            </div>
          </div>
          <div className="max-h-64 overflow-y-auto p-1">
            {filteredGuilds.length === 0 ? (
              guilds.length === 0 && !auth?.loggedIn ? (
                <div className="px-3 py-4 text-center">
                  <p className="text-xs text-zinc-500 leading-relaxed">
                    {auth?.oauthEnabled
                      ? t('shell.loginToSee', 'Sign in with Discord to see the servers you can manage.')
                      : t('side.oauthUnavailable', 'Discord login is unavailable — the backend has OAuth or its database unconfigured.')}
                  </p>
                  {auth?.oauthEnabled && (
                    <a href="/api/auth/discord" className="cyber-button-solid inline-flex items-center gap-1.5 mt-3 text-xs px-3 py-1.5">
                      <LogIn size={12} />
                      {t('common.loginDiscord', 'Login with Discord')}
                    </a>
                  )}
                </div>
              ) : (
                <p className="px-3 py-4 text-xs text-zinc-500 text-center">{t('side.noMatch', 'No servers match')} “{guildQuery}”</p>
              )
            ) : filteredGuilds.map((g) => {
              const selected = selectedGuild?.id === g.id;
              return (
                <button
                  key={g.id}
                  role="option"
                  aria-selected={selected}
                  onClick={() => { setSelectedGuild(g); setGuildOpen(false); setGuildQuery(''); }}
                  className={clsx(
                    'w-full flex items-center gap-2.5 px-2.5 py-2.5 min-h-[48px] text-xs rounded-xl transition-all text-left border border-transparent',
                    selected ? 'text-cyan-200 bg-cyan-400/[0.09] border-cyan-300/20' : 'text-zinc-300 hover:bg-white/[0.05] hover:border-white/[0.06]'
                  )}
                >
                  {g.icon
                    ? <img src={g.icon} alt="" className="w-6 h-6 rounded-full ring-1 ring-white/10" />
                    : <div className="w-6 h-6 rounded-full bg-gradient-to-br from-cyan-400/25 to-indigo-400/25 border border-white/10 flex items-center justify-center text-[10px] text-cyan-200 font-bold">{(g.name || '?')[0]}</div>
                  }
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{g.name}</span>
                    <span className="block text-[10px] text-zinc-500 tabular-nums truncate">{g.id}{g.memberCount ? ` · ${Number(g.memberCount).toLocaleString()} ${t('ov.members', 'members')}` : ''}</span>
                  </span>
                  {selected && <Check size={13} className="text-cyan-300 flex-shrink-0" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );

  const NavItem = ({ id, icon: Icon, label, compact }) => {
    const isActive = page === id;
    const shortcut = SHORTCUT_BY_ID[id];
    return (
      <button
        key={id}
        title={t(`nav.${id}`, label)}
        aria-current={isActive ? 'page' : undefined}
        onClick={() => go(id)}
        className={clsx(
          'w-full group',
          isActive ? 'sidebar-item-active' : 'sidebar-item',
          compact && 'justify-center px-0'
        )}
      >
        <span className="relative flex-shrink-0">
          <Icon size={15} className={isActive ? 'text-cyan-200' : 'text-zinc-400 group-hover:text-zinc-100 transition-colors'} aria-hidden="true" />
          {isActive && <span className="absolute -right-1 -top-1 w-1.5 h-1.5 rounded-full bg-cyan-300 shadow-[0_0_8px_rgba(103,232,249,0.9)] animate-glow-pulse" aria-hidden="true" />}
        </span>
        {!compact && <span className="truncate flex-1 text-left">{t(`nav.${id}`, label)}</span>}
        {!compact && shortcut && (
          <kbd className="kbd hidden xl:inline-flex opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity">{shortcut}</kbd>
        )}
      </button>
    );
  };

  const Content = ({ compact }) => {
    const nodes = visibleNavNodes({ compact, ...visibility });

    if (compact) {
      return (
        <div className="flex flex-col h-full">
          <div className="px-2 py-4 border-b border-white/[0.06]">
            <div className="flex items-center justify-center">
              <button type="button" onClick={() => go('home')} className="relative flex-shrink-0 group" title="Homepage">
                <span className="absolute -inset-1 rounded-2xl bg-gradient-to-br from-cyan-400/25 via-sky-400/10 to-indigo-400/25 blur-md opacity-70 group-hover:opacity-100 transition-opacity" />
                <img src="/eb_logo.svg" alt="EB BOT" className="relative w-10 h-10 rounded-xl object-cover ring-1 ring-white/15 shadow-[0_8px_20px_rgba(0,0,0,0.35)]" />
              </button>
            </div>
          </div>

          <div className="px-2 py-3 border-b border-white/[0.06]">
            <GuildButton compact />
          </div>

          <nav ref={navRef} aria-label={t('side.nav', 'Dashboard navigation')} className="flex-1 py-3 space-y-0.5 overflow-y-auto px-2">
            {nodes.map((node) => {
              if (node.type === 'divider') return <div key={node.key} className="my-2 mx-2 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />;
              if (node.type !== 'page') return null;
              const { id, icon, label, hint } = node.item;
              return <NavItem key={node.key} id={id} icon={icon} label={label} hint={hint} compact />;
            })}
          </nav>

          {me && (
            <div className="px-2 py-3 border-t border-white/[0.06]">
              <div className="flex justify-center p-2 rounded-xl bg-white/[0.04] border border-white/[0.06]">
                {(me.avatar || me.avatar_url)
                  ? <img src={me.avatar || me.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover ring-2 ring-cyan-300/40" />
                  : <div className="w-8 h-8 rounded-full bg-cyan-400/15 flex items-center justify-center text-xs text-cyan-300 font-bold">{me.username?.[0]?.toUpperCase() || 'A'}</div>
                }
              </div>
              <button
                onClick={onToggleCollapsed}
                className="hidden md:flex w-full items-center justify-center py-1.5 mt-1 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.05] transition-all"
                title={t('side.expand', 'Expand sidebar')}
                aria-label={t('side.expand', 'Expand sidebar')}
              >
                <ChevronRight size={14} />
              </button>
            </div>
          )}
        </div>
      );
    }

    // Full mode: section → collapsible group → pages, with recents on top.
    const sections = [];
    let current = null;
    NAV.forEach((entry) => {
      if (entry.section) {
        if (!isNavItemVisible(entry, visibility)) { current = null; return; }
        current = { meta: entry, groups: [] };
        sections.push(current);
        return;
      }
      if (!current) return;
      if (!isNavItemVisible(entry, visibility)) return;
      let g = current.groups.find((x) => x.name === (entry.group || 'Other'));
      if (!g) { g = { name: entry.group || 'Other', items: [] }; current.groups.push(g); }
      g.items.push(entry);
    });
    // Order groups by GROUP_ORDER for a stable IA.
    const order = new Map(GROUP_ORDER.map((g, i) => [g, i]));
    sections.forEach((s) => s.groups.sort((a, b) => (order.get(a.name) ?? 99) - (order.get(b.name) ?? 99)));

    const recentItems = recents
      .map((id) => NAV.find((n) => n.id === id))
      .filter((n) => n && isNavItemVisible(n, visibility));

    return (
      <div className="flex flex-col h-full">
        <div className="px-4 py-4 border-b border-white/[0.06]">
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => go('home')} className="relative flex-shrink-0 group" title={t('side.homepage', 'Homepage')}>
              <span className="absolute -inset-1 rounded-2xl bg-gradient-to-br from-cyan-400/30 via-sky-400/10 to-indigo-400/30 blur-md opacity-70 group-hover:opacity-100 transition-opacity" />
              <img src="/eb_logo.svg" alt="EB BOT" className="relative w-10 h-10 rounded-xl object-cover ring-1 ring-white/15 shadow-[0_8px_20px_rgba(0,0,0,0.35)]" />
              <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-400 border-2 border-[#070A0F] shadow-[0_0_8px_rgba(52,211,153,0.8)]" title={t('side.service', 'Service shell')} />
            </button>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-white leading-none tracking-tight">EB Bot</p>
              <p className="text-[10px] text-zinc-500 tracking-[0.16em] uppercase mt-1">Dashboard V2</p>
            </div>
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-gradient-to-r from-cyan-400/15 to-indigo-400/15 border border-cyan-300/20 text-cyan-200">V2</span>
          </div>
        </div>

        <div className="px-3 py-3 border-b border-white/[0.06]">
          <GuildButton compact={false} />
        </div>

        <nav ref={navRef} aria-label={t('side.nav', 'Dashboard navigation')} className="flex-1 py-2 overflow-y-auto px-3 space-y-1">
          {recentItems.length > 0 && (
            <div className="mb-1 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-1.5">
              <p className="flex items-center gap-1.5 px-2 pt-1 pb-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">
                <Clock3 size={10} /> {t('common.recent', 'Recent')}
              </p>
              <div className="grid grid-cols-2 gap-1">
                {recentItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = page === item.id;
                  return (
                    <button
                      key={`recent-${item.id}`}
                      onClick={() => go(item.id)}
                      title={item.hint || item.label}
                      aria-current={isActive ? 'page' : undefined}
                      className={clsx(
                        'flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-[11px] font-medium border transition-all truncate',
                        isActive
                          ? 'bg-cyan-400/10 border-cyan-300/25 text-cyan-100'
                          : 'border-transparent text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.05] hover:border-white/[0.06]'
                      )}
                    >
                      <Icon size={12} className="flex-shrink-0" />
                      <span className="truncate">{t(`nav.${item.id}`, item.label)}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {sections.map((section, si) => (
            <div key={`section-${si}`}>
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] px-3 pt-3 pb-1 flex items-center gap-1.5 text-zinc-500">
                {section.meta.minLevel && <Crown size={9} className="text-amber-500" />}
                {t(`section.${section.meta.section}`, section.meta.section)}
                <span className="ml-auto text-[9px] font-semibold tabular-nums text-zinc-500">
                  {section.groups.reduce((n, g) => n + g.items.length, 0)}
                </span>
              </p>
              {section.groups.map((group) => {
                const key = `${section.meta.section}:${group.name}`;
                const isCollapsed = collapsedGroups.includes(key);
                const hasActive = group.items.some((i) => i.id === page);
                return (
                  <div key={key} className={clsx('rounded-xl', hasActive && 'bg-white/[0.015]')}>
                    <button
                      onClick={() => toggleGroup(key)}
                      aria-expanded={!isCollapsed}
                      className="nav-group-toggle min-h-[32px]"
                    >
                      <ChevronDown size={11} className={clsx('transition-transform duration-200 text-zinc-500', isCollapsed && '-rotate-90')} />
                      <span className="flex-1 text-left truncate">{t(`group.${group.name}`, group.name)}</span>
                      <span className={clsx(
                        'text-[9px] font-bold tabular-nums px-1.5 py-0.5 rounded-md border',
                        hasActive ? 'text-cyan-200 border-cyan-300/25 bg-cyan-400/10' : 'text-zinc-500 border-white/[0.06] bg-white/[0.02]'
                      )}>
                        {group.items.length}
                      </span>
                    </button>
                    {!isCollapsed && (
                      <div className="space-y-0.5 pb-1 animate-fade-in">
                        {group.items.map((item) => (
                          <NavItem key={item.id} id={item.id} icon={item.icon} label={item.label} hint={item.hint} compact={false} />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </nav>

        {me && (
          <div className="px-3 py-3 border-t border-white/[0.06] space-y-2 bg-gradient-to-t from-white/[0.025] to-transparent">
            <div className="flex items-center justify-between px-3 py-1.5 rounded-xl bg-white/[0.03] border border-white/[0.06]">
              <span className="text-[10px] text-zinc-500 uppercase tracking-[0.12em] font-semibold">{t('common.access', 'Access')}</span>
              <span className={`text-[11px] font-bold ${LEVEL_COLORS[Math.min(permLevel, 3)]}`}>
                {LEVEL_LABELS[Math.min(permLevel, 3)] || 'Admin'}
              </span>
            </div>
            <div className="flex items-center gap-2.5 px-3 py-2 rounded-2xl bg-white/[0.03] border border-white/[0.06]">
              {(me.avatar || me.avatar_url)
                ? <img src={me.avatar || me.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover ring-2 ring-cyan-300/30 flex-shrink-0" />
                : <div className="w-8 h-8 rounded-full bg-gradient-to-br from-cyan-400/25 to-indigo-400/25 border border-white/10 flex items-center justify-center text-xs text-cyan-200 font-bold flex-shrink-0">
                    {me.username?.[0]?.toUpperCase() || 'A'}
                  </div>
              }
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-white truncate">{me.username}</p>
                <p className="text-[10px] text-zinc-500 truncate">{me.tag || t('side.defaultRole', 'Bot Admin')}</p>
              </div>
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${me.loggedIn ? 'bg-emerald-400 shadow-[0_0_8px_rgba(74,222,128,0.8)] animate-glow-pulse' : 'bg-zinc-500'}`} title={me.loggedIn ? t('side.connected', 'Connected') : t('side.offline', 'Offline')} />
            </div>
            {account && (
              <a
                href="/profile"
                className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] text-zinc-400 hover:text-cyan-200 hover:bg-cyan-400/10 border border-transparent hover:border-cyan-300/20 transition-all"
              >
                <UserRound size={12} /> {t('nav.profile', 'Profile')}
              </a>
            )}
            {me.loggedIn ? (
              <button
                onClick={async () => { await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }); window.location.reload(); }}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] text-zinc-400 hover:text-red-300 hover:bg-red-500/10 border border-transparent hover:border-red-400/20 transition-all"
              >
                <LogOut size={12} /> {t('common.signOut', 'Sign out')}
              </button>
            ) : auth.oauthEnabled ? (
              <a
                href="/api/auth/discord"
                className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-semibold text-cyan-100 bg-gradient-to-r from-cyan-400/15 to-indigo-400/15 border border-cyan-300/25 hover:from-cyan-400/25 hover:to-indigo-400/25 transition-all"
              >
                <LogIn size={12} /> {t('common.loginDiscord', 'Login with Discord')}
              </a>
            ) : null}

            <p className="hidden md:flex items-center justify-center gap-1.5 text-[10px] text-zinc-500">
              <kbd className="kbd">⌘K</kbd> {t('side.or', 'or')} <kbd className="kbd">/</kbd> {t('side.toJump', 'to jump')}
            </p>

            <button
              onClick={onToggleCollapsed}
              className="hidden md:flex w-full items-center justify-center gap-1.5 py-1.5 rounded-lg text-[11px] text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.05] transition-all"
              title={t('side.collapse', 'Collapse')}
            >
              <ChevronLeft size={14} /> {t('side.collapse', 'Collapse')}
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      <button
        onClick={() => setMobileOpen(!mobileOpen)}
        className="mobile-menu-button md:hidden fixed top-3 left-3 z-50 w-10 h-10 dock-glass rounded-2xl flex items-center justify-center text-cyan-200"
        aria-label={mobileOpen ? t('side.closeMenu', 'Close menu') : t('side.openMenu', 'Open menu')}
        aria-expanded={mobileOpen}
        aria-controls="mobile-sidebar"
      >
        {mobileOpen ? <X size={18} /> : <Menu size={18} />}
      </button>

      <aside aria-label={t('side.nav', 'Dashboard navigation')} className={clsx(
        'dashboard-sidebar hidden md:flex flex-col h-screen sticky top-0 flex-shrink-0 border-r border-white/[0.07] transition-[width] duration-300',
        'bg-gradient-to-b from-[#0A0F17]/95 via-[#070A0F]/95 to-[#05070B]/95 backdrop-blur-2xl',
        collapsed ? 'w-[76px]' : 'w-64'
      )}>
        <div className="absolute inset-y-0 right-0 w-px bg-gradient-to-b from-cyan-300/20 via-transparent to-indigo-400/15 pointer-events-none" />
        <Content compact={collapsed} />
      </aside>

      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-40">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-md animate-fade-in" onClick={() => setMobileOpen(false)} />
          <aside
            id="mobile-sidebar"
            role="dialog"
            aria-modal="true"
            aria-label={t('side.nav', 'Dashboard navigation')}
            className="mobile-sidebar-panel relative z-10 w-[19rem] max-w-[86vw] h-full flex flex-col animate-slide-in border-r border-white/10 bg-gradient-to-b from-[#0C121C] to-[#070A0F]"
          >
            <Content compact={false} />
          </aside>
        </div>
      )}
    </>
  );
}

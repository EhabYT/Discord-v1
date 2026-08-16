import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, Crown, LogIn, LogOut, Menu, Search, X } from 'lucide-react';
import clsx from 'clsx';
import { NAV, LEVEL_LABELS, LEVEL_COLORS } from '../nav.js';

export default function Sidebar({
  page, setPage, guilds, selectedGuild, setSelectedGuild, me,
  permLevel = 0, auth = {}, mobileOpen, setMobileOpen, collapsed, onToggleCollapsed,
}) {
  const [guildOpen, setGuildOpen] = useState(false);
  const [guildQuery, setGuildQuery] = useState('');

  const filteredGuilds = useMemo(() => {
    const q = guildQuery.trim().toLowerCase();
    if (!q) return guilds;
    return guilds.filter((g) => (g.name || '').toLowerCase().includes(q) || g.id.includes(q));
  }, [guilds, guildQuery]);

  const Content = ({ compact }) => (
    <div className="flex flex-col h-full">
      <div className={clsx('border-b border-white/[0.06]', compact ? 'px-2 py-4' : 'px-4 py-4')}>
        <div className={clsx('flex items-center', compact ? 'justify-center' : 'gap-3')}>
          <button type="button" onClick={() => setPage('home')} className="flex-shrink-0" title="Homepage">
            <img src="/eb_logo.svg" alt="EB BOT" className="w-10 h-10 rounded-xl object-cover ring-1 ring-white/10 shadow-[0_8px_20px_rgba(0,0,0,0.35)]" />
          </button>
          {!compact && (
            <div className="min-w-0">
              <p className="text-sm font-bold text-white leading-none">EB Bot</p>
              <p className="text-[10px] text-zinc-500 tracking-[0.14em] uppercase mt-1">Dashboard v6</p>
            </div>
          )}
        </div>
      </div>

      <div className={clsx('border-b border-white/[0.06] relative', compact ? 'px-2 py-3' : 'px-3 py-3')}>
        <button
          onClick={() => setGuildOpen(!guildOpen)}
          title={selectedGuild?.name || 'Select server'}
          className={clsx(
            'w-full flex items-center rounded-xl bg-white/[0.04] border border-white/[0.07] hover:border-cyan-400/30 transition-all',
            compact ? 'justify-center p-2' : 'gap-2.5 px-3 py-2.5'
          )}
        >
          {selectedGuild?.icon
            ? <img src={selectedGuild.icon} alt="" className="w-6 h-6 rounded-full" />
            : <div className="w-6 h-6 rounded-full bg-cyan-400/15 flex items-center justify-center text-xs text-cyan-300 font-bold">
                {selectedGuild?.name?.[0] || '?'}
              </div>
          }
          {!compact && (
            <>
              <span className="text-xs text-zinc-100 flex-1 text-left truncate font-medium">
                {selectedGuild?.name || 'Select Server'}
              </span>
              <ChevronDown size={14} className={clsx('text-zinc-500 transition-transform', guildOpen && 'rotate-180')} />
            </>
          )}
        </button>
        {guildOpen && (
          <div className={clsx('mt-1.5 cyber-card overflow-hidden z-30', compact && 'absolute left-16 top-2 w-64')}>
            {guilds.length > 3 && (
              <div className="p-2 border-b border-white/[0.05]">
                <div className="relative">
                  <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-600" />
                  <input
                    autoFocus
                    value={guildQuery}
                    onChange={(e) => setGuildQuery(e.target.value)}
                    placeholder="Find a server…"
                    className="cyber-input pl-7 py-1.5 text-xs"
                  />
                </div>
              </div>
            )}
            <div className="max-h-64 overflow-y-auto">
              {filteredGuilds.length === 0 ? (
                <p className="px-3 py-4 text-xs text-zinc-500 text-center">No servers match</p>
              ) : filteredGuilds.map((g) => (
                <button
                  key={g.id}
                  onClick={() => { setSelectedGuild(g); setGuildOpen(false); setGuildQuery(''); }}
                  className={clsx(
                    'w-full flex items-center gap-2.5 px-3 py-2 text-xs hover:bg-cyan-400/10 transition-colors text-left',
                    selectedGuild?.id === g.id ? 'text-cyan-300 bg-cyan-400/[0.06]' : 'text-zinc-300'
                  )}
                >
                  {g.icon
                    ? <img src={g.icon} alt="" className="w-5 h-5 rounded-full" />
                    : <div className="w-5 h-5 rounded-full bg-cyan-400/15 flex items-center justify-center text-[10px] text-cyan-300 font-bold">{g.name[0]}</div>
                  }
                  <span className="truncate font-medium">{g.name}</span>
                  <span className="ml-auto text-zinc-600 text-[10px] tabular-nums">{g.memberCount?.toLocaleString()}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <nav className={clsx('flex-1 py-3 space-y-0.5 overflow-y-auto', compact ? 'px-2' : 'px-3')}>
        {NAV.map((item, i) => {
          if (item.section) {
            if (item.minLevel && !item.always && permLevel < item.minLevel) return null;
            if (compact) {
              return <div key={i} className="my-2 mx-2 h-px bg-white/[0.06]" />;
            }
            return (
              <p key={i} className={clsx(
                'text-[10px] font-bold uppercase tracking-widest px-3 pt-3 pb-1 first:pt-1 flex items-center gap-1.5',
                item.minLevel ? 'text-amber-600' : 'text-zinc-600'
              )}>
                {item.minLevel && <Crown size={9} className="text-amber-600" />}
                {item.section}
              </p>
            );
          }
          if (item.minLevel && permLevel < item.minLevel) return null;
          const { id, icon: Icon, label } = item;
          const isActive = page === id;
          return (
            <button
              key={id}
              title={compact ? label : item.hint}
              onClick={() => { setPage(id); setMobileOpen(false); }}
              className={clsx(
                'w-full',
                isActive ? 'sidebar-item-active' : 'sidebar-item',
                compact && 'justify-center px-0'
              )}
            >
              <Icon size={15} className={isActive ? 'text-cyan-300' : 'text-zinc-500'} />
              {!compact && <span className="truncate">{label}</span>}
            </button>
          );
        })}
      </nav>

      {me && (
        <div className={clsx('border-t border-white/[0.06] space-y-2', compact ? 'px-2 py-3' : 'px-3 py-3')}>
          {!compact && (
            <div className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-white/[0.03] border border-white/5">
              <span className="text-[10px] text-zinc-600 uppercase tracking-wider">Access</span>
              <span className={`text-[11px] font-bold ${LEVEL_COLORS[Math.min(permLevel, 3)]}`}>
                {LEVEL_LABELS[Math.min(permLevel, 3)] || 'Admin'}
              </span>
            </div>
          )}
          <div className={clsx('flex items-center rounded-xl bg-white/[0.04]', compact ? 'justify-center p-2' : 'gap-2.5 px-3 py-2')}>
            {(me.avatar || me.avatar_url)
              ? <img src={me.avatar || me.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover ring-2 ring-cyan-400/40 flex-shrink-0" />
              : <div className="w-8 h-8 rounded-full bg-cyan-400/15 flex items-center justify-center text-xs text-cyan-300 font-bold flex-shrink-0">
                  {me.username?.[0]?.toUpperCase() || 'A'}
                </div>
            }
            {!compact && (
              <>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-white truncate">{me.username}</p>
                  <p className="text-[10px] text-zinc-500 truncate">{me.tag || 'Bot Admin'}</p>
                </div>
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${me.loggedIn ? 'bg-emerald-400 shadow-[0_0_6px_rgba(74,222,128,0.6)]' : 'bg-zinc-500'}`} />
              </>
            )}
          </div>
          {!compact && (me.loggedIn ? (
            <button
              onClick={async () => { await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }); window.location.reload(); }}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] text-zinc-400 hover:text-red-400 hover:bg-red-500/10 border border-transparent hover:border-red-500/20 transition-all"
            >
              <LogOut size={12} /> Sign out
            </button>
          ) : auth.oauthEnabled ? (
            <a
              href="/api/auth/discord"
              className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium text-cyan-200 bg-cyan-400/10 border border-cyan-400/30 hover:bg-cyan-400/20 transition-all"
            >
              <LogIn size={12} /> Login with Discord
            </a>
          ) : null)}

          {!compact && (
            <p className="hidden md:flex items-center justify-center gap-1.5 text-[10px] text-zinc-600">
              <kbd className="kbd">⌘K</kbd> or <kbd className="kbd">/</kbd> to jump
            </p>
          )}

          <button
            onClick={onToggleCollapsed}
            className="hidden md:flex w-full items-center justify-center gap-1.5 py-1.5 rounded-lg text-[11px] text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.05] transition-all"
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <ChevronRight size={14} /> : <><ChevronLeft size={14} /> Collapse</>}
          </button>
        </div>
      )}
    </div>
  );

  return (
    <>
      <button
        onClick={() => setMobileOpen(!mobileOpen)}
        className="md:hidden fixed top-3 left-3 z-50 w-9 h-9 bg-[#070A0F]/90 border border-white/10 rounded-xl flex items-center justify-center text-cyan-200 backdrop-blur"
        aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
      >
        {mobileOpen ? <X size={18} /> : <Menu size={18} />}
      </button>

      <aside className={clsx(
        'hidden md:flex flex-col h-screen sticky top-0 flex-shrink-0 bg-[#070A0F]/90 border-r border-white/[0.06] transition-[width] duration-200',
        collapsed ? 'w-[72px]' : 'w-60'
      )}>
        <Content compact={collapsed} />
      </aside>

      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-40">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <aside className="relative z-10 w-64 h-full bg-[#070A0F] border-r border-white/10 flex flex-col animate-slide-in">
            <Content compact={false} />
          </aside>
        </div>
      )}
    </>
  );
}

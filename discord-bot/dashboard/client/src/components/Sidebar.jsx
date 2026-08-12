import React, { useState } from 'react';
import {
  LayoutDashboard, Music, MessageSquare, Ticket, TrendingUp,
  ScrollText, Shield, ChevronDown, Bot, Menu, X, Gift, Users,
  BarChart3, Settings, SlidersHorizontal, ShieldCheck,
  Trophy, Radio, Send, Zap, Crown
} from 'lucide-react';
import clsx from 'clsx';

const NAV = [
  { section: 'Core' },
  { id: 'overview',     icon: LayoutDashboard,  label: 'Dashboard' },
  { id: 'analytics',    icon: BarChart3,         label: 'Analytics' },
  { id: 'leaderboard',  icon: Trophy,            label: 'Leaderboard' },
  { id: 'livefeed',     icon: Radio,             label: 'Live Activity Feed' },
  { id: 'members',      icon: Users,             label: 'Members' },
  { section: 'Features' },
  { id: 'music',        icon: Music,             label: 'Music Controller' },
  { id: 'giveaways',    icon: Gift,              label: 'Giveaways' },
  { id: 'progression',  icon: TrendingUp,        label: 'Progression & XP' },
  { id: 'tickets',      icon: Ticket,            label: 'Ticket System' },
  { section: 'Config' },
  { id: 'welcome',      icon: MessageSquare,     label: 'Welcome Messages' },
  { id: 'logs',         icon: ScrollText,        label: 'Logs' },
  { id: 'security',     icon: Shield,            label: 'Security' },
  { id: 'settings',     icon: Settings,          label: 'Server Settings' },
  { id: 'botcontrols',  icon: SlidersHorizontal, label: 'Bot Controls' },
  { id: 'permissions',  icon: ShieldCheck,       label: 'Permissions' },
  { section: 'Owner', minLevel: 3 },
  { id: 'embedbuilder',  icon: Send, label: 'Embed Builder',  minLevel: 3 },
  { id: 'autoresponder', icon: Zap,  label: 'Auto-Responder', minLevel: 3 },
];

const LEVEL_LABELS = ['Viewer', 'DJ', 'Mod', 'Admin'];
const LEVEL_COLORS = ['text-gray-500', 'text-blue-400', 'text-yellow-400', 'text-cyan-400'];

export default function Sidebar({ page, setPage, guilds, selectedGuild, setSelectedGuild, me, permLevel = 0 }) {
  const [guildOpen,  setGuildOpen]  = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="px-4 py-5 border-b border-cyan-500/10">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center shadow-[0_0_12px_rgba(0,255,255,0.15)]">
            <Bot size={20} className="text-cyan-400" />
          </div>
          <div>
            <p className="text-sm font-bold text-white glow-text">EB-BOT</p>
            <p className="text-xs text-gray-500">Dashboard v2</p>
          </div>
        </div>
      </div>

      {/* Guild Selector */}
      <div className="px-3 py-3 border-b border-cyan-500/10">
        <button
          onClick={() => setGuildOpen(!guildOpen)}
          className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg bg-white/5 border border-cyan-500/20 hover:border-cyan-500/40 transition-all duration-200"
        >
          {selectedGuild?.icon
            ? <img src={selectedGuild.icon} alt="" className="w-6 h-6 rounded-full ring-1 ring-cyan-500/40" />
            : <div className="w-6 h-6 rounded-full bg-cyan-500/20 flex items-center justify-center text-xs text-cyan-400 font-bold">
                {selectedGuild?.name?.[0] || '?'}
              </div>
          }
          <span className="text-xs text-gray-300 flex-1 text-left truncate font-medium">
            {selectedGuild?.name || 'Select Server'}
          </span>
          <ChevronDown size={14} className={clsx('text-gray-500 transition-transform', guildOpen && 'rotate-180')} />
        </button>
        {guildOpen && (
          <div className="mt-1.5 cyber-card overflow-hidden">
            {guilds.map(g => (
              <button
                key={g.id}
                onClick={() => { setSelectedGuild(g); setGuildOpen(false); }}
                className={clsx(
                  'w-full flex items-center gap-2.5 px-3 py-2 text-xs hover:bg-cyan-500/10 transition-colors text-left',
                  selectedGuild?.id === g.id ? 'text-cyan-400' : 'text-gray-300'
                )}
              >
                {g.icon
                  ? <img src={g.icon} alt="" className="w-5 h-5 rounded-full" />
                  : <div className="w-5 h-5 rounded-full bg-cyan-500/20 flex items-center justify-center text-[10px] text-cyan-400 font-bold">{g.name[0]}</div>
                }
                <span className="truncate font-medium">{g.name}</span>
                <span className="ml-auto text-gray-600 text-[10px]">{g.memberCount?.toLocaleString()}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto">
        {NAV.map((item, i) => {
          // Section header
          if (item.section) {
            // Hide owner section if not admin
            if (item.minLevel && permLevel < item.minLevel) return null;
            return (
              <p key={i} className={clsx(
                'text-[10px] font-bold uppercase tracking-widest px-3 pt-3 pb-1 first:pt-1 flex items-center gap-1.5',
                item.minLevel ? 'text-yellow-600' : 'text-gray-700'
              )}>
                {item.minLevel && <Crown size={9} className="text-yellow-600" />}
                {item.section}
              </p>
            );
          }

          // Nav item — hide owner-only items from non-admins
          if (item.minLevel && permLevel < item.minLevel) return null;

          const { id, icon: Icon, label } = item;
          const isActive  = page === id;
          const isOwner   = !!item.minLevel;

          return (
            <button
              key={id}
              onClick={() => { setPage(id); setMobileOpen(false); }}
              className={clsx(
                'w-full',
                isActive
                  ? isOwner ? 'sidebar-item-active border-yellow-500/30' : 'sidebar-item-active'
                  : 'sidebar-item'
              )}
            >
              <Icon size={15} className={isActive ? (isOwner ? 'text-yellow-400' : 'text-cyan-400') : 'text-gray-500'} />
              <span className={isActive && isOwner ? 'text-yellow-300' : ''}>{label}</span>
              {isActive && (
                <div className={clsx(
                  'ml-auto w-1.5 h-1.5 rounded-full',
                  isOwner
                    ? 'bg-yellow-400 shadow-[0_0_6px_rgba(234,179,8,0.8)]'
                    : 'bg-cyan-400 shadow-[0_0_6px_rgba(0,255,255,0.8)]'
                )} />
              )}
            </button>
          );
        })}
      </nav>

      {/* User info */}
      {me && (
        <div className="px-3 py-3 border-t border-cyan-500/10 space-y-2">
          <div className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-white/[0.03] border border-white/5">
            <span className="text-[10px] text-gray-600 uppercase tracking-wider">Access</span>
            <span className={`text-[11px] font-bold ${LEVEL_COLORS[Math.min(permLevel, 3)] || 'text-cyan-400'}`}>
              {LEVEL_LABELS[Math.min(permLevel, 3)] || 'Admin'}
            </span>
          </div>
          <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-white/5">
            {me.avatar_url
              ? <img src={me.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover ring-2 ring-cyan-500/50 flex-shrink-0" />
              : <div className="w-8 h-8 rounded-full bg-cyan-500/20 flex items-center justify-center text-xs text-cyan-400 font-bold flex-shrink-0">
                  {me.username?.[0]?.toUpperCase() || 'A'}
                </div>
            }
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-white truncate">{me.username}</p>
              <p className="text-[10px] text-gray-500 truncate">{me.tag || 'Bot Admin'}</p>
            </div>
            <div className="w-2 h-2 rounded-full bg-green-400 shadow-[0_0_6px_rgba(74,222,128,0.6)] flex-shrink-0" />
          </div>
        </div>
      )}
    </div>
  );

  return (
    <>
      <button
        onClick={() => setMobileOpen(!mobileOpen)}
        className="md:hidden fixed top-4 left-4 z-50 w-9 h-9 bg-[#0B0E14] border border-cyan-500/30 rounded-lg flex items-center justify-center text-cyan-400"
      >
        {mobileOpen ? <X size={18} /> : <Menu size={18} />}
      </button>

      <aside className="hidden md:flex flex-col w-60 bg-[#0B0E14] border-r border-cyan-500/10 h-screen sticky top-0 flex-shrink-0">
        <SidebarContent />
      </aside>

      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-40">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <aside className="relative z-10 w-60 h-full bg-[#0B0E14] border-r border-cyan-500/20 flex flex-col">
            <SidebarContent />
          </aside>
        </div>
      )}
    </>
  );
}

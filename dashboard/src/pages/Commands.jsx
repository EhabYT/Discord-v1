import React, { useEffect, useMemo, useState } from 'react';
import { Command, Search, Power, Copy, ChevronDown } from 'lucide-react';
import PageHeader from '../components/PageHeader.jsx';
import { useToast } from '../components/Toast.jsx';
import api from '../api.js';

const GROUPS = [
  { id: 'all', label: 'All' },
  { id: 'mod', label: 'Mod' },
  { id: 'music', label: 'Music' },
  { id: 'fun', label: 'Fun' },
  { id: 'tools', label: 'Tools' },
  { id: 'xp', label: 'XP' },
  { id: 'server', label: 'Server' },
];

const MOD = new Set(['ban','softban','kick','timeout','untimeout','warn','warnings','removewarn','note','role','lock','unlock','lockdown','slowmode','clear','snipe','editsnipe','automod','whitelist','vmute','unvmute','unban','setnick','move','announce','say']);
const MUSIC = new Set(['play','skip','stop','leave','pause','resume','queue','remove','seek','replay','nowplaying','volume','shuffle','loop','autoplay','lyrics','filters']);
const FUN = new Set(['fun','games','coinflip','roll','ship','wouldyourather','truthordare','slots','work','pay','points','daily','streak','badges','rep','credits']);
const TOOLS = new Set(['tools','define','math','qr','afk','remind','reminders','tag','jumbo','firstmessage','ping','help','info','avatar','banner','userinfo','roleinfo','channelinfo','invites','poll','suggest','confess']);
const XP = new Set(['rank','leaderboard','givexp','setlevel','resetxp','levelsettings','stats','serverstats','membercount']);
const SERVER = new Set(['ticket','giveaway','welcome','logging','reactionrole','setupverification','birthday','birthdaysettings','serverinfo']);

function groupOf(name) {
  if (MOD.has(name)) return 'mod';
  if (MUSIC.has(name)) return 'music';
  if (FUN.has(name)) return 'fun';
  if (TOOLS.has(name)) return 'tools';
  if (XP.has(name)) return 'xp';
  if (SERVER.has(name)) return 'server';
  return 'tools';
}

function copyText(text) {
  return navigator.clipboard?.writeText(text).catch(() => {});
}

export default function Commands({ guild, permLevel = 0 }) {
  const toast = useToast();
  const [commands, setCommands] = useState([]);
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState('all');
  const [open, setOpen] = useState(null);
  const canToggle = permLevel >= 3;

  const load = () => {
    if (!guild?.id) return;
    api.get(`/api/guild/${guild.id}/commands`)
      .then((d) => setCommands(d.commands || []))
      .catch(() => setCommands([]));
  };

  useEffect(load, [guild?.id]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return commands.filter((c) => {
      if (tab !== 'all' && groupOf(c.name) !== tab) return false;
      if (!q) return true;
      const blob = [
        c.name, c.description,
        ...(c.subs || []).map((s) => `${s.name} ${s.description}`),
      ].join(' ').toLowerCase();
      return blob.includes(q);
    });
  }, [commands, query, tab]);

  const toggle = async (name, enabled) => {
    if (!canToggle) return;
    setCommands((prev) => prev.map((c) => (c.name === name ? { ...c, enabled } : c)));
    try {
      await api.post(`/api/guild/${guild.id}/commands/toggle`, { commandName: name, enabled });
    } catch {
      setCommands((prev) => prev.map((c) => (c.name === name ? { ...c, enabled: !enabled } : c)));
      toast.error('Toggle failed.');
    }
  };

  const disabled = commands.filter((c) => !c.enabled).length;
  const subCount = commands.reduce((n, c) => n + (c.subs?.length || 0), 0);

  return (
    <div className="page-shell-sm animate-fade-in">
      <PageHeader
        icon={Command}
        title="Commands"
        subtitle={`${commands.length} slash commands · ${subCount} subcommands`}
        badge={disabled ? `${disabled} off` : 'all on'}
        badgeColor={disabled ? 'yellow' : 'green'}
      />

      <div className="grid grid-cols-3 gap-3">
        <div className="cyber-card p-3 text-center">
          <p className="text-xl font-bold text-white">{commands.length}</p>
          <p className="text-[10px] text-zinc-600">Top-level</p>
        </div>
        <div className="cyber-card p-3 text-center">
          <p className="text-xl font-bold text-cyan-300">{subCount}</p>
          <p className="text-[10px] text-zinc-600">Subcommands</p>
        </div>
        <div className="cyber-card p-3 text-center">
          <p className="text-xl font-bold text-yellow-300">{disabled}</p>
          <p className="text-[10px] text-zinc-600">Disabled here</p>
        </div>
      </div>

      <div className="cyber-card p-4 space-y-3">
        <div className="relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search /fun meme, weather, blackjack…"
            className="cyber-input pl-9 text-xs"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {GROUPS.map((g) => (
            <button
              key={g.id}
              onClick={() => setTab(g.id)}
              className={`text-[11px] px-2.5 py-1 rounded-lg border ${
                tab === g.id
                  ? 'border-cyan-400/40 bg-cyan-400/10 text-cyan-200'
                  : 'border-white/10 text-zinc-500 hover:text-zinc-200'
              }`}
            >
              {g.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        {filtered.map((c) => {
          const hasSubs = (c.subs && c.subs.length) || (c.groups && c.groups.length);
          const expanded = open === c.name;
          return (
            <div key={c.name} className="cyber-card px-3 py-2.5">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setOpen(expanded ? null : c.name)}
                  className="flex-1 min-w-0 text-left"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-cyan-300">/{c.name}</span>
                    {hasSubs ? (
                      <span className="text-[10px] text-zinc-600">{c.subs.length} subs</span>
                    ) : null}
                    <ChevronDown size={12} className={`text-zinc-600 transition ${expanded ? 'rotate-180' : ''}`} />
                  </div>
                  {c.description && <p className="text-[11px] text-zinc-500 truncate mt-0.5">{c.description}</p>}
                </button>
                <button
                  type="button"
                  onClick={() => { copyText(`/${c.name}`); toast.success(`Copied /${c.name}`); }}
                  className="cyber-icon-button"
                  title="Copy"
                >
                  <Copy size={12} />
                </button>
                <button
                  type="button"
                  disabled={!canToggle}
                  onClick={() => toggle(c.name, !c.enabled)}
                  className={`text-[11px] px-2 py-1 rounded-lg border ${
                    c.enabled
                      ? 'border-emerald-500/25 text-emerald-300'
                      : 'border-yellow-500/25 text-yellow-300'
                  } ${!canToggle ? 'opacity-50' : ''}`}
                  title={canToggle ? 'Toggle in this server' : 'Admin only'}
                >
                  <Power size={11} className="inline mr-1" />
                  {c.enabled ? 'On' : 'Off'}
                </button>
              </div>
              {expanded && hasSubs && (
                <div className="mt-2 pl-2 border-l border-white/10 space-y-1">
                  {(c.subs || []).map((s) => (
                    <div key={s.name} className="flex items-baseline gap-2">
                      <span className="font-mono text-[11px] text-cyan-200/80">{s.name}</span>
                      <span className="text-[11px] text-zinc-600 truncate">{s.description}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {filtered.length === 0 && (
          <p className="text-xs text-zinc-600 text-center py-8">No commands match.</p>
        )}
      </div>
    </div>
  );
}

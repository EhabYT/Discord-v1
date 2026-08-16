import React, { useState, useEffect, useCallback } from 'react';
import {
  Server, Users, Terminal, Zap, Cpu, HardDrive, Clock,
  RefreshCw, Shield, ShieldOff, UserX, UserPlus, Hash,
  Trash2, Settings, Star, Link, Webhook, Bot, AlertTriangle,
  ChevronDown, ChevronUp, Activity, Circle, Music, Ticket, Radio, BadgeCheck, Gift, Lightbulb, Vote, Ghost,
} from 'lucide-react';
import StatCard from '../components/StatCard.jsx';
import PageHeader from '../components/PageHeader.jsx';
import CopyButton from '../components/CopyButton.jsx';
import api from '../api.js';

function formatUptime(ms) {
  if (!ms) return '0s';
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m ${s % 60}s`;
}

function formatBytes(b) {
  if (!b) return '0 MB';
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

function timeAgo(ts) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60)    return `${s}s ago`;
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return new Date(ts).toLocaleDateString();
}

const CAT = {
  ban:            { icon: Shield,       color: 'text-red-400',     bg: 'bg-red-500/10',     border: 'border-red-500/20' },
  unban:          { icon: ShieldOff,    color: 'text-cyan-400',    bg: 'bg-cyan-500/10',    border: 'border-cyan-500/20' },
  kick:           { icon: UserX,        color: 'text-orange-400',  bg: 'bg-orange-500/10',  border: 'border-orange-500/20' },
  member_update:  { icon: UserPlus,     color: 'text-blue-400',    bg: 'bg-blue-500/10',    border: 'border-blue-500/20' },
  role_update:    { icon: Star,         color: 'text-purple-400',  bg: 'bg-purple-500/10',  border: 'border-purple-500/20' },
  role_create:    { icon: Star,         color: 'text-purple-400',  bg: 'bg-purple-500/10',  border: 'border-purple-500/20' },
  role_delete:    { icon: Star,         color: 'text-purple-400',  bg: 'bg-purple-500/10',  border: 'border-purple-500/20' },
  channel_create: { icon: Hash,         color: 'text-green-400',   bg: 'bg-green-500/10',   border: 'border-green-500/20' },
  channel_update: { icon: Hash,         color: 'text-green-400',   bg: 'bg-green-500/10',   border: 'border-green-500/20' },
  channel_delete: { icon: Hash,         color: 'text-green-400',   bg: 'bg-green-500/10',   border: 'border-green-500/20' },
  server_update:  { icon: Settings,     color: 'text-yellow-400',  bg: 'bg-yellow-500/10',  border: 'border-yellow-500/20' },
  msg_delete:     { icon: Trash2,       color: 'text-rose-400',    bg: 'bg-rose-500/10',    border: 'border-rose-500/20' },
  invite:         { icon: Link,         color: 'text-teal-400',    bg: 'bg-teal-500/10',    border: 'border-teal-500/20' },
  webhook:        { icon: Webhook,      color: 'text-indigo-400',  bg: 'bg-indigo-500/10',  border: 'border-indigo-500/20' },
  automod:        { icon: Bot,          color: 'text-fuchsia-400', bg: 'bg-fuchsia-500/10', border: 'border-fuchsia-500/20' },
  warning:        { icon: AlertTriangle,color: 'text-amber-400',   bg: 'bg-amber-500/10',   border: 'border-amber-500/20' },
  other:          { icon: Activity,     color: 'text-gray-400',    bg: 'bg-white/5',        border: 'border-white/10' },
};

function getCat(item) {
  return CAT[item.category] || CAT[item.type] || CAT.other;
}

function AuditEntry({ item, isLast }) {
  const [expanded, setExpanded] = useState(false);
  const meta = getCat(item);
  const Icon = meta.icon;
  const hasReason = !!item.reason;

  return (
    <div className="flex gap-3 group">
      <div className="flex flex-col items-center flex-shrink-0">
        <div className={`w-7 h-7 rounded-lg ${meta.bg} border ${meta.border} flex items-center justify-center z-10 flex-shrink-0`}>
          <Icon size={13} className={meta.color} />
        </div>
        {!isLast && <div className="w-px flex-1 bg-white/[0.05] mt-1 mb-0" />}
      </div>

      <div className="flex-1 min-w-0 pb-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-sm text-white font-medium leading-snug">
              {item.label || item.description}
            </p>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              {item.executor?.name && (
                <span className="text-[11px] text-gray-600">
                  by <span className="text-gray-400">{item.executor.name}</span>
                </span>
              )}
              {item.target?.name && (
                <span className="text-[11px] text-gray-600">
                  → <span className="text-gray-500">{item.target.name}</span>
                </span>
              )}
              {item.type === 'warning' && (
                <span className="text-[11px] text-gray-600">
                  by <span className="text-gray-400">{item.moderator || 'Unknown'}</span>
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="text-[10px] text-gray-600 tabular-nums">{timeAgo(item.timestamp)}</span>
            {hasReason && (
              <button
                onClick={() => setExpanded(e => !e)}
                className="text-gray-700 hover:text-gray-400 transition-colors"
              >
                {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              </button>
            )}
          </div>
        </div>

        {expanded && item.reason && (
          <div className="mt-2 px-3 py-2 rounded-lg bg-white/[0.03] border border-white/5 text-xs text-gray-400 italic animate-fade-in">
            "{item.reason}"
          </div>
        )}
      </div>
    </div>
  );
}

const FILTER_GROUPS = [
  { id: 'all',           label: 'All' },
  { id: 'ban',           label: 'Bans' },
  { id: 'kick',          label: 'Kicks' },
  { id: 'member_update', label: 'Members' },
  { id: 'role_update',   label: 'Roles' },
  { id: 'channel_create',label: 'Channels' },
  { id: 'msg_delete',    label: 'Messages' },
  { id: 'warning',       label: 'Warnings' },
  { id: 'server_update', label: 'Server' },
];

function MetricBar({ label, value, max = 100, color = '#00FFFF', unit = '%' }) {
  const pct = Math.min(100, Math.round((value / max) * 100));
  const warnColor = pct > 80 ? '#FF4444' : pct > 60 ? '#FFA500' : color;
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs text-gray-500">{label}</span>
        <span className="text-xs font-bold text-white tabular-nums">{value}{unit}</span>
      </div>
      <div className="cyber-progress">
        <div
          className="cyber-progress-bar"
          style={{ width: `${pct}%`, background: warnColor, boxShadow: `0 0 6px ${warnColor}60` }}
        />
      </div>
    </div>
  );
}

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return 'Late night';
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

export default function Overview({ guild, guildData, onNavigate, publicUrl: publicUrlProp }) {
  const [stats, setStats]       = useState(null);
  const [perf, setPerf]         = useState(null);
  const [activity, setActivity] = useState([]);
  const [growth, setGrowth]     = useState(null);
  const [publicUrl, setPublicUrl] = useState(publicUrlProp || '');
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [catFilter, setCatFilter]   = useState('all');
  const [showAll, setShowAll]       = useState(false);
  const [updatedAt, setUpdatedAt]   = useState(null);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const [s, p, h] = await Promise.all([
        api.get('/api/stats'),
        api.get('/api/performance'),
        api.get('/api/health').catch(() => null),
      ]);
      setStats(s);
      setPerf(p);
      if (h?.publicUrl) setPublicUrl(h.publicUrl);
      setUpdatedAt(Date.now());
      if (guild?.id) {
        const [act, g] = await Promise.all([
          api.get(`/api/guild/${guild.id}/activity`).catch(() => []),
          api.get(`/api/guild/${guild.id}/growth`).catch(() => null),
        ]);
        setActivity(act);
        setGrowth(g);
      }
    } catch (e) {}
    setRefreshing(false);
    setLoading(false);
  }, [guild?.id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [load]);

  const pingColor = (p) => p < 100 ? 'text-green-400' : p < 200 ? 'text-yellow-400' : 'text-red-400';
  const pingLabel = (p) => p < 100 ? 'Excellent' : p < 200 ? 'Good' : 'High';

  const filtered = activity.filter(item => {
    if (catFilter === 'all') return true;
    if (catFilter === 'channel_create') return item.category?.startsWith('channel') || false;
    if (catFilter === 'role_update') return item.category?.startsWith('role') || false;
    if (catFilter === 'member_update') return item.category?.startsWith('member') || false;
    return item.category === catFilter || item.type === catFilter;
  });

  const displayed = showAll ? filtered : filtered.slice(0, 12);

  return (
    <div className="page-shell">
      <PageHeader
        icon={Activity}
        title="Overview"
        crumb={greeting()}
        subtitle={guild ? `${guild.name} · live every 15s${updatedAt ? ` · updated ${timeAgo(updatedAt)}` : ''}` : 'Select a server'}
        badge={stats ? `${stats.ping}ms` : undefined}
        badgeColor={stats?.ping < 100 ? 'green' : stats?.ping < 200 ? 'yellow' : 'red'}
      >
        <div className="flex items-center gap-2">
          {stats && (
            <div className={`flex items-center gap-1.5 text-xs font-medium ${pingColor(stats.ping)}`}>
              <Circle size={6} className="fill-current animate-pulse" />
              {pingLabel(stats.ping)}
            </div>
          )}
          <button
            onClick={load}
            disabled={refreshing}
            className="cyber-button flex items-center gap-2 text-xs py-1.5 px-3"
          >
            <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </PageHeader>

      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-20 rounded-xl skeleton" />
          ))}
        </div>
      ) : (
        <>
          {/* Stat cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard icon={Server}   label="Servers"     value={stats?.guilds ?? '—'}                                             color="cyan" />
            <StatCard icon={Users}    label="Users"       value={stats?.users?.toLocaleString() ?? '—'}                            color="purple" onClick={onNavigate ? () => onNavigate('members') : undefined} />
            <StatCard icon={Terminal} label="Commands"    value={stats?.commands?.toLocaleString() ?? '—'}                         color="green" onClick={onNavigate ? () => onNavigate('analytics') : undefined} />
            <StatCard icon={Zap}      label="Latency"
              value={<span className={pingColor(stats?.ping)}>{stats?.ping ?? '—'}ms</span>}
              sub={pingLabel(stats?.ping)}
              color="yellow"
            />
          </div>

          {publicUrl && (
            <div className="cyber-card-accent p-4 flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="cyber-label mb-1">Public dashboard</p>
                <p className="text-sm text-cyan-100 truncate font-medium">{publicUrl}</p>
                <p className="text-[11px] text-zinc-500 mt-0.5">Share with staff. Quick tunnels can change if Cloudflare drops.</p>
              </div>
              <CopyButton value={publicUrl} label="Copy link" />
            </div>
          )}

          {onNavigate && (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {[
                { id: 'music', icon: Music, label: 'Music desk', hint: 'Queue & filters' },
                { id: 'tickets', icon: Ticket, label: 'Tickets', hint: 'Support inbox' },
                { id: 'verification', icon: BadgeCheck, label: 'Verification', hint: 'Gate & captcha' },
                { id: 'reactionroles', icon: Hash, label: 'Roles', hint: 'Buttons & reacts' },
                { id: 'birthdays', icon: Gift, label: 'Birthdays', hint: 'Upcoming' },
                { id: 'suggestions', icon: Lightbulb, label: 'Suggestions', hint: 'Inbox' },
                { id: 'polls', icon: Vote, label: 'Polls', hint: 'Votes' },
                { id: 'tags', icon: Hash, label: 'Tags', hint: 'Snippets' },
                { id: 'confessions', icon: Ghost, label: 'Confess', hint: 'Anonymous' },
                { id: 'security', icon: Shield, label: 'Security', hint: 'AutoMod & raid' },
                { id: 'livefeed', icon: Radio, label: 'Live feed', hint: 'Realtime events' },
              ].map(({ id, icon: Icon, label, hint }) => (
                <button key={id} onClick={() => onNavigate(id)} className="cyber-card-hover p-3.5 flex items-center gap-3 text-left">
                  <span className="w-9 h-9 rounded-xl bg-cyan-400/10 border border-cyan-400/15 flex items-center justify-center text-cyan-300">
                    <Icon size={16} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-white">{label}</span>
                    <span className="block text-[11px] text-zinc-500">{hint}</span>
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* System health + uptime */}
          <div className="grid md:grid-cols-3 gap-3">
            {/* Uptime */}
            <div className="cyber-card p-4">
              <div className="flex items-center gap-2 mb-3">
                <Clock size={14} className="text-cyan-400" />
                <span className="text-xs font-semibold text-white uppercase tracking-wide">Uptime</span>
                <div className="ml-auto flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-green-400 shadow-[0_0_6px_rgba(74,222,128,0.9)] animate-pulse" />
                  <span className="text-[10px] text-green-400 font-medium">Online</span>
                </div>
              </div>
              <p className="text-2xl font-bold text-cyan-400 glow-text-sm">{formatUptime(stats?.uptime)}</p>
              <p className="text-xs text-gray-600 mt-1">{stats?.guilds} servers · {stats?.users?.toLocaleString()} members</p>
            </div>

            {/* CPU */}
            <div className="cyber-card p-4">
              <div className="flex items-center gap-2 mb-3">
                <Cpu size={14} className="text-cyan-400" />
                <span className="text-xs font-semibold text-white uppercase tracking-wide">CPU</span>
                <span className="ml-auto text-xs font-bold text-white tabular-nums">{perf?.cpu ?? 0}%</span>
              </div>
              <div className="space-y-2">
                <MetricBar label="Process Load" value={perf?.cpu ?? 0} />
                <p className="text-[11px] text-gray-600">{perf?.system?.cpuCount} logical cores</p>
              </div>
            </div>

            {/* Memory */}
            <div className="cyber-card p-4">
              <div className="flex items-center gap-2 mb-3">
                <HardDrive size={14} className="text-cyan-400" />
                <span className="text-xs font-semibold text-white uppercase tracking-wide">Memory</span>
                <span className="ml-auto text-xs font-bold text-white tabular-nums">{perf?.memory?.percent ?? 0}%</span>
              </div>
              <div className="space-y-2">
                <MetricBar label="Heap" value={perf?.memory?.percent ?? 0} />
                <p className="text-[11px] text-gray-600">
                  {formatBytes(perf?.memory?.used)} used · {formatBytes(perf?.memory?.rss)} RSS
                </p>
              </div>
            </div>
          </div>

          {guildData?.diagnostics?.missingPermissions?.length > 0 && (
            <div className="cyber-card p-4 border-yellow-500/25 bg-yellow-500/[0.05] flex items-start gap-3">
              <AlertTriangle size={16} className="text-yellow-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-yellow-300">Missing bot permissions</p>
                <p className="text-xs text-yellow-500/80 mt-1">
                  {guildData.diagnostics.missingPermissions.map((p) => p.name).join(', ')}
                </p>
              </div>
            </div>
          )}

          {growth?.data?.length > 1 && (
            <div className="cyber-card p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Users size={14} className="text-cyan-400" />
                  <span className="text-xs font-semibold text-white uppercase tracking-wide">Member growth</span>
                </div>
                <span className="text-xs text-zinc-500">{growth.data[growth.data.length - 1]} now</span>
              </div>
              <div className="flex items-end gap-1 h-16">
                {growth.data.map((n, i) => {
                  const max = Math.max(...growth.data, 1);
                  const min = Math.min(...growth.data);
                  const span = Math.max(1, max - min);
                  const h = 12 + ((n - min) / span) * 88;
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center gap-1 group relative">
                      <div className="absolute -top-5 hidden group-hover:block text-[10px] text-white bg-black/70 px-1 rounded">{n}</div>
                      <div className="w-full rounded-t bg-cyan-400/70" style={{ height: `${h}%` }} />
                      <span className="text-[8px] text-zinc-600">{growth.labels?.[i] || ''}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Audit log */}
          <div className="cyber-card p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Activity size={15} className="text-cyan-400" />
                <span className="text-sm font-bold text-white">Audit Log</span>
                {activity.length > 0 && (
                  <span className="cyber-badge-cyan">{activity.length}</span>
                )}
              </div>
              <button
                onClick={() => { setCatFilter('all'); setShowAll(false); load(); }}
                disabled={refreshing}
                className="flex items-center gap-1 text-[11px] text-gray-600 hover:text-cyan-400 transition-colors"
              >
                <RefreshCw size={10} className={refreshing ? 'animate-spin' : ''} />
                Refresh log
              </button>
            </div>

            {activity.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-5">
                {FILTER_GROUPS.map(f => {
                  const meta = f.id !== 'all' ? (CAT[f.id] || CAT.other) : null;
                  const isActive = catFilter === f.id;
                  const count = f.id === 'all' ? activity.length
                    : activity.filter(item => {
                        if (f.id === 'channel_create') return item.category?.startsWith('channel');
                        if (f.id === 'role_update') return item.category?.startsWith('role');
                        if (f.id === 'member_update') return item.category?.startsWith('member');
                        return item.category === f.id || item.type === f.id;
                      }).length;
                  if (count === 0 && f.id !== 'all') return null;
                  return (
                    <button
                      key={f.id}
                      onClick={() => { setCatFilter(f.id); setShowAll(false); }}
                      className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium border transition-all ${
                        isActive
                          ? meta
                            ? `${meta.bg} ${meta.border} ${meta.color}`
                            : 'bg-cyan-500/15 border-cyan-500/30 text-cyan-400'
                          : 'border-white/[0.07] text-gray-600 hover:text-gray-400 hover:border-white/12'
                      }`}
                    >
                      {f.label}
                      {count > 0 && <span className="opacity-60">{count}</span>}
                    </button>
                  );
                })}
              </div>
            )}

            {!guild ? (
              <div className="text-center py-10">
                <Server size={28} className="text-gray-700 mx-auto mb-2" />
                <p className="text-sm text-gray-600">Select a server to see its audit log</p>
              </div>
            ) : activity.length === 0 ? (
              <div className="text-center py-10">
                <Activity size={28} className="text-gray-700 mx-auto mb-2" />
                <p className="text-sm text-gray-600">No recent activity</p>
                <p className="text-xs text-gray-700 mt-1">Events appear here as they happen in {guild.name}</p>
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-sm text-gray-600">No events in this category</p>
              </div>
            ) : (
              <>
                <div className="space-y-0">
                  {displayed.map((item, i) => (
                    <AuditEntry key={i} item={item} isLast={i === displayed.length - 1} />
                  ))}
                </div>
                {filtered.length > 12 && (
                  <button
                    onClick={() => setShowAll(v => !v)}
                    className="mt-3 w-full py-2 text-xs text-gray-600 hover:text-cyan-400 border border-white/5 hover:border-cyan-500/20 rounded-lg transition-all flex items-center justify-center gap-1.5"
                  >
                    {showAll
                      ? <><ChevronUp size={12} /> Show less</>
                      : <><ChevronDown size={12} /> Show {filtered.length - 12} more events</>}
                  </button>
                )}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

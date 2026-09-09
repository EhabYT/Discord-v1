import React, { useState, useEffect, useCallback } from 'react';
import {
  Server, Users, Terminal, Zap, Cpu, HardDrive, Clock,
  RefreshCw, Shield, ShieldOff, UserX, UserPlus, Hash,
  Trash2, Settings, Star, Link, Webhook, Bot, AlertTriangle,
  ChevronDown, ChevronUp, Activity, Circle, Music, Ticket, Radio, BadgeCheck, Gift, Lightbulb, Vote, Ghost,
} from 'lucide-react';
import StatCard from '../components/StatCard.jsx';
import PageHeader from '../components/PageHeader.jsx';
import EmptyState from '../components/EmptyState.jsx';
import CopyButton from '../components/CopyButton.jsx';
import { useI18n } from '../i18n.jsx';
import { timeAgo } from '../lib/time.js';
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
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const meta = getCat(item);
  const Icon = meta.icon;
  const hasReason = !!item.reason;
  // Locale-aware "by <name>" (e.g. Turkish "<name> tarafından").
  const byline = (name) => {
    const [before, after = ''] = t('ov.byline', 'by {name}').split('{name}');
    return (<>{before}<span className="text-zinc-300">{name}</span>{after}</>);
  };

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
                <span className="text-[11px] text-zinc-500">
                  {byline(item.executor.name)}
                </span>
              )}
              {item.target?.name && (
                <span className="text-[11px] text-zinc-500">
                  → <span className="text-zinc-400">{item.target.name}</span>
                </span>
              )}
              {item.type === 'warning' && (
                <span className="text-[11px] text-zinc-500">
                  {byline(item.moderator || 'Unknown')}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="text-[10px] text-zinc-500 tabular-nums">{timeAgo(item.timestamp, t)}</span>
            {hasReason && (
              <button
                onClick={() => setExpanded(e => !e)}
                aria-expanded={expanded}
                aria-label={expanded ? t('ov.hideReason', 'Hide reason') : t('ov.showReason', 'Show reason')}
                className="touch-32 w-8 h-8 flex items-center justify-center rounded-lg text-zinc-400 hover:text-cyan-200 hover:bg-white/[0.06] transition-colors"
              >
                {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              </button>
            )}
          </div>
        </div>

        {expanded && item.reason && (
          <div className="mt-2 px-3 py-2 rounded-lg bg-white/[0.03] border border-white/5 text-xs text-zinc-400 italic animate-fade-in">
            "{item.reason}"
          </div>
        )}
      </div>
    </div>
  );
}

const FILTER_GROUPS = [
  { id: 'all',            label: 'All',      i18n: 'ov.filter.all' },
  { id: 'ban',            label: 'Bans',     i18n: 'ov.filter.ban' },
  { id: 'kick',           label: 'Kicks',    i18n: 'ov.filter.kick' },
  { id: 'member_update',  label: 'Members',  i18n: 'ov.filter.member' },
  { id: 'role_update',    label: 'Roles',    i18n: 'ov.filter.role' },
  { id: 'channel_create', label: 'Channels', i18n: 'ov.filter.channel' },
  { id: 'msg_delete',     label: 'Messages', i18n: 'ov.filter.message' },
  { id: 'warning',        label: 'Warnings', i18n: 'ov.filter.warning' },
  { id: 'server_update',  label: 'Server',   i18n: 'ov.filter.server' },
];

function MetricBar({ label, value, max = 100, color = '#00FFFF', unit = '%' }) {
  const pct = Math.min(100, Math.round((value / max) * 100));
  const warnColor = pct > 80 ? '#FF4444' : pct > 60 ? '#FFA500' : color;
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs text-zinc-400">{label}</span>
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

function greeting(t) {
  const h = new Date().getHours();
  if (h < 5) return t('ov.greet.night', 'Late night');
  if (h < 12) return t('ov.greet.morning', 'Good morning');
  if (h < 18) return t('ov.greet.afternoon', 'Good afternoon');
  return t('ov.greet.evening', 'Good evening');
}

export default function Overview({ guild, guildData, onNavigate, publicUrl: publicUrlProp, developerAccess = {} }) {
  const { t } = useI18n();
  const canSeeMusicDesk = ['DEVELOPER', 'SUPER_ADMIN'].includes(developerAccess.baseRole)
    || ['DEVELOPER', 'SUPER_ADMIN'].includes(developerAccess.role);
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
  const pingLabel = (p) => p == null ? '—' : p < 100 ? t('ov.ping.excellent', 'Excellent') : p < 200 ? t('ov.ping.good', 'Good') : t('ov.ping.high', 'High');

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
        title={t('nav.overview', 'Overview')}
        crumb={greeting(t)}
        subtitle={guild ? `${guild.name} · ${t('ov.live', 'live every 15s')}${updatedAt ? ` · ${t('ov.updated', 'updated')} ${timeAgo(updatedAt, t)}` : ''}` : t('ov.selectServer', 'Select a server')}
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
            {t('ov.refresh', 'Refresh')}
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
            <StatCard icon={Server}   label={t('ov.stat.servers', 'Servers')}     value={stats?.guilds ?? '—'}                                             color="cyan" />
            <StatCard icon={Users}    label={t('ov.stat.users', 'Users')}       value={stats?.users?.toLocaleString() ?? '—'}                            color="purple" onClick={onNavigate ? () => onNavigate('members') : undefined} />
            <StatCard icon={Terminal} label={t('ov.stat.commands', 'Commands')}    value={stats?.commands?.toLocaleString() ?? '—'}                         color="green" onClick={onNavigate ? () => onNavigate('analytics') : undefined} />
            <StatCard icon={Zap}      label={t('ov.stat.latency', 'Latency')}
              value={<span className={pingColor(stats?.ping)}>{stats?.ping ?? '—'}ms</span>}
              sub={pingLabel(stats?.ping)}
              color="yellow"
            />
          </div>

          {publicUrl && (
            <div className="cyber-card-accent p-4 flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="cyber-label mb-1">{t('ov.publicDash', 'Public dashboard')}</p>
                <p className="text-sm text-cyan-100 truncate font-medium">{publicUrl}</p>
                <p className="text-[11px] text-zinc-500 mt-0.5">{t('ov.shareStaff', 'Share with staff. Quick tunnels can change if Cloudflare drops.')}</p>
              </div>
              <CopyButton value={publicUrl} label={t('ov.copyLink', 'Copy link')} />
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
              ].filter(({ id }) => id !== 'music' || canSeeMusicDesk).map(({ id, icon: Icon, label, hint }, i) => (
                <button
                  key={id}
                  onClick={() => onNavigate(id)}
                  className="cyber-card-hover p-3.5 flex items-center gap-3 text-left group animate-fade-in"
                  style={{ animationDelay: `${Math.min(i, 8) * 35}ms` }}
                >
                  <span className="w-10 h-10 rounded-2xl bg-gradient-to-br from-cyan-400/20 to-indigo-400/10 border border-cyan-300/20 flex items-center justify-center text-cyan-200 flex-shrink-0 shadow-[0_0_16px_rgba(34,211,238,0.1)] group-hover:shadow-[0_0_24px_rgba(34,211,238,0.2)] transition-shadow">
                    <Icon size={16} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-white">{t(`nav.${id}`, label)}</span>
                    <span className="block text-[11px] text-zinc-500">{t(`ov.qa.${id}`, hint)}</span>
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* System health + uptime */}
          <div className="grid md:grid-cols-3 gap-3">
            {/* Uptime */}
            <div className="glass-panel mesh-glow p-4 relative overflow-hidden">
              <div className="flex items-center gap-2 mb-3">
                <span className="w-7 h-7 rounded-lg flex items-center justify-center bg-cyan-400/12 border border-cyan-300/20">
                  <Clock size={14} className="text-cyan-200" />
                </span>
                <span className="text-[11px] font-bold text-zinc-300 uppercase tracking-[0.12em]">{t('ov.uptime', 'Uptime')}</span>
                <div className="ml-auto flex items-center gap-1.5 px-2 py-0.5 rounded-full border border-emerald-400/20 bg-emerald-400/[0.07]">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(74,222,128,0.9)] animate-pulse" />
                  <span className="text-[10px] text-emerald-300 font-semibold">{t('ov.online', 'Online')}</span>
                </div>
              </div>
              <p className="text-2xl font-bold text-white tabular-nums tracking-tight">{formatUptime(stats?.uptime)}</p>
              <p className="text-[11px] text-zinc-500 mt-1">{stats?.guilds} {t('ov.servers', 'servers')} · {stats?.users?.toLocaleString()} {t('ov.members', 'members')}</p>
            </div>

            {/* CPU */}
            <div className="glass-panel p-4">
              <div className="flex items-center gap-2 mb-3">
                <span className="w-7 h-7 rounded-lg flex items-center justify-center bg-indigo-400/12 border border-indigo-300/20">
                  <Cpu size={14} className="text-indigo-200" />
                </span>
                <span className="text-[11px] font-bold text-zinc-300 uppercase tracking-[0.12em]">{t('ov.cpu', 'CPU')}</span>
                <span className="ml-auto text-sm font-bold text-white tabular-nums">{perf?.cpu ?? 0}%</span>
              </div>
              <div className="space-y-2">
                <MetricBar label={t('ov.processLoad', 'Process Load')} value={perf?.cpu ?? 0} />
                <p className="text-[11px] text-zinc-500 tabular-nums">{perf?.system?.cpuCount} {t('ov.cores', 'logical cores')}</p>
              </div>
            </div>

            {/* Memory */}
            <div className="glass-panel p-4">
              <div className="flex items-center gap-2 mb-3">
                <span className="w-7 h-7 rounded-lg flex items-center justify-center bg-purple-400/12 border border-purple-300/20">
                  <HardDrive size={14} className="text-purple-200" />
                </span>
                <span className="text-[11px] font-bold text-zinc-300 uppercase tracking-[0.12em]">{t('ov.memory', 'Memory')}</span>
                <span className="ml-auto text-sm font-bold text-white tabular-nums">{perf?.memory?.percent ?? 0}%</span>
              </div>
              <div className="space-y-2">
                <MetricBar label={t('ov.heap', 'Heap')} value={perf?.memory?.percent ?? 0} />
                <p className="text-[11px] text-zinc-500 tabular-nums">
                  {formatBytes(perf?.memory?.used)} {t('ov.used', 'used')} · {formatBytes(perf?.memory?.rss)} RSS
                </p>
              </div>
            </div>
          </div>

          {guildData?.diagnostics?.missingPermissions?.length > 0 && (
            <div className="glass-panel p-4 !border-yellow-400/25 flex items-start gap-3" role="alert">
              <span className="w-8 h-8 rounded-xl flex items-center justify-center bg-yellow-400/12 border border-yellow-300/25 flex-shrink-0">
                <AlertTriangle size={16} className="text-yellow-200" />
              </span>
              <div>
                <p className="text-sm font-semibold text-yellow-200">{t('ov.missingPerms', 'Missing bot permissions')}</p>
                <p className="text-xs text-yellow-200/70 mt-1">
                  {guildData.diagnostics.missingPermissions.map((p) => p.name).join(', ')}
                </p>
              </div>
            </div>
          )}

          {growth?.data?.length > 1 && (
            <div className="glass-panel p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="w-7 h-7 rounded-lg flex items-center justify-center bg-cyan-400/12 border border-cyan-300/20">
                    <Users size={14} className="text-cyan-200" />
                  </span>
                  <span className="text-[11px] font-bold text-zinc-300 uppercase tracking-[0.12em]">{t('ov.memberGrowth', 'Member growth')}</span>
                </div>
                <span className="text-xs text-zinc-400 tabular-nums">{growth.data[growth.data.length - 1]} {t('ov.now', 'now')}</span>
              </div>
              <div className="flex items-end gap-1.5 h-16" role="img" aria-label={`${t('ov.memberGrowth', 'Member growth')}, ${growth.data[growth.data.length - 1]}`}>
                {growth.data.map((n, i) => {
                  const max = Math.max(...growth.data, 1);
                  const min = Math.min(...growth.data);
                  const span = Math.max(1, max - min);
                  const h = 12 + ((n - min) / span) * 88;
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center gap-1 group relative">
                      <div className="absolute -top-6 hidden group-hover:block group-focus-visible:block text-[10px] font-semibold text-white bg-black/80 border border-white/10 px-1.5 py-0.5 rounded-md tabular-nums">{n}</div>
                      <div className="w-full rounded-t-md bg-gradient-to-t from-cyan-500/50 to-cyan-300/90 shadow-[0_0_12px_rgba(34,211,238,0.2)]" style={{ height: `${h}%` }} />
                      <span className="text-[10px] text-zinc-500" aria-hidden="true">{growth.labels?.[i] || ''}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Audit log */}
          <div className="glass-panel p-5">
            <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
              <div className="flex items-center gap-2.5">
                <span className="w-8 h-8 rounded-xl flex items-center justify-center bg-cyan-400/12 border border-cyan-300/20">
                  <Activity size={15} className="text-cyan-200" />
                </span>
                <span className="text-sm font-bold text-white">{t('ov.auditLog', 'Audit Log')}</span>
                {activity.length > 0 && (
                  <span className="cyber-badge-cyan tabular-nums">{activity.length}</span>
                )}
              </div>
              <button
                onClick={() => { setCatFilter('all'); setShowAll(false); load(); }}
                disabled={refreshing}
                className="cyber-button flex items-center gap-1.5 text-[11px] py-1.5 px-3 !rounded-xl"
              >
                <RefreshCw size={11} className={refreshing ? 'animate-spin' : ''} />
                {t('ov.refreshLog', 'Refresh log')}
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
                      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[11px] font-semibold border transition-all ${
                        isActive
                          ? meta
                            ? `${meta.bg} ${meta.border} ${meta.color} shadow-[0_0_14px_rgba(34,211,238,0.12)]`
                            : 'bg-cyan-400/15 border-cyan-300/30 text-cyan-200 shadow-[0_0_14px_rgba(34,211,238,0.12)]'
                          : 'border-white/[0.07] bg-white/[0.02] text-zinc-400 hover:text-zinc-100 hover:border-white/15'
                      }`}
                    >
                      {t(f.i18n, f.label)}
                      {count > 0 && <span className="opacity-70 tabular-nums">{count}</span>}
                    </button>
                  );
                })}
              </div>
            )}

            {!guild ? (
              <EmptyState
                icon={Server}
                title={t('ov.noServerAudit', 'Select a server to see its audit log')}
                subtitle={t('ov.guildStreamHere', 'Guild activity streams here once a server is selected.')}
              />
            ) : activity.length === 0 ? (
              <EmptyState
                icon={Activity}
                title={t('ov.noActivity', 'No recent activity')}
                subtitle={t('ov.eventsIn', 'Events appear here as they happen in').replace('{guild}', guild.name)}
              />
            ) : filtered.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-sm text-zinc-400">{t('ov.noCategory', 'No events in this category')}</p>
                <button
                  onClick={() => setCatFilter('all')}
                  className="mt-2 min-h-[36px] px-3 text-xs font-medium text-cyan-300 hover:text-cyan-200"
                >
                  {t('ov.showAll', 'Show all events')}
                </button>
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
                    aria-expanded={showAll}
                    className="mt-3 w-full min-h-[44px] py-2.5 text-xs font-medium text-zinc-400 hover:text-cyan-200 border border-white/[0.07] hover:border-cyan-300/25 hover:bg-cyan-400/[0.05] rounded-xl transition-all flex items-center justify-center gap-1.5"
                  >
                    {showAll
                      ? <><ChevronUp size={12} /> {t('ov.showLess', 'Show less')}</>
                      : <><ChevronDown size={12} /> {t('ov.show', 'Show')} {filtered.length - 12} {t('ov.moreEvents', 'more events')}</>}
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

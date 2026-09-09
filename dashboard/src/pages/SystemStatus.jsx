import React, { useCallback, useEffect, useState } from 'react';
import {
  Activity, BadgeCheck, Bot, CheckCircle2, Circle, Clock, Cpu, Database, Ghost,
  Gift, HardDrive, Hash, Languages, Lightbulb, Monitor, Music, Radio,
  RefreshCw, Server, Shield, ShieldCheck, Terminal, Ticket, Users, Vote,
  XCircle, Zap,
} from 'lucide-react';
import api from '../api.js';
import { timeAgo } from '../lib/time.js';
import PageHeader from '../components/PageHeader.jsx';
import StatCard from '../components/StatCard.jsx';
import CopyButton from '../components/CopyButton.jsx';
import { useI18n } from '../i18n.jsx';

const CHECK_META = {
  dashboardBuilt: { icon: Monitor },
  databaseOnline: { icon: Database },
  discordConfigured: { icon: Bot },
  oauthConfigured: { icon: ShieldCheck },
  botOnline: { icon: Activity },
};

// English source labels for the readiness checks (translated via sys.check.*).
const CHECK_LABELS = {
  dashboardBuilt: 'Dashboard build',
  databaseOnline: 'Supabase PostgreSQL',
  discordConfigured: 'Discord configuration',
  oauthConfigured: 'Discord OAuth',
  botOnline: 'Bot connection',
};

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

function greeting(t) {
  const h = new Date().getHours();
  if (h < 5) return t('ov.greet.night', 'Late night');
  if (h < 12) return t('ov.greet.morning', 'Good morning');
  if (h < 18) return t('ov.greet.afternoon', 'Good afternoon');
  return t('ov.greet.evening', 'Good evening');
}

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

const QUICK_LINKS = [
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
];

export default function SystemStatus({ pageHint, onNavigate, developerAccess = {} }) {
  const { locale, t } = useI18n();
  const canSeeMusicDesk = ['DEVELOPER', 'SUPER_ADMIN'].includes(developerAccess.baseRole)
    || ['DEVELOPER', 'SUPER_ADMIN'].includes(developerAccess.role);
  const [snapshot, setSnapshot] = useState(null);
  const [stats, setStats] = useState(null);
  const [perf, setPerf] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [publicUrl, setPublicUrl] = useState('');
  const [, setNow] = useState(Date.now());

  const refresh = useCallback(async () => {
    setError('');
    setRefreshing(true);
    try {
      const [snap, s, p, h] = await Promise.all([
        api.get('/api/developer/system-status'),
        api.get('/api/stats').catch(() => null),
        api.get('/api/performance').catch(() => null),
        api.get('/api/health').catch(() => null),
      ]);
      setSnapshot(snap);
      if (s) setStats(s);
      if (p) setPerf(p);
      if (h?.publicUrl) setPublicUrl(h.publicUrl);
      setUpdatedAt(Date.now());
    } catch (err) {
      setError(err.message || 'Status request failed');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 15_000);
    return () => clearInterval(timer);
  }, [refresh]);

  // Tick every second so "updated Xs ago" stays live like on Overview.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const pingColor = (p) => p == null ? 'text-zinc-400' : p < 100 ? 'text-green-400' : p < 200 ? 'text-yellow-400' : 'text-red-400';
  const pingLabel = (p) => p == null ? '—' : p < 100 ? t('ov.ping.excellent', 'Excellent') : p < 200 ? t('ov.ping.good', 'Good') : t('ov.ping.high', 'High');
  const busy = loading || refreshing;

  return (
    <div className="page-shell">
      <PageHeader
        icon={Activity}
        title={t('sys.title', 'System status')}
        crumb={greeting(t)}
        subtitle={`${t('sys.subtitle', pageHint || 'Dashboard, Discord and Supabase readiness')} · ${t('ov.live', 'live every 15s')}${updatedAt ? ` · ${t('ov.updated', 'updated')} ${timeAgo(updatedAt, t)}` : ''}`}
        badge={stats ? `${stats.ping}ms` : undefined}
        badgeColor={stats?.ping == null ? undefined : stats.ping < 100 ? 'green' : stats.ping < 200 ? 'yellow' : 'red'}
      >
        <div className="flex items-center gap-2">
          {stats && (
            <div className={`flex items-center gap-1.5 text-xs font-medium ${pingColor(stats.ping)}`}>
              <Circle size={6} className="fill-current animate-pulse" />
              {pingLabel(stats.ping)}
            </div>
          )}
          <button onClick={refresh} disabled={busy} className="cyber-button inline-flex items-center gap-2">
            <RefreshCw size={14} className={busy ? 'animate-spin' : ''} />
            {t('sys.refresh', 'Refresh')}
          </button>
        </div>
      </PageHeader>

      {error && <div className="cyber-warning text-sm text-amber-200">{error}</div>}

      <section className="cyber-card-accent mesh-glow p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative overflow-hidden">
        <div className="relative">
          <p className="cyber-label !text-cyan-200">EB Dashboard V2</p>
          <h2 className="text-2xl font-bold text-white mt-1 tabular-nums tracking-tight">{snapshot?.release || '2.0.0'}</h2>
          <p className="text-xs text-zinc-400 mt-1">
            API {snapshot?.apiVersion || 'v2'}
          </p>
        </div>
        <span className={`relative self-start sm:self-auto inline-flex items-center gap-2 rounded-2xl border px-3 py-2 text-sm font-semibold tabular-nums ${
          snapshot?.status === 'ready'
            ? 'border-emerald-300/30 bg-emerald-400/10 text-emerald-200 shadow-[0_0_24px_rgba(52,211,153,0.12)]'
            : 'border-amber-300/30 bg-amber-400/10 text-amber-200 shadow-[0_0_24px_rgba(250,204,21,0.12)]'
        }`}>
          <span className="relative flex w-2 h-2">
            <span className={`absolute inline-flex h-full w-full rounded-full opacity-60 animate-ping ${snapshot?.status === 'ready' ? 'bg-emerald-400' : 'bg-amber-400'}`} />
            <span className={`relative inline-flex rounded-full h-2 w-2 ${snapshot?.status === 'ready' ? 'bg-emerald-400' : 'bg-amber-400'}`} />
          </span>
          {snapshot?.status === 'ready' ? <CheckCircle2 size={15} /> : <XCircle size={15} />}
          {snapshot?.status === 'ready' ? t('sys.ready', 'Ready') : t('sys.degraded', 'Degraded')}
        </span>
      </section>

      {snapshot?.botBootstrap && snapshot.botBootstrap.state !== 'ready' && (
        <section className="cyber-info">
          <Bot size={17} className="text-cyan-300 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-cyan-100">
              {t('sys.recovery', 'Bot recovery state')}: {snapshot.botBootstrap.state}
            </p>
            <p className="text-xs text-cyan-200/65 mt-1">
              {snapshot.botBootstrap.lastError || t('sys.waitingConfig', 'Waiting for configuration')}
              {snapshot.botBootstrap.nextRetryAt
                ? ` · ${t('sys.nextRetry', 'next retry')} ${new Date(snapshot.botBootstrap.nextRetryAt).toLocaleTimeString(locale)}`
                : ''}
            </p>
          </div>
        </section>
      )}

      {loading && !stats ? (
        <section className="grid grid-cols-2 md:grid-cols-4 gap-3" aria-label="Loading live stats">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-20 rounded-xl skeleton" />
          ))}
        </section>
      ) : (
        <>
          {/* Live overview — same live numbers as the Overview page */}
          <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard icon={Server}   label={t('ov.stat.servers', 'Servers')}  value={stats?.guilds ?? '—'}                      color="cyan" />
            <StatCard icon={Users}    label={t('ov.stat.users', 'Users')}    value={stats?.users?.toLocaleString() ?? '—'}     color="purple" />
            <StatCard icon={Terminal} label={t('ov.stat.commands', 'Commands')} value={stats?.commands?.toLocaleString() ?? '—'}  color="green" />
            <StatCard icon={Zap}      label={t('ov.stat.latency', 'Latency')}
              value={<span className={pingColor(stats?.ping)}>{stats?.ping ?? '—'}ms</span>}
              sub={pingLabel(stats?.ping)}
              color="yellow"
            />
          </section>

          {publicUrl && (
            <section className="cyber-card-accent p-4 flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="cyber-label mb-1">{t('ov.publicDash', 'Public dashboard')}</p>
                <p className="text-sm text-cyan-100 truncate font-medium">{publicUrl}</p>
                <p className="text-[11px] text-zinc-500 mt-0.5">{t('ov.shareStaff', 'Share with staff. Quick tunnels can change if Cloudflare drops.')}</p>
              </div>
              <CopyButton value={publicUrl} label={t('ov.copyLink', 'Copy link')} />
            </section>
          )}
        </>
      )}

      {/* System health + uptime */}
      <section className="grid md:grid-cols-3 gap-3">
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
          <p className="text-[11px] text-zinc-500 mt-1 tabular-nums">
            {stats ? `${stats.guilds} ${t('ov.servers', 'servers')} · ${stats.users?.toLocaleString()} ${t('ov.members', 'members')}` : '—'}
          </p>
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
            <p className="text-[11px] text-zinc-500 tabular-nums">{perf?.system?.cpuCount ?? '—'} {t('ov.cores', 'logical cores')}</p>
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
      </section>

      {onNavigate && (
        <section className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {QUICK_LINKS.filter(({ id }) => id !== 'music' || canSeeMusicDesk).map(({ id, icon: Icon, label, hint }, i) => (
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
        </section>
      )}

      <section className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {Object.entries(CHECK_META).map(([key, meta], i) => {
          const ok = !!snapshot?.checks?.[key];
          const Icon = meta.icon;
          return (
            <div key={key} className="glass-panel p-4 flex items-center gap-3 animate-fade-in" style={{ animationDelay: `${i * 50}ms` }}>
              <span className={`w-10 h-10 rounded-2xl border flex items-center justify-center flex-shrink-0 ${
                ok
                  ? 'border-emerald-300/25 bg-gradient-to-br from-emerald-400/20 to-teal-500/10 text-emerald-200 shadow-[0_0_18px_rgba(52,211,153,0.15)]'
                  : 'border-red-300/25 bg-gradient-to-br from-red-400/20 to-rose-500/10 text-red-200 shadow-[0_0_18px_rgba(248,113,113,0.15)]'
              }`}><Icon size={17} /></span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white truncate">{t(`sys.check.${key}`, CHECK_LABELS[key] || key)}</p>
                <p className={`text-xs mt-0.5 font-medium ${ok ? 'text-emerald-300' : 'text-red-300'}`}>
                  {ok ? t('sys.operational', 'Operational') : t('sys.notReady', 'Not ready')}
                </p>
              </div>
            </div>
          );
        })}
      </section>

      {snapshot?.databaseError && (
        <section className="cyber-warning">
          <Database size={17} className="text-amber-300 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-amber-100">{t('sys.dbIssue', 'Database issue')}</p>
            <p className="text-xs text-amber-200/70 mt-1 break-words">{snapshot.databaseError}</p>
          </div>
        </section>
      )}

      <section className="glass-panel p-5">
        <div className="eb-section-head mb-4">
          <span className="eb-section-icon"><Languages size={15} /></span>
          <h3 className="text-sm font-bold text-white tracking-tight">{t('sys.capabilities', 'V2 capabilities')}</h3>
        </div>
        <div className="flex flex-wrap gap-2">
          {(snapshot?.capabilities?.bilingual || ['en', 'ar']).map((lang) => (
            <span key={lang} className="cyber-badge-cyan">{lang.toUpperCase()}</span>
          ))}
          {snapshot?.capabilities?.rtl && <span className="cyber-badge-purple">RTL</span>}
          {(snapshot?.capabilities?.realtime || []).map((item) => (
            <span key={item} className="cyber-badge-green">{item}</span>
          ))}
          <span className="cyber-badge-yellow">{snapshot?.capabilities?.storage || 'supabase-postgresql'}</span>
        </div>
      </section>
    </div>
  );
}

import React, { useCallback, useEffect, useState } from 'react';
import {
  Terminal, Lock, RefreshCw, FileText, Database, Cpu, Radio,
  Shield, Power, KeyRound, Server,
} from 'lucide-react';
import PageHeader from '../components/PageHeader.jsx';
import { useToast } from '../components/Toast.jsx';
import api from '../api.js';

const ROLE_LEVEL = { NONE: 0, SUPPORT: 1, DEVELOPER: 2, SUPER_ADMIN: 3 };

const LOGS = [
  { id: 'general.log', label: 'general' },
  { id: 'error.log', label: 'error' },
  { id: 'developer-audit.log', label: 'developer audit' },
  { id: 'tunnel-watch.log', label: 'tunnel' },
  { id: 'cloudflared.log', label: 'cloudflared' },
  { id: 'dead-hosts.txt', label: 'dead hosts' },
];

function bytes(n) {
  if (!n && n !== 0) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function Pill({ ok, label }) {
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[11px] ${
      ok ? 'border-emerald-500/25 text-emerald-300 bg-emerald-500/10' : 'border-red-500/25 text-red-300 bg-red-500/10'
    }`}>
      <span className={`w-1.5 h-1.5 rounded-full ${ok ? 'bg-emerald-400' : 'bg-red-400'}`} />
      {label}
    </span>
  );
}

export default function Developer() {
  const toast = useToast();
  const [who, setWho] = useState(null);
  const [token, setToken] = useState('');
  const [tab, setTab] = useState('overview');
  const [ov, setOv] = useState(null);
  const [logFile, setLogFile] = useState('general.log');
  const [log, setLog] = useState('');
  const [env, setEnv] = useState([]);
  const [cmds, setCmds] = useState(null);
  const [dbInfo, setDbInfo] = useState(null);
  const [guilds, setGuilds] = useState([]);
  const [audit, setAudit] = useState([]);
  const [busy, setBusy] = useState('');
  const systemLevel = ROLE_LEVEL[who?.role] || 0;

  const loadWho = () => api.get('/api/developer/whoami').then(setWho).catch(() => setWho({ unlocked: false }));

  useEffect(() => { loadWho(); }, []);

  const unlock = async (e) => {
    e.preventDefault();
    setBusy('unlock');
    try {
      await api.post('/api/developer/unlock', { token: token.trim() });
      setToken('');
      await loadWho();
      toast.success('Developer backend unlocked.');
    } catch (err) {
      toast.error(err.message || 'Unlock failed.');
    }
    setBusy('');
  };

  const lock = async () => {
    await api.post('/api/developer/lock', {}).catch(() => {});
    setOv(null);
    loadWho();
  };

  const refresh = useCallback(async () => {
    if (!who?.unlocked) return;
    setBusy('load');
    try {
      if (tab === 'overview') setOv(await api.get('/api/developer/overview'));
      if (tab === 'logs') {
        const d = await api.get(`/api/developer/logs?file=${encodeURIComponent(logFile)}&lines=180`);
        setLog(d.text || '');
      }
      if (tab === 'env') setEnv((await api.get('/api/developer/env')).vars || []);
      if (tab === 'commands') setCmds(await api.get('/api/developer/commands'));
      if (tab === 'db') setDbInfo(await api.get('/api/developer/db'));
      if (tab === 'guilds') setGuilds((await api.get('/api/developer/guilds')).guilds || []);
      if (tab === 'audit') setAudit((await api.get('/api/developer/audit?limit=150')).events || []);
    } catch (err) {
      if (String(err.message).includes('Developer')) loadWho();
      else toast.error(err.message || 'Load failed');
    }
    setBusy('');
  }, [who?.unlocked, tab, logFile, toast]);

  useEffect(() => { refresh(); }, [refresh]);

  const setFlag = async (key, value) => {
    try {
      const next = await api.post('/api/developer/flags', { [key]: value });
      setOv((p) => (p ? { ...p, flags: next } : p));
      toast.success('Flag saved.');
    } catch (err) { toast.error(err.message); }
  };

  const deploy = async () => {
    setBusy('deploy');
    try {
      const d = await api.post('/api/developer/deploy-commands', {});
      toast.success(`Commands deployed to ${d.guilds} guild(s).`);
    } catch (err) { toast.error(err.message); }
    setBusy('');
  };

  if (!who) {
    return <div className="page-shell-sm text-zinc-500 text-sm">Checking developer access…</div>;
  }

  if (!who.unlocked) {
    if (!who.canUnlock) {
      return (
        <div className="page-shell-sm animate-fade-in">
          <PageHeader icon={Lock} accentColor="red" title="Developer access denied" subtitle="This account has no system role." badge="forbidden" badgeColor="red" />
          <div className="cyber-card p-6 text-sm text-zinc-400">
            Developer tools require OWNER_ID, DEVELOPER_IDS or SUPPORT_IDS authorization on the backend.
          </div>
        </div>
      );
    }
    return (
      <div className="page-shell-sm animate-fade-in">
        <PageHeader
          icon={Lock}
          accentColor="purple"
          title="Developer"
          subtitle="Developer-only backend. Authorized developers use the independent DEV_TOKEN as a second factor."
          badge="locked"
          badgeColor="red"
        />
        <form onSubmit={unlock} className="cyber-card max-w-md p-6 space-y-4">
          <p className="text-xs text-zinc-500 leading-relaxed">
            This internal panel provides system logs, processes, database diagnostics and command metadata.
            Secret values are never returned by the backend.
          </p>
          <div>
            <label className="cyber-label mb-1.5 flex items-center gap-1"><KeyRound size={11} /> DEV_TOKEN</label>
            <input
              type="password"
              autoComplete="off"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Independent DEV_TOKEN from local environment"
              className="cyber-input font-mono text-xs"
            />
          </div>
          <button type="submit" disabled={!token.trim() || busy === 'unlock'} className="cyber-button-solid text-xs">
            {busy === 'unlock' ? '…' : 'Unlock'}
          </button>
          {who.loggedIn && (
            <p className="text-[11px] text-zinc-600">Signed-in owners are authorized automatically; listed developers require the second factor.</p>
          )}
        </form>
      </div>
    );
  }

  const p = ov?.processes || [];
  const availableTabs = [
    ['overview', 'Overview', 1],
    ['commands', 'Commands', 1],
    ['guilds', 'Guilds', 1],
    ['logs', 'Logs', 2],
    ['env', 'Environment', 2],
    ['db', 'Database', 2],
    ['audit', 'Audit Log', 2],
  ].filter(([, , minimum]) => systemLevel >= minimum);

  return (
    <div className="page-shell-sm animate-fade-in">
      <PageHeader
        icon={Terminal}
        accentColor="purple"
        title="Developer"
        subtitle="Internal infrastructure control center"
        badge={who.role || 'unlocked'}
        badgeColor="purple"
      >
        <button onClick={refresh} className="cyber-button text-xs inline-flex items-center gap-1.5">
          <RefreshCw size={12} className={busy === 'load' ? 'animate-spin' : ''} /> Refresh
        </button>
        {who.baseRole === 'DEVELOPER' && (
          <button onClick={lock} className="cyber-button text-xs inline-flex items-center gap-1.5">
            <Lock size={12} /> Lock
          </button>
        )}
      </PageHeader>

      <div className="flex flex-wrap gap-1.5">
        {availableTabs.map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`text-[11px] px-2.5 py-1 rounded-lg border ${
              tab === id ? 'border-fuchsia-400/40 bg-fuchsia-400/10 text-fuchsia-200' : 'border-white/10 text-zinc-500'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'overview' && ov && (
        <div className="space-y-3">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="cyber-card p-4">
              <p className="text-[10px] uppercase tracking-widest text-zinc-600">Bot</p>
              <p className="text-lg font-bold text-white mt-1">{ov.bot?.tag || '—'}</p>
              <Pill ok={!!ov.bot?.online} label={ov.bot?.online ? `${ov.bot.ping}ms · ${ov.bot.guilds} guilds` : 'offline'} />
            </div>
            <div className="cyber-card p-4">
              <p className="text-[10px] uppercase tracking-widest text-zinc-600">Public URL</p>
              <p className="text-xs text-cyan-200 break-all mt-1">{ov.publicUrl || '—'}</p>
            </div>
            <div className="cyber-card p-4">
              <p className="text-[10px] uppercase tracking-widest text-zinc-600">Heap</p>
              <p className="text-lg font-bold text-white mt-1">{bytes(ov.memory?.heapUsed)}</p>
              <p className="text-[11px] text-zinc-600">{bytes(ov.memory?.rss)} rss · {ov.node}</p>
            </div>
            <div className="cyber-card p-4">
              <p className="text-[10px] uppercase tracking-widest text-zinc-600">Commands</p>
              <p className="text-lg font-bold text-white mt-1">{ov.bot?.commands ?? '—'}</p>
              <p className="text-[11px] text-zinc-600">slash loaded</p>
            </div>
          </div>

          <div className="cyber-card p-4 space-y-2">
            <p className="text-xs font-semibold text-white flex items-center gap-1.5"><Cpu size={13} /> Processes</p>
            <div className="grid sm:grid-cols-3 gap-2">
              {p.map((x) => (
                <div key={x.id} className="px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.06]">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-zinc-300">{x.id}</span>
                    <Pill ok={x.running} label={x.running ? `pid ${x.pid}` : 'down'} />
                  </div>
                  {x.running && <p className="text-[10px] text-zinc-600 mt-1">{x.etime} · {bytes((x.rssKb || 0) * 1024)}</p>}
                </div>
              ))}
            </div>
          </div>

          {systemLevel >= ROLE_LEVEL.SUPER_ADMIN && (
          <div className="cyber-card p-4 space-y-3">
            <p className="text-xs font-semibold text-white flex items-center gap-1.5"><Shield size={13} /> Feature flags & deployment</p>
            <label className="flex items-center justify-between text-xs text-zinc-300">
              Maintenance
              <input type="checkbox" className="accent-fuchsia-400" checked={!!ov.flags?.maintenance} onChange={(e) => setFlag('maintenance', e.target.checked)} />
            </label>
            <label className="flex items-center justify-between text-xs text-zinc-300">
              Verbose analytics
              <input type="checkbox" className="accent-fuchsia-400" checked={!!ov.flags?.verbose} onChange={(e) => setFlag('verbose', e.target.checked)} />
            </label>
            <button onClick={deploy} disabled={busy === 'deploy'} className="cyber-button text-xs inline-flex items-center gap-1.5">
              <Power size={12} /> {busy === 'deploy' ? 'Deploying…' : 'Redeploy slash commands'}
            </button>
          </div>
          )}

          {!!ov.deadHosts?.length && (
            <div className="cyber-card p-4">
              <p className="text-xs font-semibold text-white mb-2 flex items-center gap-1.5"><Radio size={13} /> Dead hosts ({ov.deadHosts.length})</p>
              <div className="max-h-36 overflow-auto font-mono text-[10px] text-zinc-500 space-y-0.5">
                {ov.deadHosts.map((h) => <div key={h}>{h}</div>)}
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'logs' && (
        <div className="cyber-card p-4 space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {LOGS.map((f) => (
              <button
                key={f.id}
                onClick={() => setLogFile(f.id)}
                className={`text-[11px] px-2 py-1 rounded-lg border ${
                  logFile === f.id ? 'border-cyan-400/40 text-cyan-200' : 'border-white/10 text-zinc-500'
                }`}
              >
                <FileText size={10} className="inline mr-1" />{f.label}
              </button>
            ))}
          </div>
          <pre className="max-h-[28rem] overflow-auto text-[10px] leading-relaxed text-zinc-400 bg-black/30 rounded-lg p-3 whitespace-pre-wrap break-all">{log || '—'}</pre>
        </div>
      )}

      {tab === 'env' && (
        <div className="cyber-card overflow-hidden">
          <table className="w-full text-left text-xs">
            <thead className="text-[10px] uppercase tracking-wider text-zinc-600">
              <tr><th className="px-3 py-2">Key</th><th>Value</th></tr>
            </thead>
            <tbody>
              {env.map((v) => (
                <tr key={v.key} className="border-t border-white/[0.05]">
                  <td className="px-3 py-1.5 font-mono text-cyan-300/90">{v.key}</td>
                  <td className="px-3 py-1.5 font-mono text-zinc-500">
                    {v.secret
                      ? <span className="text-amber-400/80">{v.set ? 'Configured' : 'Not configured'}</span>
                      : (v.set ? v.preview : '—')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'commands' && cmds && (
        <div className="cyber-card p-4 space-y-2">
          <p className="text-xs text-zinc-400">{cmds.total} loaded {cmds.overLimit ? '· OVER 100' : ''}</p>
          <div className="max-h-[28rem] overflow-auto space-y-1">
            {cmds.commands.map((c) => (
              <div key={c.name} className="flex items-baseline gap-2 px-2 py-1 rounded bg-white/[0.02]">
                <span className="font-mono text-[11px] text-cyan-300">/{c.name}</span>
                <span className="text-[10px] text-zinc-600 truncate flex-1">{c.description}</span>
                <span className="text-[10px] text-zinc-600 tabular-nums">{c.size}b</span>
                {c.subs?.length ? <span className="text-[10px] text-fuchsia-300/80">{c.subs.length} subs</span> : null}
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'db' && dbInfo && (
        <div className="cyber-card p-4 space-y-3">
          <p className="text-xs text-zinc-400 flex items-center gap-1.5">
            <Database size={12} /> {dbInfo.keys} keys · {dbInfo.provider || 'supabase-postgresql'}
          </p>
          <div className="grid sm:grid-cols-2 gap-1.5">
            {(dbInfo.prefixes || []).map((p) => (
              <div key={p.prefix} className="flex justify-between px-2 py-1 rounded bg-white/[0.03] text-[11px]">
                <span className="font-mono text-cyan-200">{p.prefix}_*</span>
                <span className="text-zinc-500">{p.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'guilds' && (
        <div className="cyber-card overflow-hidden">
          <table className="w-full text-left text-xs">
            <thead className="text-[10px] uppercase tracking-wider text-zinc-600">
              <tr>
                <th className="px-3 py-2">Server</th>
                <th>Members</th>
                <th>Channels</th>
                <th>Roles</th>
                <th>ID</th>
              </tr>
            </thead>
            <tbody>
              {guilds.map((g) => (
                <tr key={g.id} className="border-t border-white/[0.05]">
                  <td className="px-3 py-1.5 text-white">{g.name}</td>
                  <td className="px-3 py-1.5 text-zinc-400">{g.members}</td>
                  <td className="px-3 py-1.5 text-zinc-400">{g.channels}</td>
                  <td className="px-3 py-1.5 text-zinc-400">{g.roles}</td>
                  <td className="px-3 py-1.5 font-mono text-[10px] text-zinc-500">{g.id}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'audit' && (
        <div className="cyber-card overflow-hidden">
          <div className="max-h-[32rem] overflow-auto">
            {audit.length === 0 ? (
              <p className="p-8 text-center text-sm text-zinc-500">No developer actions recorded yet.</p>
            ) : audit.map((event, index) => (
              <div key={`${event.timestamp}-${index}`} className="px-4 py-3 border-b border-white/[0.05] last:border-0">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-mono text-xs text-fuchsia-200">{event.action}</span>
                  <span className={event.result === 'success' ? 'cyber-badge-green' : 'cyber-badge-red'}>{event.result}</span>
                </div>
                <p className="text-[11px] text-zinc-500 mt-1">
                  {event.systemRole || 'UNKNOWN'} · {event.userId || 'local'} · {event.target}
                </p>
                <p className="text-[10px] text-zinc-600 mt-1 font-mono">
                  {new Date(event.timestamp).toLocaleString()} · request {event.requestId || '—'}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="text-[10px] text-zinc-700 flex items-center gap-1">
        <Server size={10} /> Role-enforced API · /api/developer/* · no raw secrets
      </p>
    </div>
  );
}

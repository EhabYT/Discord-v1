import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BadgeCheck, Save, Send, Settings, Users, ScrollText, Loader,
  Shield, Clock, Search, UserCheck, UserX, Trash2, Info, Eye,
  Hash, RefreshCw, KeyRound, Sparkles,
} from 'lucide-react';
import CyanToggle from '../components/CyanToggle.jsx';
import PageHeader from '../components/PageHeader.jsx';
import StatCard from '../components/StatCard.jsx';
import EmptyState from '../components/EmptyState.jsx';
import ConfirmModal from '../components/ConfirmModal.jsx';
import { useToast } from '../components/Toast.jsx';
import api from '../api.js';

const DEFAULT_CFG = {
  enabled: false,
  roleId: null,
  unverifiedRoleId: null,
  extraRoleIds: [],
  bypassRoleIds: [],
  channelId: null,
  logChannelId: null,
  mode: 'button',
  minAccountAgeDays: 0,
  kickUnverifiedMinutes: 0,
  kickOnFail: false,
  dmOnVerify: false,
  dmMessage: 'You are now verified in {guild}. Welcome!',
  successMessage: '✅ You have been verified!',
  failMessage: '❌ Verification failed. Please contact staff.',
  alreadyMessage: '✅ You are already verified.',
  title: 'Server Verification',
  description: 'Click the button below to verify and unlock the server.',
  buttonLabel: 'Verify',
  buttonEmoji: '✅',
  buttonStyle: 'Success',
  embedColor: '#00fbff',
  showGuildIcon: true,
  requireRules: false,
  rulesText: '',
  removeUnverifiedOnVerify: true,
  denyBots: true,
  announceChannelId: null,
  announceMessage: '{user} just verified. Welcome to {guild}!',
  panelImage: '',
  panelThumbnail: '',
  footerText: '',
  pingStaffRoleId: null,
  lockApplied: false,
};

const TABS = [
  { id: 'quick', label: 'Quick', icon: Sparkles },
  { id: 'setup', label: 'Setup', icon: Settings },
  { id: 'panel', label: 'Panel', icon: Send },
  { id: 'members', label: 'Members', icon: Users },
  { id: 'logs', label: 'Logs', icon: ScrollText },
];

const STYLES = ['Success', 'Primary', 'Secondary', 'Danger'];

function Section({ title, icon: Icon, children, extra }) {
  return (
    <div className="cyber-card p-5 space-y-4">
      <div className="flex items-center gap-2 pb-2 border-b border-white/[0.05]">
        {Icon && <Icon size={13} className="text-cyan-400" />}
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{title}</h2>
        {extra && <div className="ml-auto">{extra}</div>}
      </div>
      {children}
    </div>
  );
}

function RoleMulti({ roles, value, onChange, exclude = [] }) {
  const selected = value || [];
  const toggle = (id) => {
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id].slice(0, 8));
  };
  return (
    <div className="max-h-40 overflow-y-auto rounded-xl border border-white/[0.08] bg-white/[0.02] divide-y divide-white/[0.04]">
      {roles.filter((r) => !exclude.includes(r.id)).map((r) => (
        <label key={r.id} className="flex items-center gap-2 px-3 py-1.5 text-xs cursor-pointer hover:bg-white/[0.03]">
          <input
            type="checkbox"
            checked={selected.includes(r.id)}
            onChange={() => toggle(r.id)}
            className="accent-cyan-400"
          />
          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: r.color && r.color !== '#000000' ? r.color : '#71717a' }} />
          <span className="text-zinc-200 truncate">{r.name}</span>
        </label>
      ))}
      {roles.length === 0 && <p className="px-3 py-2 text-[11px] text-zinc-600">No roles</p>}
    </div>
  );
}

function timeAgo(ts) {
  if (!ts) return '—';
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function countdown(ts) {
  if (!ts) return null;
  const s = Math.floor((ts - Date.now()) / 1000);
  if (s <= 0) return 'overdue';
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
}

function PanelPreview({ cfg, guildName }) {
  const styleClass = {
    Success: 'bg-emerald-500 text-black',
    Primary: 'bg-[#5865F2] text-white',
    Secondary: 'bg-zinc-600 text-white',
    Danger: 'bg-red-500 text-white',
  }[cfg.buttonStyle] || 'bg-emerald-500 text-black';

  return (
    <div className="rounded-xl bg-[#36393f] border border-white/10 p-4">
      <div className="flex items-start gap-3">
        <img src="/eb_logo.svg" alt="" className="w-10 h-10 rounded-full object-cover ring-1 ring-white/10 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 mb-2">
            <span className="text-sm font-semibold text-white">𝑬𝑩</span>
            <span className="text-[10px] text-zinc-500">BOT</span>
          </div>
          <div className="rounded-r-lg overflow-hidden" style={{ borderLeft: `4px solid ${cfg.embedColor || '#00fbff'}` }}>
            <div className="bg-[#2f3136] p-3 space-y-1.5">
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-white">{cfg.title || 'Server Verification'}</p>
                  <p className="text-xs text-zinc-300 leading-relaxed whitespace-pre-wrap mt-1">
                    {cfg.description || 'Click the button below to verify.'}
                  </p>
                  {cfg.requireRules && cfg.rulesText && (
                    <>
                      <p className="text-xs font-semibold text-white mt-2">Rules</p>
                      <p className="text-xs text-zinc-400 whitespace-pre-wrap">{cfg.rulesText}</p>
                    </>
                  )}
                  {cfg.mode === 'captcha' && (
                    <p className="text-[11px] text-zinc-500 italic mt-2">You will solve a short math check after clicking.</p>
                  )}
                </div>
                {cfg.showGuildIcon && (
                  <div className="w-12 h-12 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-300 text-xs font-bold flex-shrink-0">
                    {(guildName || 'S')[0]}
                  </div>
                )}
              </div>
              <p className="text-[10px] text-zinc-500 pt-1">{guildName}</p>
            </div>
          </div>
          <div className={`mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-bold ${styleClass}`}>
            <span>{cfg.buttonEmoji || '✅'}</span>
            {cfg.buttonLabel || 'Verify'}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Verification({ guild, guildData }) {
  const toast = useToast();
  const [tab, setTab] = useState('quick');
  const [extraRoles, setExtraRoles] = useState([]);
  const [cfg, setCfg] = useState(DEFAULT_CFG);
  const [stats, setStats] = useState({ enabled: false, verifiedToday: 0, verifiedTotal: 0, pending: 0 });
  const [pending, setPending] = useState([]);
  const [log, setLog] = useState([]);
  const [saving, setSaving] = useState(false);
  const [posting, setPosting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [logQuery, setLogQuery] = useState('');
  const [memberQ, setMemberQ] = useState('');
  const [found, setFound] = useState([]);
  const [searching, setSearching] = useState(false);
  const [busyId, setBusyId] = useState('');
  const [confirm, setConfirm] = useState(null);

  const channels = guildData?.guild?.channels?.filter((c) => c.type === 0) || [];
  const roles = [...(guildData?.guild?.roles || []), ...extraRoles].filter((r, i, arr) => arr.findIndex((x) => x.id === r.id) === i);

  const load = useCallback(async () => {
    if (!guild?.id) return;
    setLoading(true);
    try {
      const data = await api.get(`/api/guild/${guild.id}/verification/overview`);
      setCfg((c) => ({ ...c, ...(data.config || {}) }));
      setStats(data.stats || {});
      setPending(data.pending || []);
      setLog(data.log || []);
    } catch {
      try {
        const config = await api.get(`/api/guild/${guild.id}/verification`);
        setCfg((c) => ({ ...c, ...config }));
      } catch { /* ignore */ }
    }
    setLoading(false);
  }, [guild?.id]);

  useEffect(() => { load(); }, [load]);

  const set = (patch) => setCfg((c) => ({ ...c, ...patch }));

  const save = async () => {
    setSaving(true);
    try {
      const saved = await api.post(`/api/guild/${guild.id}/verification`, cfg);
      setCfg((c) => ({ ...c, ...saved }));
      toast.success('Verification settings saved');
      load();
    } catch (e) {
      toast.error(e.message || 'Failed to save');
    }
    setSaving(false);
  };

  const postPanel = async () => {
    if (!cfg.roleId) { toast.warning('Pick a verified role first.'); return; }
    if (!cfg.channelId) { toast.warning('Pick a panel channel first.'); return; }
    setPosting(true);
    try {
      const r = await api.post(`/api/guild/${guild.id}/verification/panel`, {
        channelId: cfg.channelId,
        title: cfg.title,
        description: cfg.description,
        buttonLabel: cfg.buttonLabel,
        buttonEmoji: cfg.buttonEmoji,
        buttonStyle: cfg.buttonStyle,
        embedColor: cfg.embedColor,
        rulesText: cfg.rulesText,
        requireRules: cfg.requireRules,
        mode: cfg.mode,
        showGuildIcon: cfg.showGuildIcon,
        panelImage: cfg.panelImage,
        panelThumbnail: cfg.panelThumbnail,
        footerText: cfg.footerText,
      });
      toast.success(r.updated ? 'Panel updated in Discord.' : 'Verification panel posted.');
      load();
    } catch (e) {
      toast.error(e.message || 'Failed to post panel');
    }
    setPosting(false);
  };

  const act = async (userId, action) => {
    setBusyId(userId + action);
    try {
      await api.post(`/api/guild/${guild.id}/verification/members/${userId}/${action}`);
      toast.success(action === 'verify' ? 'Member verified' : 'Verification revoked');
      await load();
    } catch (e) {
      toast.error(e.message || 'Action failed');
    }
    setBusyId('');
  };

  const kickPending = async (overdueOnly) => {
    setBusyId('kick');
    try {
      const r = await api.post(`/api/guild/${guild.id}/verification/kick-pending`, { overdueOnly });
      toast.success(`Kicked ${r.kicked || 0} member(s)`);
      await load();
    } catch (e) {
      toast.error(e.message || 'Kick failed');
    }
    setBusyId('');
    setConfirm(null);
  };

  const createRole = async (which) => {
    setBusyId('role-' + which);
    try {
      const r = await api.post(`/api/guild/${guild.id}/verification/roles`, { which });
      if (r.config) setCfg((c) => ({ ...c, ...r.config }));
      const add = [];
      if (r.created?.verified) add.push(r.created.verified);
      if (r.created?.unverified) add.push(r.created.unverified);
      if (add.length) setExtraRoles((prev) => [...prev, ...add]);
      toast.success(which === 'both' ? 'Verified + Unverified created' : `${which} role created`);
    } catch (e) {
      toast.error(e.message || 'Could not create role');
    }
    setBusyId('');
  };

  const toggleLock = async (enable) => {
    setBusyId('lock');
    try {
      const r = await api.post(`/api/guild/${guild.id}/verification/lock`, { enable, channelId: cfg.channelId });
      if (r.config) setCfg((c) => ({ ...c, ...r.config }));
      toast.success(enable ? `Gate lock on (${r.channels || 0} channels)` : 'Gate lock removed');
    } catch (e) {
      toast.error(e.message || 'Lock failed');
    }
    setBusyId('');
  };

  const quickSetup = async (lockServer) => {
    if (!cfg.channelId) { toast.warning('Pick a panel channel first.'); return; }
    setBusyId('quick');
    try {
      const r = await api.post(`/api/guild/${guild.id}/verification/quick-setup`, {
        channelId: cfg.channelId,
        mode: cfg.mode,
        lockServer,
      });
      if (r.config) setCfg((c) => ({ ...c, ...r.config }));
      toast.success(lockServer ? 'Gate live + server locked' : 'Gate live, panel posted');
      load();
    } catch (e) {
      toast.error(e.message || 'Quick setup failed');
    }
    setBusyId('');
  };

  const wipeLog = async () => {
    try {
      await api.delete(`/api/guild/${guild.id}/verification/log`);
      setLog([]);
      toast.success('Log cleared');
    } catch (e) {
      toast.error(e.message || 'Failed to clear log');
    }
    setConfirm(null);
  };

  useEffect(() => {
    if (!guild?.id || !memberQ.trim()) { setFound([]); return undefined; }
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const list = await api.get(`/api/guild/${guild.id}/members?q=${encodeURIComponent(memberQ.trim())}`);
        setFound(list || []);
      } catch { setFound([]); }
      setSearching(false);
    }, 350);
    return () => clearTimeout(t);
  }, [memberQ, guild?.id]);

  const filteredPending = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return pending;
    return pending.filter((p) =>
      (p.username || '').toLowerCase().includes(q)
      || (p.displayName || '').toLowerCase().includes(q)
      || (p.userId || '').includes(q));
  }, [pending, query]);

  const filteredLog = useMemo(() => {
    const q = logQuery.trim().toLowerCase();
    if (!q) return log;
    return log.filter((e) =>
      (e.username || '').toLowerCase().includes(q)
      || (e.displayName || '').toLowerCase().includes(q)
      || (e.method || '').includes(q)
      || (e.by || '').toLowerCase().includes(q)
      || (e.userId || '').includes(q));
  }, [log, logQuery]);

  if (!guild) return <div className="p-6 text-zinc-500 text-sm">Select a server first.</div>;

  return (
    <div className="page-shell-sm animate-fade-in">
      <PageHeader
        icon={BadgeCheck}
        title="Verification"
        subtitle={`Gate new members in ${guild.name}`}
        badge={cfg.enabled ? 'Armed' : 'Off'}
        badgeColor={cfg.enabled ? 'green' : 'yellow'}
      >
        <button onClick={load} className="cyber-button text-xs flex items-center gap-1.5">
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
        <button onClick={save} disabled={saving} className="cyber-button-solid text-xs flex items-center gap-1.5">
          {saving ? <Loader size={12} className="animate-spin" /> : <Save size={12} />}
          {saving ? 'Saving…' : 'Save'}
        </button>
      </PageHeader>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={Shield} label="Gate" value={cfg.enabled ? 'On' : 'Off'} sub={cfg.mode === 'captcha' ? 'Math captcha' : 'Button click'} color={cfg.enabled ? 'green' : 'yellow'} />
        <StatCard icon={UserCheck} label="Verified 24h" value={stats.verifiedToday ?? 0} sub={`${stats.verifiedTotal ?? 0} total`} color="cyan" />
        <StatCard icon={Clock} label="Pending" value={stats.pending ?? pending.length} sub={cfg.kickUnverifiedMinutes ? `kick after ${cfg.kickUnverifiedMinutes}m` : 'no auto-kick'} color="purple" />
        <StatCard icon={KeyRound} label="Roles" value={cfg.roleId ? 'Ready' : 'Set role'} sub={cfg.unverifiedRoleId ? 'join role set' : 'no join role'} color={cfg.roleId ? 'cyan' : 'red'} />
      </div>

      <div className="seg-tabs">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setTab(id)} className={tab === id ? 'seg-tab-active' : 'seg-tab'}>
            <Icon size={12} />
            {label}
            {id === 'members' && pending.length > 0 && <span className="cyber-badge-yellow">{pending.length}</span>}
            {id === 'logs' && log.length > 0 && <span className="cyber-badge-cyan">{log.length}</span>}
          </button>
        ))}
      </div>

      {tab === 'quick' && (
        <div className="space-y-4 animate-fade-in">
          <div className="cyber-info">
            <Info size={14} className="text-cyan-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-zinc-400 leading-relaxed">
              <strong className="text-zinc-200">Schnellstart:</strong> Kanal wählen → Rollen anlegen → Setup starten.
              Unverified sieht nur den Verify-Kanal, Verified schaltet den Rest frei. Rolle muss unter der Bot-Rolle liegen.
            </p>
          </div>

          <Section title="1 · Panel channel" icon={Hash}>
            <select value={cfg.channelId || ''} onChange={(e) => set({ channelId: e.target.value || null })} className="cyber-select">
              <option value="">— Select #verify —</option>
              {channels.map((c) => <option key={c.id} value={c.id}>#{c.name}</option>)}
            </select>
          </Section>

          <Section title="2 · Roles" icon={BadgeCheck}>
            <div className="grid sm:grid-cols-2 gap-2">
              <button disabled={busyId.startsWith('role')} onClick={() => createRole('verified')} className="cyber-button text-xs">
                {busyId === 'role-verified' ? 'Creating…' : cfg.roleId ? 'Recreate Verified' : 'Create Verified'}
              </button>
              <button disabled={busyId.startsWith('role')} onClick={() => createRole('unverified')} className="cyber-button text-xs">
                {busyId === 'role-unverified' ? 'Creating…' : cfg.unverifiedRoleId ? 'Recreate Unverified' : 'Create Unverified'}
              </button>
            </div>
            <button disabled={busyId.startsWith('role')} onClick={() => createRole('both')} className="cyber-button-solid w-full text-xs">
              {busyId === 'role-both' ? 'Creating…' : 'Create both roles'}
            </button>
            <p className="text-[11px] text-zinc-600">
              Verified: {cfg.roleId ? roles.find((r) => r.id === cfg.roleId)?.name || cfg.roleId : '—'}
              {' · '}Unverified: {cfg.unverifiedRoleId ? roles.find((r) => r.id === cfg.unverifiedRoleId)?.name || cfg.unverifiedRoleId : '—'}
            </p>
          </Section>

          <Section title="3 · Challenge" icon={Shield}>
            <div className="grid grid-cols-2 gap-2">
              {[
                { id: 'button', title: 'One-click', text: 'Ein Button' },
                { id: 'captcha', title: 'Math captcha', text: 'a + b lösen' },
              ].map((m) => (
                <button
                  key={m.id}
                  onClick={() => set({ mode: m.id })}
                  className={`text-left p-3 rounded-xl border ${cfg.mode === m.id ? 'border-cyan-400/40 bg-cyan-400/10' : 'border-white/10'}`}
                >
                  <p className="text-xs font-semibold text-white">{m.title}</p>
                  <p className="text-[11px] text-zinc-500">{m.text}</p>
                </button>
              ))}
            </div>
          </Section>

          <Section title="4 · Go live" icon={Sparkles}>
            <div className="grid sm:grid-cols-2 gap-2">
              <button disabled={busyId === 'quick'} onClick={() => quickSetup(false)} className="cyber-button-solid text-xs py-2.5">
                {busyId === 'quick' ? 'Running…' : 'Enable + post panel'}
              </button>
              <button disabled={busyId === 'quick'} onClick={() => quickSetup(true)} className="cyber-button text-xs py-2.5">
                Enable + lock unverified
              </button>
            </div>
            <p className="text-[11px] text-zinc-600">
              Lock hides every other channel from the Unverified role. Unlock anytime below.
            </p>
            <div className="flex gap-2">
              <button disabled={busyId === 'lock' || !cfg.unverifiedRoleId} onClick={() => toggleLock(true)} className="cyber-button text-[11px]">
                {cfg.lockApplied ? 'Re-apply lock' : 'Lock unverified'}
              </button>
              <button disabled={busyId === 'lock' || !cfg.lockApplied} onClick={() => toggleLock(false)} className="cyber-button text-[11px]">
                Unlock
              </button>
            </div>
          </Section>
        </div>
      )}

      {tab === 'setup' && (
        <div className="space-y-4 animate-fade-in">
          <div className="cyber-info">
            <Info size={14} className="text-cyan-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-zinc-400 leading-relaxed">
              Give newcomers an <strong>Unverified</strong> role that cannot see the server, then grant the <strong>Verified</strong> role when they click the panel.
              Keep the unverified role below the bot’s highest role. Welcome auto-role should not skip this gate.
            </p>
          </div>

          <Section title="Gate" icon={Shield}>
            <CyanToggle
              enabled={cfg.enabled}
              onChange={(v) => set({ enabled: v })}
              label="Enable verification"
              description="Require new members to verify before they get the verified role"
            />
            <div>
              <label className="cyber-label mb-1.5">Challenge type</label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: 'button', title: 'One-click', text: 'Single Verify button' },
                  { id: 'captcha', title: 'Math captcha', text: 'Solve a + b after click' },
                ].map((m) => (
                  <button
                    key={m.id}
                    onClick={() => set({ mode: m.id })}
                    className={`text-left p-3 rounded-xl border transition-all ${
                      cfg.mode === m.id
                        ? 'border-cyan-400/40 bg-cyan-400/10'
                        : 'border-white/10 bg-white/[0.02] hover:border-white/20'
                    }`}
                  >
                    <p className="text-xs font-semibold text-white">{m.title}</p>
                    <p className="text-[11px] text-zinc-500 mt-0.5">{m.text}</p>
                  </button>
                ))}
              </div>
            </div>
          </Section>

          <Section title="Roles" icon={BadgeCheck}>
            <div className="grid md:grid-cols-2 gap-3">
              <div>
                <label className="cyber-label mb-1.5">Verified role *</label>
                <select value={cfg.roleId || ''} onChange={(e) => set({ roleId: e.target.value || null })} className="cyber-select">
                  <option value="">— Required —</option>
                  {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
                <p className="text-[11px] text-zinc-600 mt-1">Granted when the member passes</p>
              </div>
              <div>
                <label className="cyber-label mb-1.5">Unverified / join role</label>
                <select value={cfg.unverifiedRoleId || ''} onChange={(e) => set({ unverifiedRoleId: e.target.value || null })} className="cyber-select">
                  <option value="">— None —</option>
                  {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
                <p className="text-[11px] text-zinc-600 mt-1">Assigned on join, removed after verify</p>
              </div>
            </div>
            <CyanToggle
              enabled={cfg.removeUnverifiedOnVerify}
              onChange={(v) => set({ removeUnverifiedOnVerify: v })}
              label="Remove unverified role after verify"
              description="Recommended — unlocks the rest of the server"
            />
            <div className="grid md:grid-cols-2 gap-3">
              <div>
                <label className="cyber-label mb-1.5">Extra roles on verify</label>
                <RoleMulti
                  roles={roles}
                  value={cfg.extraRoleIds}
                  onChange={(extraRoleIds) => set({ extraRoleIds })}
                  exclude={[cfg.roleId, cfg.unverifiedRoleId].filter(Boolean)}
                />
              </div>
              <div>
                <label className="cyber-label mb-1.5">Bypass roles</label>
                <RoleMulti
                  roles={roles}
                  value={cfg.bypassRoleIds}
                  onChange={(bypassRoleIds) => set({ bypassRoleIds })}
                  exclude={[cfg.unverifiedRoleId].filter(Boolean)}
                />
                <p className="text-[11px] text-zinc-600 mt-1">Staff / bots with these roles skip the gate</p>
              </div>
            </div>
          </Section>

          <Section title="Channels" icon={Hash}>
            <div className="grid md:grid-cols-2 gap-3">
              <div>
                <label className="cyber-label mb-1.5">Panel channel</label>
                <select value={cfg.channelId || ''} onChange={(e) => set({ channelId: e.target.value || null })} className="cyber-select">
                  <option value="">— None —</option>
                  {channels.map((c) => <option key={c.id} value={c.id}>#{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="cyber-label mb-1.5">Staff log channel</label>
                <select value={cfg.logChannelId || ''} onChange={(e) => set({ logChannelId: e.target.value || null })} className="cyber-select">
                  <option value="">— None —</option>
                  {channels.map((c) => <option key={c.id} value={c.id}>#{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="cyber-label mb-1.5">Announce after verify</label>
                <select value={cfg.announceChannelId || ''} onChange={(e) => set({ announceChannelId: e.target.value || null })} className="cyber-select">
                  <option value="">— Off —</option>
                  {channels.map((c) => <option key={c.id} value={c.id}>#{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="cyber-label mb-1.5">Ping staff role</label>
                <select value={cfg.pingStaffRoleId || ''} onChange={(e) => set({ pingStaffRoleId: e.target.value || null })} className="cyber-select">
                  <option value="">— None —</option>
                  {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </div>
            </div>
            {cfg.announceChannelId && (
              <input
                value={cfg.announceMessage}
                onChange={(e) => set({ announceMessage: e.target.value })}
                className="cyber-input"
                placeholder="{user} just verified. Welcome to {guild}!"
              />
            )}
          </Section>

          <Section title="Guards" icon={Shield}>
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="cyber-label mb-1.5">Minimum account age (days)</label>
                <input
                  type="number" min="0" max="365"
                  value={cfg.minAccountAgeDays || 0}
                  onChange={(e) => set({ minAccountAgeDays: parseInt(e.target.value, 10) || 0 })}
                  className="cyber-input"
                />
                <p className="text-[11px] text-zinc-600 mt-1">0 = off</p>
              </div>
              <div>
                <label className="cyber-label mb-1.5">Auto-kick unverified after (minutes)</label>
                <input
                  type="number" min="0" max="10080"
                  value={cfg.kickUnverifiedMinutes || 0}
                  onChange={(e) => set({ kickUnverifiedMinutes: parseInt(e.target.value, 10) || 0 })}
                  className="cyber-input"
                />
                <p className="text-[11px] text-zinc-600 mt-1">0 = never. Scheduler checks every minute.</p>
              </div>
            </div>
            <CyanToggle
              enabled={cfg.kickOnFail}
              onChange={(v) => set({ kickOnFail: v })}
              label="Kick accounts that are too new"
              description="If account age is set, kick on join / on verify click"
            />
            <CyanToggle
              enabled={cfg.denyBots}
              onChange={(v) => set({ denyBots: v })}
              label="Ignore bots"
              description="Bots cannot use the verify button"
            />
          </Section>

          <Section title="Messages" icon={Sparkles}>
            <CyanToggle
              enabled={cfg.dmOnVerify}
              onChange={(v) => set({ dmOnVerify: v })}
              label="DM after verify"
              description="Send a private welcome once they pass"
            />
            {cfg.dmOnVerify && (
              <textarea
                rows={2}
                value={cfg.dmMessage}
                onChange={(e) => set({ dmMessage: e.target.value })}
                className="cyber-input resize-none"
                placeholder="You are now verified in {guild}."
              />
            )}
            <div className="grid md:grid-cols-3 gap-3">
              <div>
                <label className="cyber-label mb-1.5">Success</label>
                <input value={cfg.successMessage} onChange={(e) => set({ successMessage: e.target.value })} className="cyber-input" />
              </div>
              <div>
                <label className="cyber-label mb-1.5">Already verified</label>
                <input value={cfg.alreadyMessage} onChange={(e) => set({ alreadyMessage: e.target.value })} className="cyber-input" />
              </div>
              <div>
                <label className="cyber-label mb-1.5">Failure</label>
                <input value={cfg.failMessage} onChange={(e) => set({ failMessage: e.target.value })} className="cyber-input" />
              </div>
            </div>
            <p className="text-[11px] text-zinc-600">Variables: {'{user}'} {'{userName}'} {'{guild}'} {'{count}'}</p>
          </Section>

          <button onClick={save} disabled={saving} className="cyber-button-solid flex items-center gap-2">
            {saving ? <Loader size={13} className="animate-spin" /> : <Save size={13} />}
            {saving ? 'Saving…' : 'Save setup'}
          </button>
        </div>
      )}

      {tab === 'panel' && (
        <div className="space-y-4 animate-fade-in">
          <Section title="Embed" icon={Send}>
            <div className="grid md:grid-cols-[1fr_auto] gap-3 items-end">
              <div>
                <label className="cyber-label mb-1.5">Title</label>
                <input value={cfg.title} onChange={(e) => set({ title: e.target.value })} className="cyber-input" maxLength={256} />
              </div>
              <div>
                <label className="cyber-label mb-1.5">Color</label>
                <div className="flex gap-2 items-center">
                  <input type="color" value={cfg.embedColor || '#00fbff'} onChange={(e) => set({ embedColor: e.target.value })} className="h-9 w-12 rounded-lg border border-cyan-500/20 cursor-pointer p-0.5 bg-transparent" />
                  <input value={cfg.embedColor} onChange={(e) => set({ embedColor: e.target.value })} className="cyber-input font-mono text-xs w-24" maxLength={7} />
                </div>
              </div>
            </div>
            <div>
              <label className="cyber-label mb-1.5">Description</label>
              <textarea rows={4} value={cfg.description} onChange={(e) => set({ description: e.target.value })} className="cyber-input resize-none" maxLength={2000} />
            </div>
            <CyanToggle
              enabled={cfg.requireRules}
              onChange={(v) => set({ requireRules: v })}
              label="Show rules on the panel"
              description="Appends a Rules block under the description"
            />
            {cfg.requireRules && (
              <textarea rows={4} value={cfg.rulesText} onChange={(e) => set({ rulesText: e.target.value })} className="cyber-input resize-none" placeholder="Be respectful. No spam. Follow Discord ToS." />
            )}
            <CyanToggle
              enabled={cfg.showGuildIcon}
              onChange={(v) => set({ showGuildIcon: v })}
              label="Show server icon"
            />
          </Section>

          <Section title="Button" icon={BadgeCheck}>
            <div className="grid sm:grid-cols-3 gap-3">
              <div>
                <label className="cyber-label mb-1.5">Label</label>
                <input value={cfg.buttonLabel} onChange={(e) => set({ buttonLabel: e.target.value })} className="cyber-input" maxLength={80} />
              </div>
              <div>
                <label className="cyber-label mb-1.5">Emoji</label>
                <input value={cfg.buttonEmoji} onChange={(e) => set({ buttonEmoji: e.target.value })} className="cyber-input" placeholder="✅" />
              </div>
              <div>
                <label className="cyber-label mb-1.5">Style</label>
                <select value={cfg.buttonStyle} onChange={(e) => set({ buttonStyle: e.target.value })} className="cyber-select">
                  {STYLES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="cyber-label mb-1.5">Post / update in</label>
              <select value={cfg.channelId || ''} onChange={(e) => set({ channelId: e.target.value || null })} className="cyber-select">
                <option value="">— Select channel —</option>
                {channels.map((c) => <option key={c.id} value={c.id}>#{c.name}</option>)}
              </select>
            </div>
          </Section>

          <Section title="Live preview" icon={Eye}>
            <PanelPreview cfg={cfg} guildName={guild.name} />
          </Section>

          <div className="flex flex-wrap gap-2">
            <button onClick={save} disabled={saving} className="cyber-button flex items-center gap-2">
              {saving ? <Loader size={13} className="animate-spin" /> : <Save size={13} />} Save panel text
            </button>
            <button onClick={postPanel} disabled={posting} className="cyber-button-solid flex items-center gap-2">
              {posting ? <Loader size={13} className="animate-spin" /> : <Send size={13} />}
              {posting ? 'Posting…' : 'Post / update panel'}
            </button>
          </div>
        </div>
      )}

      {tab === 'members' && (
        <div className="space-y-4 animate-fade-in">
          <Section title="Find a member" icon={Search}>
            <div className="relative">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600" />
              <input
                value={memberQ}
                onChange={(e) => setMemberQ(e.target.value)}
                placeholder="Search username or ID to verify / unverify…"
                className="cyber-input pl-9 text-xs"
              />
              {searching && <Loader size={13} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-cyan-300" />}
            </div>
            {found.length > 0 && (
              <div className="space-y-1.5">
                {found.slice(0, 8).map((m) => (
                  <div key={m.id} className="flex items-center gap-3 p-2.5 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                    {m.avatar
                      ? <img src={m.avatar} alt="" className="w-8 h-8 rounded-full object-cover" />
                      : <div className="w-8 h-8 rounded-full bg-cyan-500/15 text-cyan-300 text-xs font-bold flex items-center justify-center">{(m.username || '?')[0]}</div>}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-white truncate">{m.displayName || m.username}</p>
                      <p className="text-[10px] text-zinc-600">@{m.username}</p>
                    </div>
                    <button disabled={busyId.startsWith(m.id)} onClick={() => act(m.id, 'verify')} className="cyber-button-solid text-[11px] px-2 py-1">Verify</button>
                    <button disabled={busyId.startsWith(m.id)} onClick={() => act(m.id, 'unverify')} className="cyber-button text-[11px] px-2 py-1">Unverify</button>
                  </div>
                ))}
              </div>
            )}
          </Section>

          <Section
            title="Pending"
            icon={Clock}
            extra={
              <div className="flex gap-1.5">
                <button
                  onClick={() => setConfirm({ kind: 'overdue' })}
                  className="cyber-button text-[10px] px-2 py-1"
                  disabled={busyId === 'kick'}
                >
                  Kick overdue
                </button>
                <button
                  onClick={() => setConfirm({ kind: 'all' })}
                  className="cyber-button-danger text-[10px] px-2 py-1"
                  disabled={busyId === 'kick'}
                >
                  Kick all pending
                </button>
              </div>
            }
          >
            <div className="relative">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter pending…" className="cyber-input pl-9 text-xs" />
            </div>
            {filteredPending.length === 0 ? (
              <EmptyState icon={UserCheck} title="No pending members" subtitle="New joins appear here when the gate is on." />
            ) : (
              <div className="space-y-1.5">
                {filteredPending.map((p) => {
                  const left = countdown(p.kickAt);
                  return (
                    <div key={p.userId} className="flex items-center gap-3 p-2.5 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                      {p.avatar
                        ? <img src={p.avatar} alt="" className="w-8 h-8 rounded-full object-cover" />
                        : <div className="w-8 h-8 rounded-full bg-violet-500/15 text-violet-300 text-xs font-bold flex items-center justify-center">{(p.username || '?')[0]}</div>}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-white truncate">{p.displayName || p.username}</p>
                        <p className="text-[10px] text-zinc-600">
                          joined {timeAgo(p.joinedAt)}
                          {left && <span className={left === 'overdue' ? ' text-red-400' : ' text-amber-300'}> · kick {left}</span>}
                        </p>
                      </div>
                      <button
                        disabled={busyId.startsWith(p.userId)}
                        onClick={() => act(p.userId, 'verify')}
                        className="cyber-button-solid text-[11px] px-2 py-1 inline-flex items-center gap-1"
                      >
                        <UserCheck size={11} /> Verify
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </Section>
        </div>
      )}

      {tab === 'logs' && (
        <div className="space-y-4 animate-fade-in">
          <Section
            title="Recent verifications"
            icon={ScrollText}
            extra={
              <button onClick={() => setConfirm({ kind: 'log' })} className="cyber-button-danger text-[10px] px-2 py-1 inline-flex items-center gap-1">
                <Trash2 size={10} /> Clear
              </button>
            }
          >
            <div className="relative">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600" />
              <input value={logQuery} onChange={(e) => setLogQuery(e.target.value)} placeholder="Search user, method, staff…" className="cyber-input pl-9 text-xs" />
            </div>
            {filteredLog.length === 0 ? (
              <EmptyState icon={ScrollText} title="No verifications yet" subtitle="Button clicks and staff verifies show up here." />
            ) : (
              <div className="space-y-1.5">
                {filteredLog.map((e, i) => (
                  <div key={`${e.userId}-${e.at}-${i}`} className="flex items-center gap-3 p-2.5 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                    {e.avatar
                      ? <img src={e.avatar} alt="" className="w-8 h-8 rounded-full object-cover" />
                      : <div className="w-8 h-8 rounded-full bg-cyan-500/15 text-cyan-300 text-xs font-bold flex items-center justify-center">{(e.username || '?')[0]}</div>}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-white truncate">{e.displayName || e.username}</p>
                      <p className="text-[10px] text-zinc-600">{e.by || 'self'} · {timeAgo(e.at)}</p>
                    </div>
                    <span className="text-[10px] px-2 py-0.5 rounded-full border border-cyan-500/25 text-cyan-300 capitalize">{e.method || 'button'}</span>
                    <button
                      disabled={busyId.startsWith(e.userId)}
                      onClick={() => act(e.userId, 'unverify')}
                      className="text-zinc-600 hover:text-red-400"
                      title="Revoke"
                    >
                      <UserX size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </Section>
        </div>
      )}

      <ConfirmModal
        open={!!confirm}
        title={confirm?.kind === 'log' ? 'Clear verification log' : confirm?.kind === 'all' ? 'Kick all pending' : 'Kick overdue'}
        message={
          confirm?.kind === 'log'
            ? 'This only clears the dashboard history. Roles stay as they are.'
            : confirm?.kind === 'all'
              ? 'Every pending unverified member will be kicked from the server.'
              : 'Members past the auto-kick timer will be removed.'
        }
        confirmLabel={confirm?.kind === 'log' ? 'Clear log' : 'Kick'}
        variant="danger"
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          if (confirm?.kind === 'log') wipeLog();
          else if (confirm?.kind === 'all') kickPending(false);
          else kickPending(true);
        }}
      />
    </div>
  );
}

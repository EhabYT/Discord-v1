import React, { useState, useEffect, useCallback } from 'react';
import { Shield, Zap, Lock, Activity, RefreshCw, AlertTriangle, Users } from 'lucide-react';
import CyanToggle from '../components/CyanToggle.jsx';
import GaugeChart from '../components/GaugeChart.jsx';
import PageHeader from '../components/PageHeader.jsx';
import { useToast } from '../components/Toast.jsx';
import api from '../api.js';

function SectionCard({ icon: Icon, title, iconColor = 'text-cyan-400', badge, children }) {
  return (
    <div className="cyber-card p-5">
      <div className="flex items-center gap-2 mb-4">
        <Icon size={15} className={iconColor} />
        <h2 className="text-sm font-semibold text-white">{title}</h2>
        {badge && <span className="ml-auto cyber-badge-cyan">{badge}</span>}
      </div>
      {children}
    </div>
  );
}

const AUTOMOD_FEATURES = [
  { key: 'antiSpam',  label: 'Anti-Spam',      desc: 'Block repeated message spam',        simple: true,  icon: '🚫' },
  { key: 'antiLinks', label: 'Anti-Links',      desc: 'Block unauthorized URLs',            simple: true,  icon: '🔗' },
  { key: 'antiInvite',label: 'Anti-Invite',     desc: 'Block Discord invite links',         simple: true,  icon: '📨' },
  { key: 'badWords',  label: 'Bad Words',       desc: 'Filter profanity & slurs',           simple: true,  icon: '🤬' },
  { key: 'caps',      label: 'Excessive CAPS',  desc: 'Block messages in all-caps',         simple: false, icon: '🔠' },
  { key: 'emojis',    label: 'Emoji Spam',      desc: 'Limit excessive emoji usage',        simple: false, icon: '😵' },
  { key: 'mentions',  label: 'Mass Mentions',   desc: 'Block bulk user mentions',           simple: false, icon: '📢' },
];

export default function Security({ guild, guildData, onNavigate }) {
  const toast = useToast();
  const [verification, setVerification] = useState({ enabled: false, roleId: null, logChannelId: null });
  const [automod, setAutomod] = useState({});
  const [raid, setRaid] = useState({ enabled: false, threshold: 5, windowMs: 8000, autoAction: 'none', alertChannel: '' });
  const [perf, setPerf] = useState(null);
  const [saving, setSaving] = useState('');

  const channels = guildData?.guild?.channels?.filter(c => c.type === 0) || [];

  const loadPerf = useCallback(async () => {
    try { setPerf(await api.get('/api/performance')); } catch {}
  }, []);

  useEffect(() => {
    if (guildData?.automod) setAutomod(guildData.automod);
    if (guild?.id) {
      api.get(`/api/guild/${guild.id}/verification`).then(setVerification).catch(() => {});
      api.get(`/api/guild/${guild.id}/security`).then((cfg) => {
        const a = cfg?.antiRaid || {};
        setRaid({
          enabled: !!a.enabled,
          threshold: a.threshold || 5,
          windowMs: a.windowMs || 8000,
          autoAction: a.autoAction || 'none',
          alertChannel: a.alertChannel || '',
        });
      }).catch(() => {});
    }
    loadPerf();
    const t = setInterval(loadPerf, 6000);
    return () => clearInterval(t);
  }, [guildData, guild?.id, loadPerf]);

  const saveRaid = async () => {
    setSaving('raid');
    try {
      await api.post(`/api/guild/${guild.id}/security`, {
        antiRaid: {
          enabled: raid.enabled,
          threshold: Number(raid.threshold) || 5,
          windowMs: Number(raid.windowMs) || 8000,
          autoAction: raid.autoAction || 'none',
          alertChannel: raid.alertChannel || null,
        },
      });
      toast.success('Anti-raid saved.');
    } catch { toast.error('Failed to save anti-raid.'); }
    setSaving('');
  };

  const toggleAutomod = async (setting, value, extra = {}) => {
    try {
      const updated = { ...automod };
      if (['antiSpam', 'antiLinks', 'antiInvite', 'badWords'].includes(setting)) {
        updated[setting] = value;
      } else {
        updated[setting] = { ...(updated[setting] || { enabled: false, threshold: 5 }), enabled: value, ...extra };
      }
      setAutomod(updated);
      await api.post(`/api/guild/${guild.id}/automod`, { setting, value, ...extra });
      toast.success(`${setting} ${value ? 'enabled' : 'disabled'}`);
    } catch {
      toast.error('Failed to update AutoMod.');
    }
  };

  if (!guild) {return (
    <div className="p-6 flex items-center justify-center h-64">
      <p className="text-gray-600 text-sm">Select a server first.</p>
    </div>
  );}

  const pingColor = p => p < 100 ? '#00FF88' : p < 200 ? '#FFA500' : '#FF4444';
  const pingLabel = p => p < 100 ? 'Excellent' : p < 200 ? 'Good' : 'High Latency';
  const activeCount = AUTOMOD_FEATURES.filter(f => f.simple ? !!automod[f.key] : !!(automod[f.key]?.enabled)).length;

  return (
    <div className="page-shell-sm animate-fade-in">
      <PageHeader
        icon={Shield}
        title="Security & AutoMod"
        subtitle={`Protection configuration for ${guild.name}`}
        badge={guildData?.diagnostics?.status}
        badgeColor={guildData?.diagnostics?.status === 'Healthy' ? 'green' : guildData?.diagnostics?.status === 'Critical' ? 'red' : 'yellow'}
      />

      <div className="grid md:grid-cols-2 gap-4 mb-4">
        {/* Member Verification — full desk lives on its own page */}
        <SectionCard icon={Lock} title="Member Verification" iconColor="text-cyan-400" badge={verification.enabled ? 'Armed' : 'Off'}>
          <div className="space-y-4">
            <p className="text-xs text-zinc-500 leading-relaxed">
              Gate, captcha, pending members and verify logs moved to the dedicated <strong className="text-zinc-300">Verification</strong> page.
            </p>
            <div className="grid grid-cols-2 gap-2 text-center">
              <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] py-2">
                <p className="text-sm font-semibold text-white">{verification.roleId ? 'Role set' : 'No role'}</p>
                <p className="text-[10px] text-zinc-600">Verified role</p>
              </div>
              <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] py-2">
                <p className="text-sm font-semibold text-white">{verification.enabled ? 'On' : 'Off'}</p>
                <p className="text-[10px] text-zinc-600">Gate</p>
              </div>
            </div>
            <button
              onClick={() => onNavigate?.('verification')}
              className="cyber-button-solid w-full text-xs"
            >
              Open Verification desk
            </button>
          </div>
        </SectionCard>

        {/* Security Health */}
        <SectionCard icon={Activity} title="Security Health" iconColor="text-cyan-400">
          {perf ? (
            <>
              <div className="flex items-center justify-between p-3 rounded-xl bg-white/[0.04] border border-white/[0.08] mb-4">
                <div>
                  <p className="text-xs font-semibold text-white">Bot Latency</p>
                  <p className="text-[11px] text-gray-600 mt-0.5">WebSocket heartbeat</p>
                </div>
                <div className="text-right">
                  <p className="text-xl font-bold tabular-nums" style={{ color: pingColor(perf.ping) }}>
                    {perf.ping}ms
                  </p>
                  <p className="text-[10px]" style={{ color: pingColor(perf.ping) }}>
                    {pingLabel(perf.ping)}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <GaugeChart value={perf.cpu}            label="CPU Load" color="auto"      size={110} />
                <GaugeChart value={perf.memory?.percent} label="Memory"   color="#00FFFF"  size={110} />
              </div>

              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                {[
                  { label: 'RSS',   value: `${(perf.memory?.rss / 1024 / 1024).toFixed(0)} MB` },
                  { label: 'Cores', value: perf.system?.cpuCount },
                  { label: 'Uptime',value: `${Math.floor(perf.uptime / 3600000)}h` },
                ].map(m => (
                  <div key={m.label} className="py-2 rounded-lg bg-white/[0.04]">
                    <p className="text-xs font-bold text-cyan-400">{m.value}</p>
                    <p className="text-[10px] text-gray-600">{m.label}</p>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center h-36 gap-2">
              <div className="w-6 h-6 border-2 border-cyan-500/30 border-t-cyan-400 rounded-full animate-spin" />
              <p className="text-xs text-gray-600">Loading metrics…</p>
            </div>
          )}
          <button onClick={loadPerf} className="mt-3 w-full cyber-button text-xs flex items-center justify-center gap-1.5">
            <RefreshCw size={11} /> Refresh
          </button>
        </SectionCard>
      </div>

      <SectionCard icon={Users} title="Anti-Raid" iconColor="text-red-400" badge={raid.enabled ? 'Armed' : 'Off'}>
        <div className="space-y-4">
          <CyanToggle
            enabled={raid.enabled}
            onChange={(v) => setRaid((r) => ({ ...r, enabled: v }))}
            label="Detect join bursts"
            description="Alert (and optionally lock down) when too many members join at once"
          />
          <div className="grid sm:grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-gray-500 block mb-1.5">Joins</label>
              <input type="number" min="2" max="30" value={raid.threshold}
                onChange={(e) => setRaid((r) => ({ ...r, threshold: parseInt(e.target.value) || 5 }))}
                className="cyber-input text-xs" />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1.5">Window (seconds)</label>
              <input type="number" min="3" max="120" value={Math.round((raid.windowMs || 8000) / 1000)}
                onChange={(e) => setRaid((r) => ({ ...r, windowMs: (parseInt(e.target.value) || 8) * 1000 }))}
                className="cyber-input text-xs" />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1.5">Auto action</label>
              <select value={raid.autoAction} onChange={(e) => setRaid((r) => ({ ...r, autoAction: e.target.value }))} className="cyber-select text-xs">
                <option value="none">Alert only</option>
                <option value="lockdown">Lockdown @everyone</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1.5">Alert channel</label>
            <select value={raid.alertChannel || ''} onChange={(e) => setRaid((r) => ({ ...r, alertChannel: e.target.value }))} className="cyber-select">
              <option value="">— Member log / none —</option>
              {channels.map((c) => <option key={c.id} value={c.id}>#{c.name}</option>)}
            </select>
          </div>
          <button onClick={saveRaid} disabled={saving === 'raid'} className="cyber-button-solid text-xs">
            {saving === 'raid' ? 'Saving…' : 'Save anti-raid'}
          </button>
        </div>
      </SectionCard>

      {/* AutoMod */}
      <div className="cyber-card p-5 mt-4">
        <div className="flex items-center gap-2 mb-5">
          <Zap size={15} className="text-cyan-400" />
          <h2 className="text-sm font-semibold text-white">AutoMod Configuration</h2>
          <span className="ml-auto cyber-badge-cyan">{activeCount}/{AUTOMOD_FEATURES.length} active</span>
        </div>

        <div className="grid md:grid-cols-2 gap-3">
          {AUTOMOD_FEATURES.map(({ key, label, desc, simple, icon }) => {
            const val = simple ? !!automod[key] : !!(automod[key]?.enabled);
            return (
              <div
                key={key}
                className={`p-3.5 rounded-xl border transition-all duration-200 ${
                  val
                    ? 'bg-cyan-500/[0.05] border-cyan-500/20'
                    : 'bg-white/[0.03] border-white/[0.08] hover:border-white/[0.12]'
                }`}
              >
                <div className="flex items-start gap-2">
                  <span className="text-base mt-0.5 flex-shrink-0">{icon}</span>
                  <div className="flex-1 min-w-0">
                    <CyanToggle
                      enabled={val}
                      onChange={v => toggleAutomod(key, v)}
                      label={label}
                      description={desc}
                    />
                    {!simple && val && (
                      <div className="mt-3 flex items-center gap-2">
                        <label className="text-[11px] text-gray-500 flex-shrink-0">Threshold:</label>
                        <input
                          type="number"
                          value={automod[key]?.threshold || 5}
                          onChange={e => toggleAutomod(key, val, { threshold: parseInt(e.target.value) || 5 })}
                          className="cyber-input w-20 text-xs"
                          min="1" max="50"
                        />
                        <span className="text-[11px] text-gray-600">messages</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {guildData?.diagnostics?.missingPermissions?.length > 0 && (
          <div className="mt-4 p-3.5 rounded-xl bg-yellow-500/[0.07] border border-yellow-500/20">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle size={14} className="text-yellow-400" />
              <p className="text-xs font-semibold text-yellow-400">Missing Permissions</p>
            </div>
            <div className="space-y-1">
              {guildData.diagnostics.missingPermissions.map((p, i) => (
                <p key={i} className="text-xs text-yellow-500/80">
                  <span className="font-medium">{p.name}</span>
                  <span className="text-yellow-600/70"> — needed for {p.feature}</span>
                </p>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

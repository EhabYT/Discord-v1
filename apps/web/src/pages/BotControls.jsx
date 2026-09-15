import React, { useState, useEffect, useCallback } from 'react';
import { Bot, Wifi, Activity, Radio, Eye, Gamepad2, Music2, Mic2, Trophy, Save, RefreshCw, Type } from 'lucide-react';
import StatCard from '../components/StatCard.jsx';
import PageHeader from '../components/PageHeader.jsx';
import { useToast } from '../components/Toast.jsx';
import api from '../api.js';

const STATUS_OPTIONS = [
  { value: 'online',    label: 'Online',         color: 'bg-green-400',  glow: 'shadow-[0_0_8px_rgba(74,222,128,0.7)]',  desc: 'Fully available' },
  { value: 'idle',      label: 'Idle',           color: 'bg-yellow-400', glow: 'shadow-[0_0_8px_rgba(250,204,21,0.7)]',  desc: 'Away from keyboard' },
  { value: 'dnd',       label: 'Do Not Disturb', color: 'bg-red-500',    glow: 'shadow-[0_0_8px_rgba(239,68,68,0.7)]',   desc: 'Busy — no pings' },
  { value: 'invisible', label: 'Invisible',      color: 'bg-gray-500',   glow: 'shadow-[0_0_8px_rgba(107,114,128,0.5)]', desc: 'Appear offline' },
];

const ACTIVITY_TYPES = [
  { value: 0, label: 'Playing',   icon: Gamepad2 },
  { value: 2, label: 'Listening', icon: Music2   },
  { value: 3, label: 'Watching',  icon: Eye      },
  { value: 4, label: 'Streaming', icon: Radio    },
  { value: 5, label: 'Competing', icon: Trophy   },
];

const PRESETS = [
  { label: '/help for commands', type: 0, text: '/help for commands' },
  { label: 'your server',        type: 3, text: 'your server' },
  { label: 'music 🎵',           type: 2, text: 'music 🎵' },
  { label: 'Competing in events',type: 5, text: 'Competing in events' },
  { label: 'over the server',    type: 3, text: 'over the server' },
];

const typeLabel = v => ACTIVITY_TYPES.find(t => t.value === v)?.label || 'Playing';
const uplabel   = v => ({ online:'Online', idle:'Idle', dnd:'Do Not Disturb', invisible:'Invisible' }[v] || v);

export default function BotControls({ guild, guildData, setGuildData }) {
  const toast = useToast();
  const [botInfo, setBotInfo] = useState(null);
  const [status,  setStatus]  = useState('online');
  const [actType, setActType] = useState(0);
  const [actText, setActText] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [dirty,   setDirty]   = useState(false);
  const currentNick = guildData?.guild?.botNickname || '';
  const currentDisplay = guildData?.guild?.botDisplayName || botInfo?.username || 'EB';
  const [nickname, setNickname] = useState(currentNick);
  const [savingNick, setSavingNick] = useState(false);

  useEffect(() => {
    setNickname(guildData?.guild?.botNickname || '');
  }, [guild?.id, guildData?.guild?.botNickname]);

  const load = useCallback(() => {
    setLoading(true);
    api.get('/api/bot/presence')
      .then(d => {
        setBotInfo(d);
        setStatus(d.status || 'online');
        setActType(d.activityType ?? 0);
        setActText(d.activityText || '');
        setDirty(false);
      })
      .catch(() => toast.error('Failed to load bot status'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.post('/api/bot/presence', { status, activityType: actType, activityText: actText });
      toast.success('Bot presence updated!');
      setDirty(false);
      load();
    } catch {
      toast.error('Failed to update presence.');
    }
    setSaving(false);
  };

  const saveNickname = async () => {
    if (!guild?.id) return;
    setSavingNick(true);
    try {
      const result = await api.post(`/api/guild/${guild.id}/nickname`, { nickname });
      toast.success(result.nickname ? `Nickname set to “${result.nickname}”` : 'Nickname reset to default');
      setNickname(result.nickname || '');
      if (setGuildData) {
        setGuildData((prev) => prev ? {
          ...prev,
          guild: {
            ...(prev.guild || {}),
            botNickname: result.nickname || null,
            botDisplayName: result.displayName || prev.guild?.botDisplayName,
          },
        } : prev);
      }
    } catch (err) {
      toast.error(err.message || 'Failed to update nickname.');
    }
    setSavingNick(false);
  };

  const selectedStatus = STATUS_OPTIONS.find(s => s.value === status) || STATUS_OPTIONS[0];

  return (
    <div className="page-shell-sm animate-fade-in">
      <PageHeader icon={Bot} title="Bot Controls" subtitle="Presence, activity and the nickname in this server">
        <button onClick={load} className="cyber-button flex items-center gap-1.5 text-xs py-1.5">
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
        <button
          onClick={handleSave}
          disabled={saving || !dirty}
          className={`flex items-center gap-2 px-4 py-1.5 min-h-[40px] rounded-lg text-xs font-semibold transition-all duration-200 ${
            dirty && !saving
              ? 'cyber-button-solid'
              : 'bg-white/5 border border-white/10 text-zinc-500 cursor-not-allowed'
          }`}
        >
          {saving
            ? <><RefreshCw size={12} className="animate-spin" /> Applying…</>
            : <><Save size={12} /> Apply Presence</>}
        </button>
      </PageHeader>

      {dirty && (
        <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-2xl bg-yellow-400/[0.07] border border-yellow-300/25 text-xs font-medium text-yellow-200" role="status">
          <span className="relative flex w-1.5 h-1.5 flex-shrink-0">
            <span className="absolute inline-flex h-full w-full rounded-full bg-yellow-300 opacity-60 animate-ping" />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-yellow-300" />
          </span>
          Unsaved changes — click Apply Presence to push them live
        </div>
      )}

      {/* Live preview */}
      <div className="glass-panel p-4">
        <p className="eb-field-label">Live Preview</p>
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-[#2f3136] border border-white/[0.06]">
          <div className="relative flex-shrink-0">
            <div className="w-10 h-10 rounded-full overflow-hidden border border-white/10 flex-shrink-0">
              <img src="/eb_logo.svg" alt="EB" className="w-full h-full object-cover" />
            </div>
            <div className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-[#2f3136] ${selectedStatus.color} ${selectedStatus.glow}`} />
          </div>
          <div>
            <p className="text-sm font-semibold text-white">{nickname.trim() || currentDisplay}</p>
            {actText ? (
              <p className="text-xs text-gray-400 mt-0.5">
                <span className="text-gray-500">{typeLabel(actType)}</span> {actText}
              </p>
            ) : (
              <p className="text-xs text-gray-600 mt-0.5 italic">No activity set</p>
            )}
          </div>
        </div>
      </div>

      {/* Status cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={Wifi}     label="Status"   value={uplabel(botInfo?.status)}         color="green"  />
        <StatCard icon={Activity} label="Activity" value={typeLabel(botInfo?.activityType)}  color="cyan"   />
        <StatCard icon={Mic2}     label="Guilds"   value={botInfo?.guildCount}              color="purple" />
        <StatCard icon={Bot}      label="Latency"  value={botInfo?.ping != null ? `${botInfo.ping}ms` : '—'} sub="WebSocket" color="yellow" />
      </div>

      <div className="glass-panel p-5 space-y-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="eb-section-head">
              <span className="eb-section-icon !w-7 !h-7"><Type size={14} /></span>
              <h2 className="text-[11px] font-bold text-zinc-300 uppercase tracking-[0.12em]">Server Nickname</h2>
            </div>
            <p className="text-xs text-zinc-400 mt-1.5 ml-9">
              How the bot appears in {guild?.name || 'this server'}. Blank + Save resets to the global username.
            </p>
          </div>
          <span className="cyber-badge-cyan tabular-nums">{currentNick ? `Now: ${currentNick}` : 'Default name'}</span>
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder={currentDisplay}
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && saveNickname()}
            className="cyber-input"
            maxLength={32}
          />
          <button onClick={saveNickname} disabled={savingNick} className="cyber-button-solid flex-shrink-0">
            {savingNick ? 'Saving…' : 'Save nick'}
          </button>
        </div>
        <div className="flex items-center justify-between">
          <p className="text-[10px] text-zinc-600">{nickname.length}/32</p>
          {nickname && (
            <button
              type="button"
              onClick={() => setNickname('')}
              className="text-[11px] text-zinc-500 hover:text-cyan-300 transition-colors"
            >
              Clear field
            </button>
          )}
        </div>
      </div>

      {/* Status selector */}
      <div className="glass-panel p-5">
        <h2 className="eb-field-label !mb-3">Online Status</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2" role="radiogroup" aria-label="Online status">
          {STATUS_OPTIONS.map(opt => (
            <button
              key={opt.value}
              role="radio"
              aria-checked={status === opt.value}
              onClick={() => { setStatus(opt.value); setDirty(true); }}
              className={`flex flex-col items-center gap-2 p-4 min-h-[88px] rounded-2xl border transition-all duration-200 ${
                status === opt.value
                  ? 'border-cyan-300/50 bg-gradient-to-b from-cyan-400/[0.14] to-cyan-400/[0.05] shadow-[0_0_24px_rgba(34,211,238,0.12)]'
                  : 'border-white/[0.06] bg-white/[0.02] hover:border-white/15 hover:bg-white/[0.04]'
              }`}
            >
              <div className={`w-4 h-4 rounded-full ${opt.color} ${status === opt.value ? opt.glow : ''}`} />
              <div className="text-center">
                <p className={`text-xs font-semibold ${status === opt.value ? 'text-cyan-200' : 'text-zinc-300'}`}>
                  {opt.label}
                </p>
                <p className="text-[10px] text-zinc-500 mt-0.5">{opt.desc}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Activity type */}
      <div className="glass-panel p-5">
        <h2 className="eb-field-label !mb-3">Activity Type</h2>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Activity type">
          {ACTIVITY_TYPES.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              role="radio"
              aria-checked={actType === value}
              onClick={() => { setActType(value); setDirty(true); }}
              className={`flex items-center gap-2 px-3.5 py-2 min-h-[40px] rounded-xl border text-xs font-semibold transition-all duration-200 ${
                actType === value
                  ? 'border-cyan-300/50 bg-cyan-400/[0.12] text-cyan-100 shadow-[0_0_18px_rgba(34,211,238,0.12)]'
                  : 'border-white/[0.06] bg-white/[0.02] text-zinc-400 hover:text-zinc-100 hover:border-white/15'
              }`}
            >
              <Icon size={13} aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Activity text */}
      <div className="glass-panel p-5">
        <h2 className="eb-field-label !mb-3">Activity Text</h2>
        <input
          type="text"
          value={actText}
          onChange={e => { setActText(e.target.value); setDirty(true); }}
          placeholder="e.g. over your server  |  /help for commands  |  music 🎵"
          maxLength={128}
          aria-describedby="acttext-count"
          className="cyber-input mb-2"
        />
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <p id="acttext-count" className="text-[10px] text-zinc-500 tabular-nums">{actText.length}/128</p>
          <div className="flex gap-1.5 flex-wrap justify-end">
            {PRESETS.map((p, i) => (
              <button
                key={i}
                onClick={() => { setActType(p.type); setActText(p.text); setDirty(true); }}
                className="text-[10px] font-medium px-2.5 py-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] text-zinc-400 hover:text-cyan-200 hover:border-cyan-300/30 transition-colors"
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

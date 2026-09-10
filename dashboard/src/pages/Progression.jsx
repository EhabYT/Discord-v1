import React, { useState, useEffect, useCallback } from 'react';
import {
  TrendingUp, Trophy, Plus, Trash2, Mic, MessageSquare,
  Volume2, Hash, Settings, Zap, Bell, BellOff, X, Save
} from 'lucide-react';
import CyanToggle from '../components/CyanToggle.jsx';
import PageHeader from '../components/PageHeader.jsx';
import ConfirmModal from '../components/ConfirmModal.jsx';
import { useToast } from '../components/Toast.jsx';
import api from '../api.js';

function Avatar({ user }) {
  return user.avatar
    ? <img src={user.avatar} alt="" className="w-[42px] h-[42px] rounded-full object-cover flex-shrink-0 ring-2 ring-cyan-500/40" />
    : <div className="w-[42px] h-[42px] rounded-full bg-cyan-500/10 flex items-center justify-center text-sm font-bold text-cyan-400 ring-2 ring-cyan-500/40 flex-shrink-0">
        {user.username?.[0]?.toUpperCase() || '?'}
      </div>;
}

const TABS = [
  { id: 'settings',    icon: Settings,   label: 'Settings'    },
  { id: 'rewards',     icon: Trophy,     label: 'Rewards'     },
  { id: 'multipliers', icon: Zap,        label: 'Multipliers' },
  { id: 'leaderboard', icon: TrendingUp, label: 'Leaderboard' },
];

const LB_TABS = [
  { id: 'xp',       icon: TrendingUp,   label: 'XP'       },
  { id: 'messages', icon: MessageSquare, label: 'Messages' },
  { id: 'voice',    icon: Mic,          label: 'Voice'    },
];

export default function Progression({ guild, guildData }) {
  const toast = useToast();
  const [tab,    setTab]    = useState('settings');
  const [lbTab,  setLbTab]  = useState('xp');
  const [saving, setSaving] = useState(false);

  const [xpEnabled,       setXpEnabled]       = useState(true);
  const [multiplier,      setMultiplier]       = useState(1.0);
  const [ignoredChannels, setIgnoredChannels] = useState([]);
  const [announceMode,    setAnnounceMode]    = useState('here');
  const [announceChannel, setAnnounceChannel] = useState('');

  const [rewards,  setRewards]  = useState([]);
  const [newLevel, setNewLevel] = useState('');
  const [newRole,  setNewRole]  = useState('');

  const [roleMultipliers, setRoleMultipliers] = useState([]);
  const [newMultRole,     setNewMultRole]     = useState('');
  const [newMultValue,    setNewMultValue]    = useState('2');

  const [leaderboard, setLeaderboard] = useState([]);
  const [lbLoading,   setLbLoading]   = useState(false);
  const [resetOpen,   setResetOpen]   = useState(false);

  const roles    = guildData?.guild?.roles    || [];
  const channels = (guildData?.guild?.channels || []).filter(c => c.type === 0);

  useEffect(() => {
    if (!guild?.id) return;
    if (guildData) {
      setXpEnabled(guildData.guild?.xpEnabled !== false);
      setRewards(guildData.rewards || []);
    }
    loadXpDetails();
    loadRoleMultipliers();
    loadAnnounce();
  }, [guild?.id]);

  const loadXpDetails = async () => {
    try {
      const d = await api.get(`/api/guild/${guild.id}/xp/details`);
      setMultiplier(d.multiplier ?? 1.0);
      setIgnoredChannels(d.ignoredChannels || []);
    } catch (_) {}
  };

  const loadRoleMultipliers = async () => {
    try { setRoleMultipliers(await api.get(`/api/guild/${guild.id}/xp/rolemultipliers`) || []); }
    catch (_) {}
  };

  const loadAnnounce = async () => {
    try {
      const d = await api.get(`/api/guild/${guild.id}/xp/announce`);
      if (d.cfg === false) { setAnnounceMode('disabled'); }
      else if (d.cfg?.channelId) { setAnnounceMode('channel'); setAnnounceChannel(d.cfg.channelId); }
      else { setAnnounceMode('here'); }
    } catch (_) {}
  };

  const loadLeaderboard = useCallback(async (type) => {
    if (!guild?.id) return;
    setLbLoading(true);
    try { setLeaderboard(await api.get(`/api/guild/${guild.id}/leaderboard?type=${type}`)); }
    catch (_) {}
    setLbLoading(false);
  }, [guild?.id]);

  useEffect(() => {
    if (tab === 'leaderboard') loadLeaderboard(lbTab);
  }, [tab, lbTab]);

  const saveSettings = async () => {
    setSaving(true);
    try {
      await api.post(`/api/guild/${guild.id}/config`, { xpEnabled });
      await api.post(`/api/guild/${guild.id}/xp/advanced`, { multiplier, ignoredChannels });
      const body = announceMode === 'disabled' ? { disabled: true }
                 : announceMode === 'channel'  ? { channelId: announceChannel }
                 : {};
      await api.post(`/api/guild/${guild.id}/xp/announce`, body);
      toast.success('XP settings saved!');
    } catch (e) { toast.error('Error saving settings.'); }
    setSaving(false);
  };

  const addIgnored    = (id) => { if (id && !ignoredChannels.includes(id)) setIgnoredChannels(p => [...p, id]); };
  const removeIgnored = (id) => setIgnoredChannels(p => p.filter(x => x !== id));

  const addReward = async () => {
    if (!newLevel || !newRole) return;
    try {
      const r = await api.post(`/api/guild/${guild.id}/rewards`, { level: parseInt(newLevel), roleId: newRole });
      setRewards(r); setNewLevel(''); setNewRole('');
      toast.success('Role reward added!');
    } catch (_) { toast.error('Failed to add reward.'); }
  };

  const removeReward = async (reward) => {
    try { setRewards(await api.post(`/api/guild/${guild.id}/rewards/delete`, reward)); }
    catch (_) {}
  };

  const addRoleMultiplier = async () => {
    if (!newMultRole || !newMultValue) return;
    try {
      const r = await api.post(`/api/guild/${guild.id}/xp/rolemultipliers`, { roleId: newMultRole, value: parseFloat(newMultValue) });
      setRoleMultipliers(r); setNewMultRole(''); setNewMultValue('2');
      toast.success('Role multiplier added!');
    } catch (_) { toast.error('Failed to add multiplier.'); }
  };

  const removeRoleMultiplier = async (roleId) => {
    try { setRoleMultipliers(await api.delete(`/api/guild/${guild.id}/xp/rolemultipliers/${roleId}`)); }
    catch (_) {}
  };

  if (!guild) return <div className="p-6 text-zinc-400 text-sm">Select a server first.</div>;

  return (
    <div className="page-shell-sm animate-fade-in">
      <PageHeader icon={TrendingUp} title="Progression & XP" subtitle="Leveling system, role rewards, and XP multipliers" />

      <div className="seg-tabs" role="tablist" aria-label="Progression sections">
        {TABS.map(({ id, icon: Icon, label }) => (
          <button key={id} onClick={() => setTab(id)} role="tab" aria-selected={tab === id} className={tab === id ? 'seg-tab-active' : 'seg-tab'}>
            <Icon size={13} aria-hidden="true" />{label}
          </button>
        ))}
      </div>

      {/* ── SETTINGS ── */}
      {tab === 'settings' && (
        <div className="space-y-4">
          <div className="cyber-card p-4">
            <CyanToggle enabled={xpEnabled} onChange={setXpEnabled}
              label="Enable XP System" description="Track text activity to award XP and levels" />
          </div>

          <div className="glass-panel p-4">
            <div className="eb-section-head mb-3">
              <span className="eb-section-icon !w-7 !h-7"><Zap size={14} /></span>
              <h2 className="text-sm font-bold text-white tracking-tight">Global XP Multiplier</h2>
              <span className="ml-auto text-lg font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-200 to-indigo-300 tabular-nums">{parseFloat(multiplier).toFixed(1)}×</span>
            </div>
            <input type="range" min="0.1" max="5" step="0.1" value={multiplier}
              onChange={e => setMultiplier(parseFloat(e.target.value))}
              aria-label="Global XP multiplier"
              className="eb-range w-full cursor-pointer" />
            <div className="flex justify-between text-[10px] text-zinc-500 mt-1 tabular-nums">
              <span>0.1× (slower)</span><span>1× (normal)</span><span>5× (faster)</span>
            </div>
          </div>

          <div className="glass-panel p-4">
            <div className="eb-section-head mb-3">
              <span className="eb-section-icon !w-7 !h-7"><Bell size={14} /></span>
              <h2 className="text-sm font-bold text-white tracking-tight">Level-up Announcements</h2>
            </div>
            <div className="space-y-2" role="radiogroup" aria-label="Level-up announcement mode">
              {[
                { id: 'here',     icon: Hash,    label: 'Same channel as message',  desc: 'Posts wherever the user sent their message' },
                { id: 'channel',  icon: Volume2, label: 'Dedicated channel',         desc: 'All level-ups go to one specific channel' },
                { id: 'disabled', icon: BellOff, label: 'Disabled',                  desc: 'Level-ups happen silently' },
              ].map(opt => (
                <label key={opt.id}
                  className={`flex items-start gap-3 p-3 rounded-2xl border cursor-pointer transition-all duration-150 ${
                    announceMode === opt.id
                      ? 'border-cyan-300/40 bg-gradient-to-r from-cyan-400/[0.12] to-indigo-400/[0.06] shadow-[0_0_20px_rgba(34,211,238,0.1)]'
                      : 'border-white/[0.06] bg-white/[0.02] hover:border-white/15 hover:bg-white/[0.04]'
                  }`}>
                  <input type="radio" name="announce" value={opt.id}
                    checked={announceMode === opt.id}
                    onChange={() => setAnnounceMode(opt.id)}
                    className="accent-cyan-300 mt-0.5 flex-shrink-0" />
                  <opt.icon size={14} className={`mt-0.5 flex-shrink-0 ${announceMode === opt.id ? 'text-cyan-200' : 'text-zinc-500'}`} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-white">{opt.label}</p>
                    <p className="text-xs text-zinc-400 mt-0.5">{opt.desc}</p>
                  </div>
                </label>
              ))}
            </div>
            {announceMode === 'channel' && (
              <select value={announceChannel} onChange={e => setAnnounceChannel(e.target.value)} className="cyber-select w-full mt-3">
                <option value="">— Select channel —</option>
                {channels.map(c => <option key={c.id} value={c.id}># {c.name}</option>)}
              </select>
            )}
          </div>

          <div className="glass-panel p-4">
            <div className="eb-section-head mb-3">
              <span className="eb-section-icon !w-7 !h-7"><Hash size={14} /></span>
              <h2 className="text-sm font-bold text-white tracking-tight">Ignored Channels</h2>
              <span className="text-[10px] font-medium text-zinc-500 ml-1">No XP earned here</span>
            </div>
            <select className="cyber-select w-full mb-3"
              onChange={e => { addIgnored(e.target.value); e.target.value = ''; }}
              defaultValue="">
              <option value="">+ Add a channel to ignore…</option>
              {channels.filter(c => !ignoredChannels.includes(c.id)).map(c => (
                <option key={c.id} value={c.id}># {c.name}</option>
              ))}
            </select>
            {ignoredChannels.length === 0 ? (
              <p className="text-xs text-gray-600 text-center py-2">All channels award XP</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {ignoredChannels.map(id => {
                  const ch = channels.find(c => c.id === id);
                  return (
                    <span key={id} className="flex items-center gap-1.5 pl-2.5 pr-1 py-1 rounded-full bg-white/[0.05] border border-white/10 text-xs text-zinc-300">
                      # {ch?.name || id}
                      <button onClick={() => removeIgnored(id)} className="w-6 h-6 flex items-center justify-center rounded-full text-zinc-500 hover:text-red-300 hover:bg-red-500/10 transition-colors" title={`Unignore #${ch?.name || id}`} aria-label={`Stop ignoring channel ${ch?.name || id}`}>
                        <X size={11} aria-hidden="true" />
                      </button>
                    </span>
                  );
                })}
              </div>
            )}
          </div>

          <button onClick={saveSettings} disabled={saving}
            className="cyber-button-solid w-full py-2.5 text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-50">
            {saving ? 'Saving…' : <><Save size={14} /> Save Settings</>}
          </button>
          <button
            onClick={() => setResetOpen(true)}
            className="cyber-button-danger w-full text-xs py-2"
          >
            Reset all XP & stats
          </button>
        </div>
      )}

      {/* ── REWARDS ── */}
      {tab === 'rewards' && (
        <div className="cyber-card p-4">
          <div className="flex items-center gap-2 mb-4">
            <Trophy size={14} className="text-cyan-400" />
            <h2 className="text-sm font-semibold text-white">Role Rewards</h2>
            <span className="text-[10px] text-gray-600 ml-1">Auto-assign a role on level up</span>
          </div>
          <div className="flex gap-2 mb-4">
            <input type="number" placeholder="Level" aria-label="Reward level" value={newLevel}
              onChange={e => setNewLevel(e.target.value)}
              className="cyber-input w-24" min="1" />
            <select value={newRole} onChange={e => setNewRole(e.target.value)} aria-label="Reward role" className="cyber-select flex-1">
              <option value="">— Select Role —</option>
              {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
            <button onClick={addReward} aria-label="Add role reward" className="cyber-button-solid flex-shrink-0 flex items-center gap-1 px-3 min-h-[40px]">
              <Plus size={14} aria-hidden="true" />
            </button>
          </div>
          {rewards.length === 0 ? (
            <p className="text-xs text-gray-600 text-center py-6">No rewards configured yet</p>
          ) : (
            <div className="space-y-2">
              {[...rewards].sort((a, b) => a.level - b.level).map((r, i) => (
                <div key={i} className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-white/[0.04] border border-white/[0.05] hover:border-cyan-500/10 transition-all">
                  <div className="w-16 flex-shrink-0">
                    <span className="text-xs font-bold text-cyan-400">Level {r.level}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="inline-block text-xs text-white px-2 py-0.5 rounded-full border border-white/10 bg-white/[0.05]"
                      style={{ borderColor: roles.find(ro => ro.id === r.roleId)?.color || undefined }}>
                      {roles.find(ro => ro.id === r.roleId)?.name || r.roleId}
                    </span>
                  </div>
                  <button onClick={() => removeReward(r)} className="w-8 h-8 flex items-center justify-center rounded-lg text-zinc-500 hover:text-red-300 hover:bg-red-500/10 transition-colors flex-shrink-0" title={`Remove Level ${r.level} reward`} aria-label={`Remove Level ${r.level} role reward`}>
                    <Trash2 size={13} aria-hidden="true" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── MULTIPLIERS ── */}
      {tab === 'multipliers' && (
        <div className="space-y-4">
          <div className="cyber-card p-4">
            <div className="flex items-center gap-2 mb-1">
              <Zap size={14} className="text-cyan-400" />
              <h2 className="text-sm font-semibold text-white">Per-Role XP Multipliers</h2>
            </div>
            <p className="text-xs text-zinc-400 mb-4">
              Members with these roles earn XP at a different rate. The highest applicable multiplier is used.
            </p>
            <div className="flex gap-2 mb-4">
              <select value={newMultRole} onChange={e => setNewMultRole(e.target.value)} aria-label="Role for XP multiplier" className="cyber-select flex-1">
                <option value="">— Select Role —</option>
                {roles.filter(r => !roleMultipliers.find(m => m.roleId === r.id))
                  .map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
              <input type="number" placeholder="2.0" aria-label="XP multiplier value" min="0.1" max="10" step="0.1" value={newMultValue}
                onChange={e => setNewMultValue(e.target.value)} className="cyber-input w-20" />
              <span className="flex items-center text-sm text-zinc-500" aria-hidden="true">×</span>
              <button onClick={addRoleMultiplier} aria-label="Add role XP multiplier" className="cyber-button-solid flex-shrink-0 flex items-center gap-1 px-3 min-h-[40px]">
                <Plus size={14} aria-hidden="true" />
              </button>
            </div>
            {roleMultipliers.length === 0 ? (
              <p className="text-xs text-zinc-500 text-center py-6">No role multipliers configured</p>
            ) : (
              <div className="space-y-2" role="list" aria-label="Role XP multipliers">
                {roleMultipliers.map((m) => {
                  const role = roles.find(r => r.id === m.roleId);
                  const pct  = Math.min(100, ((m.value - 0.1) / 9.9) * 100);
                  return (
                    <div key={m.roleId} role="listitem" aria-label={`${role?.name || m.roleId}: ${m.value} times XP`} className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-white/[0.04] border border-white/[0.05]">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-medium text-white truncate">{role?.name || m.roleId}</span>
                          <span className="ml-auto text-xs font-bold text-cyan-300 tabular-nums flex-shrink-0">{m.value}×</span>
                        </div>
                        <div className="h-1 rounded-full bg-white/10 overflow-hidden" aria-hidden="true">
                          <div className="h-full bg-gradient-to-r from-cyan-500/60 to-cyan-400 rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                      <button onClick={() => removeRoleMultiplier(m.roleId)}
                        className="w-8 h-8 flex items-center justify-center rounded-lg text-zinc-500 hover:text-red-300 hover:bg-red-500/10 transition-colors flex-shrink-0" title="Remove multiplier" aria-label={`Remove XP multiplier for ${role?.name || m.roleId}`}>
                        <Trash2 size={13} aria-hidden="true" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <div className="cyber-card p-4">
            <p className="text-xs text-zinc-400">
              <span className="text-cyan-300 font-medium">How it works:</span> When a message earns XP, the bot checks all the sender's roles and picks the highest multiplier. If no role multiplier applies, the global multiplier ({parseFloat(multiplier).toFixed(1)}×) is used instead.
            </p>
          </div>
        </div>
      )}

      {/* ── LEADERBOARD ── */}
      {tab === 'leaderboard' && (
        <div className="cyber-card p-4">
          <div className="flex items-center gap-3 mb-4 flex-wrap">
            <Trophy size={16} className="text-cyan-300" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-white">Server Leaderboard</h2>
            <div className="ml-auto flex rounded-lg bg-white/[0.04] p-0.5 border border-white/[0.06]" role="group" aria-label="Leaderboard type">
              {LB_TABS.map(({ id, icon: Icon, label }) => (
                <button key={id} onClick={() => setLbTab(id)} aria-pressed={lbTab === id}
                  className={`flex items-center gap-1.5 px-3 py-2 min-h-[36px] rounded-md text-xs font-medium transition-all ${
                    lbTab === id ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30' : 'text-zinc-400 hover:text-zinc-200 border border-transparent'
                  }`}>
                  <Icon size={10} aria-hidden="true" />{label}
                </button>
              ))}
            </div>
          </div>

          {lbLoading ? (
            <div className="space-y-2">
              {[...Array(6)].map((_, i) => <div key={i} className="h-14 rounded-lg bg-white/[0.04] animate-pulse" />)}
            </div>
          ) : leaderboard.length === 0 ? (
            <p className="text-sm text-zinc-500 text-center py-8">No data yet — members earn XP by chatting</p>
          ) : (
            <div className="space-y-2" role="list" aria-label="Server leaderboard">
              {leaderboard.map((entry, i) => {
                const xpNeeded = (entry.textLevel || 1) * 100;
                const prog     = Math.min(100, Math.round(((entry.textXp || 0) / xpNeeded) * 100));
                return (
                  <div key={entry.userId} role="listitem" aria-label={`Rank ${i + 1}: ${entry.username}`} className="flex items-center gap-3 p-3 rounded-lg bg-white/[0.04] border border-white/[0.05] hover:border-cyan-500/10 transition-all">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 tabular-nums ${
                      i === 0 ? 'bg-yellow-500/20 text-yellow-300 shadow-[0_0_8px_rgba(234,179,8,0.3)]'
                    : i === 1 ? 'bg-zinc-400/20 text-zinc-300'
                    : i === 2 ? 'bg-orange-500/20 text-orange-300'
                    : 'bg-white/[0.04] text-zinc-500'
                    }`} aria-hidden="true">
                      {i + 1}
                    </div>
                    <Avatar user={entry} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white truncate">{entry.username}</p>
                      <div className="flex items-center gap-3 mt-0.5">
                        {lbTab === 'xp' && (
                          <>
                            <span className="text-xs text-cyan-300 font-medium tabular-nums">Lv. {entry.textLevel || 1}</span>
                            <span className="text-xs text-zinc-500 tabular-nums">{(entry.textXp || 0).toLocaleString()} XP</span>
                          </>
                        )}
                        {lbTab === 'messages' && <span className="text-xs text-cyan-300 tabular-nums">{(entry.messages || 0).toLocaleString()} messages</span>}
                        {lbTab === 'voice' && <span className="text-xs text-cyan-300 tabular-nums">{Math.round((entry.voiceTime || entry.voiceXp || 0) / 60000)}m voice</span>}
                      </div>
                    </div>
                    {lbTab === 'xp' && (
                      <div className="w-16 flex-shrink-0">
                        <div className="h-1 rounded-full bg-white/10 overflow-hidden" role="progressbar" aria-label={`${entry.username} progress to next level`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={prog}>
                          <div className="h-full bg-cyan-500 rounded-full" style={{ width: `${prog}%` }} />
                        </div>
                        <p className="text-[10px] text-zinc-500 text-right mt-0.5 tabular-nums">{prog}%</p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <ConfirmModal
        open={resetOpen}
        title="Reset all XP?"
        message={`This wipes every XP, level and stat record in ${guild.name}. It cannot be undone.`}
        confirmLabel="Reset everything"
        variant="danger"
        onConfirm={async () => {
          setResetOpen(false);
          try {
            const r = await api.post(`/api/guild/${guild.id}/xp/reset`);
            toast.success(`Reset ${r.cleared || 0} records.`);
            setLeaderboard([]);
          } catch { toast.error('XP reset failed.'); }
        }}
        onCancel={() => setResetOpen(false)}
      />
    </div>
  );
}

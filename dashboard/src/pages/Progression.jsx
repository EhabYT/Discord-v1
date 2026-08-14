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

  if (!guild) return <div className="p-6 text-gray-500 text-sm">Select a server first.</div>;

  return (
    <div className="page-shell-sm animate-fade-in">
      <PageHeader icon={TrendingUp} title="Progression & XP" subtitle="Leveling system, role rewards, and XP multipliers" />

      <div className="seg-tabs">
        {TABS.map(({ id, icon: Icon, label }) => (
          <button key={id} onClick={() => setTab(id)} className={tab === id ? 'seg-tab-active' : 'seg-tab'}>
            <Icon size={13} />{label}
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

          <div className="cyber-card p-4">
            <div className="flex items-center gap-2 mb-3">
              <Zap size={14} className="text-cyan-400" />
              <h2 className="text-sm font-semibold text-white">Global XP Multiplier</h2>
              <span className="ml-auto text-lg font-bold text-cyan-400">{parseFloat(multiplier).toFixed(1)}×</span>
            </div>
            <input type="range" min="0.1" max="5" step="0.1" value={multiplier}
              onChange={e => setMultiplier(parseFloat(e.target.value))}
              className="w-full accent-cyan-400 h-2 rounded-full cursor-pointer" />
            <div className="flex justify-between text-[10px] text-gray-600 mt-1">
              <span>0.1× (slower)</span><span>1× (normal)</span><span>5× (faster)</span>
            </div>
          </div>

          <div className="cyber-card p-4">
            <div className="flex items-center gap-2 mb-3">
              <Bell size={14} className="text-cyan-400" />
              <h2 className="text-sm font-semibold text-white">Level-up Announcements</h2>
            </div>
            <div className="space-y-2">
              {[
                { id: 'here',     icon: Hash,    label: 'Same channel as message',  desc: 'Posts wherever the user sent their message' },
                { id: 'channel',  icon: Volume2, label: 'Dedicated channel',         desc: 'All level-ups go to one specific channel' },
                { id: 'disabled', icon: BellOff, label: 'Disabled',                  desc: 'Level-ups happen silently' },
              ].map(opt => (
                <label key={opt.id}
                  className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                    announceMode === opt.id
                      ? 'border-cyan-500/40 bg-cyan-500/[0.08]'
                      : 'border-white/[0.05] bg-white/[0.02] hover:border-white/10'
                  }`}>
                  <input type="radio" name="announce" value={opt.id}
                    checked={announceMode === opt.id}
                    onChange={() => setAnnounceMode(opt.id)}
                    className="accent-cyan-400 mt-0.5 flex-shrink-0" />
                  <opt.icon size={14} className={`mt-0.5 flex-shrink-0 ${announceMode === opt.id ? 'text-cyan-400' : 'text-gray-500'}`} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-white">{opt.label}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{opt.desc}</p>
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

          <div className="cyber-card p-4">
            <div className="flex items-center gap-2 mb-3">
              <Hash size={14} className="text-cyan-400" />
              <h2 className="text-sm font-semibold text-white">Ignored Channels</h2>
              <span className="text-[10px] text-gray-600 ml-1">No XP earned here</span>
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
                    <span key={id} className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/[0.05] border border-white/10 text-xs text-gray-300">
                      # {ch?.name || id}
                      <button onClick={() => removeIgnored(id)} className="text-gray-600 hover:text-red-400 transition-colors">
                        <X size={10} />
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
            <input type="number" placeholder="Level" value={newLevel}
              onChange={e => setNewLevel(e.target.value)}
              className="cyber-input w-24" min="1" />
            <select value={newRole} onChange={e => setNewRole(e.target.value)} className="cyber-select flex-1">
              <option value="">— Select Role —</option>
              {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
            <button onClick={addReward} className="cyber-button-solid flex-shrink-0 flex items-center gap-1 px-3">
              <Plus size={14} />
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
                  <button onClick={() => removeReward(r)} className="text-gray-600 hover:text-red-400 transition-colors flex-shrink-0">
                    <Trash2 size={13} />
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
            <p className="text-xs text-gray-500 mb-4">
              Members with these roles earn XP at a different rate. The highest applicable multiplier is used.
            </p>
            <div className="flex gap-2 mb-4">
              <select value={newMultRole} onChange={e => setNewMultRole(e.target.value)} className="cyber-select flex-1">
                <option value="">— Select Role —</option>
                {roles.filter(r => !roleMultipliers.find(m => m.roleId === r.id))
                  .map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
              <input type="number" placeholder="2.0" min="0.1" max="10" step="0.1" value={newMultValue}
                onChange={e => setNewMultValue(e.target.value)} className="cyber-input w-20" />
              <span className="flex items-center text-sm text-gray-400">×</span>
              <button onClick={addRoleMultiplier} className="cyber-button-solid flex-shrink-0 flex items-center gap-1 px-3">
                <Plus size={14} />
              </button>
            </div>
            {roleMultipliers.length === 0 ? (
              <p className="text-xs text-gray-600 text-center py-6">No role multipliers configured</p>
            ) : (
              <div className="space-y-2">
                {roleMultipliers.map((m) => {
                  const role = roles.find(r => r.id === m.roleId);
                  const pct  = Math.min(100, ((m.value - 0.1) / 9.9) * 100);
                  return (
                    <div key={m.roleId} className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-white/[0.04] border border-white/[0.05]">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-medium text-white truncate">{role?.name || m.roleId}</span>
                          <span className="ml-auto text-xs font-bold text-cyan-400 flex-shrink-0">{m.value}×</span>
                        </div>
                        <div className="h-1 rounded-full bg-white/10 overflow-hidden">
                          <div className="h-full bg-gradient-to-r from-cyan-500/60 to-cyan-400 rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                      <button onClick={() => removeRoleMultiplier(m.roleId)}
                        className="text-gray-600 hover:text-red-400 transition-colors flex-shrink-0">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <div className="cyber-card p-4">
            <p className="text-xs text-gray-500">
              <span className="text-cyan-400 font-medium">How it works:</span> When a message earns XP, the bot checks all the sender's roles and picks the highest multiplier. If no role multiplier applies, the global multiplier ({parseFloat(multiplier).toFixed(1)}×) is used instead.
            </p>
          </div>
        </div>
      )}

      {/* ── LEADERBOARD ── */}
      {tab === 'leaderboard' && (
        <div className="cyber-card p-4">
          <div className="flex items-center gap-3 mb-4">
            <Trophy size={16} className="text-cyan-400" />
            <h2 className="text-sm font-semibold text-white">Server Leaderboard</h2>
            <div className="ml-auto flex rounded-lg bg-white/[0.04] p-0.5 border border-white/[0.06]">
              {LB_TABS.map(({ id, icon: Icon, label }) => (
                <button key={id} onClick={() => setLbTab(id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                    lbTab === id ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30' : 'text-gray-500 hover:text-gray-300'
                  }`}>
                  <Icon size={10} />{label}
                </button>
              ))}
            </div>
          </div>

          {lbLoading ? (
            <div className="space-y-2">
              {[...Array(6)].map((_, i) => <div key={i} className="h-14 rounded-lg bg-white/[0.04] animate-pulse" />)}
            </div>
          ) : leaderboard.length === 0 ? (
            <p className="text-sm text-gray-600 text-center py-8">No data yet — members earn XP by chatting</p>
          ) : (
            <div className="space-y-2">
              {leaderboard.map((entry, i) => {
                const xpNeeded = (entry.textLevel || 1) * 100;
                const prog     = Math.min(100, Math.round(((entry.textXp || 0) / xpNeeded) * 100));
                return (
                  <div key={entry.userId} className="flex items-center gap-3 p-3 rounded-lg bg-white/[0.04] border border-white/[0.05] hover:border-cyan-500/10 transition-all">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                      i === 0 ? 'bg-yellow-500/20 text-yellow-400 shadow-[0_0_8px_rgba(234,179,8,0.3)]'
                    : i === 1 ? 'bg-gray-400/20 text-gray-300'
                    : i === 2 ? 'bg-orange-500/20 text-orange-400'
                    : 'bg-white/[0.04] text-gray-600'
                    }`}>
                      {i + 1}
                    </div>
                    <Avatar user={entry} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white truncate">{entry.username}</p>
                      <div className="flex items-center gap-3 mt-0.5">
                        {lbTab === 'xp' && (
                          <>
                            <span className="text-xs text-cyan-400 font-medium">Lv. {entry.textLevel || 1}</span>
                            <span className="text-xs text-gray-600">{(entry.textXp || 0).toLocaleString()} XP</span>
                          </>
                        )}
                        {lbTab === 'messages' && <span className="text-xs text-cyan-400">{(entry.messages || 0).toLocaleString()} messages</span>}
                        {lbTab === 'voice' && <span className="text-xs text-cyan-400">{Math.round((entry.voiceTime || entry.voiceXp || 0) / 60000)}m voice</span>}
                      </div>
                    </div>
                    {lbTab === 'xp' && (
                      <div className="w-16 flex-shrink-0">
                        <div className="h-1 rounded-full bg-white/10 overflow-hidden">
                          <div className="h-full bg-cyan-500 rounded-full" style={{ width: `${prog}%` }} />
                        </div>
                        <p className="text-[9px] text-gray-700 text-right mt-0.5">{prog}%</p>
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

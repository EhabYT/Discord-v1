import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Cake, Save, Send, Settings, Users, Loader, Search, Trash2, Info } from 'lucide-react';
import PageHeader from '../components/PageHeader.jsx';
import StatCard from '../components/StatCard.jsx';
import EmptyState from '../components/EmptyState.jsx';
import ConfirmModal from '../components/ConfirmModal.jsx';
import CyanToggle from '../components/CyanToggle.jsx';
import { useToast } from '../components/Toast.jsx';
import api from '../api.js';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

export default function Birthdays({ guild, guildData }) {
  const toast = useToast();
  const [tab, setTab] = useState('list');
  const [entries, setEntries] = useState([]);
  const [cfg, setCfg] = useState({ disabled: false, channelId: null, roleId: null, message: '' });
  const [today, setToday] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [query, setQuery] = useState('');
  const [confirm, setConfirm] = useState(null);

  const channels = guildData?.guild?.channels?.filter((c) => c.type === 0) || [];
  const roles = guildData?.guild?.roles || [];

  const load = useCallback(async () => {
    if (!guild?.id) return;
    setLoading(true);
    try {
      const d = await api.get(`/api/guild/${guild.id}/birthdays`);
      setEntries(d.entries || []);
      setCfg((c) => ({ ...c, ...(d.config || {}) }));
      setToday(d.today || 0);
    } catch { setEntries([]); }
    setLoading(false);
  }, [guild?.id]);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    setSaving(true);
    try {
      const saved = await api.post(`/api/guild/${guild.id}/birthdays/config`, cfg);
      setCfg((c) => ({ ...c, ...saved }));
      toast.success('Birthday settings saved');
    } catch (e) {
      toast.error(e.message || 'Save failed');
    }
    setSaving(false);
  };

  const test = async () => {
    setTesting(true);
    try {
      await api.post(`/api/guild/${guild.id}/birthdays/test`, { channelId: cfg.channelId });
      toast.success('Test birthday sent');
    } catch (e) {
      toast.error(e.message || 'Test failed');
    }
    setTesting(false);
  };

  const remove = async (userId) => {
    try {
      await api.delete(`/api/guild/${guild.id}/birthdays/${userId}`);
      setEntries((prev) => prev.filter((e) => e.userId !== userId));
      toast.success('Birthday removed');
    } catch (e) {
      toast.error(e.message || 'Delete failed');
    }
    setConfirm(null);
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter((e) =>
      (e.username || '').toLowerCase().includes(q) || (e.userId || '').includes(q));
  }, [entries, query]);

  if (!guild) return <div className="p-6 text-zinc-500 text-sm">Select a server first.</div>;

  return (
    <div className="page-shell-sm animate-fade-in">
      <PageHeader
        icon={Cake}
        title="Birthdays"
        subtitle={`Celebrate members in ${guild.name}`}
        badge={cfg.disabled ? 'Off' : 'On'}
        badgeColor={cfg.disabled ? 'yellow' : 'green'}
      >
        <button onClick={save} disabled={saving} className="cyber-button-solid text-xs flex items-center gap-1.5">
          {saving ? <Loader size={12} className="animate-spin" /> : <Save size={12} />}
          Save
        </button>
      </PageHeader>

      <div className="grid grid-cols-3 gap-3">
        <StatCard icon={Users} label="Registered" value={entries.length} color="cyan" />
        <StatCard icon={Cake} label="Today" value={today} color="purple" />
        <StatCard icon={Settings} label="Announce" value={cfg.disabled ? 'Off' : (cfg.channelId ? 'Ready' : 'No channel')} color={cfg.channelId && !cfg.disabled ? 'green' : 'yellow'} />
      </div>

      <div className="seg-tabs">
        <button onClick={() => setTab('list')} className={tab === 'list' ? 'seg-tab-active' : 'seg-tab'}>
          <Cake size={12} /> Upcoming
        </button>
        <button onClick={() => setTab('settings')} className={tab === 'settings' ? 'seg-tab-active' : 'seg-tab'}>
          <Settings size={12} /> Settings
        </button>
      </div>

      {tab === 'list' && (
        <div className="space-y-4 animate-fade-in">
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search member…" className="cyber-input pl-9 text-xs" />
          </div>
          {loading ? (
            <div className="space-y-2">{[...Array(4)].map((_, i) => <div key={i} className="h-14 skeleton rounded-xl" />)}</div>
          ) : filtered.length === 0 ? (
            <EmptyState icon={Cake} title="No birthdays yet" subtitle="Members use /birthday set month day in Discord." />
          ) : (
            <div className="space-y-1.5">
              {filtered.map((e) => (
                <div key={e.userId} className={`flex items-center gap-3 p-2.5 rounded-xl border ${e.today ? 'bg-pink-500/[0.07] border-pink-500/25' : 'bg-white/[0.03] border-white/[0.06]'}`}>
                  {e.avatar
                    ? <img src={e.avatar} alt="" className="w-8 h-8 rounded-full object-cover" />
                    : <div className="w-8 h-8 rounded-full bg-pink-500/15 text-pink-300 text-xs font-bold flex items-center justify-center">{(e.username || '?')[0]}</div>}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-white truncate">{e.username}</p>
                    <p className="text-[10px] text-zinc-600">
                      {MONTHS[(e.month || 1) - 1]} {e.day}
                      {e.today ? ' · TODAY' : ` · in ${e.days}d`}
                    </p>
                  </div>
                  <button onClick={() => setConfirm(e.userId)} className="text-zinc-600 hover:text-red-400" title="Remove">
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'settings' && (
        <div className="space-y-4 animate-fade-in">
          <div className="cyber-info">
            <Info size={14} className="text-cyan-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-zinc-400 leading-relaxed">
              The bot checks every hour. Role is given for 24h. Members register with <span className="font-mono text-cyan-200">/birthday set</span>.
              Variables: {'{user}'} {'{name}'}
            </p>
          </div>
          <div className="cyber-card p-5 space-y-4">
            <CyanToggle
              enabled={!cfg.disabled}
              onChange={(v) => setCfg((c) => ({ ...c, disabled: !v }))}
              label="Enable announcements"
              description="Post in the channel when it’s someone’s day"
            />
            <div className="grid md:grid-cols-2 gap-3">
              <div>
                <label className="cyber-label mb-1.5">Channel</label>
                <select value={cfg.channelId || ''} onChange={(e) => setCfg((c) => ({ ...c, channelId: e.target.value || null }))} className="cyber-select">
                  <option value="">— None —</option>
                  {channels.map((c) => <option key={c.id} value={c.id}>#{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="cyber-label mb-1.5">24h birthday role</label>
                <select value={cfg.roleId || ''} onChange={(e) => setCfg((c) => ({ ...c, roleId: e.target.value || null }))} className="cyber-select">
                  <option value="">— None —</option>
                  {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="cyber-label mb-1.5">Message</label>
              <textarea rows={3} value={cfg.message || ''} onChange={(e) => setCfg((c) => ({ ...c, message: e.target.value }))} className="cyber-input resize-none" />
            </div>
            <div className="flex gap-2">
              <button onClick={save} disabled={saving} className="cyber-button-solid flex items-center gap-2">
                {saving ? <Loader size={13} className="animate-spin" /> : <Save size={13} />} Save
              </button>
              <button onClick={test} disabled={testing || !cfg.channelId} className="cyber-button flex items-center gap-2">
                {testing ? <Loader size={13} className="animate-spin" /> : <Send size={13} />} Test
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        open={!!confirm}
        title="Remove birthday"
        message="This only deletes the saved date. The member can /birthday set again."
        confirmLabel="Remove"
        variant="danger"
        onCancel={() => setConfirm(null)}
        onConfirm={() => remove(confirm)}
      />
    </div>
  );
}

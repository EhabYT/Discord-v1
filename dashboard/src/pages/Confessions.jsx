import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Ghost, Trash2, Save, Send, Settings, Inbox, Loader, Search, Info } from 'lucide-react';
import PageHeader from '../components/PageHeader.jsx';
import StatCard from '../components/StatCard.jsx';
import EmptyState from '../components/EmptyState.jsx';
import ConfirmModal from '../components/ConfirmModal.jsx';
import CyanToggle from '../components/CyanToggle.jsx';
import { useToast } from '../components/Toast.jsx';
import api from '../api.js';

export default function Confessions({ guild, guildData }) {
  const toast = useToast();
  const [tab, setTab] = useState('inbox');
  const [items, setItems] = useState([]);
  const [cfg, setCfg] = useState({ channelId: null, enabled: true, cooldownMinutes: 10, staffLog: false, title: 'Anonymous Confession', color: '#9B59B6' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState('');
  const [posting, setPosting] = useState(false);
  const [query, setQuery] = useState('');
  const [confirm, setConfirm] = useState(null);

  const channels = guildData?.guild?.channels?.filter((c) => c.type === 0) || [];

  const load = useCallback(async () => {
    if (!guild?.id) return;
    setLoading(true);
    try {
      const d = await api.get(`/api/guild/${guild.id}/confessions`);
      setItems(d.items || []);
      setCfg((c) => ({ ...c, ...(d.config || {}) }));
    } catch { setItems([]); }
    setLoading(false);
  }, [guild?.id]);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    setSaving(true);
    try {
      const saved = await api.post(`/api/guild/${guild.id}/confessions/config`, cfg);
      setCfg((c) => ({ ...c, ...saved }));
      toast.success('Confession settings saved');
    } catch (e) { toast.error(e.message || 'Save failed'); }
    setSaving(false);
  };

  const post = async () => {
    if (!draft.trim()) return;
    setPosting(true);
    try {
      await api.post(`/api/guild/${guild.id}/confessions`, { message: draft.trim() });
      setDraft('');
      toast.success('Confession posted');
      await load();
    } catch (e) { toast.error(e.message || 'Post failed'); }
    setPosting(false);
  };

  const remove = async (id) => {
    try {
      await api.delete(`/api/guild/${guild.id}/confessions/${id}`);
      setItems((prev) => prev.filter((x) => x.id !== id));
      toast.success('Removed');
    } catch (e) { toast.error(e.message || 'Delete failed'); }
    setConfirm(null);
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((x) => `${x.message} ${x.authorTag || ''} ${x.id}`.toLowerCase().includes(q));
  }, [items, query]);

  if (!guild) return <div className="p-6 text-zinc-500 text-sm">Select a server first.</div>;

  return (
    <div className="page-shell-sm animate-fade-in">
      <PageHeader
        icon={Ghost}
        title="Confessions"
        subtitle={`Anonymous posts for ${guild.name}`}
        badge={cfg.enabled ? 'On' : 'Off'}
        badgeColor={cfg.enabled ? 'green' : 'yellow'}
      >
        <button onClick={save} disabled={saving} className="cyber-button-solid text-xs flex items-center gap-1.5">
          {saving ? <Loader size={12} className="animate-spin" /> : <Save size={12} />} Save
        </button>
      </PageHeader>

      <div className="grid grid-cols-3 gap-3">
        <StatCard icon={Inbox} label="Logged" value={items.length} color="purple" />
        <StatCard icon={Ghost} label="Cooldown" value={`${cfg.cooldownMinutes}m`} color="cyan" />
        <StatCard icon={Settings} label="Staff log" value={cfg.staffLog ? 'On' : 'Off'} color={cfg.staffLog ? 'yellow' : 'green'} />
      </div>

      <div className="seg-tabs">
        <button onClick={() => setTab('inbox')} className={tab === 'inbox' ? 'seg-tab-active' : 'seg-tab'}>
          <Inbox size={12} /> Inbox
        </button>
        <button onClick={() => setTab('settings')} className={tab === 'settings' ? 'seg-tab-active' : 'seg-tab'}>
          <Settings size={12} /> Settings
        </button>
      </div>

      {tab === 'inbox' && (
        <div className="space-y-4 animate-fade-in">
          <div className="cyber-card p-4 space-y-3">
            <p className="text-xs font-semibold text-white">Post as staff (no cooldown)</p>
            <textarea rows={3} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Anonymous confession…" className="cyber-input resize-none text-xs" />
            <button onClick={post} disabled={posting || !draft.trim()} className="cyber-button-solid text-xs flex items-center gap-1.5">
              {posting ? <Loader size={12} className="animate-spin" /> : <Send size={12} />} Post
            </button>
          </div>
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search…" className="cyber-input pl-9 text-xs" />
          </div>
          {loading ? (
            <div className="space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="h-16 skeleton rounded-xl" />)}</div>
          ) : filtered.length === 0 ? (
            <EmptyState icon={Ghost} title="No confessions yet" subtitle="Members use /confess. Set a channel in Settings first." />
          ) : (
            <div className="space-y-2">
              {filtered.map((x) => (
                <div key={x.id} className="cyber-card p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[10px] text-zinc-600">#{x.id} · {new Date(x.createdAt).toLocaleString()}</p>
                      <p className="text-xs text-zinc-300 mt-1 whitespace-pre-wrap">{x.message}</p>
                      {x.authorTag && <p className="text-[10px] text-amber-300 mt-1">Staff log: {x.authorTag}</p>}
                    </div>
                    <button onClick={() => setConfirm(x.id)} className="text-zinc-600 hover:text-red-400"><Trash2 size={13} /></button>
                  </div>
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
              <span className="font-mono text-cyan-200">/confess</span> stays anonymous in Discord. Staff log (off by default) only stores the author in this desk.
            </p>
          </div>
          <div className="cyber-card p-5 space-y-4">
            <CyanToggle enabled={cfg.enabled !== false} onChange={(v) => setCfg((c) => ({ ...c, enabled: v }))} label="Enable confessions" description="Turn off to block /confess" />
            <div>
              <label className="cyber-label mb-1.5">Channel</label>
              <select value={cfg.channelId || ''} onChange={(e) => setCfg((c) => ({ ...c, channelId: e.target.value || null }))} className="cyber-select">
                <option value="">— None (use command channel) —</option>
                {channels.map((c) => <option key={c.id} value={c.id}>#{c.name}</option>)}
              </select>
            </div>
            <div className="grid md:grid-cols-2 gap-3">
              <div>
                <label className="cyber-label mb-1.5">Cooldown (minutes)</label>
                <input type="number" min="0" max="1440" value={cfg.cooldownMinutes} onChange={(e) => setCfg((c) => ({ ...c, cooldownMinutes: Number(e.target.value) }))} className="cyber-input text-xs" />
              </div>
              <div>
                <label className="cyber-label mb-1.5">Title</label>
                <input value={cfg.title || ''} onChange={(e) => setCfg((c) => ({ ...c, title: e.target.value }))} className="cyber-input text-xs" />
              </div>
            </div>
            <CyanToggle enabled={!!cfg.staffLog} onChange={(v) => setCfg((c) => ({ ...c, staffLog: v }))} label="Staff log authors" description="Keep Discord anonymous, store author only here" />
            <button onClick={save} disabled={saving} className="cyber-button-solid flex items-center gap-2">
              {saving ? <Loader size={13} className="animate-spin" /> : <Save size={13} />} Save
            </button>
          </div>
        </div>
      )}

      <ConfirmModal
        open={!!confirm}
        title="Delete confession"
        message="Removes it from the inbox and deletes the Discord message if it still exists."
        confirmLabel="Delete"
        variant="danger"
        onCancel={() => setConfirm(null)}
        onConfirm={() => remove(confirm)}
      />
    </div>
  );
}

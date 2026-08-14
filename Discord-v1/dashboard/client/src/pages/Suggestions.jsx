import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Lightbulb, Check, X, Trash2, Save, Send, Settings, Inbox, Loader, Search, Info } from 'lucide-react';
import PageHeader from '../components/PageHeader.jsx';
import StatCard from '../components/StatCard.jsx';
import EmptyState from '../components/EmptyState.jsx';
import ConfirmModal from '../components/ConfirmModal.jsx';
import CyanToggle from '../components/CyanToggle.jsx';
import { useToast } from '../components/Toast.jsx';
import api from '../api.js';

const FILTERS = [
  { id: 'pending', label: 'Pending' },
  { id: 'approved', label: 'Approved' },
  { id: 'denied', label: 'Denied' },
  { id: 'all', label: 'All' },
];

export default function Suggestions({ guild, guildData }) {
  const toast = useToast();
  const [tab, setTab] = useState('inbox');
  const [items, setItems] = useState([]);
  const [cfg, setCfg] = useState({ channelId: null, anonymousDefault: false, autoReact: true });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState('pending');
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState('');
  const [anon, setAnon] = useState(false);
  const [posting, setPosting] = useState(false);
  const [busy, setBusy] = useState('');
  const [note, setNote] = useState({});
  const [confirm, setConfirm] = useState(null);

  const channels = guildData?.guild?.channels?.filter((c) => c.type === 0) || [];

  const load = useCallback(async () => {
    if (!guild?.id) return;
    setLoading(true);
    try {
      const d = await api.get(`/api/guild/${guild.id}/suggestions`);
      setItems(d.items || []);
      setCfg((c) => ({ ...c, ...(d.config || {}) }));
    } catch { setItems([]); }
    setLoading(false);
  }, [guild?.id]);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    setSaving(true);
    try {
      const saved = await api.post(`/api/guild/${guild.id}/suggestions/config`, cfg);
      setCfg((c) => ({ ...c, ...saved }));
      toast.success('Suggestions settings saved');
    } catch (e) { toast.error(e.message || 'Save failed'); }
    setSaving(false);
  };

  const post = async () => {
    if (!draft.trim()) return;
    setPosting(true);
    try {
      await api.post(`/api/guild/${guild.id}/suggestions`, { message: draft.trim(), anonymous: anon });
      setDraft('');
      toast.success('Suggestion posted');
      await load();
    } catch (e) { toast.error(e.message || 'Post failed'); }
    setPosting(false);
  };

  const act = async (id, action) => {
    setBusy(`${action}-${id}`);
    try {
      if (action === 'delete') {
        await api.delete(`/api/guild/${guild.id}/suggestions/${id}`);
        setItems((prev) => prev.filter((s) => s.id !== id));
        toast.success('Deleted');
      } else {
        const s = await api.post(`/api/guild/${guild.id}/suggestions/${id}/${action}`, { note: note[id] || '' });
        setItems((prev) => prev.map((x) => (x.id === id ? { ...x, ...s } : x)));
        toast.success(action === 'approve' ? 'Approved' : 'Denied');
      }
    } catch (e) { toast.error(e.message || 'Action failed'); }
    setBusy('');
    setConfirm(null);
  };

  const counts = useMemo(() => ({
    pending: items.filter((s) => s.status === 'pending').length,
    approved: items.filter((s) => s.status === 'approved').length,
    denied: items.filter((s) => s.status === 'denied').length,
  }), [items]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((s) => {
      if (filter !== 'all' && s.status !== filter) return false;
      if (!q) return true;
      return `${s.message} ${s.authorTag} ${s.id}`.toLowerCase().includes(q);
    });
  }, [items, filter, query]);

  if (!guild) return <div className="p-6 text-zinc-500 text-sm">Select a server first.</div>;

  return (
    <div className="page-shell-sm animate-fade-in">
      <PageHeader
        icon={Lightbulb}
        title="Suggestions"
        subtitle={`Community inbox for ${guild.name}`}
        badge={`${counts.pending} pending`}
        badgeColor={counts.pending ? 'yellow' : 'green'}
      >
        <button onClick={save} disabled={saving} className="cyber-button-solid text-xs flex items-center gap-1.5">
          {saving ? <Loader size={12} className="animate-spin" /> : <Save size={12} />} Save
        </button>
      </PageHeader>

      <div className="grid grid-cols-3 gap-3">
        <StatCard icon={Inbox} label="Pending" value={counts.pending} color="yellow" />
        <StatCard icon={Check} label="Approved" value={counts.approved} color="green" />
        <StatCard icon={X} label="Denied" value={counts.denied} color="red" />
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
            <p className="text-xs font-semibold text-white">Post as staff</p>
            <textarea rows={3} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Write a suggestion…" className="cyber-input resize-none text-xs" />
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <label className="flex items-center gap-2 text-[11px] text-zinc-500">
                <input type="checkbox" checked={anon} onChange={(e) => setAnon(e.target.checked)} /> Anonymous
              </label>
              <button onClick={post} disabled={posting || !draft.trim()} className="cyber-button-solid text-xs flex items-center gap-1.5">
                {posting ? <Loader size={12} className="animate-spin" /> : <Send size={12} />} Post
              </button>
            </div>
          </div>

          <div className="flex gap-1.5 flex-wrap">
            {FILTERS.map((f) => (
              <button key={f.id} onClick={() => setFilter(f.id)} className={filter === f.id ? 'seg-tab-active' : 'seg-tab'}>
                {f.label}
              </button>
            ))}
          </div>
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search suggestions…" className="cyber-input pl-9 text-xs" />
          </div>

          {loading ? (
            <div className="space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="h-20 skeleton rounded-xl" />)}</div>
          ) : filtered.length === 0 ? (
            <EmptyState icon={Lightbulb} title="No suggestions" subtitle="Members use /suggest create — or post one above." />
          ) : (
            <div className="space-y-2">
              {filtered.map((s) => (
                <div key={s.id} className="cyber-card p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-white">#{s.id} · {s.anonymous ? 'Anonymous' : (s.authorTag || 'Member')}</p>
                      <p className="text-xs text-zinc-400 mt-1 leading-relaxed whitespace-pre-wrap">{s.message}</p>
                    </div>
                    <span className={`text-[10px] uppercase tracking-wide ${s.status === 'approved' ? 'text-emerald-300' : s.status === 'denied' ? 'text-red-300' : 'text-amber-300'}`}>{s.status}</span>
                  </div>
                  {s.status === 'pending' && (
                    <>
                      <input value={note[s.id] || ''} onChange={(e) => setNote((n) => ({ ...n, [s.id]: e.target.value }))} placeholder="Staff note (optional)" className="cyber-input text-xs" />
                      <div className="flex gap-2 flex-wrap">
                        <button onClick={() => act(s.id, 'approve')} disabled={!!busy} className="cyber-button-success text-xs flex items-center gap-1.5">
                          {busy === `approve-${s.id}` ? <Loader size={11} className="animate-spin" /> : <Check size={11} />} Approve
                        </button>
                        <button onClick={() => act(s.id, 'deny')} disabled={!!busy} className="cyber-button text-xs text-red-300 flex items-center gap-1.5">
                          {busy === `deny-${s.id}` ? <Loader size={11} className="animate-spin" /> : <X size={11} />} Deny
                        </button>
                        <button onClick={() => setConfirm(s.id)} className="cyber-button text-xs text-zinc-500 flex items-center gap-1.5">
                          <Trash2 size={11} /> Delete
                        </button>
                      </div>
                    </>
                  )}
                  {s.status !== 'pending' && (
                    <div className="flex justify-end">
                      <button onClick={() => setConfirm(s.id)} className="text-zinc-600 hover:text-red-400"><Trash2 size={13} /></button>
                    </div>
                  )}
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
              Members submit with <span className="font-mono text-cyan-200">/suggest create</span>. If a channel is set, posts go there instead of the command channel.
            </p>
          </div>
          <div className="cyber-card p-5 space-y-4">
            <div>
              <label className="cyber-label mb-1.5">Suggestions channel</label>
              <select value={cfg.channelId || ''} onChange={(e) => setCfg((c) => ({ ...c, channelId: e.target.value || null }))} className="cyber-select">
                <option value="">— None (use command channel) —</option>
                {channels.map((c) => <option key={c.id} value={c.id}>#{c.name}</option>)}
              </select>
            </div>
            <CyanToggle enabled={!!cfg.anonymousDefault} onChange={(v) => setCfg((c) => ({ ...c, anonymousDefault: v }))} label="Anonymous by default" description="Hide usernames unless they opt out" />
            <CyanToggle enabled={cfg.autoReact !== false} onChange={(v) => setCfg((c) => ({ ...c, autoReact: v }))} label="Auto 👍 / 👎" description="Add vote reactions on every new suggestion" />
            <button onClick={save} disabled={saving} className="cyber-button-solid flex items-center gap-2">
              {saving ? <Loader size={13} className="animate-spin" /> : <Save size={13} />} Save
            </button>
          </div>
        </div>
      )}

      <ConfirmModal
        open={!!confirm}
        title="Delete suggestion"
        message="Removes it from the inbox and deletes the Discord message if it still exists."
        confirmLabel="Delete"
        variant="danger"
        onCancel={() => setConfirm(null)}
        onConfirm={() => act(confirm, 'delete')}
      />
    </div>
  );
}

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Vote, Plus, Trash2, Lock, Loader, Search, Info, BarChart3 } from 'lucide-react';
import PageHeader from '../components/PageHeader.jsx';
import StatCard from '../components/StatCard.jsx';
import EmptyState from '../components/EmptyState.jsx';
import ConfirmModal from '../components/ConfirmModal.jsx';
import { useToast } from '../components/Toast.jsx';
import api from '../api.js';

export default function Polls({ guild, guildData }) {
  const toast = useToast();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState('');
  const [confirm, setConfirm] = useState(null);
  const [form, setForm] = useState({ channelId: '', question: '', options: 'Yes | No', duration: '0' });
  const [creating, setCreating] = useState(false);

  const channels = guildData?.guild?.channels?.filter((c) => c.type === 0) || [];

  const load = useCallback(async () => {
    if (!guild?.id) return;
    setLoading(true);
    try {
      const d = await api.get(`/api/guild/${guild.id}/polls`);
      setItems(d.polls || []);
    } catch { setItems([]); }
    setLoading(false);
  }, [guild?.id]);

  useEffect(() => { load(); }, [load]);

  const create = async () => {
    if (!form.question.trim() || !form.channelId) {
      toast.error('Pick a channel and write a question.');
      return;
    }
    setCreating(true);
    try {
      const options = form.options.split('|').map((s) => s.trim()).filter(Boolean);
      const minutes = Number(form.duration) || 0;
      await api.post(`/api/guild/${guild.id}/polls`, {
        channelId: form.channelId,
        question: form.question.trim(),
        options,
        durationMs: minutes > 0 ? minutes * 60 * 1000 : 0,
      });
      setForm((f) => ({ ...f, question: '', options: 'Yes | No' }));
      toast.success('Poll posted');
      await load();
    } catch (e) { toast.error(e.message || 'Create failed'); }
    setCreating(false);
  };

  const act = async (id, action) => {
    setBusy(`${action}-${id}`);
    try {
      if (action === 'close') {
        const p = await api.post(`/api/guild/${guild.id}/polls/${id}/close`);
        setItems((prev) => prev.map((x) => (x.id === id ? { ...x, ...p } : x)));
        toast.success('Poll closed');
      } else {
        await api.delete(`/api/guild/${guild.id}/polls/${id}`);
        setItems((prev) => prev.filter((x) => x.id !== id));
        toast.success('Poll deleted');
      }
    } catch (e) { toast.error(e.message || 'Action failed'); }
    setBusy('');
    setConfirm(null);
  };

  const open = items.filter((p) => !p.closed).length;
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((p) => !q || `${p.question} ${p.id}`.toLowerCase().includes(q));
  }, [items, query]);

  if (!guild) return <div className="p-6 text-zinc-500 text-sm">Select a server first.</div>;

  return (
    <div className="page-shell-sm animate-fade-in">
      <PageHeader icon={Vote} title="Polls" subtitle={`Vote desks for ${guild.name}`} badge={`${open} open`} badgeColor={open ? 'cyan' : 'green'} />

      <div className="grid grid-cols-2 gap-3">
        <StatCard icon={Vote} label="Open" value={open} color="cyan" />
        <StatCard icon={BarChart3} label="Total" value={items.length} color="purple" />
      </div>

      <div className="cyber-card p-5 space-y-3">
        <p className="text-xs font-semibold text-white">New poll</p>
        <div className="grid md:grid-cols-2 gap-3">
          <div>
            <label className="cyber-label mb-1.5">Channel</label>
            <select value={form.channelId} onChange={(e) => setForm((f) => ({ ...f, channelId: e.target.value }))} className="cyber-select">
              <option value="">— Select —</option>
              {channels.map((c) => <option key={c.id} value={c.id}>#{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="cyber-label mb-1.5">Auto-close</label>
            <select value={form.duration} onChange={(e) => setForm((f) => ({ ...f, duration: e.target.value }))} className="cyber-select">
              <option value="0">Manual</option>
              <option value="15">15 minutes</option>
              <option value="60">1 hour</option>
              <option value="360">6 hours</option>
              <option value="1440">24 hours</option>
              <option value="10080">7 days</option>
            </select>
          </div>
        </div>
        <input value={form.question} onChange={(e) => setForm((f) => ({ ...f, question: e.target.value }))} placeholder="Question" className="cyber-input text-xs" />
        <input value={form.options} onChange={(e) => setForm((f) => ({ ...f, options: e.target.value }))} placeholder="Options separated by |  (empty = Yes / No)" className="cyber-input text-xs" />
        <button onClick={create} disabled={creating} className="cyber-button-solid text-xs flex items-center gap-1.5">
          {creating ? <Loader size={12} className="animate-spin" /> : <Plus size={12} />} Post poll
        </button>
        <p className="text-[11px] text-zinc-600 inline-flex items-center gap-1.5">
          <Info size={11} /> Also works via <span className="font-mono text-cyan-200">/poll</span> in Discord.
        </p>
      </div>

      <div className="relative">
        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600" />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search polls…" className="cyber-input pl-9 text-xs" />
      </div>

      {loading ? (
        <div className="space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="h-16 skeleton rounded-xl" />)}</div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={Vote} title="No polls yet" subtitle="Create one above or use /poll question options: A | B" />
      ) : (
        <div className="space-y-2">
          {filtered.map((p) => (
            <div key={p.id} className="cyber-card p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-white truncate">{p.question}</p>
                  <p className="text-[10px] text-zinc-600 mt-0.5">
                    #{p.id} · {p.closed ? 'closed' : 'open'}
                    {p.endsAt && !p.closed ? ` · ends ${new Date(p.endsAt).toLocaleString()}` : ''}
                  </p>
                </div>
                <span className={`text-[10px] uppercase ${p.closed ? 'text-zinc-500' : 'text-cyan-300'}`}>{p.closed ? 'Closed' : 'Live'}</span>
              </div>
              <div className="mt-2 space-y-1">
                {(p.liveResults || p.results || p.options || []).map((o, i) => {
                  const votes = o.votes ?? 0;
                  const max = Math.max(1, ...(p.liveResults || p.results || []).map((r) => r.votes || 0));
                  return (
                    <div key={i}>
                      <div className="flex justify-between text-[11px] text-zinc-400">
                        <span>{o.emoji} {o.text}</span>
                        <span className="tabular-nums">{votes}</span>
                      </div>
                      <div className="h-1 rounded-full bg-white/10 mt-0.5 overflow-hidden">
                        <div className="h-full bg-cyan-400/70" style={{ width: `${Math.round((votes / max) * 100)}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="flex gap-2 mt-3">
                {!p.closed && (
                  <button onClick={() => act(p.id, 'close')} disabled={!!busy} className="cyber-button text-xs flex items-center gap-1.5">
                    {busy === `close-${p.id}` ? <Loader size={11} className="animate-spin" /> : <Lock size={11} />} Close
                  </button>
                )}
                <button onClick={() => setConfirm(p.id)} className="cyber-button text-xs text-red-300 flex items-center gap-1.5">
                  <Trash2 size={11} /> Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmModal
        open={!!confirm}
        title="Delete poll"
        message="Removes the poll from the desk and deletes the Discord message."
        confirmLabel="Delete"
        variant="danger"
        onCancel={() => setConfirm(null)}
        onConfirm={() => act(confirm, 'delete')}
      />
    </div>
  );
}

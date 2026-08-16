import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Megaphone, Moon, Clock, Send, Trash2, Loader, Search, Info } from 'lucide-react';
import PageHeader from '../components/PageHeader.jsx';
import StatCard from '../components/StatCard.jsx';
import EmptyState from '../components/EmptyState.jsx';
import ConfirmModal from '../components/ConfirmModal.jsx';
import { useToast } from '../components/Toast.jsx';
import api from '../api.js';

export default function StaffBoard({ guild, guildData }) {
  const toast = useToast();
  const [tab, setTab] = useState('announce');
  const [loading, setLoading] = useState(true);
  const [ann, setAnn] = useState([]);
  const [afk, setAfk] = useState([]);
  const [rems, setRems] = useState([]);
  const [form, setForm] = useState({ channelId: '', title: 'Announcement', message: '', ping: false, color: '#00fbff' });
  const [remForm, setRemForm] = useState({ channelId: '', time: '1h', reason: '' });
  const [sending, setSending] = useState(false);
  const [query, setQuery] = useState('');
  const [confirm, setConfirm] = useState(null);

  const channels = guildData?.guild?.channels?.filter((c) => c.type === 0 || c.type === 5) || [];

  const load = useCallback(async () => {
    if (!guild?.id) return;
    setLoading(true);
    try {
      const d = await api.get(`/api/guild/${guild.id}/board`);
      setAnn(d.announcements || []);
      setAfk(d.afk || []);
      setRems(d.reminders || []);
    } catch {
      setAnn([]); setAfk([]); setRems([]);
    }
    setLoading(false);
  }, [guild?.id]);

  useEffect(() => { load(); }, [load]);

  const sendAnn = async () => {
    if (!form.channelId || !form.message.trim()) {
      toast.error('Pick a channel and write a message.');
      return;
    }
    setSending(true);
    try {
      await api.post(`/api/guild/${guild.id}/board/announce`, form);
      setForm((f) => ({ ...f, message: '' }));
      toast.success('Announcement posted');
      await load();
    } catch (e) { toast.error(e.message || 'Send failed'); }
    setSending(false);
  };

  const addRem = async () => {
    if (!remForm.channelId || !remForm.reason.trim()) {
      toast.error('Channel and reason required.');
      return;
    }
    setSending(true);
    try {
      await api.post(`/api/guild/${guild.id}/board/reminders`, remForm);
      setRemForm((f) => ({ ...f, reason: '' }));
      toast.success('Reminder set');
      await load();
    } catch (e) { toast.error(e.message || 'Failed'); }
    setSending(false);
  };

  const act = async () => {
    if (!confirm) return;
    try {
      if (confirm.kind === 'ann') {
        await api.delete(`/api/guild/${guild.id}/board/announce/${confirm.id}`);
        setAnn((p) => p.filter((x) => x.id !== confirm.id));
      } else if (confirm.kind === 'afk') {
        await api.delete(`/api/guild/${guild.id}/board/afk/${confirm.id}`);
        setAfk((p) => p.filter((x) => x.userId !== confirm.id));
      } else if (confirm.kind === 'rem') {
        await api.delete(`/api/guild/${guild.id}/board/reminders/${confirm.userId}/${confirm.index}`);
        await load();
      }
      toast.success('Removed');
    } catch (e) { toast.error(e.message || 'Delete failed'); }
    setConfirm(null);
  };

  const q = query.trim().toLowerCase();
  const filteredAnn = useMemo(() => ann.filter((x) => !q || `${x.title} ${x.message}`.toLowerCase().includes(q)), [ann, q]);
  const filteredAfk = useMemo(() => afk.filter((x) => !q || `${x.username} ${x.reason}`.toLowerCase().includes(q)), [afk, q]);
  const filteredRem = useMemo(() => rems.filter((x) => !q || `${x.reason} ${x.userId}`.toLowerCase().includes(q)), [rems, q]);

  if (!guild) return <div className="p-6 text-zinc-500 text-sm">Select a server first.</div>;

  return (
    <div className="page-shell-sm animate-fade-in">
      <PageHeader icon={Megaphone} title="Staff Board" subtitle={`Announce, AFK and reminders · ${guild.name}`} />

      <div className="grid grid-cols-3 gap-3">
        <StatCard icon={Megaphone} label="Announcements" value={ann.length} color="cyan" />
        <StatCard icon={Moon} label="AFK" value={afk.length} color="purple" />
        <StatCard icon={Clock} label="Reminders" value={rems.length} color="yellow" />
      </div>

      <div className="seg-tabs">
        <button onClick={() => setTab('announce')} className={tab === 'announce' ? 'seg-tab-active' : 'seg-tab'}><Megaphone size={12} /> Announce</button>
        <button onClick={() => setTab('afk')} className={tab === 'afk' ? 'seg-tab-active' : 'seg-tab'}><Moon size={12} /> AFK</button>
        <button onClick={() => setTab('reminders')} className={tab === 'reminders' ? 'seg-tab-active' : 'seg-tab'}><Clock size={12} /> Reminders</button>
      </div>

      <div className="relative">
        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600" />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search…" className="cyber-input pl-9 text-xs" />
      </div>

      {tab === 'announce' && (
        <div className="space-y-4 animate-fade-in">
          <div className="cyber-card p-5 space-y-3">
            <div className="grid md:grid-cols-2 gap-3">
              <div>
                <label className="cyber-label mb-1.5">Channel</label>
                <select value={form.channelId} onChange={(e) => setForm((f) => ({ ...f, channelId: e.target.value }))} className="cyber-select">
                  <option value="">— Select —</option>
                  {channels.map((c) => <option key={c.id} value={c.id}>#{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="cyber-label mb-1.5">Title</label>
                <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} className="cyber-input text-xs" />
              </div>
            </div>
            <textarea rows={4} value={form.message} onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))} placeholder="Announcement text…" className="cyber-input resize-none text-xs" />
            <label className="flex items-center gap-2 text-[11px] text-zinc-500">
              <input type="checkbox" checked={form.ping} onChange={(e) => setForm((f) => ({ ...f, ping: e.target.checked }))} /> Ping @everyone
            </label>
            <button onClick={sendAnn} disabled={sending} className="cyber-button-solid text-xs flex items-center gap-1.5">
              {sending ? <Loader size={12} className="animate-spin" /> : <Send size={12} />} Post
            </button>
            <p className="text-[11px] text-zinc-600 inline-flex items-center gap-1.5">
              <Info size={11} /> Also works via <span className="font-mono text-cyan-200">/announce</span>
            </p>
          </div>
          {loading ? <div className="space-y-2">{[...Array(2)].map((_, i) => <div key={i} className="h-14 skeleton rounded-xl" />)}</div>
            : filteredAnn.length === 0 ? <EmptyState icon={Megaphone} title="No announcements yet" subtitle="Post one above." />
            : filteredAnn.map((x) => (
              <div key={x.id} className="cyber-card p-4 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-white truncate">{x.title}</p>
                  <p className="text-xs text-zinc-400 mt-1 line-clamp-3">{x.message}</p>
                  <p className="text-[10px] text-zinc-600 mt-1">{new Date(x.createdAt).toLocaleString()} · {x.authorTag}</p>
                </div>
                <button onClick={() => setConfirm({ kind: 'ann', id: x.id })} className="text-zinc-600 hover:text-red-400"><Trash2 size={13} /></button>
              </div>
            ))}
        </div>
      )}

      {tab === 'afk' && (
        <div className="space-y-3 animate-fade-in">
          <div className="cyber-info">
            <Info size={14} className="text-cyan-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-zinc-400">Members set AFK with <span className="font-mono text-cyan-200">/afk</span>. Clearing here removes the status.</p>
          </div>
          {loading ? <div className="space-y-2">{[...Array(2)].map((_, i) => <div key={i} className="h-12 skeleton rounded-xl" />)}</div>
            : filteredAfk.length === 0 ? <EmptyState icon={Moon} title="Nobody is AFK" />
            : filteredAfk.map((x) => (
              <div key={x.userId} className="cyber-card p-3 flex items-center gap-3">
                {x.avatar ? <img src={x.avatar} alt="" className="w-8 h-8 rounded-full" /> : <div className="w-8 h-8 rounded-full bg-white/10" />}
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-white truncate">{x.username}</p>
                  <p className="text-[11px] text-zinc-500 truncate">{x.reason}</p>
                </div>
                <button onClick={() => setConfirm({ kind: 'afk', id: x.userId })} className="cyber-button text-[11px]">Clear</button>
              </div>
            ))}
        </div>
      )}

      {tab === 'reminders' && (
        <div className="space-y-4 animate-fade-in">
          <div className="cyber-card p-5 space-y-3">
            <p className="text-xs font-semibold text-white">Set a reminder</p>
            <div className="grid md:grid-cols-3 gap-3">
              <select value={remForm.channelId} onChange={(e) => setRemForm((f) => ({ ...f, channelId: e.target.value }))} className="cyber-select">
                <option value="">Channel</option>
                {channels.map((c) => <option key={c.id} value={c.id}>#{c.name}</option>)}
              </select>
              <input value={remForm.time} onChange={(e) => setRemForm((f) => ({ ...f, time: e.target.value }))} placeholder="10m / 1h / 1d" className="cyber-input text-xs font-mono" />
              <input value={remForm.reason} onChange={(e) => setRemForm((f) => ({ ...f, reason: e.target.value }))} placeholder="What?" className="cyber-input text-xs" />
            </div>
            <button onClick={addRem} disabled={sending} className="cyber-button-solid text-xs flex items-center gap-1.5">
              {sending ? <Loader size={12} className="animate-spin" /> : <Clock size={12} />} Remind
            </button>
          </div>
          {loading ? <div className="h-12 skeleton rounded-xl" />
            : filteredRem.length === 0 ? <EmptyState icon={Clock} title="No upcoming reminders" subtitle="/remind 1h check tickets" />
            : filteredRem.map((x) => (
              <div key={`${x.userId}-${x.index}-${x.expiresAt}`} className="cyber-card p-3 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs text-white truncate">{x.reason}</p>
                  <p className="text-[10px] text-zinc-600">{new Date(x.expiresAt).toLocaleString()}</p>
                </div>
                <button onClick={() => setConfirm({ kind: 'rem', userId: x.userId, index: x.index })} className="text-zinc-600 hover:text-red-400"><Trash2 size={13} /></button>
              </div>
            ))}
        </div>
      )}

      <ConfirmModal
        open={!!confirm}
        title="Remove"
        message="This cannot be undone."
        confirmLabel="Remove"
        variant="danger"
        onCancel={() => setConfirm(null)}
        onConfirm={act}
      />
    </div>
  );
}

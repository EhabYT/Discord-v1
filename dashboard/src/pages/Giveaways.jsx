import React, { useState, useEffect, useCallback } from 'react';
import {
  Gift, Plus, RotateCcw, Square, Clock, Users, Hash,
  RefreshCw, X, Trophy, ChevronDown, ChevronUp,
  Trash2, Copy, Shield, Info, Star
} from 'lucide-react';
import PageHeader from '../components/PageHeader.jsx';
import { useToast } from '../components/Toast.jsx';
import api from '../api.js';

/* ── Countdown hook ─────────────────────────────────────────────── */
function useCountdown(endsAt) {
  const [left, setLeft] = useState('');
  const [pct,  setPct]  = useState(100);

  useEffect(() => {
    const WINDOW = 7 * 24 * 3600 * 1000;
    const tick = () => {
      const diff = endsAt - Date.now();
      if (diff <= 0) { setLeft('Ended'); setPct(0); return; }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setLeft(h > 0 ? `${h}h ${m}m ${s}s` : m > 0 ? `${m}m ${s}s` : `${s}s`);
      setPct(Math.max(2, Math.min(100, (diff / WINDOW) * 100)));
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [endsAt]);

  return { left, pct };
}

/* ── Color presets for giveaways ────────────────────────────────── */
const COLORS = [
  { label: 'Pink',    hex: '#FF69B4' },
  { label: 'Cyan',    hex: '#00FFFF' },
  { label: 'Gold',    hex: '#FFD700' },
  { label: 'Purple',  hex: '#9B59B6' },
  { label: 'Green',   hex: '#2ECC71' },
  { label: 'Orange',  hex: '#E67E22' },
  { label: 'Red',     hex: '#E74C3C' },
  { label: 'Blue',    hex: '#3498DB' },
];

/* ── Durations ─────────────────────────────────────────────────── */
const DURATIONS = [
  { label: '5 min',    ms: 5 * 60 * 1000 },
  { label: '10 min',   ms: 10 * 60 * 1000 },
  { label: '15 min',   ms: 15 * 60 * 1000 },
  { label: '30 min',   ms: 30 * 60 * 1000 },
  { label: '1 hour',   ms: 60 * 60 * 1000 },
  { label: '2 hours',  ms: 2 * 60 * 60 * 1000 },
  { label: '6 hours',  ms: 6 * 60 * 60 * 1000 },
  { label: '12 hours', ms: 12 * 60 * 60 * 1000 },
  { label: '1 day',    ms: 24 * 60 * 60 * 1000 },
  { label: '2 days',   ms: 2 * 24 * 60 * 60 * 1000 },
  { label: '3 days',   ms: 3 * 24 * 60 * 60 * 1000 },
  { label: '7 days',   ms: 7 * 24 * 60 * 60 * 1000 },
];

const DEFAULT_FORM = {
  prize: '', description: '', duration: DURATIONS[4].ms,
  winners: 1, channelId: '', requiredRoleId: '',
  color: '#FF69B4', dmWinner: true,
};

/* ── GiveawayCard ───────────────────────────────────────────────── */
function GiveawayCard({ g, channels, roles, onEnd, onReroll, onDelete, onDuplicate, actionPending }) {
  const [expanded, setExpanded] = useState(false);
  const { left, pct } = useCountdown(g.endsAt);
  const isActive   = g.active && g.endsAt > Date.now();
  const chanName   = channels.find(c => c.id === g.channelId)?.name || g.channelId;
  const reqRole    = g.requiredRoleId ? roles.find(r => r.id === g.requiredRoleId) : null;
  const endingId   = g.id + 'end';
  const rerollId   = g.id + 'reroll';
  const deleteId   = g.id + 'delete';

  return (
    <div className={`cyber-card transition-all ${isActive ? 'border-cyan-500/25 hover:border-cyan-500/40' : 'opacity-70 hover:opacity-90'}`}>
      {/* Main row */}
      <div className="p-5">
        <div className="flex items-start gap-4">
          {/* Icon with color accent */}
          <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 border relative overflow-hidden"
            style={{
              background: `${g.color || '#FF69B4'}18`,
              borderColor: `${g.color || '#FF69B4'}40`,
            }}>
            <Gift size={20} style={{ color: g.color || '#FF69B4' }} />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-bold text-white truncate">{g.prize}</h3>
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border ${
                isActive
                  ? 'bg-green-500/[0.12] text-green-400 border-green-500/25'
                  : 'bg-gray-500/10 text-gray-400 border-gray-500/20'
              }`}>
                {isActive ? 'Active' : 'Ended'}
              </span>
              {reqRole && (
                <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md bg-purple-500/10 text-purple-400 border border-purple-500/20">
                  <Shield size={9} /> {reqRole.name}
                </span>
              )}
            </div>

            {g.description && (
              <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{g.description}</p>
            )}

            <div className="flex items-center gap-4 mt-2 flex-wrap">
              <span className="flex items-center gap-1.5 text-xs text-gray-500">
                <Trophy size={10} className="text-yellow-600" />
                {g.winners} {g.winners === 1 ? 'winner' : 'winners'}
              </span>
              <span className="flex items-center gap-1.5 text-xs text-gray-500">
                <Hash size={10} className="text-gray-600" />
                #{chanName}
              </span>
              <span className="flex items-center gap-1.5 text-xs">
                <Clock size={10} className={isActive ? 'text-cyan-500/60' : 'text-gray-600'} />
                <span className={isActive ? 'text-cyan-400 font-mono text-[11px]' : 'text-gray-500'}>
                  {isActive ? left : `Ended ${new Date(g.endsAt).toLocaleDateString()}`}
                </span>
              </span>
              {typeof g.entries === 'number' && (
                <span className="flex items-center gap-1.5 text-xs text-gray-500">
                  <Users size={10} className="text-gray-600" />
                  {g.entries} {g.entries === 1 ? 'entry' : 'entries'}
                </span>
              )}
            </div>

            {/* Winners display for ended */}
            {!isActive && g.winnerIds?.length > 0 && (
              <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                <Star size={10} className="text-yellow-400" />
                <span className="text-[10px] text-gray-600">Winners:</span>
                {g.winnerIds.map(id => (
                    <span key={id} className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 font-mono">
                      {`<@${id}>`}
                    </span>
                ))}
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex flex-col gap-1.5 flex-shrink-0">
            <button
              onClick={() => onReroll(g.id)}
              disabled={actionPending === rerollId}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/30 text-purple-400 transition-all disabled:opacity-40">
              <RotateCcw size={11} className={actionPending === rerollId ? 'animate-spin' : ''} />
              {actionPending === rerollId ? 'Rolling…' : 'Reroll'}
            </button>
            {isActive && (
              <button
                onClick={() => onEnd(g.id)}
                disabled={actionPending === endingId}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 transition-all disabled:opacity-40">
                <Square size={11} />
                {actionPending === endingId ? 'Ending…' : 'End Early'}
              </button>
            )}
            <button
              onClick={() => setExpanded(v => !v)}
              className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.07] border border-white/[0.07] text-gray-500 hover:text-gray-300 transition-all">
              {expanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
              {expanded ? 'Less' : 'More'}
            </button>
          </div>
        </div>

        {/* Progress bar for active */}
        {isActive && (
          <div className="mt-4 space-y-1">
            <div className="h-1.5 rounded-full bg-white/[0.05] overflow-hidden">
              <div className="h-full rounded-full transition-all duration-1000"
                style={{
                  width: `${pct}%`,
                  background: `linear-gradient(90deg, ${g.color || '#FF69B4'}80, ${g.color || '#FF69B4'})`,
                  boxShadow: `0 0 8px ${g.color || '#FF69B4'}60`,
                }} />
            </div>
            <p className="text-[10px] text-gray-700 text-right">{Math.round(pct)}% time remaining</p>
          </div>
        )}
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="border-t border-white/[0.05] px-5 py-4 bg-white/[0.01] space-y-3 animate-fade-in">
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <p className="text-gray-600 text-[10px] uppercase tracking-wide mb-1">Message ID</p>
              <p className="text-gray-400 font-mono text-[11px] truncate">{g.id}</p>
            </div>
            <div>
              <p className="text-gray-600 text-[10px] uppercase tracking-wide mb-1">Hosted By</p>
              <p className="text-gray-400 text-[11px]">{g.hostId === 'Dashboard' ? '🖥 Dashboard' : `<@${g.hostId}>`}</p>
            </div>
            <div>
              <p className="text-gray-600 text-[10px] uppercase tracking-wide mb-1">End Time</p>
              <p className="text-gray-400 text-[11px]">{new Date(g.endsAt).toLocaleString()}</p>
            </div>
            {g.description && (
              <div>
                <p className="text-gray-600 text-[10px] uppercase tracking-wide mb-1">Description</p>
                <p className="text-gray-400 text-[11px]">{g.description}</p>
              </div>
            )}
          </div>
          <div className="flex gap-2 pt-1">
            <button onClick={() => onDuplicate(g)}
              className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/20 text-cyan-400 transition-all">
              <Copy size={10} /> Duplicate
            </button>
            <button onClick={() => onDelete(g.id)}
              disabled={actionPending === deleteId}
              className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-lg bg-red-500/[0.08] hover:bg-red-500/15 border border-red-500/20 text-red-400/80 transition-all disabled:opacity-40 ml-auto">
              <Trash2 size={10} />
              {actionPending === deleteId ? 'Deleting…' : 'Delete'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Main page ──────────────────────────────────────────────────── */
export default function Giveaways({ guild, guildData, permLevel }) {
  const toast = useToast();
  const [giveaways,     setGiveaways]     = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [showForm,      setShowForm]      = useState(false);
  const [form,          setForm]          = useState(DEFAULT_FORM);
  const [creating,      setCreating]      = useState(false);
  const [actionPending, setActionPending] = useState('');
  const [query, setQuery] = useState('');

  const channels = guildData?.guild?.channels?.filter(c => c.type === 0) || [];
  const roles    = guildData?.guild?.roles || [];

  const load = useCallback(async () => {
    if (!guild?.id) return;
    setLoading(true);
    try {
      setGiveaways(await api.get(`/api/guild/${guild.id}/giveaways`) || []);
    } catch {}
    setLoading(false);
  }, [guild?.id]);

  useEffect(() => { load(); }, [load]);

  const create = async () => {
    if (!form.prize.trim()) { toast.error('Prize name is required.'); return; }
    if (!form.channelId)    { toast.error('Please select a channel.'); return; }
    setCreating(true);
    try {
      await api.post(`/api/guild/${guild.id}/giveaways/create`, {
        ...form,
        duration: Number(form.duration),
        winners:  Number(form.winners),
      });
      setShowForm(false);
      setForm(DEFAULT_FORM);
      toast.success(`🎉 "${form.prize}" giveaway launched!`);
      await load();
    } catch (e) {
      toast.error(e.message || 'Failed to create giveaway.');
    }
    setCreating(false);
  };

  const endGiveaway = async (id) => {
    setActionPending(id + 'end');
    try {
      await api.post(`/api/guild/${guild.id}/giveaways/${id}/end`, {});
      toast.success('Giveaway ended — winners picked!');
      await load();
    } catch { toast.error('Failed to end giveaway.'); }
    setActionPending('');
  };

  const reroll = async (id) => {
    setActionPending(id + 'reroll');
    try {
      await api.post(`/api/guild/${guild.id}/giveaways/${id}/reroll`, {});
      toast.success('New winner selected! 🎉');
      await load();
    } catch { toast.error('Failed to reroll.'); }
    setActionPending('');
  };

  const deleteGiveaway = async (id) => {
    setActionPending(id + 'delete');
    try {
      await api.delete(`/api/guild/${guild.id}/giveaways/${id}`);
      toast.success('Giveaway removed.');
      setGiveaways(gs => gs.filter(g => g.id !== id));
    } catch { toast.error('Failed to delete giveaway.'); }
    setActionPending('');
  };

  const duplicate = (g) => {
    setForm({
      prize:          g.prize,
      description:    g.description || '',
      duration:       DURATIONS[4].ms,
      winners:        g.winners,
      channelId:      g.channelId,
      requiredRoleId: g.requiredRoleId || '',
      color:          g.color || '#FF69B4',
      dmWinner:       g.dmWinner ?? true,
    });
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    toast.success('Form pre-filled — adjust and launch!');
  };

  if (!guild) return <div className="p-6 text-gray-500 text-sm">Select a server first.</div>;

  const canCreate = permLevel >= 2;
  const q = query.trim().toLowerCase();
  const matches = (g) => !q || `${g.prize || ''} ${g.description || ''} ${g.channelId || ''}`.toLowerCase().includes(q);
  const active    = giveaways.filter(g => g.active && g.endsAt > Date.now() && matches(g));
  const ended     = giveaways.filter(g => (!g.active || g.endsAt <= Date.now()) && matches(g));

  return (
    <div className="page-shell-sm animate-fade-in">
      <PageHeader icon={Gift} title="Giveaways" subtitle={`${guild.name} · ${active.length} active`}>
        <button onClick={load} disabled={loading}
          className="w-8 h-8 flex items-center justify-center rounded-lg border border-white/[0.08] text-gray-500 hover:text-cyan-400 hover:border-cyan-500/30 transition-all">
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
        </button>
        {canCreate && (
          <button onClick={() => setShowForm(v => !v)}
            className={`flex items-center gap-2 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              showForm
                ? 'bg-white/[0.05] border border-white/10 text-gray-400'
                : 'cyber-button-solid'
            }`}>
            {showForm ? <X size={13} /> : <Plus size={13} />}
            {showForm ? 'Cancel' : 'New Giveaway'}
          </button>
        )}
      </PageHeader>

      <div className="relative">
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search prizes…" className="cyber-input text-xs" />
      </div>

      {/* Stats row */}
      {giveaways.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Total', value: giveaways.length, color: 'text-gray-400' },
            { label: 'Active', value: active.length, color: 'text-green-400' },
            { label: 'Ended', value: ended.length, color: 'text-gray-500' },
          ].map(s => (
            <div key={s.label} className="cyber-card p-3 text-center">
              <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-[10px] text-gray-600 uppercase tracking-wide mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Create Form */}
      {showForm && (
        <div className="cyber-card p-5 border-cyan-500/30 shadow-[0_0_24px_rgba(0,255,255,0.04)] animate-slide-up">
          <h2 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
            <Gift size={14} className="text-cyan-400" /> Launch a Giveaway
          </h2>
          <div className="space-y-4">
            {/* Prize + Description */}
            <div>
              <label className="cyber-label mb-1.5">Prize <span className="text-red-400">*</span></label>
              <input type="text" placeholder="e.g. Nitro Classic, Steam Gift Card…"
                value={form.prize}
                onChange={e => setForm(f => ({ ...f, prize: e.target.value }))}
                className="cyber-input" />
            </div>
            <div>
              <label className="cyber-label mb-1.5">Description <span className="text-gray-600">(optional)</span></label>
              <textarea rows={2} placeholder="Extra info about the giveaway…"
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                className="cyber-input resize-none" />
            </div>

            {/* Duration + Winners */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="cyber-label mb-1.5">Duration</label>
                <select value={form.duration}
                  onChange={e => setForm(f => ({ ...f, duration: Number(e.target.value) }))}
                  className="cyber-select">
                  {DURATIONS.map(d => <option key={d.ms} value={d.ms}>{d.label}</option>)}
                </select>
              </div>
              <div>
                <label className="cyber-label mb-1.5">Winners <span className="text-gray-600">(1–20)</span></label>
                <input type="number" min="1" max="20" value={form.winners}
                  onChange={e => setForm(f => ({ ...f, winners: Math.min(20, Math.max(1, Number(e.target.value))) }))}
                  className="cyber-input" />
              </div>
            </div>

            {/* Channel + Required Role */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="cyber-label mb-1.5">Channel <span className="text-red-400">*</span></label>
                <select value={form.channelId}
                  onChange={e => setForm(f => ({ ...f, channelId: e.target.value }))}
                  className="cyber-select">
                  <option value="">— Select channel —</option>
                  {channels.map(c => <option key={c.id} value={c.id}>#{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="cyber-label mb-1.5 flex items-center gap-1">
                  <Shield size={9} /> Required Role <span className="text-gray-600">(optional)</span>
                </label>
                <select value={form.requiredRoleId}
                  onChange={e => setForm(f => ({ ...f, requiredRoleId: e.target.value }))}
                  className="cyber-select">
                  <option value="">— Anyone can enter —</option>
                  {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </div>
            </div>

            {/* Color */}
            <div>
              <label className="cyber-label mb-2">Embed Color</label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {COLORS.map(c => (
                  <button key={c.hex} title={c.label} onClick={() => setForm(f => ({ ...f, color: c.hex }))}
                    className="w-6 h-6 rounded-md border-2 transition-all hover:scale-110 flex-shrink-0"
                    style={{ background: c.hex, borderColor: form.color === c.hex ? '#fff' : 'transparent' }} />
                ))}
              </div>
              <div className="flex gap-2 items-center">
                <input type="color" value={form.color}
                  onChange={e => setForm(f => ({ ...f, color: e.target.value }))}
                  className="h-8 w-10 rounded-lg border border-cyan-500/20 cursor-pointer p-0.5 bg-transparent" />
                <input type="text" value={form.color} maxLength={7}
                  onChange={e => setForm(f => ({ ...f, color: e.target.value }))}
                  className="cyber-input font-mono text-xs w-24" />
              </div>
            </div>

            {/* DM Winner toggle */}
            <label className="flex items-center gap-3 cursor-pointer group">
              <div className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-all ${
                form.dmWinner ? 'bg-cyan-500 border-cyan-500' : 'border-white/20 group-hover:border-cyan-500/40'
              }`} onClick={() => setForm(f => ({ ...f, dmWinner: !f.dmWinner }))}>
                {form.dmWinner && <span className="text-[8px] text-black font-bold">✓</span>}
              </div>
              <div>
                <p className="text-sm text-gray-300">DM winners when giveaway ends</p>
                <p className="text-[10px] text-gray-600">Winners receive a direct message with the prize info</p>
              </div>
            </label>

            {/* Summary */}
            {form.prize && form.channelId && (
              <div className="px-3 py-2.5 rounded-xl border text-xs"
                style={{ background: `${form.color}10`, borderColor: `${form.color}30` }}>
                <span style={{ color: form.color }}>🎉 <strong>{form.prize}</strong></span>
                <span className="text-gray-500"> · {form.winners} winner{form.winners !== 1 ? 's' : ''}</span>
                <span className="text-gray-500"> · #{channels.find(c => c.id === form.channelId)?.name}</span>
                <span className="text-gray-500"> · ends in {DURATIONS.find(d => d.ms === form.duration)?.label}</span>
                {form.requiredRoleId && <span className="text-purple-400"> · 🛡 {roles.find(r => r.id === form.requiredRoleId)?.name}</span>}
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <button onClick={create} disabled={creating} className="cyber-button-solid flex items-center gap-2">
                <Gift size={14} className={creating ? 'animate-bounce' : ''} />
                {creating ? 'Launching…' : 'Launch Giveaway'}
              </button>
              <button onClick={() => { setShowForm(false); setForm(DEFAULT_FORM); }}
                className="px-4 py-2 text-sm text-gray-500 hover:text-gray-300 transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Active */}
      <section>
        <p className="text-[10px] font-bold text-gray-600 uppercase tracking-widest mb-3 flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-green-400 shadow-[0_0_6px_rgba(74,222,128,0.7)]" />
          Active ({active.length})
        </p>
        {loading ? (
          <div className="space-y-3">
            {[0, 1].map(i => <div key={i} className="cyber-card h-28 animate-pulse bg-white/[0.03]" />)}
          </div>
        ) : active.length === 0 ? (
          <div className="cyber-card p-10 text-center">
            <Gift size={30} className="text-gray-700 mx-auto mb-3" />
            <p className="text-sm text-gray-500 font-medium">No active giveaways</p>
            <p className="text-xs text-gray-700 mt-1">
              {canCreate ? 'Hit "New Giveaway" to launch one.' : 'Ask a moderator to start one.'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {active.map((g, i) => (
              <div key={g.id} className="animate-slide-up" style={{ animationDelay: `${i * 60}ms` }}>
                <GiveawayCard g={g} channels={channels} roles={roles}
                  onEnd={endGiveaway} onReroll={reroll}
                  onDelete={deleteGiveaway} onDuplicate={duplicate}
                  actionPending={actionPending} />
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Ended */}
      {ended.length > 0 && (
        <section>
          <p className="text-[10px] font-bold text-gray-600 uppercase tracking-widest mb-3 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-gray-600" />
            Recently Ended ({ended.length})
          </p>
          <div className="space-y-3">
            {ended.map((g, i) => (
              <div key={g.id} className="animate-fade-in" style={{ animationDelay: `${i * 50}ms` }}>
                <GiveawayCard g={g} channels={channels} roles={roles}
                  onEnd={endGiveaway} onReroll={reroll}
                  onDelete={deleteGiveaway} onDuplicate={duplicate}
                  actionPending={actionPending} />
              </div>
            ))}
          </div>
        </section>
      )}

      {!loading && giveaways.length === 0 && !showForm && (
        <div className="cyber-card p-14 text-center">
          <Gift size={40} className="text-gray-700 mx-auto mb-4" />
          <p className="text-base font-semibold text-gray-500">No giveaways yet</p>
          <p className="text-xs text-gray-700 mt-1 max-w-xs mx-auto">
            {canCreate ? 'Launch your first giveaway to get started.' : 'A moderator can start giveaways here.'}
          </p>
        </div>
      )}
    </div>
  );
}

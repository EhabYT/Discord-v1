import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Users, Search, Crown, UserX, Clock, AlertTriangle, Shield,
  Loader2, ChevronDown, ScrollText, Trash2, User, StickyNote,
  Ban, TimerReset, Type, ShieldOff, X, Plus, Pencil, Copy, MoreHorizontal,
} from 'lucide-react';
import PageHeader from '../components/PageHeader.jsx';
import EmptyState from '../components/EmptyState.jsx';
import MemberProfile from '../components/MemberProfile.jsx';
import { useToast } from '../components/Toast.jsx';
import api from '../api.js';

function MemberAvatar({ member }) {
  return member?.avatar
    ? <img src={member.avatar} alt="" className="w-10 h-10 rounded-full object-cover ring-2 ring-cyan-500/30 flex-shrink-0" />
    : <div className="w-10 h-10 rounded-full bg-cyan-500/10 flex items-center justify-center text-sm font-bold text-cyan-400 ring-2 ring-cyan-500/20 flex-shrink-0">
        {(member?.username || member?.displayName || '?')[0]?.toUpperCase()}
      </div>;
}

const ACTIONS = [
  { id: 'note',       label: 'Note',       icon: StickyNote,    color: 'text-cyan-300 bg-cyan-500/10 border-cyan-500/30' },
  { id: 'warn',       label: 'Warn',       icon: AlertTriangle, color: 'text-blue-300 bg-blue-500/10 border-blue-500/30' },
  { id: 'clearwarns', label: 'Del warns',  icon: Trash2,        color: 'text-red-300 bg-red-500/10 border-red-500/30' },
  { id: 'timeout',    label: 'Timeout',    icon: Clock,         color: 'text-yellow-300 bg-yellow-500/10 border-yellow-500/30' },
  { id: 'untimeout',  label: 'Unmute',     icon: TimerReset,    color: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30' },
  { id: 'nickname',   label: 'Nick',       icon: Type,          color: 'text-violet-300 bg-violet-500/10 border-violet-500/30' },
  { id: 'kick',       label: 'Kick',       icon: UserX,         color: 'text-orange-300 bg-orange-500/10 border-orange-500/30' },
  { id: 'softban',    label: 'Softban',    icon: ShieldOff,     color: 'text-rose-300 bg-rose-500/10 border-rose-500/30' },
  { id: 'ban',        label: 'Ban',        icon: Ban,           color: 'text-red-300 bg-red-500/10 border-red-500/30' },
];

function ActionMenu({ member, guildId, onAction, onOpenNotes }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [action, setAction] = useState('');
  const [reason, setReason] = useState('');
  const [nickname, setNickname] = useState('');
  const [duration, setDuration] = useState(60000);
  const [pending, setPending] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const submit = async () => {
    if (!action || action === 'note') return;
    setPending(true);
    try {
      if (action === 'clearwarns') {
        await api.delete(`/api/guild/${guildId}/members/${member.id}/warnings`);
        toast.success(`Warnings cleared for ${member.displayName || member.username}`);
      } else {
        await api.post(`/api/guild/${guildId}/members/${member.id}/action`, {
          action, reason, duration, nickname,
        });
        toast.success(`${action} applied to ${member.displayName || member.username}`);
      }
      onAction(member.id, action);
      setOpen(false); setAction(''); setReason(''); setNickname('');
    } catch (e) {
      toast.error(e.message || `Failed to ${action}`);
    }
    setPending(false);
  };

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(!open)} className="cyber-button flex items-center gap-1 text-xs">
        Staff <ChevronDown size={10} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute right-0 mt-1 w-64 cyber-card shadow-xl z-30 p-3 space-y-2">
          <div className="flex gap-1.5 flex-wrap">
            {ACTIONS.map((a) => {
              const Icon = a.icon;
              return (
                <button
                  key={a.id}
                  onClick={() => {
                    if (a.id === 'note') { onOpenNotes(member); setOpen(false); return; }
                    setAction(action === a.id ? '' : a.id);
                  }}
                  className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs border font-medium transition-all ${
                    action === a.id ? a.color : 'text-zinc-500 border-white/10 hover:border-white/20'
                  }`}
                >
                  <Icon size={10} />{a.label}
                </button>
              );
            })}
          </div>
          {action && action !== 'note' && (
            <>
              {action === 'nickname' ? (
                <input type="text" placeholder="New nick (blank = reset)" value={nickname}
                  onChange={(e) => setNickname(e.target.value)} className="cyber-input text-xs" maxLength={32} />
              ) : (
                <input type="text" placeholder="Reason (optional)" value={reason}
                  onChange={(e) => setReason(e.target.value)} className="cyber-input text-xs" />
              )}
              {action === 'timeout' && (
                <select value={duration} onChange={(e) => setDuration(Number(e.target.value))} className="cyber-select text-xs">
                  <option value={60000}>1 minute</option>
                  <option value={300000}>5 minutes</option>
                  <option value={1800000}>30 minutes</option>
                  <option value={3600000}>1 hour</option>
                  <option value={86400000}>1 day</option>
                  <option value={604800000}>7 days</option>
                </select>
              )}
              <button onClick={submit} disabled={pending}
                className={`w-full text-xs py-1.5 rounded-lg border font-medium transition-all capitalize ${
                  ACTIONS.find((x) => x.id === action)?.color || ''
                }`}>
                {pending ? <Loader2 size={12} className="animate-spin mx-auto" /> : (action === 'clearwarns' ? 'Confirm delete warnings' : `Confirm ${action}`)}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function DeleteConfirm({ onConfirm, title = 'Delete', confirmLabel = 'Confirm delete', className = '' }) {
  const [armed, setArmed] = useState(false);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!armed) return undefined;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);

  const click = async (e) => {
    e.stopPropagation();
    if (!armed) { setArmed(true); return; }
    setPending(true);
    try { await onConfirm(); } finally { setPending(false); setArmed(false); }
  };

  return (
    <button
      type="button"
      onClick={click}
      disabled={pending}
      title={armed ? confirmLabel : title}
      className={`${armed
        ? 'cyber-button-danger text-[10px] px-2 py-1'
        : 'text-zinc-600 hover:text-red-400 transition-colors'} ${className}`}
    >
      {pending ? <Loader2 size={12} className="animate-spin" /> : armed ? confirmLabel : <Trash2 size={13} />}
    </button>
  );
}

function WarnCount({ count }) {
  if (!count) return null;
  const color = count >= 5 ? 'bg-red-500/15 text-red-400 border-red-500/25'
              : count >= 3 ? 'bg-orange-500/15 text-orange-400 border-orange-500/25'
              : 'bg-yellow-500/15 text-yellow-400 border-yellow-500/25';
  return (
    <span className={`flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded border font-semibold ${color}`}>
      <AlertTriangle size={8} /> {count}
    </span>
  );
}

function NoteCount({ count }) {
  if (!count) return null;
  return (
    <span className="flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded border font-semibold bg-cyan-500/15 text-cyan-300 border-cyan-500/25">
      <StickyNote size={8} /> {count}
    </span>
  );
}

function NotesPanel({ guild, member, onClose, onChanged }) {
  const toast = useToast();
  const [notes, setNotes] = useState([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!guild?.id || !member?.id) return;
    setLoading(true);
    try { setNotes(await api.get(`/api/guild/${guild.id}/members/${member.id}/notes`) || []); }
    catch { setNotes([]); }
    setLoading(false);
  }, [guild?.id, member?.id]);

  useEffect(() => { load(); }, [load]);

  const add = async () => {
    if (!text.trim()) return;
    setSaving(true);
    try {
      const list = await api.post(`/api/guild/${guild.id}/members/${member.id}/notes`, { text: text.trim() });
      setNotes(list);
      setText('');
      toast.success('Note added');
      onChanged?.(member.id, list.length);
    } catch (e) { toast.error(e.message || 'Failed to add note'); }
    setSaving(false);
  };

  const remove = async (noteId) => {
    try {
      const list = await api.delete(`/api/guild/${guild.id}/members/${member.id}/notes/${noteId}`);
      setNotes(list);
      toast.success('Note deleted');
      onChanged?.(member.id, list.length);
    } catch (e) { toast.error(e.message || 'Failed to delete note'); }
  };

  const clearAll = async () => {
    if (!notes.length) return;
    try {
      await api.delete(`/api/guild/${guild.id}/members/${member.id}/notes`);
      setNotes([]);
      toast.success('All notes cleared');
      onChanged?.(member.id, 0);
    } catch (e) { toast.error(e.message || 'Failed to clear notes'); }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/55 backdrop-blur-sm" onClick={onClose} />
      <aside className="relative z-10 w-full max-w-md h-full bg-[#070A0F] border-l border-white/10 flex flex-col animate-slide-in">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-white/[0.06]">
          <MemberAvatar member={member} />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-white truncate">{member.displayName || member.username}</p>
            <p className="text-[11px] text-zinc-500">Staff notes · @{member.username}</p>
          </div>
          <button onClick={onClose} className="cyber-icon-button" aria-label="Close"><X size={16} /></button>
        </div>

        <div className="p-4 border-b border-white/[0.06] space-y-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) add(); }}
            placeholder="Add a staff note… (Ctrl+Enter)"
            maxLength={500}
            rows={3}
            className="cyber-textarea"
          />
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-zinc-600">{text.length}/500</span>
            <button onClick={add} disabled={saving || !text.trim()} className="cyber-button-solid flex items-center gap-1.5 text-xs">
              {saving ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />} Add note
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {loading ? (
            [...Array(3)].map((_, i) => <div key={i} className="h-16 skeleton" />)
          ) : notes.length === 0 ? (
            <EmptyState icon={StickyNote} title="No notes yet" subtitle="Private staff notes about this member." />
          ) : notes.map((n) => (
            <div key={n.id} className="cyber-card p-3 space-y-2">
              <p className="text-sm text-zinc-100 whitespace-pre-wrap">{n.text}</p>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] text-zinc-500">{n.mod} · {n.ts ? new Date(n.ts).toLocaleString() : '—'}</span>
                <button onClick={() => remove(n.id)} className="text-zinc-600 hover:text-red-400 transition-colors" title="Delete note">
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          ))}
        </div>

        {notes.length > 0 && (
          <div className="p-4 border-t border-white/[0.06]">
            <button onClick={clearAll} className="cyber-button-danger w-full text-xs flex items-center justify-center gap-1.5">
              <Trash2 size={12} /> Clear all notes
            </button>
          </div>
        )}
      </aside>
    </div>
  );
}

function GroupedLog({ items, members, emptyTitle, emptySub, accent = 'yellow', onDelete }) {
  const [filter, setFilter] = useState('');
  const [expanded, setExpanded] = useState(new Set());

  const grouped = React.useMemo(() => {
    const map = new Map();
    for (const item of items) {
      if (!map.has(item.userId)) map.set(item.userId, []);
      map.get(item.userId).push(item);
    }
    for (const [, arr] of map) arr.sort((a, b) => (b.ts || b.timestamp || 0) - (a.ts || a.timestamp || 0));
    return [...map.entries()]
      .sort((a, b) => b[1].length - a[1].length)
      .filter(([userId]) => {
        if (!filter) return true;
        const m = members.find((x) => x.id === userId);
        const name = (m?.displayName || m?.username || userId).toLowerCase();
        return name.includes(filter.toLowerCase()) || userId.includes(filter);
      });
  }, [items, filter, members]);

  return (
    <div className="space-y-4">
      <div className="cyber-card p-3">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600" />
          <input type="text" placeholder="Filter by username or user ID..." value={filter}
            onChange={(e) => setFilter(e.target.value)} className="cyber-input pl-9" />
        </div>
      </div>
      {grouped.length === 0 ? (
        <div className="cyber-card">
          <EmptyState icon={ScrollText} title={filter ? 'Nothing matches that filter.' : emptyTitle} subtitle={emptySub} />
        </div>
      ) : (
        <div className="cyber-card overflow-hidden divide-y divide-white/[0.04]">
          {grouped.map(([userId, rows]) => {
            const member = members.find((m) => m.id === userId);
            const name = member?.displayName || member?.username || userId;
            const isOpen = expanded.has(userId);
            return (
              <div key={userId}>
                <button
                  onClick={() => setExpanded((prev) => {
                    const next = new Set(prev);
                    next.has(userId) ? next.delete(userId) : next.add(userId);
                    return next;
                  })}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/[0.02] transition-colors text-left"
                >
                  <MemberAvatar member={member || { username: userId }} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-white truncate">{name}</p>
                      {accent === 'yellow' ? <WarnCount count={rows.length} /> : <NoteCount count={rows.length} />}
                    </div>
                    <p className="text-[11px] text-zinc-600 mt-0.5">{member?.username ? `@${member.username} · ` : ''}{userId}</p>
                  </div>
                  <ChevronDown size={14} className={`text-zinc-600 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </button>
                {isOpen && (
                  <div className="bg-white/[0.015] border-t border-white/[0.04]">
                    {rows.map((row, i) => {
                      const id = row.id || String(row.timestamp || row.ts || i);
                      return (
                        <div key={id} className="flex items-start gap-3 px-6 py-3 border-b border-white/[0.03] last:border-0">
                          <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 mt-0.5 ${
                            accent === 'yellow' ? 'bg-yellow-500/10 border border-yellow-500/20 text-yellow-400' : 'bg-cyan-500/10 border border-cyan-500/20 text-cyan-300'
                          }`}>{i + 1}</div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-white">{row.text || row.reason || <span className="text-zinc-600 italic">No text</span>}</p>
                            <div className="flex items-center gap-3 mt-1 flex-wrap">
                              <span className="flex items-center gap-1 text-[11px] text-zinc-600"><User size={9} />{row.mod || row.moderator || 'Unknown'}</span>
                              <span className="flex items-center gap-1 text-[11px] text-zinc-600"><Clock size={9} />{new Date(row.ts || row.timestamp || 0).toLocaleString()}</span>
                            </div>
                          </div>
                          {onDelete && (
                            <button onClick={() => onDelete(userId, id)} className="text-zinc-600 hover:text-red-400 transition-colors" title="Delete">
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function warningId(row, i = 0) {
  return row.id || String(row.timestamp || row.ts || i);
}

function WarningActions({ guildId, userId, warning, member, onDeleted, onEdited, onOpenNotes, onCleared }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [reason, setReason] = useState(warning.reason || '');
  const [pending, setPending] = useState('');
  const ref = useRef(null);
  const id = warningId(warning);

  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const run = async (label, fn) => {
    setPending(label);
    try { await fn(); setOpen(false); }
    catch (e) { toast.error(e.message || 'Action failed'); }
    setPending('');
  };

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((v) => !v)} className="cyber-icon-button" title="Warning options">
        <MoreHorizontal size={14} />
      </button>
      {open && (
        <div className="absolute right-0 mt-1 w-56 cyber-card shadow-xl z-30 p-2 space-y-1">
          {editing ? (
            <div className="p-1 space-y-2">
              <input className="cyber-input text-xs" value={reason} onChange={(e) => setReason(e.target.value)} />
              <div className="flex gap-1">
                <button className="cyber-button flex-1 text-[11px]" onClick={() => setEditing(false)}>Cancel</button>
                <button
                  className="cyber-button-solid flex-1 text-[11px]"
                  disabled={pending === 'edit' || !reason.trim()}
                  onClick={() => run('edit', async () => {
                    await api.patch(`/api/guild/${guildId}/members/${userId}/warnings/${id}`, { reason: reason.trim() });
                    onEdited?.(userId, id, reason.trim());
                    toast.success('Reason updated');
                    setEditing(false);
                  })}
                >Save</button>
              </div>
            </div>
          ) : (
            <>
              <button className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs text-zinc-300 hover:bg-white/[0.06]"
                onClick={() => { setReason(warning.reason || ''); setEditing(true); }}>
                <Pencil size={12} className="text-violet-300" /> Edit reason
              </button>
              <button className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs text-zinc-300 hover:bg-white/[0.06]"
                onClick={() => run('note', async () => {
                  const text = warning.reason ? `From warning: ${warning.reason}` : 'Note from warning';
                  await api.post(`/api/guild/${guildId}/members/${userId}/notes`, { text });
                  toast.success('Note created from warning');
                  onOpenNotes?.(member || { id: userId, username: userId });
                })}>
                <StickyNote size={12} className="text-cyan-300" /> Add as note
              </button>
              <button className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs text-zinc-300 hover:bg-white/[0.06]"
                onClick={() => {
                  navigator.clipboard?.writeText(id).then(() => toast.success('Warning ID copied')).catch(() => {});
                  setOpen(false);
                }}>
                <Copy size={12} className="text-zinc-400" /> Copy ID
              </button>
              <button className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs text-zinc-300 hover:bg-white/[0.06]"
                disabled={pending === 'timeout'}
                onClick={() => run('timeout', async () => {
                  await api.post(`/api/guild/${guildId}/members/${userId}/action`, {
                    action: 'timeout', duration: 600000, reason: warning.reason || 'Escalated warning',
                  });
                  toast.success('Timed out 10 minutes');
                })}>
                <Clock size={12} className="text-yellow-300" /> Timeout 10m
              </button>
              <div className="h-px bg-white/[0.06] my-1" />
              <button className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs text-red-300 hover:bg-red-500/10"
                disabled={pending === 'delete'}
                onClick={() => run('delete', async () => {
                  await api.delete(`/api/guild/${guildId}/members/${userId}/warnings/${id}`);
                  onDeleted?.(userId, id);
                  toast.success('Warning deleted');
                })}>
                <Trash2 size={12} /> Delete warning
              </button>
              <button className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs text-red-400 hover:bg-red-500/10"
                disabled={pending === 'clear'}
                onClick={() => run('clear', async () => {
                  await api.delete(`/api/guild/${guildId}/members/${userId}/warnings`);
                  onCleared?.(userId);
                  toast.success('All warnings cleared');
                })}>
                <Trash2 size={12} /> Clear all for user
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function WarningsDesk({ guild, warnings, members, onDeleted, onEdited, onCleared, onClearedAll, onOpenNotes }) {
  const toast = useToast();
  const [filter, setFilter] = useState('');
  const [expanded, setExpanded] = useState(new Set());
  const [clearingUser, setClearingUser] = useState('');
  const [clearingAll, setClearingAll] = useState(false);
  const [armClearAll, setArmClearAll] = useState(false);
  const [armClearUser, setArmClearUser] = useState('');

  const grouped = React.useMemo(() => {
    const map = new Map();
    for (const item of warnings) {
      if (!map.has(item.userId)) map.set(item.userId, []);
      map.get(item.userId).push(item);
    }
    for (const [, arr] of map) arr.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    return [...map.entries()]
      .sort((a, b) => b[1].length - a[1].length)
      .filter(([userId]) => {
        if (!filter) return true;
        const m = members.find((x) => x.id === userId);
        const name = (m?.displayName || m?.username || userId).toLowerCase();
        return name.includes(filter.toLowerCase()) || userId.includes(filter);
      });
  }, [warnings, filter, members]);

  const total = warnings.length;
  const users = new Set(warnings.map((w) => w.userId)).size;

  const deleteOne = async (userId, row, i) => {
    const id = warningId(row, i);
    await api.delete(`/api/guild/${guild.id}/members/${userId}/warnings/${id}`);
    onDeleted?.(userId, id);
    toast.success('Warning deleted');
  };

  const clearUser = async (userId) => {
    setClearingUser(userId);
    try {
      await api.delete(`/api/guild/${guild.id}/members/${userId}/warnings`);
      onCleared?.(userId);
      toast.success('All warnings for this member deleted');
    } catch (e) {
      toast.error(e.message || 'Failed to clear warnings');
    }
    setClearingUser('');
  };

  const clearGuild = async () => {
    setClearingAll(true);
    try {
      await api.delete(`/api/guild/${guild.id}/warnings`);
      onClearedAll?.();
      toast.success('All server warnings deleted');
    } catch (e) {
      toast.error(e.message || 'Failed to clear server warnings');
    }
    setClearingAll(false);
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="cyber-card p-3 text-center">
          <p className="text-xl font-bold text-yellow-400">{total}</p>
          <p className="text-xs text-zinc-600">Total Warnings</p>
        </div>
        <div className="cyber-card p-3 text-center">
          <p className="text-xl font-bold text-orange-400">{users}</p>
          <p className="text-xs text-zinc-600">Members Warned</p>
        </div>
      </div>
      {total > 0 && (
        <div className="flex items-center justify-between gap-3 cyber-card px-4 py-3">
          <p className="text-xs text-zinc-500">Delete a single warning, clear one member, or wipe the whole list.</p>
          <button
            type="button"
            disabled={clearingAll}
            onClick={() => {
              if (!armClearAll) { setArmClearAll(true); setTimeout(() => setArmClearAll(false), 4000); return; }
              setArmClearAll(false);
              clearGuild();
            }}
            className="cyber-button-danger text-xs flex items-center gap-1.5"
          >
            {clearingAll ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
            {armClearAll ? `Really delete ${total}?` : 'Delete all warnings'}
          </button>
        </div>
      )}
      <div className="cyber-card p-3">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600" />
          <input type="text" placeholder="Filter by username or user ID..." value={filter}
            onChange={(e) => setFilter(e.target.value)} className="cyber-input pl-9" />
        </div>
      </div>
      {grouped.length === 0 ? (
        <div className="cyber-card">
          <EmptyState icon={AlertTriangle} title={filter ? 'Nothing matches that filter.' : 'No warnings recorded yet.'} subtitle="Use Staff → Warn on a member, then manage each warning here." />
        </div>
      ) : (
        <div className="cyber-card overflow-hidden divide-y divide-white/[0.04]">
          {grouped.map(([userId, rows]) => {
            const member = members.find((m) => m.id === userId) || { id: userId, username: userId };
            const name = member.displayName || member.username || userId;
            const isOpen = expanded.has(userId);
            return (
              <div key={userId}>
                <div className="flex items-center gap-3 px-4 py-3 hover:bg-white/[0.02]">
                  <button
                    className="flex-1 flex items-center gap-3 text-left min-w-0"
                    onClick={() => setExpanded((prev) => {
                      const next = new Set(prev);
                      next.has(userId) ? next.delete(userId) : next.add(userId);
                      return next;
                    })}
                  >
                    <MemberAvatar member={member} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-white truncate">{name}</p>
                        <WarnCount count={rows.length} />
                      </div>
                      <p className="text-[11px] text-zinc-600 mt-0.5">{member.username ? `@${member.username}` : userId}</p>
                    </div>
                    <ChevronDown size={14} className={`text-zinc-600 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                  </button>
                  <button onClick={() => onOpenNotes(member)} className="cyber-icon-button" title="Notes">
                    <StickyNote size={14} />
                  </button>
                  <button
                    type="button"
                    disabled={clearingUser === userId}
                    onClick={() => {
                      if (armClearUser !== userId) {
                        setArmClearUser(userId);
                        setTimeout(() => setArmClearUser((cur) => (cur === userId ? '' : cur)), 4000);
                        return;
                      }
                      setArmClearUser('');
                      clearUser(userId);
                    }}
                    className="cyber-button-danger text-[10px] px-2 py-1 flex items-center gap-1"
                    title="Delete all warnings for this member"
                  >
                    {clearingUser === userId ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />}
                    {armClearUser === userId ? 'Sure?' : 'Clear'}
                  </button>
                </div>
                {isOpen && (
                  <div className="bg-white/[0.015] border-t border-white/[0.04]">
                    {rows.map((row, i) => (
                      <div key={warningId(row, i)} className="flex items-start gap-3 px-6 py-3 border-b border-white/[0.03] last:border-0">
                        <div className="w-5 h-5 rounded-full bg-yellow-500/10 border border-yellow-500/20 flex items-center justify-center text-[10px] font-bold text-yellow-400 flex-shrink-0 mt-0.5">
                          {i + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-white">{row.reason || <span className="text-zinc-600 italic">No reason</span>}</p>
                          <div className="flex items-center gap-3 mt-1 flex-wrap">
                            <span className="flex items-center gap-1 text-[11px] text-zinc-600"><User size={9} />{row.moderator || 'Unknown'}</span>
                            <span className="flex items-center gap-1 text-[11px] text-zinc-600"><Clock size={9} />{row.timestamp ? new Date(row.timestamp).toLocaleString() : '—'}</span>
                            {row.id && <span className="text-[10px] text-zinc-700 font-mono">{row.id}</span>}
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <DeleteConfirm
                            title="Delete this warning"
                            confirmLabel="Delete?"
                            onConfirm={() => deleteOne(userId, row, i)}
                          />
                          <WarningActions
                            guildId={guild.id}
                            userId={userId}
                            warning={row}
                            member={member}
                            onDeleted={onDeleted}
                            onEdited={onEdited}
                            onOpenNotes={onOpenNotes}
                            onCleared={onCleared}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function MemberRow({ member, guildId, warnCount, noteCount, onAction, onOpenNotes, onOpenProfile, index }) {
  return (
    <div
      className="flex items-center gap-3 px-4 py-3 hover:bg-white/[0.02] transition-colors group"
      style={{ animationDelay: `${Math.min(index, 20) * 25}ms` }}
    >
      <button type="button" onClick={() => onOpenProfile?.(member)} className="flex-shrink-0" title="Open profile">
        <MemberAvatar member={member} />
      </button>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <button type="button" onClick={() => onOpenProfile?.(member)} className="text-sm font-semibold text-white truncate hover:text-cyan-200 text-left">
            {member.displayName || member.username}
          </button>
          {member.isStaff && (
            <span className="flex-shrink-0 flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">
              <Crown size={8} /> Staff
            </span>
          )}
          {member.timedOut && <span className="cyber-badge-yellow">Timed out</span>}
          <WarnCount count={warnCount} />
          <NoteCount count={noteCount} />
        </div>
        <div className="flex items-center gap-3 mt-0.5 flex-wrap">
          <span className="text-[11px] text-zinc-600">@{member.username}</span>
          {member.highestRole && <span className="text-[11px] text-zinc-500">{member.highestRole}</span>}
          <span className="text-[11px] text-zinc-700">{member.roles} role{member.roles !== 1 ? 's' : ''}</span>
          {member.joinedAt && <span className="text-[11px] text-zinc-700">Joined {new Date(member.joinedAt).toLocaleDateString()}</span>}
        </div>
      </div>
      <div className="flex-shrink-0 flex items-center gap-1.5 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
        <button onClick={() => onOpenNotes(member)} className="cyber-icon-button" title="Notes"><StickyNote size={14} /></button>
        <ActionMenu member={member} guildId={guildId} onAction={onAction} onOpenNotes={onOpenNotes} />
      </div>
    </div>
  );
}

export default function Members({ guild }) {
  const toast = useToast();
  const [tab, setTab] = useState('members');
  const [members, setMembers] = useState([]);
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [warnCounts, setWarnCounts] = useState({});
  const [noteCounts, setNoteCounts] = useState({});
  const [warnings, setWarnings] = useState([]);
  const [notes, setNotes] = useState([]);
  const [notesMember, setNotesMember] = useState(null);
  const [profileMember, setProfileMember] = useState(null);

  const loadMembers = useCallback(async (q = '') => {
    if (!guild?.id) return;
    q ? setSearching(true) : setLoading(true);
    try {
      const data = await api.get(`/api/guild/${guild.id}/members${q ? `?q=${encodeURIComponent(q)}` : ''}`);
      setMembers(data);
    } catch { /* ignore */ }
    setLoading(false);
    setSearching(false);
  }, [guild?.id]);

  const loadMeta = useCallback(async () => {
    if (!guild?.id) return;
    try {
      const [w, n, s] = await Promise.all([
        api.get(`/api/guild/${guild.id}/warnings`).catch(() => []),
        api.get(`/api/guild/${guild.id}/notes`).catch(() => []),
        api.get(`/api/guild/${guild.id}/members?staff=1`).catch(() => []),
      ]);
      setWarnings(w || []);
      setNotes(n || []);
      setStaff(s || []);
      const wc = {}; const nc = {};
      for (const item of (w || [])) wc[item.userId] = (wc[item.userId] || 0) + 1;
      for (const item of (n || [])) nc[item.userId] = (nc[item.userId] || 0) + 1;
      setWarnCounts(wc);
      setNoteCounts(nc);
    } catch { /* ignore */ }
  }, [guild?.id]);

  useEffect(() => { loadMembers(); loadMeta(); }, [loadMembers, loadMeta]);
  useEffect(() => {
    const t = setTimeout(() => { if (query !== undefined) loadMembers(query); }, 400);
    return () => clearTimeout(t);
  }, [query, loadMembers]);

  const handleAction = (userId, action) => {
    if (['kick', 'ban', 'softban'].includes(action)) {
      setMembers((m) => m.filter((mb) => mb.id !== userId));
      setStaff((m) => m.filter((mb) => mb.id !== userId));
    }
    if (action === 'warn') setWarnCounts((prev) => ({ ...prev, [userId]: (prev[userId] || 0) + 1 }));
    if (action === 'clearwarns') {
      setWarnCounts((prev) => ({ ...prev, [userId]: 0 }));
      setWarnings((prev) => prev.filter((w) => w.userId !== userId));
    }
    if (action === 'timeout') {
      setMembers((m) => m.map((x) => x.id === userId ? { ...x, timedOut: true } : x));
      setStaff((m) => m.map((x) => x.id === userId ? { ...x, timedOut: true } : x));
    }
    if (action === 'untimeout') {
      setMembers((m) => m.map((x) => x.id === userId ? { ...x, timedOut: false } : x));
      setStaff((m) => m.map((x) => x.id === userId ? { ...x, timedOut: false } : x));
    }
  };

  const onNoteChanged = (userId, count) => {
    setNoteCounts((prev) => ({ ...prev, [userId]: count }));
    loadMeta();
  };

  const deleteWarning = (userId, wid) => {
    setWarnings((prev) => prev.filter((w) => !(w.userId === userId && (w.id || String(w.timestamp)) === wid)));
    setWarnCounts((prev) => ({ ...prev, [userId]: Math.max(0, (prev[userId] || 1) - 1) }));
  };

  const editWarning = (userId, wid, reason) => {
    setWarnings((prev) => prev.map((w) => (
      w.userId === userId && (w.id || String(w.timestamp)) === wid ? { ...w, reason } : w
    )));
  };

  const clearWarnings = (userId) => {
    setWarnings((prev) => prev.filter((w) => w.userId !== userId));
    setWarnCounts((prev) => ({ ...prev, [userId]: 0 }));
  };

  const clearAllWarnings = () => {
    setWarnings([]);
    setWarnCounts({});
  };

  const deleteNote = async (userId, noteId) => {
    try {
      await api.delete(`/api/guild/${guild.id}/members/${userId}/notes/${noteId}`);
      setNotes((prev) => prev.filter((n) => !(n.userId === userId && n.id === noteId)));
      setNoteCounts((prev) => ({ ...prev, [userId]: Math.max(0, (prev[userId] || 1) - 1) }));
      toast.success('Note deleted');
    } catch (e) { toast.error(e.message || 'Failed to delete note'); }
  };

  if (!guild) return <div className="p-6 text-zinc-500 text-sm">Select a server first.</div>;

  const tabs = [
    { id: 'members', label: 'Members', icon: Users },
    { id: 'staff', label: 'Staff', icon: Crown },
    { id: 'notes', label: 'Notes', icon: StickyNote },
    { id: 'warnings', label: 'Warnings', icon: AlertTriangle },
  ];

  const list = tab === 'staff' ? staff : members;

  return (
    <div className="page-shell-sm">
      <PageHeader
        icon={Users}
        title="Members"
        crumb={guild.name}
        subtitle={`Staff tools, notes and moderation in ${guild.name}`}
      />

      <div className="seg-tabs mb-1">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={tab === id ? 'seg-tab-active' : 'seg-tab'}
          >
            <Icon size={14} /> {label}
            {id === 'warnings' && warnings.length > 0 && (
              <span className="cyber-badge-yellow">{warnings.length}</span>
            )}
            {id === 'notes' && notes.length > 0 && (
              <span className="cyber-badge-cyan">{notes.length}</span>
            )}
          </button>
        ))}
      </div>

      {tab === 'warnings' && (
        <WarningsDesk
          guild={guild}
          warnings={warnings}
          members={[...members, ...staff]}
          onDeleted={deleteWarning}
          onEdited={editWarning}
          onCleared={clearWarnings}
          onClearedAll={clearAllWarnings}
          onOpenNotes={setNotesMember}
        />
      )}

      {tab === 'notes' && (
        <GroupedLog
          items={notes}
          members={[...members, ...staff]}
          emptyTitle="No staff notes yet."
          emptySub="Open a member and add a private note."
          accent="cyan"
          onDelete={deleteNote}
        />
      )}

      {(tab === 'members' || tab === 'staff') && (
        <>
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="cyber-card p-3 text-center">
              <p className="text-xl font-bold text-white">{guild.memberCount?.toLocaleString() || members.length}</p>
              <p className="text-xs text-zinc-600">Total Members</p>
            </div>
            <div className="cyber-card p-3 text-center">
              <p className="text-xl font-bold text-yellow-400">{staff.length || members.filter((m) => m.isStaff).length}</p>
              <p className="text-xs text-zinc-600">Staff</p>
            </div>
            <div className="cyber-card p-3 text-center">
              <p className="text-xl font-bold text-cyan-300">{Object.values(noteCounts).reduce((a, b) => a + b, 0)}</p>
              <p className="text-xs text-zinc-600">Notes</p>
            </div>
          </div>

          {tab === 'members' && (
            <div className="cyber-card p-3 mb-4">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600" />
                <input
                  type="text"
                  placeholder="Search by username, display name, or user ID..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="cyber-input pl-9"
                />
                {searching && <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-cyan-400 animate-spin" />}
              </div>
            </div>
          )}

          {loading ? (
            <div className="space-y-2">{[...Array(6)].map((_, i) => <div key={i} className="cyber-card h-16 animate-pulse bg-white/[0.03]" />)}</div>
          ) : list.length === 0 ? (
            <div className="cyber-card">
              <EmptyState
                icon={tab === 'staff' ? Crown : Users}
                title={tab === 'staff' ? 'No staff found' : (query ? 'No members found' : 'No members to show')}
                subtitle={tab === 'staff' ? 'Members with Manage Messages appear here.' : undefined}
              />
            </div>
          ) : (
            <div className="cyber-card overflow-hidden">
              <div className="divide-y divide-white/[0.04]">
                {list.map((member, i) => (
                  <MemberRow
                    key={member.id}
                    member={member}
                    guildId={guild.id}
                    warnCount={warnCounts[member.id]}
                    noteCount={noteCounts[member.id]}
                    onAction={handleAction}
                    onOpenNotes={setNotesMember}
                    onOpenProfile={setProfileMember}
                    index={i}
                  />
                ))}
              </div>
              <div className="px-4 py-2.5 border-t border-white/5 bg-white/[0.02]">
                <p className="text-[11px] text-zinc-600">
                  Showing {list.length} {tab === 'staff' ? 'staff' : `member${list.length !== 1 ? 's' : ''}`}
                  {tab === 'members' && query ? ` matching “${query}”` : tab === 'members' ? ' (up to 50)' : ''}
                </p>
              </div>
            </div>
          )}
        </>
      )}

      {profileMember && (
        <MemberProfile
          guild={guild}
          member={profileMember}
          onClose={() => setProfileMember(null)}
          onOpenNotes={(m) => { setProfileMember(null); setNotesMember(m); }}
        />
      )}

      {notesMember && (
        <NotesPanel
          guild={guild}
          member={notesMember}
          onClose={() => setNotesMember(null)}
          onChanged={onNoteChanged}
        />
      )}
    </div>
  );
}

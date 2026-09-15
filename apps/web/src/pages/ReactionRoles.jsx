import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Tags, Plus, Trash2, Send, Loader, Search, SmilePlus, MousePointerClick, Info, AlertTriangle,
} from 'lucide-react';
import PageHeader from '../components/PageHeader.jsx';
import StatCard from '../components/StatCard.jsx';
import EmptyState from '../components/EmptyState.jsx';
import ConfirmModal from '../components/ConfirmModal.jsx';
import CyanToggle from '../components/CyanToggle.jsx';
import { useToast } from '../components/Toast.jsx';
import api from '../api.js';

const EMPTY_ROW = () => ({ emoji: '✅', roleId: '', label: '' });

export default function ReactionRoles({ guild, guildData }) {
  const toast = useToast();
  const [tab, setTab] = useState('create');
  const [mappings, setMappings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const [query, setQuery] = useState('');
  const [confirm, setConfirm] = useState(null);

  const [style, setStyle] = useState('button');
  const [unique, setUnique] = useState(false);
  const [group, setGroup] = useState('colors');
  const [channelId, setChannelId] = useState('');
  const [title, setTitle] = useState('Pick your roles');
  const [description, setDescription] = useState('Click a button to add or remove a role.');
  const [color, setColor] = useState('#00fbff');
  const [rows, setRows] = useState([EMPTY_ROW(), EMPTY_ROW()]);

  const channels = guildData?.guild?.channels?.filter((c) => c.type === 0) || [];
  const roles = guildData?.guild?.roles || [];
  const botTop = guildData?.guild?.botHighestPosition ?? null;
  const botCanManage = guildData?.guild?.botCanManageRoles;
  const isUnmanageable = (roleId) => {
    if (botTop == null) return false;
    const r = roles.find((x) => x.id === roleId);
    return !!r && typeof r.position === 'number' && r.position >= botTop;
  };
  const badRows = rows.filter((r) => r.roleId && isUnmanageable(r.roleId));

  const load = useCallback(async () => {
    if (!guild?.id) return;
    setLoading(true);
    try {
      const d = await api.get(`/api/guild/${guild.id}/reactionroles`);
      setMappings(d.mappings || []);
    } catch { setMappings([]); }
    setLoading(false);
  }, [guild?.id]);

  useEffect(() => { load(); }, [load]);

  const setRow = (i, patch) => setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const addRow = () => setRows((prev) => (prev.length >= 20 ? prev : [...prev, EMPTY_ROW()]));
  const delRow = (i) => setRows((prev) => prev.filter((_, idx) => idx !== i));

  const post = async () => {
    if (!channelId) { toast.warning('Pick a channel.'); return; }
    const rolesOk = rows.filter((r) => r.roleId);
    if (!rolesOk.length) { toast.warning('Add at least one role.'); return; }
    setPosting(true);
    try {
      const r = await api.post(`/api/guild/${guild.id}/reactionroles/panel`, {
        channelId,
        title,
        description,
        color,
        style,
        unique,
        group: unique ? (group || 'panel') : '',
        roles: rolesOk.map((row) => ({
          emoji: row.emoji,
          roleId: row.roleId,
          label: row.label || roles.find((x) => x.id === row.roleId)?.name,
          mode: 'toggle',
        })),
      });
      setMappings(r.mappings || []);
      toast.success(`Panel posted · ${r.added} role(s)`);
      setTab('list');
    } catch (e) {
      toast.error(e.message || 'Failed to post panel');
    }
    setPosting(false);
  };

  const remove = async (id) => {
    try {
      const r = await api.delete(`/api/guild/${guild.id}/reactionroles/${id}`);
      setMappings(r.mappings || []);
      toast.success('Mapping removed');
    } catch (e) {
      toast.error(e.message || 'Delete failed');
    }
    setConfirm(null);
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return mappings;
    return mappings.filter((m) =>
      (m.label || '').toLowerCase().includes(q)
      || (m.emoji || '').includes(q)
      || (m.roleId || '').includes(q)
      || (m.group || '').toLowerCase().includes(q)
      || (m.messageId || '').includes(q));
  }, [mappings, query]);

  const buttons = mappings.filter((m) => m.style === 'button').length;
  const reacts = mappings.length - buttons;
  const groups = new Set(mappings.map((m) => m.group).filter(Boolean)).size;

  if (!guild) return <div className="p-6 text-zinc-500 text-sm">Select a server first.</div>;

  return (
    <div className="page-shell-sm animate-fade-in">
      <PageHeader
        icon={Tags}
        title="Reaction Roles"
        subtitle={`Self-assign roles in ${guild.name}`}
        badge={`${mappings.length} maps`}
      />

      <div className="grid grid-cols-3 gap-3">
        <StatCard icon={MousePointerClick} label="Buttons" value={buttons} color="cyan" />
        <StatCard icon={SmilePlus} label="Reactions" value={reacts} color="purple" />
        <StatCard icon={Tags} label="Exclusive groups" value={groups} color="green" />
      </div>

      <div className="seg-tabs" role="tablist" aria-label="Reaction role sections">
        <button onClick={() => setTab('create')} role="tab" aria-selected={tab === 'create'} className={tab === 'create' ? 'seg-tab-active' : 'seg-tab'}>
          <Plus size={12} aria-hidden="true" /> New panel
        </button>
        <button onClick={() => setTab('list')} role="tab" aria-selected={tab === 'list'} className={tab === 'list' ? 'seg-tab-active' : 'seg-tab'}>
          <Tags size={12} aria-hidden="true" /> Mappings
          {mappings.length > 0 && <span className="cyber-badge-cyan tabular-nums">{mappings.length}</span>}
        </button>
      </div>

      {tab === 'create' && (
        <div className="space-y-4 animate-fade-in">
          <div className="cyber-info">
            <Info size={14} className="text-cyan-300 flex-shrink-0 mt-0.5" aria-hidden="true" />
            <p className="text-xs text-zinc-400 leading-relaxed">
              <strong className="text-zinc-200">Buttons</strong> are easier for members. <strong className="text-zinc-200">Reactions</strong> stay compatible with `/reactionrole`.
              Exclusive group = only one role from the set at a time (colors, platforms…).
            </p>
          </div>

          {botCanManage === false && (
            <div className="rounded-xl border border-red-400/30 bg-red-400/10 p-3 flex gap-2" role="alert">
              <AlertTriangle size={14} className="text-red-300 flex-shrink-0 mt-0.5" aria-hidden="true" />
              <p className="text-xs text-red-200 leading-relaxed">
                The bot does not have the <strong>Manage Roles</strong> permission, so no self-assignable role can be given out yet.
              </p>
            </div>
          )}
          {badRows.length > 0 && botTop != null && (
            <div className="rounded-xl border border-amber-400/30 bg-amber-400/10 p-3 flex gap-2" role="alert">
              <AlertTriangle size={14} className="text-amber-300 flex-shrink-0 mt-0.5" aria-hidden="true" />
              <p className="text-xs text-amber-200 leading-relaxed">
                {badRows.map((r) => roles.find((x) => x.id === r.roleId)?.name || 'A role').join(', ')} {badRows.length === 1 ? 'is' : 'are'} above the bot&apos;s highest role.
                Move the bot role above {badRows.length === 1 ? 'it' : 'them'} in Server Settings → Roles, or members will see “I cannot manage…”.
              </p>
            </div>
          )}

          <div className="cyber-card p-5 space-y-4">
            <div className="grid grid-cols-2 gap-2" role="group" aria-label="Panel style">
              {[
                { id: 'button', title: 'Buttons', text: 'Click to toggle' },
                { id: 'reaction', title: 'Reactions', text: 'Emoji on the message' },
              ].map((s) => (
                <button
                  key={s.id}
                  onClick={() => setStyle(s.id)}
                  aria-pressed={style === s.id}
                  className={`text-left p-3 min-h-[56px] rounded-xl border transition-all ${style === s.id ? 'border-cyan-300/40 bg-cyan-400/10' : 'border-white/10 hover:border-white/20'}`}
                >
                  <p className="text-xs font-semibold text-white">{s.title}</p>
                  <p className="text-[11px] text-zinc-400">{s.text}</p>
                </button>
              ))}
            </div>

            <div>
              <label className="cyber-label mb-1.5">Channel</label>
              <select value={channelId} onChange={(e) => setChannelId(e.target.value)} className="cyber-select">
                <option value="">— Select —</option>
                {channels.map((c) => <option key={c.id} value={c.id}>#{c.name}</option>)}
              </select>
            </div>

            <div className="grid md:grid-cols-[1fr_auto] gap-3 items-end">
              <div>
                <label className="cyber-label mb-1.5">Title</label>
                <input value={title} onChange={(e) => setTitle(e.target.value)} className="cyber-input" maxLength={256} />
              </div>
              <div>
                <label className="cyber-label mb-1.5">Color</label>
                <div className="flex gap-2">
                  <input type="color" value={color} onChange={(e) => setColor(e.target.value)} aria-label="Panel color" className="h-10 w-14 rounded-lg border border-cyan-500/20 bg-transparent p-1" />
                  <input value={color} onChange={(e) => setColor(e.target.value)} aria-label="Panel color hex" className="cyber-input font-mono text-xs w-24" maxLength={7} />
                </div>
              </div>
            </div>
            <div>
              <label className="cyber-label mb-1.5">Description</label>
              <textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} className="cyber-input resize-none" />
            </div>

            <CyanToggle
              enabled={unique}
              onChange={setUnique}
              label="Exclusive group"
              description="Picking one role in this panel removes the others"
            />
            {unique && (
              <input value={group} onChange={(e) => setGroup(e.target.value)} className="cyber-input" placeholder="group name, e.g. colors" />
            )}
          </div>

          <div className="cyber-card p-5 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">Roles</p>
              <button onClick={addRow} className="cyber-button text-[11px] inline-flex items-center gap-1"><Plus size={11} /> Add</button>
            </div>
            {rows.map((row, i) => (
              <div key={i} className="grid grid-cols-[72px_1fr_1fr_32px] gap-2 items-center">
                <input value={row.emoji} onChange={(e) => setRow(i, { emoji: e.target.value })} className="cyber-input text-center" placeholder="✅" />
                <select value={row.roleId} onChange={(e) => setRow(i, { roleId: e.target.value })} className="cyber-select text-xs">
                  <option value="">— Role —</option>
                  {roles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}{botTop != null && typeof r.position === 'number' && r.position >= botTop ? ' ⚠ (above bot)' : ''}
                    </option>
                  ))}
                </select>
                <input value={row.label} onChange={(e) => setRow(i, { label: e.target.value })} className="cyber-input text-xs" placeholder="Button label" />
                <button onClick={() => delRow(i)} className="text-zinc-600 hover:text-red-400" disabled={rows.length <= 1}>
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>

          <div className="cyber-card p-4">
            <p className="text-[10px] uppercase tracking-wide text-zinc-500 mb-2">Preview</p>
            <div className="rounded-r-lg p-3 bg-[#2f3136]" style={{ borderLeft: `4px solid ${color}` }}>
              <p className="text-sm font-bold text-white">{title}</p>
              <p className="text-xs text-zinc-400 mt-1 whitespace-pre-wrap">{description}</p>
              <div className="flex flex-wrap gap-1.5 mt-3">
                {rows.filter((r) => r.roleId).map((r, i) => (
                  <span key={i} className="inline-flex items-center gap-1 px-2 py-1 rounded bg-white/10 text-[11px] text-white">
                    {r.emoji} {r.label || roles.find((x) => x.id === r.roleId)?.name}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <button onClick={post} disabled={posting} className="cyber-button-solid inline-flex items-center gap-2">
            {posting ? <Loader size={13} className="animate-spin" /> : <Send size={13} />}
            {posting ? 'Posting…' : 'Post panel'}
          </button>
        </div>
      )}

      {tab === 'list' && (
        <div className="space-y-4 animate-fade-in">
          <div className="relative">
            <Search size={13} className="absolute start-3 top-1/2 -translate-y-1/2 text-zinc-500" aria-hidden="true" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter role, emoji, group…" aria-label="Filter role mappings" className="cyber-input ps-9 text-xs" />
          </div>
          {loading ? (
            <div className="space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="h-14 skeleton rounded-xl" />)}</div>
          ) : filtered.length === 0 ? (
            <EmptyState icon={Tags} title="No role mappings" subtitle="Post a panel or use /reactionrole setup." />
          ) : (
            <div className="space-y-1.5">
              {filtered.map((m) => {
                const role = roles.find((r) => r.id === m.roleId);
                const stuck = botTop != null && role && typeof role.position === 'number' && role.position >= botTop;
                return (
                  <div key={m.id} className="flex items-center gap-3 p-2.5 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                    <span className="text-lg w-8 text-center">{m.emoji || '🔘'}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-white truncate">
                        {m.label || role?.name || m.roleId}
                        {stuck && <span className="ml-1.5 inline-flex items-center gap-0.5 text-amber-300 font-normal" title="Above the bot role — move the bot role above it in Server Settings → Roles"><AlertTriangle size={11} aria-hidden="true" /> above bot</span>}
                      </p>
                      <p className="text-[10px] text-zinc-500 tabular-nums">
                        {m.style} · {m.mode}{m.group ? ` · group ${m.group}` : ''}
                        {m.channelId ? ` · #${channels.find((c) => c.id === m.channelId)?.name || m.channelId}` : ''}
                      </p>
                    </div>
                    <button onClick={() => setConfirm(m.id)} className="w-8 h-8 flex items-center justify-center rounded-lg text-zinc-500 hover:text-red-300 hover:bg-red-500/10 transition-colors flex-shrink-0" title="Remove mapping" aria-label={`Remove role mapping ${m.label || m.roleId || ''}`}>
                      <Trash2 size={14} aria-hidden="true" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <ConfirmModal
        open={!!confirm}
        title="Remove mapping"
        message="Members keep the role. Only the button / reaction stops working."
        confirmLabel="Remove"
        variant="danger"
        onCancel={() => setConfirm(null)}
        onConfirm={() => remove(confirm)}
      />
    </div>
  );
}

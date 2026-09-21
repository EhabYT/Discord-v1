import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Hash, Plus, Trash2, Save, Copy, Search, Loader, Info } from 'lucide-react';
import PageHeader from '../components/PageHeader.jsx';
import StatCard from '../components/StatCard.jsx';
import EmptyState from '../components/EmptyState.jsx';
import ConfirmModal from '../components/ConfirmModal.jsx';
import { useToast } from '../components/Toast.jsx';
import api from '../api.js';

export default function Tags({ guild, permLevel = 0 }) {
  const toast = useToast();
  // Both tag writes (upsert, delete) require Mod (2) backend-side.
  const canAct = permLevel >= 2;
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [name, setName] = useState('');
  const [content, setContent] = useState('');
  const [editing, setEditing] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState(null);

  const load = useCallback(async () => {
    if (!guild?.id) return;
    setLoading(true);
    try {
      const d = await api.get(`/api/guild/${guild.id}/tags`);
      setItems(d.tags || []);
    } catch (e) { toast.error(e.message || 'Failed to load tags.'); }
    setLoading(false);
  }, [guild?.id]);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!canAct) { toast.error('Mod access required.'); return; }
    if (!name.trim() || !content.trim()) {
      toast.error('Name and content are required.');
      return;
    }
    setSaving(true);
    try {
      await api.post(`/api/guild/${guild.id}/tags`, { name: name.trim(), content: content.trim() });
      toast.success(editing ? 'Tag updated' : 'Tag saved');
      setName(''); setContent(''); setEditing('');
      await load();
    } catch (e) { toast.error(e.message || 'Save failed'); }
    setSaving(false);
  };

  const remove = async (tagName) => {
    if (!canAct) { toast.error('Mod access required.'); return; }
    try {
      await api.delete(`/api/guild/${guild.id}/tags/${encodeURIComponent(tagName)}`);
      setItems((prev) => prev.filter((t) => t.name !== tagName));
      if (editing === tagName) { setName(''); setContent(''); setEditing(''); }
      toast.success('Tag deleted');
    } catch (e) { toast.error(e.message || 'Delete failed'); }
    setConfirm(null);
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((t) => `${t.name} ${t.content}`.toLowerCase().includes(q));
  }, [items, query]);

  if (!guild) return <div className="p-6 text-zinc-400 text-sm">Select a server first.</div>;

  return (
    <div className="page-shell-sm animate-fade-in">
      <PageHeader icon={Hash} title="Tags" subtitle={`Reusable snippets for ${guild.name}`} badge={`${items.length}`} badgeColor="cyan" />

      {!canAct && (
        <p className="text-[11px] text-amber-300/80 flex items-center gap-1.5" role="note">Read-only access — Mod level or higher is required to save or delete tags.</p>
      )}

      <StatCard icon={Hash} label="Tags" value={items.length} color="cyan" />

      <div className="cyber-card p-5 space-y-3">
        <p className="text-xs font-semibold text-white">{editing ? `Edit · ${editing}` : 'New tag'}</p>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="name (faq, rules, links…)" aria-label="Tag name" className="cyber-input text-xs font-mono" disabled={!!editing} />
        <textarea rows={4} value={content} onChange={(e) => setContent(e.target.value)} placeholder="Content members see with /tag get" aria-label="Tag content" className="cyber-input resize-none text-xs" />
        <div className="flex gap-2 flex-wrap">
          <button onClick={save} disabled={saving || !canAct} title={canAct ? undefined : 'Mod access required'} className="cyber-button-solid text-xs flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed">
            {saving ? <Loader size={12} className="animate-spin" aria-hidden="true" /> : editing ? <Save size={12} aria-hidden="true" /> : <Plus size={12} aria-hidden="true" />}
            {editing ? 'Update' : 'Save tag'}
          </button>
          {editing && (
            <button onClick={() => { setEditing(''); setName(''); setContent(''); }} className="cyber-button text-xs">Cancel</button>
          )}
        </div>
        <p className="text-[11px] text-zinc-500 inline-flex items-center gap-1.5">
          <Info size={11} aria-hidden="true" /> Members use <span className="font-mono text-cyan-200">/tag get name</span>
        </p>
      </div>

      <div className="relative">
        <Search size={13} className="absolute start-3 top-1/2 -translate-y-1/2 text-zinc-500" aria-hidden="true" />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search tags…" aria-label="Search tags" className="cyber-input ps-9 text-xs" />
      </div>

      {loading ? (
        <div className="space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="h-16 skeleton rounded-xl" />)}</div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={Hash} title="No tags yet" subtitle="Save FAQs, rules or links. Staff needs Manage Messages in Discord." />
      ) : (
        <div className="space-y-2">
          {filtered.map((t) => (
            <div key={t.name} className="cyber-card p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-mono text-xs text-cyan-200">/{t.name}</p>
                  <p className="text-xs text-zinc-400 mt-1 whitespace-pre-wrap line-clamp-4">{t.content}</p>
                </div>
                <div className="flex gap-1.5 flex-shrink-0 items-center">
                  <button
                    onClick={async () => {
                      try { await navigator.clipboard.writeText(t.content); toast.success('Copied'); }
                      catch (e) { toast.error(e.message || 'Copy failed'); }
                    }}
                    className="cyber-icon-button" title={`Copy tag ${t.name}`} aria-label={`Copy tag ${t.name}`}
                  >
                    <Copy size={12} aria-hidden="true" />
                  </button>
                  <button onClick={() => { setEditing(t.name); setName(t.name); setContent(t.content); }} disabled={!canAct} title={canAct ? undefined : 'Mod access required'} className="cyber-button text-[11px] min-h-[36px] disabled:opacity-50 disabled:cursor-not-allowed">Edit</button>
                  <button onClick={() => setConfirm(t.name)} disabled={!canAct} className="w-9 h-9 flex items-center justify-center rounded-xl text-zinc-500 hover:text-red-300 hover:bg-red-500/10 transition-colors flex-shrink-0 disabled:opacity-40 disabled:cursor-not-allowed" title={canAct ? `Delete tag ${t.name}` : 'Mod access required'} aria-label={`Delete tag ${t.name}`}>
                    <Trash2 size={13} aria-hidden="true" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmModal
        open={!!confirm}
        title="Delete tag"
        message={`Remove /${confirm}? Members will no longer be able to /tag get it.`}
        confirmLabel="Delete"
        variant="danger"
        onCancel={() => setConfirm(null)}
        onConfirm={() => remove(confirm)}
      />
    </div>
  );
}

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Hash, Plus, Trash2, Save, Copy, Search, Loader, Info } from 'lucide-react';
import PageHeader from '../components/PageHeader.jsx';
import StatCard from '../components/StatCard.jsx';
import EmptyState from '../components/EmptyState.jsx';
import ConfirmModal from '../components/ConfirmModal.jsx';
import { useToast } from '../components/Toast.jsx';
import api from '../api.js';

export default function Tags({ guild }) {
  const toast = useToast();
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
    } catch { setItems([]); }
    setLoading(false);
  }, [guild?.id]);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
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

  if (!guild) return <div className="p-6 text-zinc-500 text-sm">Select a server first.</div>;

  return (
    <div className="page-shell-sm animate-fade-in">
      <PageHeader icon={Hash} title="Tags" subtitle={`Reusable snippets for ${guild.name}`} badge={`${items.length}`} badgeColor="cyan" />

      <StatCard icon={Hash} label="Tags" value={items.length} color="cyan" />

      <div className="cyber-card p-5 space-y-3">
        <p className="text-xs font-semibold text-white">{editing ? `Edit · ${editing}` : 'New tag'}</p>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="name (faq, rules, links…)" className="cyber-input text-xs font-mono" disabled={!!editing} />
        <textarea rows={4} value={content} onChange={(e) => setContent(e.target.value)} placeholder="Content members see with /tag get" className="cyber-input resize-none text-xs" />
        <div className="flex gap-2 flex-wrap">
          <button onClick={save} disabled={saving} className="cyber-button-solid text-xs flex items-center gap-1.5">
            {saving ? <Loader size={12} className="animate-spin" /> : editing ? <Save size={12} /> : <Plus size={12} />}
            {editing ? 'Update' : 'Save tag'}
          </button>
          {editing && (
            <button onClick={() => { setEditing(''); setName(''); setContent(''); }} className="cyber-button text-xs">Cancel</button>
          )}
        </div>
        <p className="text-[11px] text-zinc-600 inline-flex items-center gap-1.5">
          <Info size={11} /> Members use <span className="font-mono text-cyan-200">/tag get name</span>
        </p>
      </div>

      <div className="relative">
        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600" />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search tags…" className="cyber-input pl-9 text-xs" />
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
                <div className="flex gap-1.5 flex-shrink-0">
                  <button
                    onClick={async () => {
                      try { await navigator.clipboard.writeText(t.content); toast.success('Copied'); }
                      catch { toast.error('Copy failed'); }
                    }}
                    className="cyber-icon-button" title="Copy"
                  >
                    <Copy size={12} />
                  </button>
                  <button onClick={() => { setEditing(t.name); setName(t.name); setContent(t.content); }} className="cyber-button text-[11px]">Edit</button>
                  <button onClick={() => setConfirm(t.name)} className="text-zinc-600 hover:text-red-400"><Trash2 size={13} /></button>
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

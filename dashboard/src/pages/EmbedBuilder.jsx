import React, { useState } from 'react';
import {
  Send, Plus, Trash2, Hash, Palette, Lock, Save,
  Download, Upload, ChevronUp, ChevronDown, Clock, Link, Copy, Check
} from 'lucide-react';
import PageHeader from '../components/PageHeader.jsx';
import { useToast } from '../components/Toast.jsx';
import api from '../api.js';

/* ── Owner gate ─────────────────────────────────────────────────── */
function OwnerGate() {
  return (
    <div className="p-6 flex items-center justify-center min-h-[60vh]">
      <div className="text-center max-w-sm">
        <div className="w-16 h-16 rounded-2xl bg-yellow-500/10 border border-yellow-500/20 flex items-center justify-center mx-auto mb-4">
          <Lock size={28} className="text-yellow-400" />
        </div>
        <h2 className="text-lg font-bold text-white mb-2">Owner Only</h2>
        <p className="text-sm text-gray-500">The Embed Builder is restricted to server admins.</p>
      </div>
    </div>
  );
}

/* ── Color presets ─────────────────────────────────────────────── */
const COLOR_PRESETS = [
  { label: 'Cyan',    hex: '#00fbff' },
  { label: 'Blurple', hex: '#5865F2' },
  { label: 'Green',   hex: '#57F287' },
  { label: 'Yellow',  hex: '#FEE75C' },
  { label: 'Red',     hex: '#ED4245' },
  { label: 'Fuchsia', hex: '#EB459E' },
  { label: 'White',   hex: '#FFFFFF' },
  { label: 'Dark',    hex: '#2B2D31' },
  { label: 'Gold',    hex: '#F0B232' },
  { label: 'Teal',    hex: '#1ABC9C' },
  { label: 'Orange',  hex: '#E67E22' },
  { label: 'Navy',    hex: '#34495E' },
];

/* ── Template storage helpers ───────────────────────────────────── */
const STORAGE_KEY = 'eb_embed_templates';
const loadTemplates = () => { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; } };
const saveTemplates = (tpls) => localStorage.setItem(STORAGE_KEY, JSON.stringify(tpls));

/* ── Default embed state ────────────────────────────────────────── */
const BLANK = {
  channelId: '', title: '', titleUrl: '', description: '',
  color: '#00fbff',
  author: '', authorIconUrl: '',
  footer: '', footerIconUrl: '',
  image: '', thumbnail: '',
  addTimestamp: false,
  fields: [],
};

export default function EmbedBuilder({ guild, guildData, permLevel }) {
  const toast = useToast();
  const [embed,     setEmbed]     = useState({ ...BLANK });
  const [sending,   setSending]   = useState(false);
  const [copied,    setCopied]    = useState(false);
  const [templates, setTemplates] = useState(loadTemplates);
  const [tplName,   setTplName]   = useState('');
  const [showJson,  setShowJson]  = useState(false);
  const [showTpl,   setShowTpl]   = useState(false);

  const channels = guildData?.guild?.channels?.filter(c => c.type === 0) || [];

  if (!guild)        return <div className="p-6 text-gray-500 text-sm">Select a server first.</div>;
  if (permLevel < 3) return <OwnerGate />;

  /* ── Field helpers ─────────────────────────────────────────────── */
  const addField    = () => setEmbed(e => ({ ...e, fields: [...e.fields, { name: '', value: '', inline: false }] }));
  const updField    = (i, k, v) => setEmbed(e => { const f = [...e.fields]; f[i] = { ...f[i], [k]: v }; return { ...e, fields: f }; });
  const delField    = (i) => setEmbed(e => ({ ...e, fields: e.fields.filter((_, idx) => idx !== i) }));
  const moveField   = (i, dir) => setEmbed(e => {
    const f = [...e.fields];
    const j = i + dir;
    if (j < 0 || j >= f.length) return e;
    [f[i], f[j]] = [f[j], f[i]];
    return { ...e, fields: f };
  });

  /* ── Template helpers ──────────────────────────────────────────── */
  const saveTpl = () => {
    if (!tplName.trim()) { toast.error('Enter a template name first.'); return; }
    const tpls = [...templates.filter(t => t.name !== tplName.trim()), { name: tplName.trim(), data: { ...embed } }];
    saveTemplates(tpls);
    setTemplates(tpls);
    setTplName('');
    toast.success(`Template "${tplName.trim()}" saved!`);
  };
  const loadTpl = (tpl) => {
    setEmbed({ ...BLANK, ...tpl.data, channelId: embed.channelId });
    setShowTpl(false);
    toast.success(`Loaded template "${tpl.name}"`);
  };
  const deleteTpl = (name) => {
    const tpls = templates.filter(t => t.name !== name);
    saveTemplates(tpls);
    setTemplates(tpls);
  };

  /* ── JSON export ────────────────────────────────────────────────── */
  const exportJson = () => {
    const json = JSON.stringify(embed, null, 2);
    navigator.clipboard?.writeText(json).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
    toast.success('JSON copied to clipboard!');
  };

  const importJson = () => {
    const raw = prompt('Paste embed JSON:');
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      setEmbed(e => ({ ...BLANK, ...parsed, channelId: e.channelId }));
      toast.success('Embed imported!');
    } catch {
      toast.error('Invalid JSON — check the format and try again.');
    }
  };

  /* ── Send ───────────────────────────────────────────────────────── */
  const send = async () => {
    if (!embed.channelId)                       { toast.error('Select a destination channel.'); return; }
    if (!embed.title && !embed.description)     { toast.error('Add a title or description.'); return; }
    setSending(true);
    try {
      await api.post(`/api/guild/${guild.id}/embed`, embed);
      toast.success('Embed sent!');
      setEmbed(e => ({ ...e, title: '', titleUrl: '', description: '', image: '', thumbnail: '', fields: [], author: '', footer: '', addTimestamp: false }));
    } catch (err) {
      toast.error(err.message || 'Failed to send embed.');
    }
    setSending(false);
  };

  const pv = embed.color || '#00fbff';

  return (
    <div className="page-shell-sm animate-fade-in">
      <PageHeader icon={Send} title="Embed Builder" subtitle={`Compose and send rich embeds in ${guild.name}`} badge="Owner" badgeColor="yellow">
        <button onClick={() => setShowJson(v => !v)} className="cyber-button flex items-center gap-1.5 text-xs">
          {showJson ? <ChevronUp size={12} /> : <Download size={12} />} JSON
        </button>
        <button onClick={() => setShowTpl(v => !v)} className="cyber-button flex items-center gap-1.5 text-xs">
          <Save size={12} /> Templates{templates.length > 0 && <span className="cyber-badge-cyan ml-1">{templates.length}</span>}
        </button>
      </PageHeader>

      {/* JSON panel */}
      {showJson && (
        <div className="cyber-card p-4 animate-fade-in">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Embed JSON</span>
            <div className="flex gap-2">
              <button onClick={importJson} className="cyber-button flex items-center gap-1 text-xs">
                <Upload size={11} /> Import
              </button>
              <button onClick={exportJson} className="cyber-button flex items-center gap-1 text-xs">
                {copied ? <Check size={11} className="text-green-400" /> : <Copy size={11} />}
                {copied ? 'Copied!' : 'Copy JSON'}
              </button>
            </div>
          </div>
          <pre className="text-[10px] text-cyan-400/80 font-mono leading-relaxed overflow-x-auto max-h-48 bg-black/20 rounded-xl p-3">
            {JSON.stringify(embed, null, 2)}
          </pre>
        </div>
      )}

      {/* Templates panel */}
      {showTpl && (
        <div className="cyber-card p-4 animate-fade-in space-y-3">
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Saved Templates</span>
          <div className="flex gap-2">
            <input type="text" placeholder="Template name…" value={tplName}
              onChange={e => setTplName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && saveTpl()}
              className="cyber-input text-xs" />
            <button onClick={saveTpl} className="cyber-button-solid flex-shrink-0 flex items-center gap-1 text-xs px-3">
              <Save size={11} /> Save
            </button>
          </div>
          {templates.length === 0 ? (
            <p className="text-xs text-gray-600 text-center py-3">No saved templates yet</p>
          ) : (
            <div className="space-y-1.5 max-h-40 overflow-y-auto">
              {templates.map(t => (
                <div key={t.name} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/[0.04] border border-white/[0.07]">
                  <span className="text-xs text-gray-300 flex-1 truncate">{t.name}</span>
                  <button onClick={() => loadTpl(t)} className="text-[10px] text-cyan-400 hover:text-cyan-300 transition-colors">Load</button>
                  <button onClick={() => deleteTpl(t.name)} className="text-gray-600 hover:text-red-400 transition-colors"><Trash2 size={11} /></button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Live preview */}
      <div className="cyber-card p-5">
        <p className="cyber-label mb-3 flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_5px_rgba(0,255,255,0.7)]" /> Live Preview
        </p>
        <div className="rounded-xl overflow-hidden border border-white/[0.08] bg-[#36393f]">
          <div className="flex">
            <div className="w-1 flex-shrink-0" style={{ background: pv }} />
            <div className="p-4 flex-1 space-y-1.5 min-w-0">
              {embed.author && <p className="text-[11px] text-gray-300 font-semibold">{embed.author}</p>}
              {embed.title
                ? <p className="text-sm font-bold text-white">{embed.title}</p>
                : !embed.description && !embed.author && (
                    <p className="text-xs text-gray-600 italic">Fill in the fields below…</p>
                  )
              }
              {embed.description && <p className="text-xs text-gray-300 leading-relaxed whitespace-pre-wrap">{embed.description}</p>}
              {embed.image && (
                <img src={embed.image} alt="" className="rounded-lg max-h-40 object-cover mt-2 w-full" onError={e => e.target.style.display='none'} />
              )}
              {embed.fields.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {embed.fields.map((f, i) => (
                    <div key={i} className={f.inline ? 'flex-1 min-w-[100px]' : 'w-full'}>
                      <p className="text-[10px] text-white font-bold">{f.name || 'Field Name'}</p>
                      <p className="text-[10px] text-gray-300">{f.value || 'Field value'}</p>
                    </div>
                  ))}
                </div>
              )}
              {(embed.footer || embed.addTimestamp) && (
                <div className="flex items-center gap-2 pt-2 border-t border-white/10">
                  {embed.footer && <p className="text-[10px] text-gray-600 flex-1">{embed.footer}</p>}
                  {embed.addTimestamp && (
                    <p className="text-[10px] text-gray-600">
                      {new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                    </p>
                  )}
                </div>
              )}
            </div>
            {embed.thumbnail && (
              <div className="p-3 flex-shrink-0">
                <img src={embed.thumbnail} alt="" className="w-16 h-16 rounded-lg object-cover"
                  onError={e => e.target.style.display='none'} />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Form */}
      <div className="cyber-card p-5 space-y-4">
        {/* Destination + Color */}
        <div>
          <label className="cyber-label mb-1.5 flex items-center gap-1"><Hash size={10} /> Destination Channel</label>
          <select value={embed.channelId} onChange={e => setEmbed(em => ({ ...em, channelId: e.target.value }))} className="cyber-select">
            <option value="">— Select channel —</option>
            {channels.map(c => <option key={c.id} value={c.id}>#{c.name}</option>)}
          </select>
        </div>

        {/* Color + presets */}
        <div>
          <label className="cyber-label mb-2 flex items-center gap-1"><Palette size={10} /> Accent Color</label>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {COLOR_PRESETS.map(p => (
              <button key={p.hex} title={p.label} onClick={() => setEmbed(em => ({ ...em, color: p.hex }))}
                className="w-6 h-6 rounded-md border-2 transition-all hover:scale-110"
                style={{ background: p.hex, borderColor: embed.color === p.hex ? '#fff' : 'transparent' }} />
            ))}
          </div>
          <div className="flex gap-2 items-center">
            <input type="color" value={embed.color}
              onChange={e => setEmbed(em => ({ ...em, color: e.target.value }))}
              className="h-9 w-12 rounded-lg border border-cyan-500/20 cursor-pointer p-0.5 bg-transparent" />
            <input type="text" value={embed.color} maxLength={7}
              onChange={e => setEmbed(em => ({ ...em, color: e.target.value }))}
              className="cyber-input font-mono text-xs w-28" />
          </div>
        </div>

        {/* Author */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="cyber-label mb-1.5">Author Name</label>
            <input type="text" placeholder="Author" value={embed.author}
              onChange={e => setEmbed(em => ({ ...em, author: e.target.value }))} className="cyber-input" />
          </div>
          <div>
            <label className="cyber-label mb-1.5">Author Icon URL</label>
            <input type="text" placeholder="https://…" value={embed.authorIconUrl}
              onChange={e => setEmbed(em => ({ ...em, authorIconUrl: e.target.value }))} className="cyber-input" />
          </div>
        </div>

        {/* Title + URL */}
        <div className="grid grid-cols-[1fr_1fr] gap-3">
          <div>
            <label className="cyber-label mb-1.5">Title</label>
            <input type="text" placeholder="Embed title" value={embed.title}
              onChange={e => setEmbed(em => ({ ...em, title: e.target.value }))} className="cyber-input" />
          </div>
          <div>
            <label className="cyber-label mb-1.5 flex items-center gap-1"><Link size={9} /> Title URL (clickable)</label>
            <input type="text" placeholder="https://…" value={embed.titleUrl}
              onChange={e => setEmbed(em => ({ ...em, titleUrl: e.target.value }))} className="cyber-input" />
          </div>
        </div>

        {/* Description */}
        <div>
          <label className="cyber-label mb-1.5">Description</label>
          <textarea rows={4} placeholder="Main body text…" value={embed.description}
            onChange={e => setEmbed(em => ({ ...em, description: e.target.value }))}
            className="cyber-input resize-none" />
        </div>

        {/* Images */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="cyber-label mb-1.5">Large Image URL</label>
            <input type="text" placeholder="https://…" value={embed.image}
              onChange={e => setEmbed(em => ({ ...em, image: e.target.value }))} className="cyber-input" />
          </div>
          <div>
            <label className="cyber-label mb-1.5">Thumbnail URL</label>
            <input type="text" placeholder="https://…" value={embed.thumbnail}
              onChange={e => setEmbed(em => ({ ...em, thumbnail: e.target.value }))} className="cyber-input" />
          </div>
        </div>

        {/* Footer + timestamp */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="cyber-label mb-1.5">Footer Text</label>
            <input type="text" placeholder="Footer note…" value={embed.footer}
              onChange={e => setEmbed(em => ({ ...em, footer: e.target.value }))} className="cyber-input" />
          </div>
          <div>
            <label className="cyber-label mb-1.5">Footer Icon URL</label>
            <input type="text" placeholder="https://…" value={embed.footerIconUrl}
              onChange={e => setEmbed(em => ({ ...em, footerIconUrl: e.target.value }))} className="cyber-input" />
          </div>
        </div>

        {/* Timestamp toggle */}
        <label className="flex items-center gap-3 cursor-pointer group">
          <div className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-all ${
            embed.addTimestamp ? 'bg-cyan-500 border-cyan-500' : 'border-white/20 group-hover:border-cyan-500/40'
          }`}
            onClick={() => setEmbed(em => ({ ...em, addTimestamp: !em.addTimestamp }))}>
            {embed.addTimestamp && <Check size={10} className="text-black" />}
          </div>
          <div className="flex items-center gap-1.5">
            <Clock size={12} className="text-gray-500" />
            <span className="text-sm text-gray-400">Add current timestamp to footer</span>
          </div>
        </label>

        {/* Fields */}
        {embed.fields.length > 0 && (
          <div className="space-y-2">
            <p className="cyber-label">Inline Fields</p>
            {embed.fields.map((field, i) => (
              <div key={i} className="flex items-center gap-2 animate-fade-in" style={{ animationDelay: `${i * 30}ms` }}>
                <div className="flex flex-col gap-0.5 flex-shrink-0">
                  <button onClick={() => moveField(i, -1)} disabled={i === 0}
                    className="text-gray-700 hover:text-gray-400 disabled:opacity-20 transition-colors"><ChevronUp size={11} /></button>
                  <button onClick={() => moveField(i, 1)} disabled={i === embed.fields.length - 1}
                    className="text-gray-700 hover:text-gray-400 disabled:opacity-20 transition-colors"><ChevronDown size={11} /></button>
                </div>
                <input type="text" placeholder="Field name" value={field.name}
                  onChange={e => updField(i, 'name', e.target.value)} className="cyber-input text-xs flex-1" />
                <input type="text" placeholder="Field value" value={field.value}
                  onChange={e => updField(i, 'value', e.target.value)} className="cyber-input text-xs flex-1" />
                <label className="flex items-center gap-1 text-xs text-gray-500 cursor-pointer whitespace-nowrap flex-shrink-0">
                  <input type="checkbox" checked={field.inline}
                    onChange={e => updField(i, 'inline', e.target.checked)} className="accent-cyan-400" />
                  Inline
                </label>
                <button onClick={() => delField(i)} className="text-gray-600 hover:text-red-400 transition-colors flex-shrink-0">
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-1 flex-wrap">
          <button onClick={addField} className="cyber-button flex items-center gap-1.5 text-xs">
            <Plus size={12} /> Add Field
          </button>
          <button onClick={() => setEmbed({ ...BLANK, channelId: embed.channelId })}
            className="cyber-button flex items-center gap-1.5 text-xs text-gray-600 hover:text-gray-300">
            Clear
          </button>
          <button onClick={send} disabled={sending}
            className="cyber-button-solid flex items-center gap-2 ml-auto">
            <Send size={14} />
            {sending ? 'Sending…' : 'Send Embed'}
          </button>
        </div>
      </div>
    </div>
  );
}

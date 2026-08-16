import React, { useEffect, useState } from 'react';
import {
  Settings, Plus, Trash2, Save, Download, Upload, LogOut, Link2, Search, Power,
  Music2, RefreshCw,
} from 'lucide-react';
import PageHeader from '../components/PageHeader.jsx';
import CyanToggle from '../components/CyanToggle.jsx';
import ConfirmModal from '../components/ConfirmModal.jsx';
import { useToast } from '../components/Toast.jsx';
import api from '../api.js';

function Section({ icon: Icon, title, desc, children }) {
  return (
    <div className="cyber-card p-5 space-y-4">
      <div>
        <div className="flex items-center gap-2">
          <Icon size={15} className="text-cyan-400" />
          <h2 className="text-sm font-semibold text-white">{title}</h2>
        </div>
        {desc && <p className="text-xs text-gray-600 mt-1 ml-5">{desc}</p>}
      </div>
      {children}
    </div>
  );
}

export default function ServerSettings({ guild, guildData, setGuildData }) {
  const toast = useToast();
  const [customFilters, setCustomFilters] = useState([]);
  const [newFilter, setNewFilter] = useState('');
  const [xpEnabled, setXpEnabled] = useState(true);
  const [djRoleId, setDjRoleId] = useState('');
  const [webhook, setWebhook] = useState('');
  const [commands, setCommands] = useState([]);
  const [cmdQuery, setCmdQuery] = useState('');
  const [saving, setSaving] = useState('');
  const [leaveOpen, setLeaveOpen] = useState(false);
  const roles = guildData?.guild?.roles || [];

  useEffect(() => {
    if (guildData?.customFilters) setCustomFilters(guildData.customFilters);
    if (guildData?.guild) setXpEnabled(guildData.guild.xpEnabled !== false);
    if (guildData?.djrole) setDjRoleId(typeof guildData.djrole === 'string' ? guildData.djrole : guildData.djrole?.id || '');
  }, [guildData]);

  useEffect(() => {
    if (!guild?.id) return;
    api.get(`/api/guild/${guild.id}/commands`)
      .then((d) => setCommands(d.commands || []))
      .catch(() => setCommands([]));
  }, [guild?.id]);

  const addFilter = async () => {
    if (!newFilter.trim()) return;
    try {
      const result = await api.post(`/api/guild/${guild.id}/automod/custom`, { pattern: newFilter.trim() });
      setCustomFilters(result);
      setNewFilter('');
      toast.success('Filter added.');
    } catch { toast.error('Failed to add filter.'); }
  };

  const removeFilter = async (pattern) => {
    try {
      setCustomFilters(await api.post(`/api/guild/${guild.id}/automod/custom/delete`, { pattern }));
    } catch { toast.error('Failed to remove filter.'); }
  };

  const saveGeneral = async () => {
    setSaving('general');
    try {
      await api.post(`/api/guild/${guild.id}/config`, { xpEnabled, djRoleId: djRoleId || null });
      if (setGuildData) {
        setGuildData((prev) => prev ? {
          ...prev,
          djrole: djRoleId || null,
          guild: { ...(prev.guild || {}), xpEnabled },
        } : prev);
      }
      toast.success('Server options saved.');
    } catch { toast.error('Failed to save options.'); }
    setSaving('');
  };

  const saveWebhook = async () => {
    if (!webhook.trim()) { toast.warning('Paste a Discord webhook URL first.'); return; }
    setSaving('webhook');
    try {
      await api.post(`/api/guild/${guild.id}/webhook-logs`, { url: webhook.trim() });
      toast.success('Audit webhook connected.');
      setWebhook('');
    } catch (e) { toast.error(e.message || 'Invalid webhook.'); }
    setSaving('');
  };

  const toggleCommand = async (name, enabled) => {
    setCommands((prev) => prev.map((c) => c.name === name ? { ...c, enabled } : c));
    try {
      await api.post(`/api/guild/${guild.id}/commands/toggle`, { commandName: name, enabled });
    } catch {
      setCommands((prev) => prev.map((c) => c.name === name ? { ...c, enabled: !enabled } : c));
      toast.error('Failed to toggle command.');
    }
  };

  const downloadBackup = async () => {
    try {
      const data = await api.get(`/api/guild/${guild.id}/backup`);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `eb-backup-${guild.id}.json`;
      a.click();
      toast.success('Backup downloaded.');
    } catch { toast.error('Backup failed.'); }
  };

  const restoreBackup = async (file) => {
    if (!file) return;
    try {
      const json = JSON.parse(await file.text());
      await api.post(`/api/guild/${guild.id}/restore`, json);
      toast.success('Backup restored. Refresh the page.');
    } catch { toast.error('Restore failed — check the file.'); }
  };

  const leaveServer = async () => {
    try {
      await api.post(`/api/guild/${guild.id}/leave`);
      toast.success('Bot left the server.');
      setTimeout(() => window.location.reload(), 800);
    } catch (e) { toast.error(e.message || 'Could not leave.'); }
    setLeaveOpen(false);
  };

  if (!guild) return <div className="p-6 text-gray-500 text-sm">Select a server first.</div>;

  const filteredCmds = commands.filter((c) => c.name.includes(cmdQuery.toLowerCase()));
  const disabledCount = commands.filter((c) => !c.enabled).length;



  return (
    <div className="page-shell-sm animate-fade-in">
      <PageHeader icon={Settings} title="Settings" subtitle={`Prefixes, locale and server options for ${guild.name}`} />

      <div className="grid grid-cols-3 gap-3">
        <div className="cyber-card p-3 text-center">
          <p className="text-xl font-bold text-white">{guild.memberCount?.toLocaleString?.() || '—'}</p>
          <p className="text-[10px] text-zinc-600">Members</p>
        </div>
        <div className="cyber-card p-3 text-center">
          <p className="text-xl font-bold text-cyan-300">{commands.length}</p>
          <p className="text-[10px] text-zinc-600">Commands</p>
        </div>
        <div className="cyber-card p-3 text-center">
          <p className="text-xl font-bold text-yellow-300">{disabledCount}</p>
          <p className="text-[10px] text-zinc-600">Disabled</p>
        </div>
      </div>

      <Section icon={Power} title="General" desc="Core toggles for this server.">
        <CyanToggle
          enabled={xpEnabled}
          onChange={setXpEnabled}
          label="XP & Levels"
          description="Award XP for chat activity in this server"
        />
        <div>
          <label className="cyber-label mb-1.5 flex items-center gap-1"><Music2 size={11} /> DJ Role</label>
          <select value={djRoleId} onChange={(e) => setDjRoleId(e.target.value)} className="cyber-select">
            <option value="">— Anyone can use music —</option>
            {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </div>
        <button onClick={saveGeneral} disabled={saving === 'general'} className="cyber-button-solid flex items-center gap-2 text-xs">
          {saving === 'general' ? <RefreshCw size={12} className="animate-spin" /> : <Save size={12} />}
          Save options
        </button>
      </Section>

      <Section icon={Settings} title="Slash commands" desc="Disable a command in this server without removing it globally.">
        <div className="relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600" />
          <input value={cmdQuery} onChange={(e) => setCmdQuery(e.target.value)} placeholder="Filter commands…" className="cyber-input pl-9 text-xs" />
        </div>
        <div className="max-h-64 overflow-y-auto grid sm:grid-cols-2 gap-1.5">
          {filteredCmds.map((c) => (
            <label key={c.name} className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.06]">
              <span className="text-xs font-mono text-cyan-300 truncate">/{c.name}</span>
              <input type="checkbox" checked={c.enabled} onChange={(e) => toggleCommand(c.name, e.target.checked)} className="accent-cyan-400" />
            </label>
          ))}
          {filteredCmds.length === 0 && <p className="text-xs text-zinc-600 col-span-2 text-center py-4">No commands match.</p>}
        </div>
      </Section>

      <Section icon={Settings} title="Custom Word Filters" desc="Add regex patterns or words to block globally in this server.">
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Pattern or word to block…"
            value={newFilter}
            onChange={(e) => setNewFilter(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addFilter()}
            className="cyber-input font-mono text-xs"
          />
          <button onClick={addFilter} className="cyber-button-solid flex-shrink-0 flex items-center gap-1">
            <Plus size={14} />
          </button>
        </div>
        {customFilters.length === 0 ? (
          <p className="text-xs text-gray-600 text-center py-3">No custom filters added</p>
        ) : (
          <div className="space-y-1.5 max-h-48 overflow-y-auto">
            {customFilters.map((f, i) => (
              <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.06]">
                <code className="text-xs text-cyan-400 font-mono flex-1 truncate">{f}</code>
                <button onClick={() => removeFilter(f)} className="text-gray-600 hover:text-red-400 transition-colors flex-shrink-0">
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section icon={Link2} title="Audit webhook" desc="Forward dashboard audit events to a Discord webhook.">
        <div className="flex gap-2">
          <input
            type="url"
            placeholder="https://discord.com/api/webhooks/…"
            value={webhook}
            onChange={(e) => setWebhook(e.target.value)}
            className="cyber-input text-xs"
          />
          <button onClick={saveWebhook} disabled={saving === 'webhook'} className="cyber-button-solid flex-shrink-0 text-xs">
            Connect
          </button>
        </div>
      </Section>

      <Section icon={Download} title="Backup & restore" desc="Download this server’s config or restore from a JSON file.">
        <div className="flex flex-wrap gap-2">
          <button onClick={downloadBackup} className="cyber-button flex items-center gap-1.5 text-xs">
            <Download size={12} /> Download backup
          </button>
          <label className="cyber-button flex items-center gap-1.5 text-xs cursor-pointer">
            <Upload size={12} /> Restore…
            <input type="file" accept="application/json" className="hidden" onChange={(e) => restoreBackup(e.target.files?.[0])} />
          </label>
        </div>
      </Section>

      <Section icon={LogOut} title="Danger zone" desc="The bot will leave this server. You can re-invite it later.">
        <button onClick={() => setLeaveOpen(true)} className="cyber-button-danger text-xs flex items-center gap-1.5">
          <LogOut size={12} /> Leave server
        </button>
      </Section>

      <ConfirmModal
        open={leaveOpen}
        title="Leave server?"
        message={`EB will leave ${guild.name}. Dashboard access for this guild is lost until you invite the bot again.`}
        confirmLabel="Leave"
        variant="danger"
        onConfirm={leaveServer}
        onCancel={() => setLeaveOpen(false)}
      />
    </div>
  );
}

import React, { useState, useEffect } from 'react';
import { Settings, Bot, Plus, Trash2 } from 'lucide-react';
import PageHeader from '../components/PageHeader.jsx';
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

export default function ServerSettings({ guild, guildData }) {
  const toast = useToast();
  const [nickname,    setNickname]    = useState('');
  const [savingNick,  setSavingNick]  = useState(false);
  const [customFilters, setCustomFilters] = useState([]);
  const [newFilter,   setNewFilter]   = useState('');

  useEffect(() => {
    if (guildData?.customFilters) setCustomFilters(guildData.customFilters);
  }, [guildData]);

  const saveNickname = async () => {
    setSavingNick(true);
    try {
      await api.post(`/api/guild/${guild.id}/nickname`, { nickname });
      toast.success('Bot nickname updated!');
    } catch {
      toast.error('Failed to update nickname.');
    }
    setSavingNick(false);
  };

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
      const result = await api.post(`/api/guild/${guild.id}/automod/custom/delete`, { pattern });
      setCustomFilters(result);
    } catch { toast.error('Failed to remove filter.'); }
  };

  if (!guild) return <div className="p-6 text-gray-500 text-sm">Select a server first.</div>;

  return (
    <div className="p-6 max-w-3xl mx-auto animate-fade-in space-y-4">
      <PageHeader icon={Settings} title="Server Settings" subtitle={`General configuration for ${guild.name}`} />

      {/* Bot Nickname */}
      <Section icon={Bot} title="Bot Nickname" desc="Change the bot's display name in this server.">
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="New nickname (blank = reset)"
            value={nickname}
            onChange={e => setNickname(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && saveNickname()}
            className="cyber-input"
            maxLength={32}
          />
          <button onClick={saveNickname} disabled={savingNick} className="cyber-button-solid flex-shrink-0">
            {savingNick ? 'Saving…' : 'Save'}
          </button>
        </div>
      </Section>

      {/* Custom Word Filters */}
      <Section icon={Settings} title="Custom Word Filters" desc="Add regex patterns or words to block globally in this server.">
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Pattern or word to block…"
            value={newFilter}
            onChange={e => setNewFilter(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addFilter()}
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
    </div>
  );
}

import React, { useState, useEffect } from 'react';
import { Zap, Plus, Trash2, Lock, MessageSquare, Hash } from 'lucide-react';
import PageHeader from '../components/PageHeader.jsx';
import ConfirmModal from '../components/ConfirmModal.jsx';
import { useToast } from '../components/Toast.jsx';
import api from '../api.js';

function OwnerGate() {
  return (
    <div className="p-6 flex items-center justify-center min-h-[60vh]">
      <div className="text-center max-w-sm">
        <div className="w-16 h-16 rounded-2xl bg-yellow-500/10 border border-yellow-500/20 flex items-center justify-center mx-auto mb-4">
          <Lock size={28} className="text-yellow-400" />
        </div>
        <h2 className="text-lg font-bold text-white mb-2">Owner Only</h2>
        <p className="text-sm text-gray-500">
          The Auto-Responder is restricted to server owners and admins. Contact a server admin to grant you access.
        </p>
      </div>
    </div>
  );
}

export default function AutoResponder({ guild, guildData, permLevel }) {
  const toast = useToast();
  const [triggers,     setTriggers]     = useState([]);
  const [newTrigger,   setNewTrigger]   = useState('');
  const [newResponse,  setNewResponse]  = useState('');
  const [exact,        setExact]        = useState(false);
  const [removeIndex,  setRemoveIndex]  = useState(null);
  const [saving,       setSaving]       = useState(false);
  const [query,        setQuery]        = useState('');

  useEffect(() => {
    if (guildData?.autoresponder) setTriggers(guildData.autoresponder);
  }, [guildData]);

  if (!guild) return <div className="p-6 text-gray-500 text-sm">Select a server first.</div>;
  if (permLevel < 3) return <OwnerGate />;

  const add = async () => {
    if (!newTrigger.trim() || !newResponse.trim()) {
      toast.error('Fill in both the trigger phrase and the bot response.');
      return;
    }
    setSaving(true);
    try {
      const result = await api.post(`/api/guild/${guild.id}/autoresponder`, {
        trigger: newTrigger.trim(),
        response: newResponse.trim(),
        exact,
      });
      setTriggers(result.responders || result || []);
      setNewTrigger('');
      setNewResponse('');
      setExact(false);
      toast.success(exact ? 'Exact trigger added!' : 'Trigger added!');
    } catch {
      toast.error('Failed to add trigger.');
    }
    setSaving(false);
  };

  const remove = async (i) => {
    const item = triggers[i];
    setSaving(true);
    try {
      if (item?.id) {
        const result = await api.delete(`/api/guild/${guild.id}/autoresponder/${item.id}`);
        setTriggers(result.responders || result || []);
      } else {
        const updated = triggers.filter((_, idx) => idx !== i);
        await api.post(`/api/guild/${guild.id}/config`, { autoresponder: updated });
        setTriggers(updated);
      }
      toast.success('Trigger removed.');
    } catch {
      toast.error('Failed to remove trigger.');
    }
    setSaving(false);
    setRemoveIndex(null);
  };

  return (
    <div className="page-shell-sm animate-fade-in">
      <PageHeader
        icon={Zap}
        title="Auto-Responder"
        subtitle={`Automatic replies triggered by keywords in ${guild.name}`}
        badge="Owner"
        badgeColor="yellow"
      />

      {/* How it works */}
      <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-cyan-500/[0.04] border border-cyan-500/[0.12]">
        <MessageSquare size={15} className="text-cyan-400 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-gray-400 leading-relaxed">
          When a message contains a <span className="text-cyan-400 font-mono">trigger phrase</span>, the bot immediately replies with the configured response. Matching is case-insensitive and partial (trigger phrase anywhere in the message).
        </p>
      </div>

      {/* Add trigger form */}
      <div className="cyber-card p-5 space-y-4">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-2">
          <Plus size={12} className="text-cyan-400" /> Add New Trigger
        </h2>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="cyber-label mb-1.5 flex items-center gap-1">
              <Hash size={10} /> Trigger Phrase
            </label>
            <input
              type="text"
              placeholder="e.g. !help, price, when launch"
              value={newTrigger}
              onChange={e => setNewTrigger(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && add()}
              className="cyber-input font-mono"
            />
          </div>
          <div>
            <label className="cyber-label mb-1.5">Bot Response</label>
            <input
              type="text"
              placeholder="e.g. Check the pins for help!"
              value={newResponse}
              onChange={e => setNewResponse(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && add()}
              className="cyber-input"
            />
          </div>
        </div>

        {/* Live mini preview */}
        {newTrigger && newResponse && (
          <div className="rounded-xl bg-[#36393f] border border-white/[0.08] p-3 space-y-2">
            <div className="flex items-start gap-2">
              <div className="w-6 h-6 rounded-full bg-gray-600/40 flex items-center justify-center text-[10px] text-gray-400 font-bold flex-shrink-0">U</div>
              <div className="flex-1 min-w-0">
                <span className="text-xs text-gray-400 font-semibold">User </span>
                <span className="text-[10px] text-gray-600">Today</span>
                <p className="text-xs text-gray-200 mt-0.5">
                  Hey, <span className="bg-cyan-500/20 text-cyan-300 px-1 rounded font-mono">{newTrigger}</span> anyone?
                </p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <img src="/eb_logo.svg" alt="" className="w-6 h-6 rounded-full object-cover flex-shrink-0 ring-1 ring-white/10" />
              <div className="flex-1 min-w-0">
                <span className="text-xs text-white font-semibold">𝑬𝑩 </span>
                <span className="text-[10px] text-gray-600">Today</span>
                <p className="text-xs text-gray-200 mt-0.5">{newResponse}</p>
              </div>
            </div>
          </div>
        )}

        <label className="flex items-center gap-2 text-xs text-zinc-400 cursor-pointer">
          <input type="checkbox" checked={exact} onChange={(e) => setExact(e.target.checked)} className="accent-cyan-400" />
          Exact match only (whole message must equal the trigger)
        </label>
        <button onClick={add} disabled={saving || !newTrigger.trim() || !newResponse.trim()}
          className="cyber-button-solid flex items-center gap-1.5 text-sm disabled:opacity-50">
          <Plus size={14} /> Add Trigger
        </button>
      </div>

      {/* Trigger list */}
      <div className="cyber-card p-5">
        <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Configured Triggers</h2>
          <div className="flex items-center gap-2">
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter…" className="cyber-input text-xs h-8 w-40" />
            <span className="text-xs text-gray-600">
              {triggers.length} {triggers.length === 1 ? 'trigger' : 'triggers'}
            </span>
          </div>
        </div>

        {triggers.length === 0 ? (
          <div className="text-center py-10">
            <Zap size={28} className="text-gray-700 mx-auto mb-2" />
            <p className="text-sm text-gray-600 font-medium">No triggers configured</p>
            <p className="text-xs text-gray-700 mt-1">Add a trigger above to get started.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {triggers.map((item, i) => {
              if (query.trim()) {
                const q = query.toLowerCase();
                const hit = (item.trigger || '').toLowerCase().includes(q) || (item.response || '').toLowerCase().includes(q);
                if (!hit) return null;
              }
              return (
              <div key={i}
                className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/[0.07] hover:border-white/[0.12] transition-all group animate-fade-in"
                style={{ animationDelay: `${i * 45}ms` }}>
                <Zap size={13} className="text-cyan-500/50 flex-shrink-0" />
                <div className="flex-1 min-w-0 grid grid-cols-2 gap-4">
                  <div className="min-w-0">
                    <p className="text-[10px] text-gray-600 uppercase tracking-wide mb-0.5">Trigger</p>
                    <p className="text-xs text-cyan-400 font-mono truncate">
                      {item.trigger}{item.exact ? <span className="ml-1 text-[9px] text-zinc-500">exact</span> : null}
                    </p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] text-gray-600 uppercase tracking-wide mb-0.5">Response</p>
                    <p className="text-xs text-gray-300 truncate">{item.response}</p>
                  </div>
                </div>
                <button
                  onClick={() => setRemoveIndex(i)}
                  className="text-gray-700 hover:text-red-400 transition-colors flex-shrink-0 opacity-0 group-hover:opacity-100">
                  <Trash2 size={14} />
                </button>
              </div>
              );
            })}
          </div>
        )}
      </div>

      <ConfirmModal
        open={removeIndex !== null}
        title="Remove Trigger"
        message={`Remove the trigger "${triggers[removeIndex]?.trigger}"? The bot will no longer respond to it.`}
        confirmLabel="Remove"
        cancelLabel="Keep"
        variant="danger"
        onConfirm={() => remove(removeIndex)}
        onCancel={() => setRemoveIndex(null)}
      />
    </div>
  );
}

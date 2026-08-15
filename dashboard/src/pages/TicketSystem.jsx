import React, { useState, useEffect } from 'react';
import { Ticket, Save, Clock, User, Hash, Plus, Settings, X, ChevronRight, CheckCircle, AlertCircle, Loader } from 'lucide-react';
import PageHeader from '../components/PageHeader.jsx';
import ConfirmModal from '../components/ConfirmModal.jsx';
import { useToast } from '../components/Toast.jsx';
import api from '../api.js';

const STATUS_STYLES = {
  open:    'cyber-badge-green',
  closed:  'bg-gray-500/10 text-gray-400 border-gray-500/30 cyber-badge',
  pending: 'cyber-badge-yellow',
};

export default function TicketSystem({ guild, guildData }) {
  const toast = useToast();
  const [config, setConfig] = useState({
    categoryId: null,
    transcriptChannelId: null,
    supportRoleId: null,
    panelChannelId: null,
    panelTitle: 'Support Tickets',
    panelDescription: 'Click the button below to open a ticket.',
    maxOpen: 1,
  });
  const [tickets, setTickets] = useState([]);
  const [tab, setTab] = useState('config');
  const [saving, setSaving] = useState(false);
  const [posting, setPosting] = useState(false);
  const [confirmClose, setConfirmClose] = useState(null);
  const [ticketFilter, setTicketFilter] = useState('all');
  const [ticketQuery, setTicketQuery] = useState('');

  const refreshTickets = () => {
    if (!guild?.id) return;
    api.get(`/api/guild/${guild.id}/tickets`).then(setTickets).catch(() => {});
  };

  const channels   = guildData?.guild?.channels || [];
  const categories = channels.filter(c => c.type === 4);
  const textChs    = channels.filter(c => c.type === 0);
  const roles      = guildData?.guild?.roles || [];

  useEffect(() => {
    if (guildData?.tickets) setConfig(prev => ({ ...prev, ...guildData.tickets }));
    if (guild?.id) api.get(`/api/guild/${guild.id}/tickets`).then(setTickets).catch(() => {});
  }, [guildData, guild?.id]);

  const save = async () => {
    setSaving(true);
    try {
      await api.post(`/api/guild/${guild.id}/tickets`, config);
      toast.success('Ticket configuration saved!');
    } catch {
      toast.error('Failed to save configuration.');
    }
    setSaving(false);
  };

  const postPanel = async () => {
    if (!config.panelChannelId) { toast.warning('Select a channel to post the panel in.'); return; }
    setPosting(true);
    try {
      await api.post(`/api/guild/${guild.id}/tickets/panel`, {
        channelId: config.panelChannelId,
        title: config.panelTitle,
        description: config.panelDescription,
      });
      toast.success('Ticket panel posted successfully!');
    } catch {
      toast.error('Failed to post the panel.');
    }
    setPosting(false);
  };

  const closeTicket = async (ticketId) => {
    try {
      await api.post(`/api/guild/${guild.id}/tickets/${ticketId}/close`);
      setTickets(prev => prev.map(t => t.id === ticketId ? { ...t, status: 'closed' } : t));
      toast.success('Ticket closed.');
    } catch {
      toast.error('Failed to close ticket.');
    }
    setConfirmClose(null);
  };

  if (!guild) {return (
    <div className="p-6 flex items-center justify-center h-64">
      <p className="text-gray-600 text-sm">Select a server first.</p>
    </div>
  );}

  const openCount   = tickets.filter(t => t.status === 'open' || !t.status).length;
  const closedCount = tickets.filter(t => t.status === 'closed').length;

  return (
    <div className="page-shell-sm animate-fade-in">
      <PageHeader
        icon={Ticket}
        title="Ticket System"
        subtitle={`Support ticket management for ${guild.name}`}
        badge={openCount > 0 ? `${openCount} open` : undefined}
        badgeColor="green"
      />

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        {[
          { label: 'Total Tickets',  value: tickets.length,  color: 'text-white' },
          { label: 'Open',           value: openCount,        color: 'text-green-400' },
          { label: 'Closed',         value: closedCount,      color: 'text-gray-500' },
        ].map(s => (
          <div key={s.label} className="cyber-card p-3.5 text-center">
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-gray-600 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="seg-tabs mb-1">
        {[
          { id: 'config',  label: 'Configuration', icon: Settings },
          { id: 'panel',   label: 'Create Panel',  icon: Plus },
          { id: 'tickets', label: 'Tickets', icon: Ticket, badge: openCount || undefined },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={tab === t.id ? 'seg-tab-active' : 'seg-tab'}
          >
            <t.icon size={13} />
            {t.label}
            {t.badge ? <span className="cyber-badge-green">{t.badge}</span> : null}
          </button>
        ))}
      </div>

      {/* Configuration tab */}
      {tab === 'config' && (
        <div className="cyber-card p-5 animate-fade-in">
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-gray-500 block mb-1.5">Ticket Category</label>
              <select
                value={config.categoryId || ''}
                onChange={e => setConfig(c => ({ ...c, categoryId: e.target.value || null }))}
                className="cyber-select"
              >
                <option value="">— None —</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <p className="text-[11px] text-gray-600 mt-1">New ticket channels are created here</p>
            </div>

            <div>
              <label className="text-xs text-gray-500 block mb-1.5">Transcript Channel</label>
              <select
                value={config.transcriptChannelId || ''}
                onChange={e => setConfig(c => ({ ...c, transcriptChannelId: e.target.value || null }))}
                className="cyber-select"
              >
                <option value="">— None —</option>
                {textChs.map(c => <option key={c.id} value={c.id}>#{c.name}</option>)}
              </select>
              <p className="text-[11px] text-gray-600 mt-1">Closed ticket transcripts sent here</p>
            </div>

            <div>
              <label className="text-xs text-gray-500 block mb-1.5">Support Role</label>
              <select
                value={config.supportRoleId || ''}
                onChange={e => setConfig(c => ({ ...c, supportRoleId: e.target.value || null }))}
                className="cyber-select"
              >
                <option value="">— None —</option>
                {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
              <p className="text-[11px] text-gray-600 mt-1">Role that can see & manage all tickets</p>
            </div>

            <div>
              <label className="text-xs text-gray-500 block mb-1.5">Max Open Per User</label>
              <input
                type="number"
                value={config.maxOpen || 1}
                onChange={e => setConfig(c => ({ ...c, maxOpen: parseInt(e.target.value) || 1 }))}
                className="cyber-input"
                min="1" max="10"
              />
              <p className="text-[11px] text-gray-600 mt-1">Max tickets a user can have open at once</p>
            </div>
          </div>

          <div className="border-t border-white/[0.06] mt-5 pt-5">
            <button onClick={save} disabled={saving} className="cyber-button-solid flex items-center gap-2">
              {saving ? <Loader size={14} className="animate-spin" /> : <Save size={14} />}
              {saving ? 'Saving…' : 'Save Configuration'}
            </button>
          </div>
        </div>
      )}

      {/* Panel tab */}
      {tab === 'panel' && (
        <div className="animate-fade-in space-y-4">
          <div className="cyber-card p-5">
            <h3 className="text-sm font-semibold text-white mb-4">Panel Settings</h3>
            <div className="space-y-4">
              <div>
                <label className="text-xs text-gray-500 block mb-1.5">Post to Channel</label>
                <select
                  value={config.panelChannelId || ''}
                  onChange={e => setConfig(c => ({ ...c, panelChannelId: e.target.value || null }))}
                  className="cyber-select"
                >
                  <option value="">— Select channel —</option>
                  {textChs.map(c => <option key={c.id} value={c.id}>#{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1.5">Panel Title</label>
                <input
                  type="text"
                  value={config.panelTitle || ''}
                  onChange={e => setConfig(c => ({ ...c, panelTitle: e.target.value }))}
                  className="cyber-input"
                  placeholder="Support Tickets"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1.5">Panel Description</label>
                <textarea
                  value={config.panelDescription || ''}
                  onChange={e => setConfig(c => ({ ...c, panelDescription: e.target.value }))}
                  className="cyber-input resize-none"
                  rows={3}
                  placeholder="Click the button below to open a support ticket."
                />
              </div>
            </div>
          </div>

          {/* Live preview */}
          <div className="cyber-card p-5">
            <p className="text-xs text-gray-500 mb-3 font-semibold uppercase tracking-wide">Preview</p>
            <div className="discord-embed border-cyan-400/60 bg-[#2f3136] rounded-r-xl p-4">
              <p className="text-xs font-bold text-white mb-1">{config.panelTitle || 'Support Tickets'}</p>
              <p className="text-xs text-gray-300 leading-relaxed mb-3">{config.panelDescription || 'Click below to open a ticket.'}</p>
              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-cyan-500 rounded text-black text-xs font-bold cursor-default">
                <Ticket size={12} />
                Open Ticket
              </div>
            </div>
          </div>

          <button onClick={postPanel} disabled={posting} className="cyber-button-solid flex items-center gap-2">
            {posting ? <Loader size={14} className="animate-spin" /> : <Plus size={14} />}
            {posting ? 'Posting…' : 'Post Panel to Channel'}
          </button>
        </div>
      )}

      {/* Tickets list tab */}
      {tab === 'tickets' && (
        <div className="cyber-card p-4 animate-fade-in">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <span className="text-sm font-semibold text-white">Tickets</span>
            <div className="flex items-center gap-2">
              <input
                value={ticketQuery}
                onChange={(e) => setTicketQuery(e.target.value)}
                placeholder="Search ID / user…"
                className="cyber-input text-[11px] h-8 w-36"
              />
              {['all', 'open', 'closed'].map((f) => (
                <button key={f} onClick={() => setTicketFilter(f)}
                  className={`text-[10px] px-2 py-1 rounded-full border capitalize ${ticketFilter === f ? 'bg-cyan-500/15 border-cyan-500/40 text-cyan-300' : 'border-white/10 text-zinc-500'}`}>
                  {f}
                </button>
              ))}
              <button onClick={refreshTickets} className="text-[10px] text-cyan-400 hover:text-cyan-300">Refresh</button>
              <span className="text-xs text-gray-600">{tickets.length} total</span>
            </div>
          </div>

          {tickets.length === 0 ? (
            <div className="text-center py-12">
              <Ticket size={28} className="text-gray-700 mx-auto mb-2" />
              <p className="text-sm text-gray-600">No tickets found</p>
              <p className="text-xs text-gray-700 mt-1">Create a ticket panel so members can open tickets</p>
            </div>
          ) : (
            <div className="space-y-2">
              {tickets.filter((t) => {
                if (ticketFilter === 'open') return t.status === 'open' || !t.status;
                if (ticketFilter === 'closed') return t.status === 'closed';
                return true;
              }).map((ticket, i) => (
                <div
                  key={ticket.id || i}
                  className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/[0.08] hover:border-white/[0.12] transition-all"
                >
                  <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center flex-shrink-0">
                    <Ticket size={14} className="text-cyan-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white">
                      Ticket #{ticket.id?.slice(-6) || String(i + 1).padStart(4, '0')}
                    </p>
                    <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                      {ticket.userId && (
                        <span className="text-[11px] text-gray-600 flex items-center gap-1">
                          <User size={9} /> {ticket.userId}
                        </span>
                      )}
                      {ticket.channelId && (
                        <span className="text-[11px] text-gray-600 flex items-center gap-1">
                          <Hash size={9} /> {ticket.channelId}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {ticket.createdAt && (
                      <span className="text-[11px] text-gray-600 flex items-center gap-1 tabular-nums">
                        <Clock size={9} />
                        {new Date(ticket.createdAt).toLocaleDateString()}
                      </span>
                    )}
                    <span className={STATUS_STYLES[ticket.status || 'open']}>
                      {ticket.status || 'open'}
                    </span>
                    {(ticket.status === 'open' || !ticket.status) && (
                      <button
                        onClick={() => setConfirmClose(ticket.id)}
                        className="text-gray-600 hover:text-red-400 transition-colors"
                        title="Close ticket"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <ConfirmModal
        open={!!confirmClose}
        title="Close Ticket"
        message="This will close the ticket channel and send a transcript. The channel will be archived."
        confirmLabel="Close Ticket"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={() => closeTicket(confirmClose)}
        onCancel={() => setConfirmClose(null)}
      />
    </div>
  );
}

import React, { useState, useEffect } from 'react';
import { Ticket, Save, Clock, User, Hash, Plus, Settings, X, ChevronRight, CheckCircle, AlertCircle, Loader } from 'lucide-react';
import PageHeader from '../components/PageHeader.jsx';
import EmptyState from '../components/EmptyState.jsx';
import ConfirmModal from '../components/ConfirmModal.jsx';
import { useToast } from '../components/Toast.jsx';
import api from '../api.js';

const STATUS_STYLES = {
  open:    'cyber-badge-green',
  closed:  'bg-zinc-500/10 text-zinc-400 border-zinc-500/30 cyber-badge',
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
      const payload = {
        categoryId: config.categoryId,
        transcriptChannelId: config.transcriptChannelId,
        supportRoleId: config.supportRoleId,
        maxOpen: config.maxOpen,
      };
      const saved = await api.post(`/api/guild/${guild.id}/tickets`, payload);
      // Merge canonical server response (normalizes '' -> null)
      setConfig(prev => ({ ...prev, ...saved }));
      toast.success('Ticket configuration saved!');
    } catch (err) {
      toast.error(err.message || 'Failed to save configuration.');
    }
    setSaving(false);
  };

  const postPanel = async () => {
    if (!config.panelChannelId) { toast.warning('Select a channel to post the panel in.'); return; }
    setPosting(true);
    try {
      const res = await api.post(`/api/guild/${guild.id}/tickets/panel`, {
        channelId: config.panelChannelId,
        title: config.panelTitle,
        description: config.panelDescription,
      });
      if (res?.warned) toast.warning(res.warned);
      else toast.success('Ticket panel posted successfully!');
    } catch (err) {
      toast.error(err.message || 'Failed to post the panel.');
    }
    setPosting(false);
  };

  const closeTicket = async (ticketId) => {
    try {
      await api.post(`/api/guild/${guild.id}/tickets/${ticketId}/close`);
      setTickets(prev => prev.map(t => String(t.id) === String(ticketId) ? { ...t, status: 'closed' } : t));
      toast.success('Ticket closed.');
    } catch (err) {
      toast.error(err.message || 'Failed to close ticket.');
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
  const isConfigured = !!(config.categoryId || guildData?.tickets?.categoryId || guildData?.tickets?.category);

  const visibleTickets = tickets.filter((t) => {
    if (ticketFilter === 'open' && !(t.status === 'open' || !t.status)) return false;
    if (ticketFilter === 'closed' && t.status !== 'closed') return false;
    if (ticketQuery) {
      const q = ticketQuery.toLowerCase();
      const hay = `${t.id || ''} ${t.userId || ''} ${t.channelId || ''} ${t.channelName || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  return (
    <div className="page-shell-sm animate-fade-in">
      <PageHeader
        icon={Ticket}
        title="Ticket System"
        subtitle={`Support ticket management for ${guild.name}`}
        badge={openCount > 0 ? `${openCount} open` : undefined}
        badgeColor="green"
      />

      {!isConfigured && (
        <div className="flex items-center gap-2 px-3 py-2.5 mb-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs">
          <AlertCircle size={14} className="flex-shrink-0" />
          <span>Ticket system is not configured — select a category and click <b>Save Configuration</b> before members use the ticket button.</span>
        </div>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        {[
          { label: 'Total Tickets',  value: tickets.length,  color: 'text-white' },
          { label: 'Open',           value: openCount,        color: 'text-emerald-300' },
          { label: 'Closed',         value: closedCount,      color: 'text-zinc-400' },
        ].map((s, i) => (
          <div key={s.label} className="glass-panel p-3.5 text-center animate-fade-in" style={{ animationDelay: `${i * 50}ms` }}>
            <p className={`text-2xl font-bold tabular-nums tracking-tight ${s.color}`}>{s.value}</p>
            <p className="text-[11px] font-medium text-zinc-400 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="seg-tabs mb-1" role="tablist" aria-label="Ticket sections">
        {[
          { id: 'config',  label: 'Configuration', icon: Settings },
          { id: 'panel',   label: 'Create Panel',  icon: Plus },
          { id: 'tickets', label: 'Tickets', icon: Ticket, badge: openCount || undefined },
        ].map(t => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={tab === t.id ? 'seg-tab-active' : 'seg-tab'}
          >
            <t.icon size={13} />
            {t.label}
            {t.badge ? <span className="cyber-badge-green tabular-nums">{t.badge}</span> : null}
          </button>
        ))}
      </div>

      {/* Configuration tab */}
      {tab === 'config' && (
        <div className="glass-panel p-5 animate-fade-in">
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="eb-field-label">Ticket Category</label>
              <select
                value={config.categoryId || ''}
                onChange={e => setConfig(c => ({ ...c, categoryId: e.target.value || null }))}
                className="cyber-select"
              >
                <option value="">— None —</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <p className="text-[11px] text-zinc-500 mt-1">New ticket channels are created here</p>
            </div>

            <div>
              <label className="eb-field-label">Transcript Channel</label>
              <select
                value={config.transcriptChannelId || ''}
                onChange={e => setConfig(c => ({ ...c, transcriptChannelId: e.target.value || null }))}
                className="cyber-select"
              >
                <option value="">— None —</option>
                {textChs.map(c => <option key={c.id} value={c.id}>#{c.name}</option>)}
              </select>
              <p className="text-[11px] text-zinc-500 mt-1">Closed ticket transcripts sent here</p>
            </div>

            <div>
              <label className="eb-field-label">Support Role</label>
              <select
                value={config.supportRoleId || ''}
                onChange={e => setConfig(c => ({ ...c, supportRoleId: e.target.value || null }))}
                className="cyber-select"
              >
                <option value="">— None —</option>
                {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
              <p className="text-[11px] text-zinc-500 mt-1">Role that can see & manage all tickets</p>
            </div>

            <div>
              <label className="eb-field-label">Max Open Per User</label>
              <input
                type="number"
                value={config.maxOpen || 1}
                onChange={e => setConfig(c => ({ ...c, maxOpen: parseInt(e.target.value) || 1 }))}
                className="cyber-input"
                min="1" max="10"
              />
              <p className="text-[11px] text-zinc-500 mt-1">Max tickets a user can have open at once</p>
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
                <label className="eb-field-label">Post to Channel</label>
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
                <label className="eb-field-label">Panel Title</label>
                <input
                  type="text"
                  value={config.panelTitle || ''}
                  onChange={e => setConfig(c => ({ ...c, panelTitle: e.target.value }))}
                  className="cyber-input"
                  placeholder="Support Tickets"
                />
              </div>
              <div>
                <label className="eb-field-label">Panel Description</label>
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
            <div className="flex items-center gap-2 flex-wrap">
              <input
                value={ticketQuery}
                onChange={(e) => setTicketQuery(e.target.value)}
                placeholder="Search ID / user…"
                aria-label="Search tickets"
                className="cyber-input text-xs w-36 min-h-[40px]"
              />
              {['all', 'open', 'closed'].map((f) => (
                <button key={f} onClick={() => setTicketFilter(f)} aria-pressed={ticketFilter === f}
                  className={`text-[11px] font-medium px-3 py-2 min-h-[36px] rounded-full border capitalize transition-all ${ticketFilter === f ? 'bg-cyan-500/15 border-cyan-500/40 text-cyan-200' : 'border-white/10 text-zinc-400 hover:text-zinc-200 hover:border-white/20'}`}>
                  {f}
                </button>
              ))}
              <button onClick={refreshTickets} className="min-h-[36px] px-2 text-[11px] font-medium text-cyan-300 hover:text-cyan-200">Refresh</button>
              <span className="text-xs text-zinc-500 tabular-nums">{tickets.length} total</span>
            </div>
          </div>

          {visibleTickets.length === 0 ? (
            tickets.length === 0 ? (
              <EmptyState icon={Ticket} title="No tickets found" subtitle="Create a ticket panel so members can open tickets." />
            ) : (
              <EmptyState icon={Ticket} title="No matches" subtitle="Try a different search or filter." />
            )
          ) : (
            <div className="space-y-2">
              {visibleTickets.map((ticket, i) => (
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
                        <span className="text-[11px] text-zinc-500 flex items-center gap-1">
                          <User size={9} aria-hidden="true" /> {ticket.userId}
                        </span>
                      )}
                      {ticket.channelId && (
                        <span className="text-[11px] text-zinc-500 flex items-center gap-1">
                          <Hash size={9} aria-hidden="true" /> {ticket.channelId}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {ticket.createdAt && (
                      <span className="text-[11px] text-zinc-500 flex items-center gap-1 tabular-nums">
                        <Clock size={9} aria-hidden="true" />
                        {new Date(ticket.createdAt).toLocaleDateString()}
                      </span>
                    )}
                    <span className={STATUS_STYLES[ticket.status || 'open']}>
                      {ticket.status || 'open'}
                    </span>
                    {(ticket.status === 'open' || !ticket.status) && (
                      <button
                        onClick={() => setConfirmClose(ticket.id)}
                        className="w-8 h-8 flex items-center justify-center rounded-lg text-zinc-500 hover:text-red-300 hover:bg-red-500/10 transition-colors flex-shrink-0"
                        title="Close ticket"
                        aria-label={`Close ticket ${ticket.id?.slice(-6) || ''}`}
                      >
                        <X size={14} aria-hidden="true" />
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

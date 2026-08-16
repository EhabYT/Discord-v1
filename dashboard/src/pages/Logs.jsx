import React, { useState, useEffect, useRef } from 'react';
import { ScrollText, Circle, Filter, Trash2, WifiOff, Save, Pause, Play, Loader, Download } from 'lucide-react';
import { getSocket, joinGuild, leaveGuild } from '../socket.js';
import PageHeader from '../components/PageHeader.jsx';
import { useToast } from '../components/Toast.jsx';
import api from '../api.js';

const CATEGORIES = [
  { id: 'all',      label: 'All',      color: 'text-cyan-400',   border: 'border-cyan-400',   bg: 'bg-cyan-500/15'   },
  { id: 'messages', label: 'Messages', color: 'text-blue-400',   border: 'border-blue-400',   bg: 'bg-blue-500/15'   },
  { id: 'members',  label: 'Members',  color: 'text-green-400',  border: 'border-green-400',  bg: 'bg-green-500/15'  },
  { id: 'voice',    label: 'Voice',    color: 'text-purple-400', border: 'border-purple-400', bg: 'bg-purple-500/15' },
  { id: 'roles',    label: 'Roles',    color: 'text-yellow-400', border: 'border-yellow-400', bg: 'bg-yellow-500/15' },
  { id: 'server',   label: 'Server',   color: 'text-orange-400', border: 'border-orange-400', bg: 'bg-orange-500/15' },
  { id: 'security', label: 'Security', color: 'text-red-400',    border: 'border-red-400',    bg: 'bg-red-500/15'    },
];

const LOG_TYPES = [
  { key: 'messages',      label: 'Message Edit/Delete' },
  { key: 'msg_delete',    label: 'Message Delete' },
  { key: 'bulk_delete',   label: 'Bulk Delete' },
  { key: 'members',       label: 'Member Join/Leave' },
  { key: 'voice',         label: 'Voice Events' },
  { key: 'role_update',   label: 'Role Updates' },
  { key: 'moderation',    label: 'Moderation Actions' },
  { key: 'channels',      label: 'Channel Changes' },
  { key: 'server_update', label: 'Server Updates' },
  { key: 'ban',           label: 'Bans' },
  { key: 'kick',          label: 'Kicks' },
  { key: 'unban',         label: 'Unbans' },
  { key: 'invites',       label: 'Invites' },
  { key: 'member_leave',  label: 'Leaves' },
  { key: 'channel_delete',label: 'Channel Deletes' },
  { key: 'role_delete',   label: 'Role Deletes' },
];

const CAT_BORDER = {
  messages: 'border-l-blue-400',
  members:  'border-l-green-400',
  voice:    'border-l-purple-400',
  roles:    'border-l-yellow-400',
  server:   'border-l-orange-400',
  security: 'border-l-red-400',
};

function LogEntry({ log }) {
  const borderColor = CAT_BORDER[log.category] || 'border-l-cyan-400';
  return (
    <div className={`flex gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/[0.06] border-l-2 ${borderColor} animate-fade-in`}>
      <span className="text-base flex-shrink-0 leading-none mt-0.5">{log.icon || '📋'}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-xs font-semibold text-white">{log.title}</p>
          {log.channel && (
            <span className="text-[10px] text-gray-600">#{log.channel.name}</span>
          )}
        </div>
        {log.description && (
          <p className="text-xs text-gray-500 mt-0.5 truncate">{log.description}</p>
        )}
        {log.before && (
          <div className="mt-1.5 grid grid-cols-2 gap-2">
            <div className="bg-red-500/[0.08] border border-red-500/20 rounded-lg p-1.5">
              <p className="text-[10px] text-red-400 font-semibold mb-0.5">Before</p>
              <p className="text-[10px] text-gray-400 truncate">{log.before}</p>
            </div>
            <div className="bg-green-500/[0.08] border border-green-500/20 rounded-lg p-1.5">
              <p className="text-[10px] text-green-400 font-semibold mb-0.5">After</p>
              <p className="text-[10px] text-gray-400 truncate">{log.after}</p>
            </div>
          </div>
        )}
        {log.author && (
          <div className="flex items-center gap-1.5 mt-1">
            {log.author.avatar && <img src={log.author.avatar} alt="" className="w-4 h-4 rounded-full" />}
            <span className="text-[10px] text-gray-600">{log.author.tag}</span>
          </div>
        )}
      </div>
      <span className="text-[10px] text-gray-700 flex-shrink-0 tabular-nums">
        {new Date(log.timestamp).toLocaleTimeString()}
      </span>
    </div>
  );
}

export default function Logs({ guild, guildData }) {
  const toast = useToast();
  const [logs, setLogs]           = useState([]);
  const [filter, setFilter]       = useState('all');
  const [connected, setConnected] = useState(false);
  const [logConfig, setLogConfig] = useState({});
  const [configOpen, setConfigOpen] = useState(false);
  const [paused, setPaused]       = useState(false);
  const [saving, setSaving]       = useState(false);
  const [query, setQuery]         = useState('');
  const bottomRef  = useRef(null);
  const pausedRef  = useRef(false);

  const channels = guildData?.guild?.channels?.filter(c => c.type === 0) || [];

  useEffect(() => {
    if (guildData?.logging) setLogConfig(guildData.logging);
  }, [guildData]);

  useEffect(() => {
    if (!guild?.id) return;
    api.get(`/api/guild/${guild.id}/logging`)
      .then((cfg) => { if (cfg && typeof cfg === 'object') setLogConfig(cfg); })
      .catch(() => {});
  }, [guild?.id]);

  useEffect(() => {
    if (!guild?.id) return;
    const socket = getSocket();
    joinGuild(guild.id);
    setConnected(socket.connected);

    const onConnect    = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    const onLog = (event) => {
      if (!pausedRef.current) {
        setLogs(prev => [event, ...prev].slice(0, 300));
      }
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('log:event', onLog);

    return () => {
      leaveGuild(guild.id);
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('log:event', onLog);
    };
  }, [guild?.id]);

  const togglePause = () => {
    const next = !paused;
    setPaused(next);
    pausedRef.current = next;
  };

  const filtered = logs.filter((l) => {
    if (filter !== 'all' && l.category !== filter) return false;
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    const hay = `${l.title || ''} ${l.description || ''} ${l.channel?.name || ''} ${l.author?.tag || ''} ${l.before || ''} ${l.after || ''}`.toLowerCase();
    return hay.includes(q);
  });

  const saveLogConfig = async () => {
    setSaving(true);
    try {
      for (const [type, channelId] of Object.entries(logConfig)) {
        await api.post(`/api/guild/${guild.id}/logging`, { type, channelId: channelId || null });
      }
      toast.success('Log channels saved!');
      setConfigOpen(false);
    } catch (e) {
      toast.error(e.message || 'Failed to save log channels.');
    }
    setSaving(false);
  };

  if (!guild) {return (
    <div className="p-6 flex items-center justify-center h-64">
      <p className="text-gray-600 text-sm">Select a server first.</p>
    </div>
  );}

  return (
    <div className="page-shell-sm animate-fade-in">
      <PageHeader icon={ScrollText} title="Live Logs" subtitle={`Real-time event stream for ${guild.name}`}>
        <div className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-full border font-medium
          ${connected ? 'text-green-400 border-green-500/30 bg-green-500/[0.08]' : 'text-red-400 border-red-500/30 bg-red-500/[0.08]'}`}>
          {connected
            ? <><Circle size={7} className="fill-green-400 animate-pulse" /> Live</>
            : <><WifiOff size={11} /> Offline</>}
        </div>
        <button
          onClick={togglePause}
          className={paused ? 'cyber-button-success flex items-center gap-1.5 text-xs py-1.5' : 'cyber-button flex items-center gap-1.5 text-xs py-1.5'}
        >
          {paused ? <Play size={12} /> : <Pause size={12} />}
          {paused ? 'Resume' : 'Pause'}
        </button>
        <button onClick={() => setConfigOpen(o => !o)} className="cyber-button flex items-center gap-1.5 text-xs py-1.5">
          <Filter size={12} /> Log Channels
        </button>
        {logs.length > 0 && (
          <>
            <button
              onClick={() => {
                const rows = [['time', 'category', 'title', 'description', 'channel', 'author'],
                  ...filtered.map((l) => [
                    new Date(l.timestamp).toISOString(),
                    l.category || '',
                    l.title || '',
                    (l.description || '').replaceAll(',', ' '),
                    l.channel?.name || '',
                    l.author?.tag || '',
                  ])];
                const blob = new Blob([rows.map((r) => r.join(',')).join('\n')], { type: 'text/csv' });
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                a.download = `logs-${guild.id}.csv`;
                a.click();
              }}
              className="cyber-button flex items-center gap-1.5 text-xs py-1.5"
            >
              <Download size={12} /> CSV
            </button>
            <button onClick={() => setLogs([])} className="cyber-button flex items-center gap-1.5 text-xs py-1.5 text-red-400 hover:text-red-300 border-red-500/20 hover:border-red-500/40">
              <Trash2 size={12} /> Clear
            </button>
          </>
        )}
      </PageHeader>

      {/* Log channel config panel */}
      {configOpen && (
        <div className="cyber-card p-5 mb-4 animate-fade-in">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-white">Log Channel Configuration</h3>
            <p className="text-xs text-gray-600">Map event types to Discord channels</p>
          </div>
          <div className="grid md:grid-cols-2 gap-3 mb-4">
            {LOG_TYPES.map(({ key, label }) => (
              <div key={key}>
                <label className="text-xs text-gray-500 block mb-1">{label}</label>
                <select
                  value={logConfig[key] || ''}
                  onChange={e => setLogConfig(c => ({ ...c, [key]: e.target.value || null }))}
                  className="cyber-select text-xs"
                >
                  <option value="">— Disabled —</option>
                  {channels.map(c => <option key={c.id} value={c.id}>#{c.name}</option>)}
                </select>
              </div>
            ))}
          </div>
          <button onClick={saveLogConfig} disabled={saving} className="cyber-button-solid flex items-center gap-2 text-xs">
            {saving ? <Loader size={12} className="animate-spin" /> : <Save size={12} />}
            {saving ? 'Saving…' : 'Save Log Channels'}
          </button>
        </div>
      )}

      <div className="relative mb-3">
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search events, users, channels…" className="cyber-input text-xs" />
      </div>

      {/* Category filter pills */}
      <div className="flex gap-1.5 mb-4 flex-wrap">
        {CATEGORIES.map(cat => {
          const count = cat.id === 'all' ? logs.length : logs.filter(l => l.category === cat.id).length;
          const isActive = filter === cat.id;
          return (
            <button
              key={cat.id}
              onClick={() => setFilter(cat.id)}
              className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-all font-medium ${
                isActive
                  ? `${cat.bg} ${cat.border} ${cat.color}`
                  : 'border-white/[0.07] text-gray-600 hover:text-gray-400 hover:border-white/12'
              }`}
            >
              {cat.label}
              {count > 0 && (
                <span className={`text-[10px] tabular-nums ${isActive ? 'opacity-70' : 'opacity-50'}`}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Log stream */}
      <div className="cyber-card p-4">
        <div className="flex items-center gap-2 mb-3">
          <ScrollText size={14} className="text-cyan-400" />
          <span className="text-xs font-semibold text-white">Event Stream</span>
          {paused && (
            <span className="cyber-badge-yellow ml-1">Paused</span>
          )}
          <span className="text-xs text-gray-600 ml-auto tabular-nums">{filtered.length} / 300</span>
          {connected && !paused && (
            <div className="flex items-center gap-1">
              <Circle size={6} className="text-green-400 fill-green-400 animate-pulse" />
              <span className="text-[10px] text-green-400">Live</span>
            </div>
          )}
        </div>

        <div className="space-y-1.5 max-h-[560px] overflow-y-auto pr-1">
          {filtered.length === 0 ? (
            <div className="text-center py-14">
              <ScrollText size={28} className="text-gray-700 mx-auto mb-2" />
              <p className="text-sm text-gray-600">Waiting for events…</p>
              <p className="text-xs text-gray-700 mt-1">
                {connected
                  ? `Events will appear here as they happen in ${guild.name}`
                  : 'Reconnecting to live stream…'}
              </p>
            </div>
          ) : (
            filtered.map((log, i) => (
              <LogEntry key={`${log.timestamp}-${i}`} log={log} />
            ))
          )}
          <div ref={bottomRef} />
        </div>
      </div>
    </div>
  );
}

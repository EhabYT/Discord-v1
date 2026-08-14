import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Radio, MessageSquare, UserPlus, UserMinus, Terminal, ShieldX, ShieldOff, Mic, MicOff, Trash2, Filter } from 'lucide-react';

const EVENT_META = {
  message:        { label: 'Message',        color: 'text-blue-400',   bg: 'bg-blue-500/10',   border: 'border-blue-500/20',   icon: MessageSquare },
  member_join:    { label: 'Join',            color: 'text-green-400',  bg: 'bg-green-500/10',  border: 'border-green-500/20',  icon: UserPlus },
  member_leave:   { label: 'Leave',           color: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/20', icon: UserMinus },
  command:        { label: 'Command',         color: 'text-purple-400', bg: 'bg-purple-500/10', border: 'border-purple-500/20', icon: Terminal },
  ban:            { label: 'Ban',             color: 'text-red-400',    bg: 'bg-red-500/10',    border: 'border-red-500/20',    icon: ShieldX },
  unban:          { label: 'Unban',           color: 'text-cyan-400',   bg: 'bg-cyan-500/10',   border: 'border-cyan-500/20',   icon: ShieldOff },
  voice_join:     { label: 'Voice Join',      color: 'text-teal-400',   bg: 'bg-teal-500/10',   border: 'border-teal-500/20',   icon: Mic },
  voice_leave:    { label: 'Voice Leave',     color: 'text-yellow-400', bg: 'bg-yellow-500/10', border: 'border-yellow-500/20', icon: MicOff },
  message_delete: { label: 'Deleted',         color: 'text-rose-400',   bg: 'bg-rose-500/10',   border: 'border-rose-500/20',   icon: Trash2 },
};

const ALL_TYPES = Object.keys(EVENT_META);
const MAX_EVENTS = 200;

function timeAgo(ts) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 5) return 'just now';
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

function EventRow({ event }) {
  const meta = EVENT_META[event.type] || { label: event.type, color: 'text-gray-400', bg: 'bg-white/5', border: 'border-white/10', icon: Radio };
  const Icon = meta.icon;

  return (
    <div className={`flex items-start gap-3 px-4 py-3 border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors animate-[fadeIn_0.3s_ease]`}>
      {/* Type badge */}
      <div className={`flex-shrink-0 w-7 h-7 rounded-lg ${meta.bg} border ${meta.border} flex items-center justify-center mt-0.5`}>
        <Icon size={13} className={meta.color} />
      </div>

      {/* Avatar */}
      {event.avatar
        ? <img src={event.avatar} alt="" className="w-7 h-7 rounded-full object-cover flex-shrink-0 mt-0.5" />
        : <div className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center text-xs font-bold text-gray-400 flex-shrink-0 mt-0.5">
            {event.user?.[0]?.toUpperCase() || '?'}
          </div>
      }

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-sm font-semibold text-white">{event.user || 'Unknown'}</span>
          <span className={`text-xs font-medium ${meta.color}`}>{meta.label}</span>
          {event.guildName && (
            <span className="text-[10px] text-gray-600 truncate">in {event.guildName}</span>
          )}
        </div>
        {event.description && (
          <p className="text-xs text-gray-400 mt-0.5 truncate">{event.description}</p>
        )}
        {event.channel && (
          <p className="text-[10px] text-gray-600 mt-0.5">#{event.channel}</p>
        )}
      </div>

      {/* Time */}
      <span className="text-[10px] text-gray-600 flex-shrink-0 mt-1">{timeAgo(event.ts)}</span>
    </div>
  );
}

export default function LiveFeed({ guild }) {
  const [events, setEvents] = useState([]);
  const [filter, setFilter] = useState(new Set(ALL_TYPES));
  const [connected, setConnected] = useState(false);
  const [totalCommands, setTotalCommands] = useState(0);
  const [paused, setPaused] = useState(false);
  const [query, setQuery] = useState('');
  const [guildOnly, setGuildOnly] = useState(true);
  const [, setTick] = useState(0);
  const pausedRef = useRef(false);
  const esRef = useRef(null);
  const topRef = useRef(null);
  const [autoScroll, setAutoScroll] = useState(true);

  pausedRef.current = paused;

  const addEvent = useCallback((type, data) => {
    if (pausedRef.current) return;
    setEvents(prev => {
      const next = [{ ...data, type, id: `${Date.now()}-${Math.random()}` }, ...prev];
      return next.slice(0, MAX_EVENTS);
    });
  }, []);

  useEffect(() => {
    const es = new EventSource('/api/events/stream');
    esRef.current = es;

    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);

    es.addEventListener('connected', (e) => {
      const d = JSON.parse(e.data);
      setTotalCommands(d.totalCommands || 0);
      setConnected(true);
    });

    es.addEventListener('stats_update', (e) => {
      const d = JSON.parse(e.data);
      setTotalCommands(d.totalCommands || 0);
    });

    ALL_TYPES.forEach(type => {
      if (type === 'stats_update') return;
      es.addEventListener(type, (e) => {
        addEvent(type, JSON.parse(e.data));
      });
    });

    return () => { es.close(); setConnected(false); };
  }, [addEvent]);

  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 15000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (autoScroll && topRef.current) {
      topRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [events, autoScroll]);

  const toggleType = (type) => {
    setFilter(prev => {
      const next = new Set(prev);
      next.has(type) ? next.delete(type) : next.add(type);
      return next;
    });
  };

  const q = query.trim().toLowerCase();
  const visible = events.filter((e) => {
    if (!filter.has(e.type)) return false;
    if (guildOnly && guild?.id) {
      const gid = e.guildId || e.guild || e.guild_id;
      if (gid && gid !== guild.id) return false;
      if (!gid && e.guildName && guild.name && e.guildName !== guild.name) return false;
    }
    if (q) {
      const hay = `${e.user || ''} ${e.description || ''} ${e.channel || ''} ${e.guildName || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  return (
    <div className="flex flex-col h-full p-0 pb-14 md:pb-0">
      {/* Header */}
      <div className="flex-shrink-0 px-5 sm:px-6 py-4 border-b border-white/[0.06] bg-[#070A0F]/40">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative">
              <Radio size={20} className="text-cyan-400" />
              {connected && (
                <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-green-400 rounded-full shadow-[0_0_6px_rgba(74,222,128,0.8)]" />
              )}
            </div>
            <div>
              <h1 className="text-lg font-bold text-white">Live Activity Feed</h1>
              <p className="text-xs text-gray-500">
                {connected ? (
                  <span className="text-green-400">Connected · {totalCommands.toLocaleString()} total commands</span>
                ) : (
                  <span className="text-red-400">Reconnecting...</span>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setGuildOnly((v) => !v)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-all ${
                guildOnly
                  ? 'bg-cyan-500/15 border-cyan-500/40 text-cyan-300'
                  : 'border-white/10 text-gray-400 hover:text-cyan-400'
              }`}
              title="Only this server"
            >
              {guildOnly ? (guild?.name || 'This server') : 'All servers'}
            </button>
            <button
              onClick={() => setPaused(p => !p)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-all ${
                paused
                  ? 'bg-yellow-500/20 border-yellow-500/40 text-yellow-300'
                  : 'border-white/10 text-gray-400 hover:border-cyan-500/30 hover:text-cyan-400'
              }`}
            >
              {paused ? '▶ Resume' : '⏸ Pause'}
            </button>
            <button
              onClick={() => setEvents([])}
              className="px-3 py-1.5 text-xs font-medium rounded-lg border border-white/10 text-gray-400 hover:border-red-500/30 hover:text-red-400 transition-all"
            >
              Clear
            </button>
          </div>
        </div>

        {/* Type Filters */}
        <div className="flex flex-wrap gap-1.5 mt-3">
          <div className="flex items-center gap-1 text-[10px] text-gray-600 mr-1">
            <Filter size={10} /> Filter:
          </div>
          {ALL_TYPES.map(type => {
            const meta = EVENT_META[type];
            if (!meta) return null;
            const active = filter.has(type);
            return (
              <button
                key={type}
                onClick={() => toggleType(type)}
                className={`px-2 py-0.5 rounded-full text-[10px] font-medium border transition-all ${
                  active ? `${meta.bg} ${meta.border} ${meta.color}` : 'border-white/5 text-gray-600'
                }`}
              >
                {meta.label}
              </button>
            );
          })}
          <button
            onClick={() => setFilter(new Set(ALL_TYPES))}
            className="px-2 py-0.5 rounded-full text-[10px] font-medium border border-white/5 text-gray-600 hover:text-gray-400 ml-1"
          >
            All
          </button>
          <button
            onClick={() => setFilter(new Set())}
            className="px-2 py-0.5 rounded-full text-[10px] font-medium border border-white/5 text-gray-600 hover:text-gray-400"
          >
            None
          </button>
        </div>
      </div>

      <div className="flex-shrink-0 px-6 py-2 border-b border-white/[0.04] flex items-center justify-between gap-3">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search user, message, channel…"
          className="cyber-input text-xs h-8 max-w-xs"
        />
        <p className="text-[10px] text-gray-600">
          Showing {visible.length} of {events.length} events (max {MAX_EVENTS})
        </p>
        <label className="flex items-center gap-1.5 text-[10px] text-gray-600 cursor-pointer">
          <input
            type="checkbox"
            checked={autoScroll}
            onChange={e => setAutoScroll(e.target.checked)}
            className="accent-cyan-500 w-3 h-3"
          />
          Auto-scroll
        </label>
      </div>

      {/* Feed */}
      <div className="flex-1 overflow-y-auto">
        {visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-gray-700">
            <Radio size={40} className="opacity-20" />
            <p className="text-sm">
              {connected ? 'Waiting for activity...' : 'Connecting to event stream...'}
            </p>
            {!connected && (
              <div className="w-5 h-5 border-2 border-cyan-500/20 border-t-cyan-400/40 rounded-full animate-spin" />
            )}
          </div>
        ) : (
          <>
            <div ref={topRef} />
            {visible.map(event => <EventRow key={event.id} event={event} />)}
          </>
        )}
      </div>

      {paused && (
        <div className="flex-shrink-0 px-4 py-2 bg-yellow-500/10 border-t border-yellow-500/20 text-center">
          <p className="text-xs text-yellow-400">Feed paused — new events are being discarded</p>
        </div>
      )}
    </div>
  );
}

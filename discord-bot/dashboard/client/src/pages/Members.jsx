import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Users, Search, Crown, UserX, Clock, AlertTriangle, Shield,
  Loader2, ChevronDown, ScrollText, Trash2, User
} from 'lucide-react';
import PageHeader from '../components/PageHeader.jsx';
import api from '../api.js';

/* ── Avatar ──────────────────────────────────────────────────────── */
function MemberAvatar({ member, size = 10 }) {
  const cls = `w-${size} h-${size} rounded-full flex-shrink-0`;
  return member?.avatar
    ? <img src={member.avatar} alt="" className={`${cls} object-cover ring-2 ring-cyan-500/30`} />
    : <div className={`${cls} bg-cyan-500/10 flex items-center justify-center text-sm font-bold text-cyan-400 ring-2 ring-cyan-500/20`}>
        {(member?.username || member?.displayName || '?')[0]?.toUpperCase()}
      </div>;
}

/* ── Action Menu ─────────────────────────────────────────────────── */
const ACTION_ICONS  = { kick: UserX, ban: Shield, timeout: Clock, warn: AlertTriangle };
const ACTION_COLORS = {
  kick:    'text-orange-400 bg-orange-500/10 border-orange-500/30',
  ban:     'text-red-400 bg-red-500/10 border-red-500/30',
  timeout: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30',
  warn:    'text-blue-400 bg-blue-500/10 border-blue-500/30',
};

function ActionMenu({ member, guildId, onAction }) {
  const [open, setOpen]       = useState(false);
  const [action, setAction]   = useState('');
  const [reason, setReason]   = useState('');
  const [duration, setDuration] = useState(60000);
  const [pending, setPending] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const submit = async () => {
    if (!action) return;
    setPending(true);
    try {
      await api.post(`/api/guild/${guildId}/members/${member.id}/action`, { action, reason, duration });
      onAction(member.id, action);
      setOpen(false); setAction(''); setReason('');
    } catch (e) {}
    setPending(false);
  };

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(!open)} className="cyber-button flex items-center gap-1 text-xs">
        Moderate <ChevronDown size={10} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute right-0 mt-1 w-56 cyber-card shadow-xl z-20 p-3 space-y-2">
          <div className="flex gap-1.5 flex-wrap">
            {['kick','ban','timeout','warn'].map(a => {
              const Icon = ACTION_ICONS[a];
              return (
                <button key={a} onClick={() => setAction(action === a ? '' : a)}
                  className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs border font-medium transition-all capitalize
                    ${action === a ? ACTION_COLORS[a] : 'text-gray-500 border-white/10 hover:border-white/20'}`}>
                  <Icon size={10} />{a}
                </button>
              );
            })}
          </div>
          {action && (
            <>
              <input type="text" placeholder="Reason (optional)" value={reason}
                onChange={e => setReason(e.target.value)} className="cyber-input text-xs" />
              {action === 'timeout' && (
                <select value={duration} onChange={e => setDuration(Number(e.target.value))} className="cyber-select text-xs">
                  <option value={60000}>1 minute</option>
                  <option value={300000}>5 minutes</option>
                  <option value={1800000}>30 minutes</option>
                  <option value={3600000}>1 hour</option>
                  <option value={86400000}>1 day</option>
                  <option value={604800000}>7 days</option>
                </select>
              )}
              <button onClick={submit} disabled={pending}
                className={`w-full text-xs py-1.5 rounded-lg border font-medium transition-all capitalize ${ACTION_COLORS[action]}`}>
                {pending ? <Loader2 size={12} className="animate-spin mx-auto" /> : `Confirm ${action}`}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Warning Badge ───────────────────────────────────────────────── */
function WarnCount({ count }) {
  if (!count) return null;
  const color = count >= 5 ? 'bg-red-500/15 text-red-400 border-red-500/25'
              : count >= 3 ? 'bg-orange-500/15 text-orange-400 border-orange-500/25'
              : 'bg-yellow-500/15 text-yellow-400 border-yellow-500/25';
  return (
    <span className={`flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded border font-semibold ${color}`}>
      <AlertTriangle size={8} /> {count}
    </span>
  );
}

/* ── Warnings Tab ────────────────────────────────────────────────── */
function WarningsLog({ guild, members }) {
  const [warnings, setWarnings]   = useState([]);
  const [loading, setLoading]     = useState(true);
  const [filter, setFilter]       = useState('');
  const [expanded, setExpanded]   = useState(new Set());

  useEffect(() => {
    if (!guild?.id) return;
    setLoading(true);
    api.get(`/api/guild/${guild.id}/warnings`)
      .then(data => setWarnings(data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [guild?.id]);

  // Group warnings by userId, newest first
  const grouped = React.useMemo(() => {
    const map = new Map();
    for (const w of warnings) {
      if (!map.has(w.userId)) map.set(w.userId, []);
      map.get(w.userId).push(w);
    }
    // Sort each user's warnings newest-first
    for (const [, arr] of map) arr.sort((a, b) => b.timestamp - a.timestamp);
    // Sort users by warning count descending
    return [...map.entries()]
      .sort((a, b) => b[1].length - a[1].length)
      .filter(([userId]) => {
        if (!filter) return true;
        const m = members.find(m => m.id === userId);
        const name = (m?.displayName || m?.username || userId).toLowerCase();
        return name.includes(filter.toLowerCase()) || userId.includes(filter);
      });
  }, [warnings, filter, members]);

  const toggleExpand = (userId) => {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(userId) ? next.delete(userId) : next.add(userId);
      return next;
    });
  };

  const totalWarnings = warnings.length;
  const uniqueUsers   = new Set(warnings.map(w => w.userId)).size;

  if (loading) {
    return (
      <div className="space-y-2">
        {[...Array(4)].map((_, i) => <div key={i} className="cyber-card h-16 animate-pulse bg-white/[0.03]" />)}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary stats */}
      <div className="grid grid-cols-2 gap-3">
        <div className="cyber-card p-3 text-center">
          <p className="text-xl font-bold text-yellow-400">{totalWarnings}</p>
          <p className="text-xs text-gray-600">Total Warnings</p>
        </div>
        <div className="cyber-card p-3 text-center">
          <p className="text-xl font-bold text-orange-400">{uniqueUsers}</p>
          <p className="text-xs text-gray-600">Members Warned</p>
        </div>
      </div>

      {/* Search */}
      <div className="cyber-card p-3">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600" />
          <input
            type="text"
            placeholder="Filter by username or user ID..."
            value={filter}
            onChange={e => setFilter(e.target.value)}
            className="cyber-input pl-9"
          />
        </div>
      </div>

      {/* Grouped list */}
      {grouped.length === 0 ? (
        <div className="cyber-card p-10 text-center">
          <ScrollText size={28} className="text-gray-700 mx-auto mb-2" />
          <p className="text-sm text-gray-500 font-medium">
            {filter ? 'No warnings found for that user.' : 'No warnings recorded yet.'}
          </p>
          <p className="text-xs text-gray-700 mt-1">Warnings issued via the Moderate button will appear here.</p>
        </div>
      ) : (
        <div className="cyber-card overflow-hidden divide-y divide-white/[0.04]">
          {grouped.map(([userId, userWarnings]) => {
            const member = members.find(m => m.id === userId);
            const name   = member?.displayName || member?.username || userId;
            const isOpen = expanded.has(userId);
            const count  = userWarnings.length;

            return (
              <div key={userId}>
                {/* User header row */}
                <button
                  onClick={() => toggleExpand(userId)}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/[0.02] transition-colors text-left"
                >
                  <MemberAvatar member={member || { username: userId }} />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-white truncate">{name}</p>
                      <WarnCount count={count} />
                    </div>
                    <p className="text-[11px] text-gray-600 mt-0.5">
                      {member?.username ? `@${member.username} · ` : ''}{userId}
                    </p>
                  </div>

                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span className="text-[11px] text-gray-600">
                      Last: {new Date(userWarnings[0].timestamp).toLocaleDateString()}
                    </span>
                    <ChevronDown
                      size={14}
                      className={`text-gray-600 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                    />
                  </div>
                </button>

                {/* Expanded warning list */}
                {isOpen && (
                  <div className="bg-white/[0.015] border-t border-white/[0.04]">
                    {userWarnings.map((w, i) => (
                      <div key={i} className="flex items-start gap-3 px-6 py-3 border-b border-white/[0.03] last:border-0">
                        {/* Number */}
                        <div className="w-5 h-5 rounded-full bg-yellow-500/10 border border-yellow-500/20 flex items-center justify-center text-[10px] font-bold text-yellow-400 flex-shrink-0 mt-0.5">
                          {i + 1}
                        </div>

                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-white">
                            {w.reason || <span className="text-gray-600 italic">No reason provided</span>}
                          </p>
                          <div className="flex items-center gap-3 mt-1 flex-wrap">
                            <span className="flex items-center gap-1 text-[11px] text-gray-600">
                              <User size={9} />
                              {w.moderator || 'Unknown'}
                            </span>
                            <span className="flex items-center gap-1 text-[11px] text-gray-600">
                              <Clock size={9} />
                              {new Date(w.timestamp).toLocaleString()}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ── Main Page ───────────────────────────────────────────────────── */
export default function Members({ guild, guildData }) {
  const [tab, setTab]         = useState('members');
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery]     = useState('');
  const [searching, setSearching] = useState(false);
  const [warnCounts, setWarnCounts] = useState({});

  const load = useCallback(async (q = '') => {
    if (!guild?.id) return;
    q ? setSearching(true) : setLoading(true);
    try {
      const data = await api.get(`/api/guild/${guild.id}/members${q ? `?q=${encodeURIComponent(q)}` : ''}`);
      setMembers(data);
    } catch (e) {}
    setLoading(false);
    setSearching(false);
  }, [guild?.id]);

  // Load warning counts for badge display
  const loadWarnCounts = useCallback(async () => {
    if (!guild?.id) return;
    try {
      const data = await api.get(`/api/guild/${guild.id}/warnings`);
      const counts = {};
      for (const w of (data || [])) {
        counts[w.userId] = (counts[w.userId] || 0) + 1;
      }
      setWarnCounts(counts);
    } catch (e) {}
  }, [guild?.id]);

  useEffect(() => { load(); loadWarnCounts(); }, [load, loadWarnCounts]);

  useEffect(() => {
    const t = setTimeout(() => { if (query !== undefined) load(query); }, 400);
    return () => clearTimeout(t);
  }, [query, load]);

  const handleAction = (userId, action) => {
    if (action === 'kick' || action === 'ban') {
      setMembers(m => m.filter(mb => mb.id !== userId));
    }
    if (action === 'warn') {
      setWarnCounts(prev => ({ ...prev, [userId]: (prev[userId] || 0) + 1 }));
    }
  };

  const staffCount = members.filter(m => m.isStaff).length;

  if (!guild) return <div className="p-6 text-gray-500 text-sm">Select a server first.</div>;

  return (
    <div className="p-6 max-w-4xl mx-auto animate-fade-in">
      <PageHeader
        icon={Users}
        title="Members"
        subtitle={`Browse, moderate, and review warnings in ${guild.name}`}
      />

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-white/5 rounded-xl border border-white/5 mb-5">
        <button
          onClick={() => setTab('members')}
          className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-sm font-medium transition-all ${
            tab === 'members'
              ? 'bg-cyan-500/20 text-cyan-400 shadow-[0_0_12px_rgba(0,255,255,0.08)]'
              : 'text-gray-500 hover:text-gray-300'
          }`}
        >
          <Users size={14} /> Member List
        </button>
        <button
          onClick={() => setTab('warnings')}
          className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-sm font-medium transition-all ${
            tab === 'warnings'
              ? 'bg-yellow-500/20 text-yellow-400 shadow-[0_0_12px_rgba(234,179,8,0.08)]'
              : 'text-gray-500 hover:text-gray-300'
          }`}
        >
          <AlertTriangle size={14} /> Warnings Log
        </button>
      </div>

      {tab === 'warnings' ? (
        <WarningsLog guild={guild} members={members} />
      ) : (
        <>
          {/* Stats */}
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="cyber-card p-3 text-center">
              <p className="text-xl font-bold text-white">{guild.memberCount?.toLocaleString() || members.length}</p>
              <p className="text-xs text-gray-600">Total Members</p>
            </div>
            <div className="cyber-card p-3 text-center">
              <p className="text-xl font-bold text-yellow-400">{staffCount}</p>
              <p className="text-xs text-gray-600">Staff</p>
            </div>
            <div className="cyber-card p-3 text-center">
              <p className="text-xl font-bold text-cyan-400">{members.length}</p>
              <p className="text-xs text-gray-600">Shown</p>
            </div>
          </div>

          {/* Search */}
          <div className="cyber-card p-3 mb-4">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600" />
              <input
                type="text"
                placeholder="Search by username, display name, or user ID..."
                value={query}
                onChange={e => setQuery(e.target.value)}
                className="cyber-input pl-9"
              />
              {searching && <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-cyan-400 animate-spin" />}
            </div>
          </div>

          {/* Member List */}
          {loading ? (
            <div className="space-y-2">
              {[...Array(8)].map((_, i) => <div key={i} className="cyber-card h-16 animate-pulse bg-white/[0.03]" />)}
            </div>
          ) : members.length === 0 ? (
            <div className="cyber-card p-10 text-center">
              <Users size={28} className="text-gray-700 mx-auto mb-2" />
              <p className="text-sm text-gray-600">{query ? 'No members found' : 'No members to show'}</p>
            </div>
          ) : (
            <div className="cyber-card overflow-hidden">
              <div className="divide-y divide-white/[0.04]">
                {members.map((member, i) => (
                  <div key={member.id}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-white/[0.02] transition-colors group animate-fade-in"
                    style={{ animationDelay: `${Math.min(i, 20) * 30}ms` }}>
                    <MemberAvatar member={member} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold text-white truncate">
                          {member.displayName || member.username}
                        </p>
                        {member.isStaff && (
                          <span className="flex-shrink-0 flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">
                            <Crown size={8} /> Staff
                          </span>
                        )}
                        <WarnCount count={warnCounts[member.id]} />
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                        <span className="text-[11px] text-gray-600">@{member.username}</span>
                        <span className="text-[11px] text-gray-700">{member.roles} role{member.roles !== 1 ? 's' : ''}</span>
                        {member.joinedAt && (
                          <span className="text-[11px] text-gray-700">
                            Joined {new Date(member.joinedAt).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      <ActionMenu member={member} guildId={guild.id} onAction={handleAction} />
                    </div>
                  </div>
                ))}
              </div>
              <div className="px-4 py-2.5 border-t border-white/5 bg-white/[0.02]">
                <p className="text-[11px] text-gray-600">
                  Showing {members.length} member{members.length !== 1 ? 's' : ''}{query ? ` matching "${query}"` : ' (up to 50)'}
                </p>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

import React, { useState, useEffect } from 'react';
import { Trophy, MessageSquare, Mic, RefreshCw, Search, Download } from 'lucide-react';
import PageHeader from '../components/PageHeader.jsx';
import api from '../api.js';

const TABS = [
  { id: 'xp',       label: 'XP & Level',  icon: Trophy },
  { id: 'messages', label: 'Messages',     icon: MessageSquare },
  { id: 'voice',    label: 'Voice Time',   icon: Mic },
];

const RANK_STYLES = [
  'bg-yellow-500/20 text-yellow-300 border-yellow-500/40',
  'bg-gray-400/20 text-gray-300 border-gray-400/40',
  'bg-orange-600/20 text-orange-300 border-orange-600/40',
];

function formatVoice(ms) {
  if (!ms) return '0m';
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function StatBar({ value, max }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
      <div
        className="h-full bg-gradient-to-r from-cyan-500 to-cyan-400 rounded-full transition-all duration-500"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export default function Leaderboard({ guild }) {
  const [tab, setTab] = useState('xp');
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [query, setQuery] = useState('');

  const load = async (type) => {
    if (!guild?.id) return;
    setLoading(true);
    try {
      const res = await api.get(`/api/guild/${guild.id}/leaderboard?type=${type}`);
      setData(res || []);
      setLastUpdated(new Date());
    } catch (e) {
      setData([]);
    }
    setLoading(false);
  };

  useEffect(() => {
    load(tab);
  }, [tab, guild?.id]);

  const max = data[0]
    ? tab === 'xp' ? (data[0].textLevel * 100 + (data[0].textXp || 0))
    : tab === 'messages' ? data[0].messages
    : data[0].voiceTime
    : 1;

  const statValue = (entry) => {
    if (tab === 'xp') {
      const lvl = entry.textLevel || 0;
      const xp = entry.textXp || 0;
      return { primary: `Level ${lvl}`, secondary: `${xp.toLocaleString()} XP`, raw: lvl * 100 + xp };
    }
    if (tab === 'messages') {
      return { primary: (entry.messages || 0).toLocaleString(), secondary: 'messages', raw: entry.messages || 0 };
    }
    return { primary: formatVoice(entry.voiceTime), secondary: 'voice time', raw: entry.voiceTime || 0 };
  };

  const visible = query
    ? data.filter((e) => (e.username || '').toLowerCase().includes(query.toLowerCase()) || e.userId?.includes(query))
    : data;

  const exportCsv = () => {
    const rows = [['rank', 'user', 'userId', 'level', 'xp', 'messages', 'voiceMs'],
      ...data.map((e, i) => [i + 1, e.username, e.userId, e.textLevel || 0, e.textXp || 0, e.messages || 0, e.voiceTime || 0])];
    const blob = new Blob([rows.map((r) => r.join(',')).join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `leaderboard-${tab}-${guild?.id || 'server'}.csv`;
    a.click();
  };

  return (
    <div className="page-shell-sm">
      <PageHeader
        icon={Trophy}
        title="Leaderboard"
        subtitle={`${guild?.name || 'Server'} · Top 15${lastUpdated ? ` · ${lastUpdated.toLocaleTimeString()}` : ''}`}
      >
        <button onClick={exportCsv} disabled={!data.length} className="cyber-button flex items-center gap-1.5 text-xs">
          <Download size={12} /> CSV
        </button>
        <button onClick={() => load(tab)} disabled={loading} className="cyber-button flex items-center gap-1.5 text-xs">
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </PageHeader>

      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600" />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search members…" className="cyber-input pl-9" />
      </div>

      {/* Tabs */}
      <div className="seg-tabs">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={tab === id ? 'seg-tab-active' : 'seg-tab'}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      {/* Top 3 Podium */}
      {!loading && data.length >= 3 && (
        <div className="grid grid-cols-3 gap-3">
          {[data[1], data[0], data[2]].map((entry, i) => {
            const rank = i === 1 ? 1 : i === 0 ? 2 : 3;
            const stat = statValue(entry);
            return (
              <div
                key={entry.userId}
                className={`cyber-card flex flex-col items-center py-4 px-3 gap-2 border ${RANK_STYLES[rank - 1]} ${rank === 1 ? 'relative -top-2' : ''}`}
              >
                <div className="text-lg font-black">{['🥇','🥈','🥉'][rank-1]}</div>
                {entry.avatar
                  ? <img src={entry.avatar} alt="" className="w-12 h-12 rounded-full ring-2 ring-current object-cover" />
                  : <div className="w-12 h-12 rounded-full bg-cyan-500/20 flex items-center justify-center text-lg font-bold text-cyan-400">{entry.username?.[0]?.toUpperCase()}</div>
                }
                <p className="text-xs font-semibold text-white text-center truncate w-full">{entry.username}</p>
                <p className="text-sm font-bold">{stat.primary}</p>
                <p className="text-[10px] text-gray-500">{stat.secondary}</p>
              </div>
            );
          })}
        </div>
      )}

      {/* Full List */}
      <div className="cyber-card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16 gap-3">
            <div className="w-5 h-5 border-2 border-cyan-500/30 border-t-cyan-400 rounded-full animate-spin" />
            <span className="text-sm text-gray-500">Loading rankings...</span>
          </div>
        ) : data.length === 0 ? (
          <div className="text-center py-16 text-gray-600">
            <Trophy size={32} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">No data yet — members need to be active first.</p>
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {visible.map((entry, i) => {
              const stat = statValue(entry);
              const rankStyle = i < 3 ? RANK_STYLES[i] : 'text-gray-500';
              return (
                <div key={entry.userId} className="flex items-center gap-4 px-5 py-3 hover:bg-white/[0.02] transition-colors">
                  {/* Rank */}
                  <div className={`w-7 h-7 rounded-full border flex items-center justify-center text-xs font-bold flex-shrink-0 ${rankStyle}`}>
                    {i + 1}
                  </div>

                  {/* Avatar */}
                  {entry.avatar
                    ? <img src={entry.avatar} alt="" className="w-9 h-9 rounded-full object-cover flex-shrink-0" />
                    : <div className="w-9 h-9 rounded-full bg-cyan-500/10 flex items-center justify-center text-sm font-bold text-cyan-400 flex-shrink-0">{entry.username?.[0]?.toUpperCase()}</div>
                  }

                  {/* Name + bar */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white truncate">{entry.username}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <StatBar value={stat.raw} max={max} />
                      <span className="text-[10px] text-gray-500 flex-shrink-0">{stat.secondary}</span>
                    </div>
                  </div>

                  {/* Stat */}
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-bold text-cyan-400">{stat.primary}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

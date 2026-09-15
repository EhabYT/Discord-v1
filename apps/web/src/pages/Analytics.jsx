import React, { useState, useEffect, useCallback } from 'react';
import { BarChart3, MessageSquare, UserPlus, Terminal, TrendingUp, RefreshCw, Trophy, Download } from 'lucide-react';
import PageHeader from '../components/PageHeader.jsx';
import api from '../api.js';

function MiniBar({ value, max, color }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="flex flex-col items-center gap-1 flex-1">
      <div className="w-full flex items-end justify-center" style={{ height: 80 }}>
        <div
          className="w-full rounded-t-sm transition-all duration-500 min-h-[2px]"
          style={{ height: `${Math.max(2, pct)}%`, background: color, boxShadow: pct > 0 ? `0 0 6px ${color}60` : 'none' }}
        />
      </div>
    </div>
  );
}

function BarChart({ data, dataKey, color, label }) {
  const max = Math.max(...data.map(d => d[dataKey] || 0), 1);
  const now = new Date().getHours();
  const total = data.reduce((s, d) => s + (d[dataKey] || 0), 0);
  const peak = data.reduce((best, d) => ((d[dataKey] || 0) > (best.value || 0) ? { label: d.label, value: d[dataKey] } : best), { label: null, value: 0 });

  return (
    <div className="glass-panel p-4">
      <div className="flex items-center gap-2 mb-4">
        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: color, boxShadow: `0 0 10px ${color}` }} aria-hidden="true" />
        <span className="text-xs font-bold text-white">{label}</span>
        <span className="ml-auto text-[11px] text-zinc-400 tabular-nums">{total} total</span>
      </div>
      <div className="flex items-end gap-1 h-24" role="img" aria-label={`${label}: ${total} total${peak.label ? `, peak ${peak.label} with ${peak.value}` : ''}`}>
        {data.map((d, i) => (
          <div key={i} className="flex flex-col items-center flex-1 gap-1 relative group">
            <div className="eb-chart-tip" aria-hidden="true">
              {d.label}: {d[dataKey]}
            </div>
            <div className="w-full flex items-end justify-center" style={{ height: 80 }}>
              <div
                className="eb-chart-bar min-h-[2px]"
                style={{
                  '--bar': color,
                  height: `${Math.max(2, max > 0 ? (d[dataKey] / max) * 100 : 0)}%`,
                  opacity: i === now ? 1 : 0.45,
                  boxShadow: i === now && d[dataKey] > 0 ? `0 0 10px ${color}66` : 'none',
                }}
              />
            </div>
            {i % 4 === 0 && <span className="text-[10px] text-zinc-500 tabular-nums" aria-hidden="true">{d.label?.split(':')[0]}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Analytics({ guild }) {
  const [chart, setChart] = useState([]);
  const [commands, setCommands] = useState({ commands: [], total: 0 });
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!guild?.id) return;
    setRefreshing(true);
    try {
      const [c, cmd, s] = await Promise.all([
        api.get(`/api/guild/${guild.id}/analytics/chart`),
        api.get(`/api/guild/${guild.id}/analytics/commands`),
        api.get(`/api/guild/${guild.id}/analytics/summary`),
      ]);
      setChart(c);
      setCommands(cmd);
      setSummary(s);
    } catch (e) {}
    setRefreshing(false);
    setLoading(false);
  }, [guild?.id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { const t = setInterval(load, 60000); return () => clearInterval(t); }, [load]);

  if (!guild) return <div className="p-6 text-zinc-400 text-sm">Select a server first.</div>;

  const maxCmd = Math.max(...(commands.commands || []).map(c => c.count), 1);
  const chartSafe = Array.isArray(chart) ? chart : [];
  const peak = chartSafe.reduce((best, row) => {
    const total = (row.messages || 0) + (row.joins || 0) + (row.commands || 0);
    return total > (best.total || 0) ? { ...row, total } : best;
  }, { label: '—', total: 0 });

  const exportCsv = () => {
    const rows = [['hour', 'messages', 'joins', 'commands'], ...chartSafe.map((d) => [d.label, d.messages || 0, d.joins || 0, d.commands || 0])];
    const blob = new Blob([rows.map((r) => r.join(',')).join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `analytics-${guild.id}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  return (
    <div className="page-shell-sm">
      <PageHeader
        icon={BarChart3}
        title="Analytics"
        crumb={guild.name}
        subtitle={`24-hour activity · peak ${peak.label}${peak.total ? ` (${peak.total} events)` : ''}`}
        badge="Live"
        badgeColor="green"
      >
        <button onClick={exportCsv} disabled={!chartSafe.length} className="cyber-button flex items-center gap-1.5 text-xs">
          <Download size={12} /> CSV
        </button>
        <button onClick={load} disabled={refreshing} className="cyber-button flex items-center gap-1.5 text-xs">
          <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} /> Refresh
        </button>
      </PageHeader>

      {/* 24h Summary */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
        {[
          { icon: MessageSquare, label: 'Messages (24h)', value: summary?.messages24h ?? '—', color: 'cyan' },
          { icon: UserPlus,      label: 'Joins (24h)',    value: summary?.joins24h ?? '—',    color: 'green' },
          { icon: Terminal,      label: 'Commands (24h)', value: summary?.commands24h ?? '—', color: 'purple' },
          { icon: TrendingUp,    label: 'Online Now',     value: summary?.onlineCount ?? '—', color: 'yellow' },
          { icon: BarChart3,     label: 'Peak Hour',      value: peak.label,                  color: 'purple' },
        ].map(({ icon: Icon, label, value, color }) => (
          <div key={label} className="cyber-card p-4 flex items-center gap-3">
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
              color === 'cyan' ? 'bg-cyan-500/10 text-cyan-300' :
              color === 'green' ? 'bg-green-500/10 text-green-300' :
              color === 'purple' ? 'bg-purple-500/10 text-purple-300' :
              'bg-yellow-500/10 text-yellow-300'
            }`}>
              <Icon size={16} aria-hidden="true" />
            </div>
            <div>
              <p className="text-xs text-zinc-400">{label}</p>
              <p className="text-lg font-bold text-white tabular-nums">{typeof value === 'number' ? value.toLocaleString() : value}</p>
            </div>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="grid gap-4">
          {[...Array(3)].map((_, i) => <div key={i} className="cyber-card h-40 animate-pulse bg-white/5" />)}
        </div>
      ) : (
        <>
          {/* Charts */}
          <div className="grid md:grid-cols-3 gap-4 mb-5">
            <BarChart data={chartSafe} dataKey="messages" color="#00FFFF" label="Messages per Hour" />
            <BarChart data={chartSafe} dataKey="joins"    color="#00FF88" label="Member Joins per Hour" />
            <BarChart data={chartSafe} dataKey="commands" color="#AA55FF" label="Commands per Hour" />
          </div>

          {/* Command Usage */}
          <div className="cyber-card p-4">
            <div className="flex items-center gap-2 mb-4">
              <Trophy size={15} className="text-cyan-300" aria-hidden="true" />
              <span className="text-sm font-semibold text-white">Top Commands</span>
              <span className="ml-auto text-xs text-zinc-500 tabular-nums">{commands.total.toLocaleString()} total uses</span>
            </div>
            {commands.commands.length === 0 ? (
              <p className="text-xs text-zinc-500 text-center py-6">No command usage recorded yet</p>
            ) : (
              <div className="space-y-2.5" role="list" aria-label="Top commands by usage">
                {commands.commands.map((cmd, i) => (
                  <div key={cmd.name} role="listitem" aria-label={`Rank ${i + 1}: /${cmd.name}, ${cmd.count} uses`} className="flex items-center gap-3">
                    <span className={`text-xs font-bold w-5 text-right flex-shrink-0 tabular-nums ${i < 3 ? ['text-yellow-300','text-zinc-300','text-orange-300'][i] : 'text-zinc-500'}`} aria-hidden="true">{i + 1}</span>
                    <span className="text-xs font-mono text-cyan-300 w-28 truncate flex-shrink-0">/{cmd.name}</span>
                    <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden" role="progressbar" aria-label={`/${cmd.name} usage`} aria-valuemin={0} aria-valuemax={maxCmd} aria-valuenow={cmd.count}>
                      <div
                        className="h-full rounded-full bg-cyan-500 transition-all duration-500"
                        style={{ width: `${(cmd.count / maxCmd) * 100}%`, boxShadow: '0 0 6px rgba(0,255,255,0.5)' }}
                      />
                    </div>
                    <span className="text-xs text-zinc-400 w-10 text-right flex-shrink-0 tabular-nums">{cmd.count}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

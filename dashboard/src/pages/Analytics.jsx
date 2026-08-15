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

  return (
    <div className="cyber-card p-4">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-3 h-3 rounded-full" style={{ background: color, boxShadow: `0 0 6px ${color}` }} />
        <span className="text-xs font-semibold text-white">{label}</span>
        <span className="ml-auto text-xs text-gray-600">{data.reduce((s, d) => s + (d[dataKey] || 0), 0)} total</span>
      </div>
      <div className="flex items-end gap-0.5 h-24">
        {data.map((d, i) => (
          <div key={i} className="flex flex-col items-center flex-1 gap-1 relative group">
            <div className="absolute -top-6 left-1/2 -translate-x-1/2 hidden group-hover:block bg-gray-900 border border-white/10 text-[10px] text-white px-1.5 py-0.5 rounded whitespace-nowrap z-10">
              {d.label}: {d[dataKey]}
            </div>
            <div className="w-full flex items-end justify-center" style={{ height: 80 }}>
              <div
                className="w-full rounded-t-sm transition-all duration-500"
                style={{
                  height: `${Math.max(2, max > 0 ? (d[dataKey] / max) * 100 : 0)}%`,
                  background: i === now ? color : `${color}60`,
                  boxShadow: i === now && d[dataKey] > 0 ? `0 0 8px ${color}` : 'none'
                }}
              />
            </div>
            {i % 4 === 0 && <span className="text-[8px] text-gray-700">{d.label?.split(':')[0]}</span>}
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

  if (!guild) return <div className="p-6 text-gray-500 text-sm">Select a server first.</div>;

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
              color === 'cyan' ? 'bg-cyan-500/10 text-cyan-400' :
              color === 'green' ? 'bg-green-500/10 text-green-400' :
              color === 'purple' ? 'bg-purple-500/10 text-purple-400' :
              'bg-yellow-500/10 text-yellow-400'
            }`}>
              <Icon size={16} />
            </div>
            <div>
              <p className="text-xs text-gray-500">{label}</p>
              <p className="text-lg font-bold text-white">{typeof value === 'number' ? value.toLocaleString() : value}</p>
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
              <Trophy size={15} className="text-cyan-400" />
              <span className="text-sm font-semibold text-white">Top Commands</span>
              <span className="ml-auto text-xs text-gray-600">{commands.total.toLocaleString()} total uses</span>
            </div>
            {commands.commands.length === 0 ? (
              <p className="text-xs text-gray-600 text-center py-6">No command usage recorded yet</p>
            ) : (
              <div className="space-y-2.5">
                {commands.commands.map((cmd, i) => (
                  <div key={cmd.name} className="flex items-center gap-3">
                    <span className={`text-xs font-bold w-5 text-right flex-shrink-0 ${i < 3 ? ['text-yellow-400','text-gray-400','text-orange-400'][i] : 'text-gray-700'}`}>{i + 1}</span>
                    <span className="text-xs font-mono text-cyan-400 w-28 truncate flex-shrink-0">/{cmd.name}</span>
                    <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-cyan-500 transition-all duration-500"
                        style={{ width: `${(cmd.count / maxCmd) * 100}%`, boxShadow: '0 0 6px rgba(0,255,255,0.5)' }}
                      />
                    </div>
                    <span className="text-xs text-gray-500 w-10 text-right flex-shrink-0">{cmd.count}</span>
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

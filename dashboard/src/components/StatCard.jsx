import React from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';
import clsx from 'clsx';

const COLORS = {
  cyan:   {
    icon: 'text-cyan-300',
    iconBg: 'linear-gradient(135deg, rgba(34,211,238,0.22), rgba(56,189,248,0.08))',
    iconBorder: 'rgba(103,232,249,0.3)',
    iconGlow: '0 0 20px rgba(34,211,238,0.22)',
    accent: 'rgba(34,211,238,0.1)',
  },
  green:  {
    icon: 'text-green-300',
    iconBg: 'linear-gradient(135deg, rgba(34,197,94,0.22), rgba(16,185,129,0.08))',
    iconBorder: 'rgba(74,222,128,0.3)',
    iconGlow: '0 0 20px rgba(34,197,94,0.22)',
    accent: 'rgba(34,197,94,0.09)',
  },
  yellow: {
    icon: 'text-yellow-300',
    iconBg: 'linear-gradient(135deg, rgba(234,179,8,0.22), rgba(245,158,11,0.08))',
    iconBorder: 'rgba(250,204,21,0.3)',
    iconGlow: '0 0 20px rgba(234,179,8,0.22)',
    accent: 'rgba(234,179,8,0.09)',
  },
  purple: {
    icon: 'text-purple-300',
    iconBg: 'linear-gradient(135deg, rgba(168,85,247,0.22), rgba(129,140,248,0.08))',
    iconBorder: 'rgba(192,132,252,0.3)',
    iconGlow: '0 0 20px rgba(168,85,247,0.22)',
    accent: 'rgba(168,85,247,0.09)',
  },
  red:    {
    icon: 'text-red-300',
    iconBg: 'linear-gradient(135deg, rgba(239,68,68,0.22), rgba(244,63,94,0.08))',
    iconBorder: 'rgba(248,113,113,0.3)',
    iconGlow: '0 0 20px rgba(239,68,68,0.22)',
    accent: 'rgba(239,68,68,0.09)',
  },
  blue:   {
    icon: 'text-blue-300',
    iconBg: 'linear-gradient(135deg, rgba(59,130,246,0.22), rgba(56,189,248,0.08))',
    iconBorder: 'rgba(96,165,250,0.3)',
    iconGlow: '0 0 20px rgba(59,130,246,0.22)',
    accent: 'rgba(59,130,246,0.09)',
  },
};

export default function StatCard({ icon: Icon, label, value, sub, color = 'cyan', trend, onClick, className = '' }) {
  const c = COLORS[color] || COLORS.cyan;
  const Tag = onClick ? 'button' : 'div';
  // Truncated values (large counts, latency JSX) need a hover tooltip so the
  // full number stays discoverable for sighted users and screen readers.
  const valueText = typeof value === 'string' || typeof value === 'number' ? String(value) : undefined;

  return (
    <Tag
      onClick={onClick}
      className={clsx(
        'glass-panel mesh-glow p-4 flex items-center gap-4 animate-fade-in w-full text-left relative overflow-hidden group',
        onClick && 'cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:border-cyan-300/30 hover:shadow-[0_18px_44px_rgba(0,0,0,0.36),0_0_32px_rgba(34,211,238,0.1)] active:scale-[0.99]',
        className
      )}
    >
      {/* Accent wash in corner */}
      <div
        className="absolute top-0 right-0 w-28 h-28 rounded-full pointer-events-none transition-opacity group-hover:opacity-100 opacity-80"
        style={{ background: `radial-gradient(circle at top right, ${c.accent} 0%, transparent 70%)` }}
      />

      {Icon && (
        <div
          className={clsx('relative w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 border', c.icon)}
          style={{
            background: c.iconBg,
            borderColor: c.iconBorder,
            boxShadow: `${c.iconGlow}, inset 0 1px 0 rgba(255,255,255,0.14)`,
          }}
        >
          <Icon size={20} />
        </div>
      )}

      <div className="min-w-0 flex-1 relative">
        <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-[0.12em]">{label}</p>
        <p className="text-2xl font-bold text-white mt-0.5 truncate leading-tight tabular-nums tracking-tight" title={valueText}>{value ?? '—'}</p>
        {sub && <p className="text-[11px] text-zinc-400 mt-0.5 truncate" title={typeof sub === 'string' ? sub : undefined}>{sub}</p>}
      </div>

      {trend && (
        <div className={clsx(
          'flex items-center gap-1 text-xs font-bold flex-shrink-0 relative px-2 py-1 rounded-lg border',
          trend.positive
            ? 'text-green-300 border-green-400/20 bg-green-400/[0.07]'
            : 'text-red-300 border-red-400/20 bg-red-400/[0.07]'
        )}>
          {trend.positive ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
          {trend.value}
        </div>
      )}
    </Tag>
  );
}

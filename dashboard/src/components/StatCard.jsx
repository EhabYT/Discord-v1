import React from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';
import clsx from 'clsx';

const COLORS = {
  cyan:   {
    icon: 'text-cyan-400',
    iconBg: 'rgba(0,255,255,0.08)',
    iconBorder: 'rgba(0,255,255,0.15)',
    iconGlow: '0 0 16px rgba(0,255,255,0.15)',
    accent: 'rgba(0,255,255,0.06)',
  },
  green:  {
    icon: 'text-green-400',
    iconBg: 'rgba(34,197,94,0.08)',
    iconBorder: 'rgba(34,197,94,0.15)',
    iconGlow: '0 0 16px rgba(34,197,94,0.15)',
    accent: 'rgba(34,197,94,0.05)',
  },
  yellow: {
    icon: 'text-yellow-400',
    iconBg: 'rgba(234,179,8,0.08)',
    iconBorder: 'rgba(234,179,8,0.15)',
    iconGlow: '0 0 16px rgba(234,179,8,0.15)',
    accent: 'rgba(234,179,8,0.05)',
  },
  purple: {
    icon: 'text-purple-400',
    iconBg: 'rgba(168,85,247,0.08)',
    iconBorder: 'rgba(168,85,247,0.15)',
    iconGlow: '0 0 16px rgba(168,85,247,0.15)',
    accent: 'rgba(168,85,247,0.05)',
  },
  red:    {
    icon: 'text-red-400',
    iconBg: 'rgba(239,68,68,0.08)',
    iconBorder: 'rgba(239,68,68,0.15)',
    iconGlow: '0 0 16px rgba(239,68,68,0.15)',
    accent: 'rgba(239,68,68,0.05)',
  },
  blue:   {
    icon: 'text-blue-400',
    iconBg: 'rgba(59,130,246,0.08)',
    iconBorder: 'rgba(59,130,246,0.15)',
    iconGlow: '0 0 16px rgba(59,130,246,0.15)',
    accent: 'rgba(59,130,246,0.05)',
  },
};

export default function StatCard({ icon: Icon, label, value, sub, color = 'cyan', trend, onClick, className = '' }) {
  const c = COLORS[color] || COLORS.cyan;
  const Tag = onClick ? 'button' : 'div';

  return (
    <Tag
      onClick={onClick}
      className={clsx(
        'cyber-card p-4 flex items-center gap-4 animate-fade-in w-full text-left relative overflow-hidden',
        onClick && 'cursor-pointer transition-all duration-200 hover:border-cyan-500/25 hover:bg-white/[0.055]',
        className
      )}
      style={onClick ? { '--hover-shadow': `0 0 24px ${c.accent}` } : undefined}
    >
      {/* Subtle accent gradient in corner */}
      <div
        className="absolute top-0 right-0 w-24 h-24 rounded-full pointer-events-none"
        style={{ background: `radial-gradient(circle at top right, ${c.accent} 0%, transparent 70%)` }}
      />

      {Icon && (
        <div
          className={clsx('w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0', c.icon)}
          style={{
            background: c.iconBg,
            border: `1px solid ${c.iconBorder}`,
            boxShadow: c.iconGlow,
          }}
        >
          <Icon size={20} />
        </div>
      )}

      <div className="min-w-0 flex-1">
        <p className="text-[10px] text-gray-500 font-semibold uppercase tracking-[0.1em]">{label}</p>
        <p className="text-2xl font-bold text-white mt-0.5 truncate leading-tight">{value ?? '—'}</p>
        {sub && <p className="text-[11px] text-gray-600 mt-0.5">{sub}</p>}
      </div>

      {trend && (
        <div className={clsx(
          'flex items-center gap-1 text-xs font-semibold flex-shrink-0 relative',
          trend.positive ? 'text-green-400' : 'text-red-400'
        )}>
          {trend.positive ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
          {trend.value}
        </div>
      )}
    </Tag>
  );
}

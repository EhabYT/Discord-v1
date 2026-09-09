import React from 'react';

const BADGE_STYLES = {
  cyan:   'bg-cyan-500/[0.12]   text-cyan-300   border-cyan-500/25',
  green:  'bg-green-500/[0.12]  text-green-300  border-green-500/25',
  yellow: 'bg-yellow-500/[0.12] text-yellow-300 border-yellow-500/25',
  red:    'bg-red-500/[0.12]    text-red-300    border-red-500/25',
  purple: 'bg-purple-500/[0.12] text-purple-300 border-purple-500/25',
};

const ICON_STYLES = {
  cyan:   { bg: 'bg-gradient-to-br from-cyan-400/25 to-sky-500/10',   text: 'text-cyan-200',   glow: '0 0 24px rgba(34,211,238,0.22)', ring: 'rgba(103,232,249,0.3)' },
  green:  { bg: 'bg-gradient-to-br from-green-400/25 to-emerald-500/10',  text: 'text-green-200',  glow: '0 0 24px rgba(34,197,94,0.22)', ring: 'rgba(74,222,128,0.3)' },
  yellow: { bg: 'bg-gradient-to-br from-yellow-400/25 to-amber-500/10', text: 'text-yellow-200', glow: '0 0 24px rgba(234,179,8,0.22)', ring: 'rgba(250,204,21,0.3)' },
  red:    { bg: 'bg-gradient-to-br from-red-400/25 to-rose-500/10',    text: 'text-red-200',    glow: '0 0 24px rgba(239,68,68,0.22)', ring: 'rgba(248,113,113,0.3)' },
  purple: { bg: 'bg-gradient-to-br from-purple-400/25 to-indigo-500/10', text: 'text-purple-200', glow: '0 0 24px rgba(168,85,247,0.22)', ring: 'rgba(192,132,252,0.3)' },
};

export default function PageHeader({
  icon: Icon,
  iconColor,
  iconBg,
  accentColor = 'cyan',
  title,
  subtitle,
  badge,
  badgeColor = 'cyan',
  crumb,
  children,
}) {
  const iconStyle = ICON_STYLES[accentColor] || ICON_STYLES.cyan;
  const resolvedIconBg   = iconBg    || iconStyle.bg;
  const resolvedIconText = iconColor || iconStyle.text;

  return (
    <div className="glass-panel mesh-glow p-5 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 relative">
        <div className="flex items-center gap-4 min-w-0">
          {Icon && (
            <div className="relative flex-shrink-0">
              <div
                className="absolute -inset-1.5 rounded-[1.1rem] blur-lg opacity-50 pointer-events-none"
                style={{ background: `linear-gradient(135deg, ${iconStyle.ring}, transparent 70%)` }}
                aria-hidden="true"
              />
              <div
                className={`relative w-12 h-12 rounded-2xl flex items-center justify-center border ${resolvedIconBg} ${resolvedIconText}`}
                style={{ boxShadow: `${iconStyle.glow}, inset 0 1px 0 rgba(255,255,255,0.14)`, borderColor: iconStyle.ring }}
              >
                <Icon size={21} aria-hidden="true" />
              </div>
            </div>
          )}
          <div className="min-w-0">
            {crumb && (
              <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-400 mb-1 truncate font-semibold">{crumb}</p>
            )}
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-[1.45rem] font-bold text-white leading-tight tracking-tight break-words">
                {title}
              </h1>
              {badge && (
                <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold tracking-wide tabular-nums ${BADGE_STYLES[badgeColor] || BADGE_STYLES.cyan}`}>
                  {badge}
                </span>
              )}
            </div>
            {subtitle && (
              <p className="text-zinc-400 text-xs mt-1 leading-relaxed max-w-2xl break-words">{subtitle}</p>
            )}
          </div>
        </div>

        {children && (
          <div className="flex items-center gap-2 flex-shrink-0 flex-wrap w-full sm:w-auto [&>button]:min-h-[40px] [&>a]:min-h-[40px] [&>a]:inline-flex [&>a]:items-center">
            {children}
          </div>
        )}
      </div>
    </div>
  );
}

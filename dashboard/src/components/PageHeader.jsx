import React from 'react';

const BADGE_STYLES = {
  cyan:   'bg-cyan-500/[0.12]   text-cyan-300   border-cyan-500/25',
  green:  'bg-green-500/[0.12]  text-green-300  border-green-500/25',
  yellow: 'bg-yellow-500/[0.12] text-yellow-300 border-yellow-500/25',
  red:    'bg-red-500/[0.12]    text-red-300    border-red-500/25',
  purple: 'bg-purple-500/[0.12] text-purple-300 border-purple-500/25',
};

const ICON_STYLES = {
  cyan:   { bg: 'bg-cyan-500/10',   text: 'text-cyan-300',   glow: '0 0 20px rgba(0,255,255,0.15)' },
  green:  { bg: 'bg-green-500/10',  text: 'text-green-300',  glow: '0 0 20px rgba(34,197,94,0.15)' },
  yellow: { bg: 'bg-yellow-500/10', text: 'text-yellow-300', glow: '0 0 20px rgba(234,179,8,0.15)' },
  red:    { bg: 'bg-red-500/10',    text: 'text-red-300',    glow: '0 0 20px rgba(239,68,68,0.15)' },
  purple: { bg: 'bg-purple-500/10', text: 'text-purple-300', glow: '0 0 20px rgba(168,85,247,0.15)' },
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
    <div className="mb-1">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3.5 min-w-0">
          {Icon && (
            <div
              className={`w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0 ${resolvedIconBg} ${resolvedIconText}`}
              style={{ boxShadow: `${iconStyle.glow}, inset 0 1px 0 rgba(255,255,255,0.08)` }}
            >
              <Icon size={20} />
            </div>
          )}
          <div className="min-w-0">
            {crumb && (
              <p className="text-[10px] uppercase tracking-[0.16em] text-zinc-500 mb-0.5 truncate">{crumb}</p>
            )}
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-[1.35rem] font-bold text-white leading-tight tracking-tight">
                {title}
              </h1>
              {badge && (
                <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold tracking-wide ${BADGE_STYLES[badgeColor] || BADGE_STYLES.cyan}`}>
                  {badge}
                </span>
              )}
            </div>
            {subtitle && (
              <p className="text-zinc-500 text-xs mt-0.5 leading-relaxed">{subtitle}</p>
            )}
          </div>
        </div>

        {children && (
          <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
            {children}
          </div>
        )}
      </div>
      <div className="mt-5 h-px bg-gradient-to-r from-cyan-400/25 via-indigo-400/10 to-transparent" />
    </div>
  );
}

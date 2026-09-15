import React, { useId } from 'react';

export default function GaugeChart({ value = 0, label, color = '#22d3ee', size = 100 }) {
  const gid = useId();
  const r = 38;
  const cx = size / 2;
  const cy = size / 2;
  const circ = 2 * Math.PI * r;
  const half = circ / 2;
  const offset = half - (Math.min(100, Math.max(0, value)) / 100) * half;
  const pct = Math.min(100, Math.max(0, value));

  const getColor = (v) => {
    if (v < 50) return '#22d3ee';
    if (v < 80) return '#f59e0b';
    return '#f87171';
  };

  const c = color === 'auto' ? getColor(pct) : color;

  return (
    <div className="flex flex-col items-center gap-1">
      <svg
        width={size}
        height={size / 2 + 10}
        viewBox={`0 0 ${size} ${size / 2 + 10}`}
        role="img"
        aria-label={label ? `${label}: ${pct}%` : `${pct}%`}
      >
        <defs>
          <linearGradient id={`${gid}-track`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="rgba(255,255,255,0.1)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0.05)" />
          </linearGradient>
          <linearGradient id={`${gid}-val`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={c} stopOpacity="0.65" />
            <stop offset="100%" stopColor={c} />
          </linearGradient>
        </defs>
        <path
          d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          fill="none"
          stroke={`url(#${gid}-track)`}
          strokeWidth="8"
          strokeLinecap="round"
        />
        <path
          d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          fill="none"
          stroke={`url(#${gid}-val)`}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={`${half} ${half}`}
          strokeDashoffset={offset}
          style={{ filter: `drop-shadow(0 0 5px ${c}66)`, transition: 'stroke-dashoffset 0.5s ease' }}
        />
        <text x={cx} y={cy + 6} textAnchor="middle" fill="white" fontSize="14" fontWeight="700" fontFamily="Outfit, sans-serif" className="tabular-nums">
          {pct}%
        </text>
      </svg>
      {label && <p className="text-[11px] text-zinc-400 font-medium">{label}</p>}
    </div>
  );
}

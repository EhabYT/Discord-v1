import React from 'react';

export default function GaugeChart({ value = 0, label, color = '#00FFFF', size = 100 }) {
  const r = 38;
  const cx = size / 2;
  const cy = size / 2;
  const circ = 2 * Math.PI * r;
  const half = circ / 2;
  const offset = half - (Math.min(100, Math.max(0, value)) / 100) * half;
  const pct = Math.min(100, Math.max(0, value));

  const getColor = (v) => {
    if (v < 50) return '#00FFFF';
    if (v < 80) return '#FFA500';
    return '#FF4444';
  };

  const c = color === 'auto' ? getColor(pct) : color;

  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={size} height={size / 2 + 10} viewBox={`0 0 ${size} ${size / 2 + 10}`}>
        <path
          d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth="8"
          strokeLinecap="round"
        />
        <path
          d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          fill="none"
          stroke={c}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={`${half} ${half}`}
          strokeDashoffset={offset}
          style={{ filter: `drop-shadow(0 0 4px ${c})`, transition: 'stroke-dashoffset 0.5s ease' }}
        />
        <text x={cx} y={cy + 6} textAnchor="middle" fill="white" fontSize="14" fontWeight="700" fontFamily="Inter">
          {pct}%
        </text>
      </svg>
      {label && <p className="text-xs text-gray-500 font-medium">{label}</p>}
    </div>
  );
}

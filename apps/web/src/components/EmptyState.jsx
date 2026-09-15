import React from 'react';

export default function EmptyState({ icon: Icon, title, subtitle, action }) {
  return (
    <div className="empty-state px-4 py-14">
      {Icon && (
        <div className="relative mb-4">
          <div className="absolute -inset-2 rounded-3xl bg-gradient-to-br from-cyan-400/15 to-indigo-400/10 blur-xl pointer-events-none" />
          <div className="empty-state-icon relative !w-16 !h-16 !rounded-3xl bg-gradient-to-b from-white/[0.07] to-white/[0.02]">
            <Icon size={24} className="text-cyan-200/90" />
          </div>
        </div>
      )}
      {title && <p className="empty-state-title !text-[15px]">{title}</p>}
      {subtitle && <p className="empty-state-sub !max-w-sm leading-relaxed">{subtitle}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

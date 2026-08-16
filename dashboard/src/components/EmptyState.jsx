import React from 'react';

export default function EmptyState({ icon: Icon, title, subtitle, action }) {
  return (
    <div className="empty-state px-4">
      {Icon && (
        <div className="empty-state-icon">
          <Icon size={22} className="text-cyan-300/80" />
        </div>
      )}
      {title && <p className="empty-state-title">{title}</p>}
      {subtitle && <p className="empty-state-sub">{subtitle}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

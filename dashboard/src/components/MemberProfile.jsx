import React, { useEffect, useState } from 'react';
import { Clock, Copy, Hash, MessageSquare, Mic, Shield, StickyNote, Trophy, X } from 'lucide-react';
import api from '../api.js';
import { copyText } from '../lib/clipboard.js';
import { useToast } from './Toast.jsx';
import { useI18n } from '../i18n.jsx';

function formatVoice(ms) {
  if (!ms) return '0m';
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export default function MemberProfile({ guild, member, onClose, onOpenNotes }) {
  const toast = useToast();
  const { t } = useI18n();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!guild?.id || !member?.id) return;
    let cancelled = false;
    // Clear stale data immediately so switching members never flashes the
    // previous member's stats, and ignore out-of-order responses.
    setData(null);
    setLoading(true);
    api.get(`/api/guild/${guild.id}/user/${member.id}`)
      .then((d) => { if (!cancelled) setData(d); })
      .catch(() => { if (!cancelled) setData(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [guild?.id, member?.id]);

  // Close on Escape like every other overlay (palette, modals, popovers).
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const name = data?.displayName || member.displayName || member.username;
  const avatar = data?.avatar || member.avatar;
  const xp = data?.xp || {};
  const stats = data?.stats || {};

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-md animate-fade-in" onClick={onClose} />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={t('mem.profileOf', 'Profile of {name}').replace('{name}', name || member?.id || '')}
        className="member-drawer relative z-10 w-full max-w-md h-full flex flex-col animate-slide-right border-l border-white/10 bg-gradient-to-b from-[#0C121C] to-[#070A0F]"
      >
        <div className="member-drawer-edge absolute inset-y-0 left-0 w-px bg-gradient-to-b from-cyan-300/25 via-transparent to-indigo-400/20 pointer-events-none" aria-hidden="true" />
        <div className="flex items-start gap-3 px-5 py-4 border-b border-white/[0.06] glass-header">
          {avatar
            ? <img src={avatar} alt="" className="w-14 h-14 rounded-2xl object-cover ring-2 ring-cyan-300/30 shadow-[0_0_20px_rgba(34,211,238,0.15)]" />
            : <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-cyan-400/25 to-indigo-400/25 border border-white/10 flex items-center justify-center text-lg font-bold text-cyan-200">{(name || '?')[0]}</div>}
          <div className="min-w-0 flex-1">
            <p className="text-base font-bold text-white truncate tracking-tight">{name}</p>
            <p className="text-xs text-zinc-400 truncate">@{data?.username || member.username}</p>
            <button
              onClick={async () => { if (await copyText(member.id)) toast.success(t('mem.copied', 'User ID copied')); }}
              title={t('mem.copyIdTitle', 'Copy user ID')}
              className="text-[11px] text-zinc-500 hover:text-cyan-200 font-mono mt-0.5 truncate transition-colors"
            >
              {member.id}
            </button>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-xl text-zinc-500 hover:text-zinc-100 hover:bg-white/[0.07] transition-all"
            aria-label={t('mem.close', 'Close profile')}
            autoFocus
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4" aria-busy={loading}>
          {loading ? (
            <div className="space-y-2" aria-label={t('shell.loadingPage', 'Loading page')}>{[...Array(4)].map((_, i) => <div key={i} className="h-16 skeleton" />)}</div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2">
                <div className="cyber-card p-3">
                  <p className="text-[10px] text-zinc-500 uppercase tracking-wide flex items-center gap-1"><Trophy size={10} /> {t('mem.level', 'Level')}</p>
                  <p className="text-lg font-bold text-cyan-300 tabular-nums">{xp.textLevel || 0}</p>
                  <p className="text-[11px] text-zinc-500 tabular-nums">{(xp.textXp || 0).toLocaleString()} XP</p>
                </div>
                <div className="cyber-card p-3">
                  <p className="text-[10px] text-zinc-500 uppercase tracking-wide flex items-center gap-1"><Shield size={10} /> {t('mem.warnings', 'Warnings')}</p>
                  <p className="text-lg font-bold text-yellow-300 tabular-nums">{data?.warnings || 0}</p>
                </div>
                <div className="cyber-card p-3">
                  <p className="text-[10px] text-zinc-500 uppercase tracking-wide flex items-center gap-1"><MessageSquare size={10} /> {t('mem.messages', 'Messages')}</p>
                  <p className="text-lg font-bold text-white tabular-nums">{(stats.messages || 0).toLocaleString()}</p>
                </div>
                <div className="cyber-card p-3">
                  <p className="text-[10px] text-zinc-500 uppercase tracking-wide flex items-center gap-1"><Mic size={10} /> {t('mem.voice', 'Voice')}</p>
                  <p className="text-lg font-bold text-white tabular-nums">{formatVoice(stats.voiceTime)}</p>
                </div>
              </div>

              {(data?.joinedAt || member.joinedAt) && (
                <div className="cyber-card p-3 flex items-center gap-2 text-xs text-zinc-400">
                  <Clock size={13} className="text-cyan-400 flex-shrink-0" />
                  {t('mem.joined', 'Joined')} {new Date(data?.joinedAt || member.joinedAt).toLocaleString()}
                </div>
              )}

              <div className="cyber-card p-3">
                <p className="cyber-label mb-2 flex items-center gap-1"><Hash size={10} /> {t('mem.roles', 'Roles')}</p>
                <div className="flex flex-wrap gap-1.5">
                  {(data?.roles || []).length === 0 ? (
                    <span className="text-xs text-zinc-500">{t('mem.noRoles', 'No extra roles')}</span>
                  ) : data.roles.map((r) => {
                    const color = r.color && r.color !== '#000000' ? r.color : '#d4d4d8';
                    return (
                      <span key={r.id} className="inline-flex items-center gap-1.5 text-[11px] px-2 py-0.5 rounded-full border border-white/10 bg-white/[0.02]" style={{ color }}>
                        <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: color, boxShadow: `0 0 6px ${color}` }} />
                        {r.name}
                      </span>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>

        <div className="p-4 border-t border-white/[0.06] glass-header flex gap-2">
          <button
            onClick={async () => { if (await copyText(member.id)) toast.success(t('mem.copied', 'User ID copied')); }}
            className="cyber-button flex-1 flex items-center justify-center gap-1.5 text-xs !rounded-xl !py-2.5"
          >
            <Copy size={12} /> {t('mem.copyId', 'Copy ID')}
          </button>
          <button
            onClick={() => onOpenNotes?.(member)}
            className="cyber-button-solid flex-1 flex items-center justify-center gap-1.5 text-xs !py-2.5"
          >
            <StickyNote size={12} /> {t('mem.notes', 'Notes')}
          </button>
        </div>
      </aside>
    </div>
  );
}

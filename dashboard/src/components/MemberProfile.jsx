import React, { useEffect, useState } from 'react';
import { Clock, Copy, Hash, MessageSquare, Mic, Shield, StickyNote, Trophy, X } from 'lucide-react';
import api from '../api.js';
import { copyText } from '../lib/clipboard.js';
import { useToast } from './Toast.jsx';

function formatVoice(ms) {
  if (!ms) return '0m';
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export default function MemberProfile({ guild, member, onClose, onOpenNotes }) {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!guild?.id || !member?.id) return;
    setLoading(true);
    api.get(`/api/guild/${guild.id}/user/${member.id}`)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [guild?.id, member?.id]);

  const name = data?.displayName || member.displayName || member.username;
  const avatar = data?.avatar || member.avatar;
  const xp = data?.xp || {};
  const stats = data?.stats || {};

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/55 backdrop-blur-sm" onClick={onClose} />
      <aside className="relative z-10 w-full max-w-md h-full bg-[#070A0F] border-l border-white/10 flex flex-col animate-slide-in">
        <div className="flex items-start gap-3 px-5 py-4 border-b border-white/[0.06]">
          {avatar
            ? <img src={avatar} alt="" className="w-14 h-14 rounded-2xl object-cover ring-2 ring-cyan-400/30" />
            : <div className="w-14 h-14 rounded-2xl bg-cyan-500/10 flex items-center justify-center text-lg font-bold text-cyan-300">{(name || '?')[0]}</div>}
          <div className="min-w-0 flex-1">
            <p className="text-base font-semibold text-white truncate">{name}</p>
            <p className="text-xs text-zinc-500 truncate">@{data?.username || member.username}</p>
            <p className="text-[11px] text-zinc-600 font-mono mt-0.5 truncate">{member.id}</p>
          </div>
          <button onClick={onClose} className="cyber-icon-button" aria-label="Close"><X size={16} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {loading ? (
            <div className="space-y-2">{[...Array(4)].map((_, i) => <div key={i} className="h-16 skeleton" />)}</div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2">
                <div className="cyber-card p-3">
                  <p className="text-[10px] text-zinc-500 uppercase tracking-wide flex items-center gap-1"><Trophy size={10} /> Level</p>
                  <p className="text-lg font-bold text-cyan-300">{xp.textLevel || 0}</p>
                  <p className="text-[11px] text-zinc-600">{(xp.textXp || 0).toLocaleString()} XP</p>
                </div>
                <div className="cyber-card p-3">
                  <p className="text-[10px] text-zinc-500 uppercase tracking-wide flex items-center gap-1"><Shield size={10} /> Warnings</p>
                  <p className="text-lg font-bold text-yellow-300">{data?.warnings || 0}</p>
                </div>
                <div className="cyber-card p-3">
                  <p className="text-[10px] text-zinc-500 uppercase tracking-wide flex items-center gap-1"><MessageSquare size={10} /> Messages</p>
                  <p className="text-lg font-bold text-white">{(stats.messages || 0).toLocaleString()}</p>
                </div>
                <div className="cyber-card p-3">
                  <p className="text-[10px] text-zinc-500 uppercase tracking-wide flex items-center gap-1"><Mic size={10} /> Voice</p>
                  <p className="text-lg font-bold text-white">{formatVoice(stats.voiceTime)}</p>
                </div>
              </div>

              {(data?.joinedAt || member.joinedAt) && (
                <div className="cyber-card p-3 flex items-center gap-2 text-xs text-zinc-400">
                  <Clock size={13} className="text-cyan-400" />
                  Joined {new Date(data?.joinedAt || member.joinedAt).toLocaleString()}
                </div>
              )}

              <div className="cyber-card p-3">
                <p className="cyber-label mb-2 flex items-center gap-1"><Hash size={10} /> Roles</p>
                <div className="flex flex-wrap gap-1.5">
                  {(data?.roles || []).length === 0 ? (
                    <span className="text-xs text-zinc-600">No extra roles</span>
                  ) : data.roles.map((r) => (
                    <span key={r.id} className="text-[11px] px-2 py-0.5 rounded-full border border-white/10" style={{ color: r.color && r.color !== '#000000' ? r.color : '#d4d4d8' }}>
                      {r.name}
                    </span>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        <div className="p-4 border-t border-white/[0.06] flex gap-2">
          <button
            onClick={async () => { if (await copyText(member.id)) toast.success('User ID copied'); }}
            className="cyber-button flex-1 flex items-center justify-center gap-1.5 text-xs"
          >
            <Copy size={12} /> Copy ID
          </button>
          <button
            onClick={() => onOpenNotes?.(member)}
            className="cyber-button-solid flex-1 flex items-center justify-center gap-1.5 text-xs"
          >
            <StickyNote size={12} /> Notes
          </button>
        </div>
      </aside>
    </div>
  );
}

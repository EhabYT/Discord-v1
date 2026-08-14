import React, { useState, useEffect, useCallback } from 'react';
import {
  Play, Pause, SkipForward, Square, Shuffle, Repeat, Volume2, Search,
  Loader2, Music2, Trash2, Repeat1, Mic2, ScrollText, Sparkles, X,
} from 'lucide-react';
import PageHeader from '../components/PageHeader.jsx';
import EmptyState from '../components/EmptyState.jsx';
import { useToast } from '../components/Toast.jsx';
import api from '../api.js';

const FILTERS = ['bassboost', 'nightcore', 'vaporwave', 'lofi', '8d', 'treble'];
const LOOP_MODES = [
  { mode: 0, label: 'Off', icon: Repeat },
  { mode: 1, label: 'Track', icon: Repeat1 },
  { mode: 2, label: 'Queue', icon: Repeat },
];

export default function MusicController({ guild }) {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [volume, setVolume] = useState(50);
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [actionPending, setActionPending] = useState('');
  const [voiceChannels, setVoiceChannels] = useState([]);
  const [voiceId, setVoiceId] = useState('');
  const [lyrics, setLyrics] = useState(null);
  const [lyricsOpen, setLyricsOpen] = useState(false);
  const [lyricsLoading, setLyricsLoading] = useState(false);

  const load = useCallback(async () => {
    if (!guild?.id) return;
    try {
      const d = await api.get(`/api/music/${guild.id}`);
      setData(d);
      if (d?.volume !== undefined) setVolume(d.volume);
    } catch { setData(null); }
    setLoading(false);
  }, [guild?.id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!guild?.id) return;
    api.get(`/api/music/${guild.id}/channels`).then((list) => {
      setVoiceChannels(list || []);
      const busy = (list || []).find((c) => c.members > 0);
      if (busy) setVoiceId((cur) => cur || busy.id);
    }).catch(() => {});
  }, [guild?.id]);
  useEffect(() => {
    const t = setInterval(() => { if (data?.current) load(); }, 3000);
    return () => clearInterval(t);
  }, [data?.current, load]);

  const action = async (endpoint, body = {}, okMsg) => {
    setActionPending(endpoint);
    try {
      const res = await api.post(`/api/music/${guild.id}/${endpoint}`, body);
      if (okMsg) toast.success(okMsg);
      await load();
      return res;
    } catch (e) {
      toast.error(e.message || `Failed: ${endpoint}`);
    } finally {
      setActionPending('');
    }
    return null;
  };

  const doSearch = async () => {
    if (!search.trim()) return;
    setSearching(true);
    try {
      const r = await api.post(`/api/music/${guild.id}/search`, { query: search });
      setSearchResults(r.tracks || []);
      if (!(r.tracks || []).length) toast.info('No tracks found');
    } catch (e) {
      toast.error(e.message || 'Search failed');
    }
    setSearching(false);
  };

  const playTrack = async (url) => {
    const res = await action('play-remote', { url, channelId: voiceId || undefined }, 'Queued');
    if (res) { setSearchResults([]); setSearch(''); }
  };

  const loadLyrics = async () => {
    const q = data?.current ? `${data.current.title} ${data.current.author || ''}` : '';
    if (!q.trim()) return;
    setLyricsLoading(true);
    setLyricsOpen(true);
    try {
      const r = await api.get(`/api/music/${guild.id}/lyrics?query=${encodeURIComponent(q)}`);
      setLyrics(r);
    } catch (e) {
      setLyrics(null);
      toast.error(e.message || 'No lyrics found');
    }
    setLyricsLoading(false);
  };

  const removeAt = (index) => action('queue/remove', { index }, 'Removed from queue');

  if (!guild) return <div className="p-6 text-gray-500 text-sm">Select a server first.</div>;

  const hasTrack = !!data?.current;
  const paused = !!data?.paused;
  const nextLoop = ((data?.repeatMode || 0) + 1) % 3;
  const LoopIcon = LOOP_MODES[data?.repeatMode || 0]?.icon || Repeat;

  return (
    <div className="page-shell-sm">
      <PageHeader
        icon={Music2}
        title="Music"
        crumb={guild.name}
        subtitle={data?.voiceChannel?.name ? `Playing in #${data.voiceChannel.name}` : `Playback and queue for ${guild.name}`}
        badge={hasTrack ? (paused ? 'Paused' : 'Playing') : 'Idle'}
        badgeColor={hasTrack ? (paused ? 'yellow' : 'green') : 'cyan'}
      />

      <div className="grid md:grid-cols-5 gap-4">
        <div className="md:col-span-3 cyber-card p-5">
          {loading ? (
            <div className="flex items-center gap-3 h-20">
              <Loader2 size={18} className="animate-spin text-cyan-400" />
              <span className="text-sm text-gray-500">Loading...</span>
            </div>
          ) : !hasTrack ? (
            <EmptyState
              icon={Music2}
              title="Nothing is playing"
              subtitle="Search below or use /play in Discord to start a track."
            />
          ) : (
            <>
              <div className="flex gap-4 mb-4">
                {data.current?.thumbnail && (
                  <img src={data.current.thumbnail} alt="" className="w-16 h-16 rounded-lg object-cover ring-1 ring-cyan-500/30 flex-shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-white truncate">{data.current?.title}</p>
                  <p className="text-xs text-gray-500 mt-0.5 truncate">{data.current?.author}</p>
                  <div className="flex items-center gap-2 mt-2">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${data.current?.source === 'spotify' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                      {data.current?.source?.toUpperCase()}
                    </span>
                    <span className="text-xs text-gray-500">{data.current?.position} / {data.current?.duration}</span>
                    {data.voiceChannel && (
                      <span className="text-[10px] text-zinc-500 flex items-center gap-1"><Mic2 size={10} />{data.voiceChannel.name}</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="h-1.5 rounded-full bg-white/10 mb-5 overflow-hidden">
                <div
                  className="h-full rounded-full bg-cyan-500 transition-all duration-1000"
                  style={{ width: `${data.current?.progress || 0}%`, boxShadow: '0 0 8px rgba(0,255,255,0.6)' }}
                />
              </div>

              <div className="flex items-center justify-center gap-3">
                <button onClick={() => action('shuffle', {}, 'Queue shuffled')} title="Shuffle"
                  className={`p-2 rounded-lg transition-all ${actionPending === 'shuffle' ? 'text-cyan-400' : 'text-gray-500 hover:text-cyan-400 hover:bg-cyan-500/10'}`}>
                  <Shuffle size={16} />
                </button>
                <button onClick={() => action('skip', {}, 'Skipped')} title="Skip"
                  className={`p-2.5 rounded-xl transition-all ${actionPending === 'skip' ? 'text-cyan-400 bg-cyan-500/20' : 'text-gray-400 hover:text-white hover:bg-white/10'}`}>
                  <SkipForward size={18} />
                </button>
                <button
                  onClick={() => action('pause', {}, paused ? 'Resumed' : 'Paused')}
                  title={paused ? 'Resume' : 'Pause'}
                  className="w-12 h-12 rounded-full bg-cyan-500 hover:bg-cyan-400 text-black flex items-center justify-center transition-all shadow-cyan-glow"
                >
                  {actionPending === 'pause' ? <Loader2 size={20} className="animate-spin" /> : paused ? <Play size={20} /> : <Pause size={20} />}
                </button>
                <button onClick={() => action('stop', {}, 'Stopped')} title="Stop"
                  className="p-2.5 rounded-xl text-gray-400 hover:text-red-400 hover:bg-red-500/10 transition-all">
                  <Square size={18} />
                </button>
                <button
                  onClick={() => action('loop', { mode: nextLoop }, `Loop: ${LOOP_MODES[nextLoop].label}`)}
                  title={`Loop: ${LOOP_MODES[data?.repeatMode || 0]?.label || 'Off'}`}
                  className={`p-2 rounded-lg transition-all ${(data?.repeatMode || 0) > 0 ? 'text-cyan-400 bg-cyan-500/10' : 'text-gray-500 hover:text-cyan-400 hover:bg-cyan-500/10'}`}
                >
                  <LoopIcon size={16} />
                </button>
                <button
                  onClick={() => action('autoplay', { enabled: data?.repeatMode !== 3 }, data?.repeatMode === 3 ? 'Autoplay off' : 'Autoplay on')}
                  title="Autoplay similar tracks"
                  className={`p-2 rounded-lg transition-all ${data?.repeatMode === 3 ? 'text-cyan-400 bg-cyan-500/10' : 'text-gray-500 hover:text-cyan-400 hover:bg-cyan-500/10'}`}
                >
                  <Sparkles size={16} />
                </button>
                <button
                  onClick={loadLyrics}
                  title="Lyrics"
                  className="p-2 rounded-lg text-gray-500 hover:text-cyan-400 hover:bg-cyan-500/10 transition-all"
                >
                  <ScrollText size={16} />
                </button>
              </div>

              <div className="flex items-center gap-3 mt-4">
                <Volume2 size={14} className="text-gray-500 flex-shrink-0" />
                <input
                  type="range" min="0" max="100" value={volume}
                  onChange={(e) => setVolume(Number(e.target.value))}
                  onMouseUp={() => action('volume', { volume })}
                  onTouchEnd={() => action('volume', { volume })}
                  className="eb-range flex-1"
                />
                <span className="text-xs text-gray-500 w-8 text-right">{volume}%</span>
              </div>
            </>
          )}
        </div>

        <div className="md:col-span-2 space-y-4">
          <div className="cyber-card p-4">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Audio Filters</p>
            <div className="flex flex-wrap gap-1.5">
              {FILTERS.map((f) => (
                <button
                  key={f}
                  onClick={() => action('filters', { filter: f })}
                  className={`text-xs px-2.5 py-1 rounded-full border transition-all capitalize ${
                    data?.filters?.includes(f)
                      ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-400 shadow-[0_0_8px_rgba(0,255,255,0.2)]'
                      : 'border-white/10 text-gray-500 hover:border-cyan-500/30 hover:text-gray-300'
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          <div className="cyber-card p-4 flex-1">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                Queue {data?.queue?.length ? `(${data.queue.length})` : ''}
              </p>
              {data?.queue?.length > 0 && (
                <button onClick={() => action('clear', {}, 'Queue cleared')} className="text-[10px] text-red-400 hover:text-red-300 flex items-center gap-1">
                  <Trash2 size={10} /> Clear
                </button>
              )}
            </div>
            {!data?.queue?.length ? (
              <p className="text-xs text-gray-600 text-center py-4">Queue is empty</p>
            ) : (
              <div className="space-y-1.5 max-h-56 overflow-y-auto">
                {data.queue.map((t, i) => (
                  <div key={`${t.title}-${i}`} className="flex items-center gap-2 py-1 group">
                    <span className="text-[10px] text-gray-600 w-4 flex-shrink-0">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-gray-300 truncate">{t.title}</p>
                      <p className="text-[10px] text-gray-600 truncate">{t.author}</p>
                    </div>
                    <span className="text-[10px] text-gray-600 flex-shrink-0">{t.duration}</span>
                    <button
                      onClick={() => removeAt(t.index ?? i)}
                      className="opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-red-400 transition-all"
                      title="Remove"
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="cyber-card p-4 mt-4">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Search & Play</p>
        <div className="flex gap-2 flex-wrap">
          <select value={voiceId} onChange={(e) => setVoiceId(e.target.value)} className="cyber-select text-xs w-full sm:w-52">
            <option value="">— Auto voice channel —</option>
            {voiceChannels.map((c) => (
              <option key={c.id} value={c.id}>#{c.name}{c.members ? ` · ${c.members}` : ''}</option>
            ))}
          </select>
          <input
            type="text" placeholder="Search YouTube, Spotify..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && doSearch()}
            className="cyber-input flex-1 min-w-[12rem]"
          />
          <button onClick={doSearch} disabled={searching} className="cyber-button-solid flex-shrink-0 flex items-center gap-1.5">
            {searching ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
            Search
          </button>
        </div>
        {searchResults.length > 0 && (
          <div className="mt-3 space-y-1.5">
            {searchResults.map((t, i) => (
              <button
                key={i}
                onClick={() => playTrack(t.url)}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-lg bg-white/5 hover:bg-cyan-500/10 hover:border-cyan-500/30 border border-transparent text-left transition-all group"
              >
                {t.thumbnail && <img src={t.thumbnail} alt="" className="w-8 h-8 rounded object-cover flex-shrink-0" />}
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-gray-200 truncate group-hover:text-white">{t.title}</p>
                  <p className="text-[10px] text-gray-600 truncate">{t.author} · {t.duration}</p>
                </div>
                <Play size={12} className="text-cyan-400 opacity-0 group-hover:opacity-100 flex-shrink-0 transition-opacity" />
              </button>
            ))}
          </div>
        )}
      </div>

      {lyricsOpen && (
        <div className="cyber-card p-4 mt-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
              Lyrics {lyrics?.title ? `· ${lyrics.title}` : ''}
            </p>
            <button onClick={() => setLyricsOpen(false)} className="cyber-icon-button" aria-label="Close lyrics">
              <X size={14} />
            </button>
          </div>
          {lyricsLoading ? (
            <div className="flex items-center gap-2 text-xs text-zinc-500 py-6 justify-center">
              <Loader2 size={14} className="animate-spin" /> Fetching lyrics…
            </div>
          ) : lyrics?.lyrics ? (
            <pre className="text-xs text-zinc-300 whitespace-pre-wrap max-h-72 overflow-y-auto leading-relaxed font-sans">
              {lyrics.lyrics}
            </pre>
          ) : (
            <p className="text-xs text-zinc-600 text-center py-6">No lyrics found for this track.</p>
          )}
        </div>
      )}
    </div>
  );
}

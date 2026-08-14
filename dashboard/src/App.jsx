import React, { useState, useEffect, useCallback } from 'react';
import Sidebar from './components/Sidebar.jsx';
import CommandPalette from './components/CommandPalette.jsx';
import CopyButton from './components/CopyButton.jsx';
import { ToastProvider } from './components/Toast.jsx';
import Overview from './pages/Overview.jsx';
import MusicController from './pages/MusicController.jsx';
import WelcomeAutoResponse from './pages/WelcomeAutoResponse.jsx';
import TicketSystem from './pages/TicketSystem.jsx';
import Progression from './pages/Progression.jsx';
import Logs from './pages/Logs.jsx';
import Security from './pages/Security.jsx';
import Giveaways from './pages/Giveaways.jsx';
import Members from './pages/Members.jsx';
import Analytics from './pages/Analytics.jsx';
import ServerSettings from './pages/ServerSettings.jsx';
import BotControls from './pages/BotControls.jsx';
import Permissions from './pages/Permissions.jsx';
import Leaderboard from './pages/Leaderboard.jsx';
import LiveFeed from './pages/LiveFeed.jsx';
import EmbedBuilder from './pages/EmbedBuilder.jsx';
import AutoResponder from './pages/AutoResponder.jsx';
import Home from './pages/Home.jsx';
import Commands from './pages/Commands.jsx';
import Developer from './pages/Developer.jsx';
import Verification from './pages/Verification.jsx';
import ReactionRoles from './pages/ReactionRoles.jsx';
import Birthdays from './pages/Birthdays.jsx';
import Suggestions from './pages/Suggestions.jsx';
import Polls from './pages/Polls.jsx';
import TagsPage from './pages/Tags.jsx';
import Confessions from './pages/Confessions.jsx';
import StaffBoard from './pages/StaffBoard.jsx';
import api from './api.js';
import { PAGE_TITLES, PAGE_HINTS, DOCK_PAGES, SEARCHABLE_PAGES } from './nav.js';
import { rememberRecentPage } from './lib/clipboard.js';
import { Activity, Search, Wifi, WifiOff } from 'lucide-react';

const PAGES = {
  overview: Overview,
  analytics: Analytics,
  leaderboard: Leaderboard,
  livefeed: LiveFeed,
  members: Members,
  music: MusicController,
  giveaways: Giveaways,
  progression: Progression,
  tickets: TicketSystem,
  reactionroles: ReactionRoles,
  birthdays: Birthdays,
  suggestions: Suggestions,
  polls: Polls,
  tags: TagsPage,
  confessions: Confessions,
  board: StaffBoard,
  welcome: WelcomeAutoResponse,
  verification: Verification,
  logs: Logs,
  security: Security,
  commands: Commands,
  settings: ServerSettings,
  botcontrols: BotControls,
  permissions: Permissions,
  embedbuilder: EmbedBuilder,
  autoresponder: AutoResponder,
  developer: Developer,
};

export const PermContext = React.createContext({ level: 0, levelName: 'Viewer' });

function getHashPage() {
  const h = window.location.hash.replace('#', '').trim();
  if (!h || h === 'home') return 'home';
  return PAGES[h] ? h : 'overview';
}

function rememberGuild(id) {
  try { if (id) localStorage.setItem('eb.guild', id); } catch { /* ignore */ }
}
function rememberedGuild() {
  try { return localStorage.getItem('eb.guild'); } catch { return null; }
}
function rememberedCollapsed() {
  try { return localStorage.getItem('eb.sidebar') === '1'; } catch { return false; }
}

function formatUptime(ms) {
  if (!ms) return '—';
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function MobileDock({ page, onNavigate, onSearch }) {
  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 glass-header border-t border-white/[0.06] pb-[env(safe-area-inset-bottom)]">
      <div className="grid grid-cols-5 h-14">
        {DOCK_PAGES.map((id) => {
          const item = SEARCHABLE_PAGES.find((p) => p.id === id);
          if (!item) return null;
          const Icon = item.icon;
          const active = page === id;
          return (
            <button
              key={id}
              onClick={() => onNavigate(id)}
              className={`flex flex-col items-center justify-center gap-0.5 text-[10px] ${active ? 'text-cyan-200' : 'text-zinc-500'}`}
            >
              <Icon size={16} />
              {item.label.split(' ')[0]}
            </button>
          );
        })}
        <button onClick={onSearch} className="flex flex-col items-center justify-center gap-0.5 text-[10px] text-zinc-500">
          <Search size={16} />
          Search
        </button>
      </div>
    </nav>
  );
}

export default function App() {
  const [page, setPage] = useState(getHashPage);
  const [guilds, setGuilds] = useState([]);
  const [selectedGuild, setSelectedGuild] = useState(null);
  const [guildData, setGuildData] = useState(null);
  const [me, setMe] = useState(null);
  const [loading, setLoading] = useState(true);
  const [permLevel, setPermLevel] = useState(0);
  const [permLevelName, setPermLevelName] = useState('Viewer');
  const [auth, setAuth] = useState({ oauthEnabled: false, loggedIn: false, authRequired: false });
  const [health, setHealth] = useState(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(rememberedCollapsed);

  const navigate = useCallback((p) => {
    setPage(p);
    window.location.hash = p;
    setMobileOpen(false);
    rememberRecentPage(p);
  }, []);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((c) => {
      const next = !c;
      try { localStorage.setItem('eb.sidebar', next ? '1' : '0'); } catch { /* ignore */ }
      return next;
    });
  }, []);

  useEffect(() => {
    const onHash = () => { setPage(getHashPage()); };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      const tag = (e.target?.tagName || '').toLowerCase();
      const typing = tag === 'input' || tag === 'textarea' || e.target?.isContentEditable;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((v) => !v);
        return;
      }
      if (!typing && e.key === '/' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        setPaletteOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    Promise.all([
      api.get('/api/guilds').catch(() => []),
      api.get('/api/me').catch(() => null),
      api.get('/api/auth/status').catch(() => ({ oauthEnabled: false, loggedIn: false, authRequired: false })),
      api.get('/api/health').catch(() => null),
    ]).then(([g, m, a, h]) => {
      const list = Array.isArray(g) ? g : [];
      setGuilds(list);
      setMe(m);
      setAuth(a || { oauthEnabled: false, loggedIn: false, authRequired: false });
      setHealth(h);
      const remembered = rememberedGuild();
      setSelectedGuild(list.find((x) => x.id === remembered) || list[0] || null);
    }).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const t = setInterval(() => {
      api.get('/api/health').then(setHealth).catch(() => setHealth(null));
    }, 15000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!selectedGuild) return;
    rememberGuild(selectedGuild.id);
    setGuildData(null);
    api.get(`/api/guild/${selectedGuild.id}`).then(setGuildData).catch(() => {});
  }, [selectedGuild]);

  useEffect(() => {
    if (!selectedGuild) return;
    api.get(`/api/guild/${selectedGuild.id}/permissions/my-level`)
      .then((d) => { setPermLevel(d.level ?? 0); setPermLevelName(d.levelName ?? 'Viewer'); })
      .catch(() => { setPermLevel(0); setPermLevelName('Viewer'); });
  }, [selectedGuild]);

  const PageComponent = PAGES[page] || Overview;
  const isLive = page === 'livefeed';
  const isHome = page === 'home';
  const publicUrl = health?.publicUrl || '';

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center animate-fade-in">
          <img src="/eb_logo.svg" alt="EB BOT" className="w-16 h-16 mx-auto mb-5 rounded-2xl object-cover ring-1 ring-white/10 shadow-[0_12px_32px_rgba(0,0,0,0.45)]" />
          <div className="relative w-10 h-10 mx-auto mb-4">
            <div className="absolute inset-0 rounded-full border-2 border-cyan-500/15" />
            <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-cyan-300 animate-spin" />
          </div>
          <p className="text-cyan-200 text-sm font-semibold glow-text">Starting EB Dashboard</p>
          <p className="text-zinc-500 text-xs mt-1">Connecting to the bot…</p>
        </div>
      </div>
    );
  }

  return (
    <ToastProvider>
      <PermContext.Provider value={{ level: permLevel, levelName: permLevelName }}>
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[100] focus:px-3 focus:py-2 focus:rounded-lg focus:bg-cyan-400 focus:text-black text-sm font-semibold">
          Skip to content
        </a>
        {isHome ? (
          <Home health={health} auth={auth} onEnter={(id) => navigate(id || 'overview')} />
        ) : (
        <div className="h-screen flex overflow-hidden">
          <Sidebar
            page={page}
            setPage={navigate}
            guilds={guilds}
            selectedGuild={selectedGuild}
            setSelectedGuild={setSelectedGuild}
            me={me}
            permLevel={permLevel}
            auth={auth}
            mobileOpen={mobileOpen}
            setMobileOpen={setMobileOpen}
            collapsed={collapsed}
            onToggleCollapsed={toggleCollapsed}
          />
          <div className="flex-1 min-w-0 flex flex-col">
            <header className="h-14 flex-shrink-0 pl-14 md:pl-5 pr-3 sm:pr-5 glass-header flex items-center justify-between gap-3">
              <div className="min-w-0 flex items-center gap-3">
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-[0.16em] text-zinc-500 truncate">
                    {selectedGuild?.name || 'EB Dashboard'}
                    <span className="text-zinc-700"> / </span>
                    <span className="text-zinc-400">v6</span>
                  </p>
                  <h2 className="text-sm font-semibold text-white truncate leading-tight">
                    {PAGE_TITLES[page] || 'Dashboard'}
                  </h2>
                </div>
              </div>

              <div className="flex items-center gap-2 sm:gap-3">
                <button
                  onClick={() => setPaletteOpen(true)}
                  className="hidden md:flex items-center gap-2 h-9 px-3 rounded-xl border border-white/10 bg-white/[0.03] text-zinc-500 hover:text-zinc-200 hover:border-cyan-400/30 transition-all min-w-[220px]"
                >
                  <Search size={13} />
                  <span className="text-xs flex-1 text-left">Search pages, warn, music…</span>
                  <kbd className="kbd">⌘K</kbd>
                </button>
                <button
                  onClick={() => setPaletteOpen(true)}
                  className="md:hidden cyber-icon-button"
                  aria-label="Search"
                >
                  <Search size={16} />
                </button>

                {publicUrl && (
                  <div className="hidden lg:block">
                    <CopyButton value={publicUrl} label="Copy URL" className="cyber-button flex items-center gap-1.5 text-xs py-1.5 px-3" />
                  </div>
                )}

                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-medium ${
                  health?.botOnline
                    ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300'
                    : 'border-red-500/25 bg-red-500/10 text-red-300'
                }`}>
                  {health?.botOnline ? <Wifi size={11} /> : <WifiOff size={11} />}
                  <span>{health?.botOnline ? 'Online' : 'Offline'}</span>
                  {health?.uptime ? <span className="hidden sm:inline text-zinc-500">· {formatUptime(health.uptime)}</span> : null}
                </span>
                <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-white/10 text-zinc-400 text-[11px]">
                  <Activity size={11} />
                  {health?.guilds ?? 0}
                </span>
              </div>
            </header>

            {health?.maintenance && (
              <div className="px-4 sm:px-6 py-2 text-xs text-fuchsia-200 bg-fuchsia-500/10 border-b border-fuchsia-500/20">
                Maintenance mode is on — slash commands are blocked for everyone except the owner.
              </div>
            )}
            {health === null && (
              <div className="px-4 sm:px-6 py-2 text-xs text-amber-200 bg-amber-500/10 border-b border-amber-500/20">
                Dashboard API unreachable (tunnel may have rotated). Reload this page in a few seconds.
              </div>
            )}
            {!health?.botOnline && (
              <div className="px-4 sm:px-6 py-2 text-xs text-amber-200 bg-amber-500/10 border-b border-amber-500/20">
                Bot appears offline. Commands and live data may be delayed until it reconnects.
              </div>
            )}

            <main id="main" className={`flex-1 min-w-0 ${isLive ? 'overflow-hidden' : 'overflow-auto'}`}>
              {auth.oauthEnabled && !auth.loggedIn && auth.redirectUri && !auth.redirectUri.includes('localhost') && (
                <div className="mx-4 sm:mx-6 mt-4 px-4 py-3 rounded-xl bg-cyan-500/10 border border-cyan-500/25 text-xs text-cyan-200">
                  Add this Redirect URI in the Discord Developer Portal → OAuth2 → Redirects:
                  <code className="block mt-1 text-[11px] text-cyan-300 break-all">{auth.redirectUri}</code>
                </div>
              )}
              {page === 'developer' ? (
                <div className="h-full animate-fade-in">
                  <Developer />
                </div>
              ) : !selectedGuild ? (
                <div className="min-h-full flex items-center justify-center p-8">
                  <div className="text-center max-w-sm cyber-card p-8 animate-slide-up">
                    <img src="/eb_logo.svg" alt="EB BOT" className="w-14 h-14 mx-auto mb-4 rounded-2xl object-cover ring-1 ring-white/10" />
                    <p className="text-white font-semibold mb-2">No server selected</p>
                    <p className="text-sm text-zinc-500 mb-5">
                      {auth.oauthEnabled && !auth.loggedIn
                        ? 'Log in with Discord to see the servers you can manage.'
                        : 'Invite the bot to a server, then refresh this page.'}
                    </p>
                    {auth.oauthEnabled && !auth.loggedIn && (
                      <a href="/api/auth/discord" className="cyber-button-solid inline-flex">Login with Discord</a>
                    )}
                  </div>
                </div>
              ) : (
                <div key={`${page}-${selectedGuild?.id}`} className="h-full animate-fade-in">
                  <PageComponent
                    guild={selectedGuild}
                    guildData={guildData}
                    setGuildData={setGuildData}
                    permLevel={permLevel}
                    onNavigate={navigate}
                    pageHint={PAGE_HINTS[page]}
                    publicUrl={publicUrl}
                  />
                </div>
              )}
            </main>
          </div>
        </div>
        )}

        {!isHome && <MobileDock page={page} onNavigate={navigate} onSearch={() => setPaletteOpen(true)} />}

        <CommandPalette
          open={paletteOpen}
          onClose={() => setPaletteOpen(false)}
          onNavigate={navigate}
          permLevel={permLevel}
          page={page}
          publicUrl={publicUrl}
        />
      </PermContext.Provider>
    </ToastProvider>
  );
}

import React, { lazy, Suspense, useState, useEffect, useCallback } from 'react';
import Sidebar from './components/Sidebar.jsx';
import CommandPalette from './components/CommandPalette.jsx';
import CopyButton from './components/CopyButton.jsx';
import { ToastProvider } from './components/Toast.jsx';
import Home from './pages/Home.jsx';

// Load dashboard tools only when they are opened. The previous eager imports
// shipped every admin page in one 617 kB bundle, slowing down login and mobile
// navigation even when a user only needed Overview.
const Overview = lazy(() => import('./pages/Overview.jsx'));
const MusicController = lazy(() => import('./pages/MusicController.jsx'));
const WelcomeAutoResponse = lazy(() => import('./pages/WelcomeAutoResponse.jsx'));
const TicketSystem = lazy(() => import('./pages/TicketSystem.jsx'));
const Progression = lazy(() => import('./pages/Progression.jsx'));
const Logs = lazy(() => import('./pages/Logs.jsx'));
const Security = lazy(() => import('./pages/Security.jsx'));
const Giveaways = lazy(() => import('./pages/Giveaways.jsx'));
const Members = lazy(() => import('./pages/Members.jsx'));
const Analytics = lazy(() => import('./pages/Analytics.jsx'));
const ServerSettings = lazy(() => import('./pages/ServerSettings.jsx'));
const BotControls = lazy(() => import('./pages/BotControls.jsx'));
const Permissions = lazy(() => import('./pages/Permissions.jsx'));
const Leaderboard = lazy(() => import('./pages/Leaderboard.jsx'));
const LiveFeed = lazy(() => import('./pages/LiveFeed.jsx'));
const EmbedBuilder = lazy(() => import('./pages/EmbedBuilder.jsx'));
const AutoResponder = lazy(() => import('./pages/AutoResponder.jsx'));
const Commands = lazy(() => import('./pages/Commands.jsx'));
const Developer = lazy(() => import('./pages/Developer.jsx'));
const Verification = lazy(() => import('./pages/Verification.jsx'));
const ReactionRoles = lazy(() => import('./pages/ReactionRoles.jsx'));
const Birthdays = lazy(() => import('./pages/Birthdays.jsx'));
const Suggestions = lazy(() => import('./pages/Suggestions.jsx'));
const Polls = lazy(() => import('./pages/Polls.jsx'));
const TagsPage = lazy(() => import('./pages/Tags.jsx'));
const Confessions = lazy(() => import('./pages/Confessions.jsx'));
const StaffBoard = lazy(() => import('./pages/StaffBoard.jsx'));
import api from './api.js';
import { PAGE_TITLES, PAGE_HINTS, DOCK_PAGES, SEARCHABLE_PAGES } from './nav.js';
import { rememberRecentPage } from './lib/clipboard.js';
import { Activity, AlertTriangle, CheckCircle2, Search, Wifi, WifiOff, X } from 'lucide-react';

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

function formatUptime(seconds) {
  if (!seconds) return '—';
  const s = Math.floor(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function PageLoading() {
  return (
    <div className="page-shell" aria-label="Loading page" aria-busy="true">
      <div className="space-y-2 mb-7">
        <div className="skeleton h-7 w-52" />
        <div className="skeleton h-3 w-80 max-w-full" />
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {[0, 1, 2, 3, 4, 5].map((n) => (
          <div key={n} className="cyber-card p-5 space-y-4">
            <div className="skeleton h-10 w-10" />
            <div className="skeleton h-4 w-2/3" />
            <div className="skeleton h-3 w-full" />
            <div className="skeleton h-3 w-4/5" />
          </div>
        ))}
      </div>
    </div>
  );
}

function OAuthNotice() {
  const [result, setResult] = useState(() => {
    try { return new window.URLSearchParams(window.location.search).get('oauth'); }
    catch { return null; }
  });

  useEffect(() => {
    if (!result) return;
    const url = new URL(window.location.href);
    url.searchParams.delete('oauth');
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
    const timer = setTimeout(() => setResult(null), result === 'success' ? 4500 : 7000);
    return () => clearTimeout(timer);
  }, [result]);

  if (!result) return null;
  const success = result === 'success';
  const message = success
    ? 'Signed in with Discord. Your servers and permissions are ready.'
    : result === 'session'
      ? 'The login session could not be saved. Please try again.'
      : 'Discord did not return a login code. Please start the login again.';
  const Icon = success ? CheckCircle2 : AlertTriangle;

  return (
    <div className="fixed z-[100] top-4 left-1/2 -translate-x-1/2 w-[calc(100%-2rem)] max-w-xl animate-slide-up" role={success ? 'status' : 'alert'}>
      <div className={`flex items-start gap-3 rounded-2xl border px-4 py-3 shadow-2xl backdrop-blur-xl ${
        success
          ? 'border-emerald-400/30 bg-emerald-950/90 text-emerald-100'
          : 'border-amber-400/30 bg-amber-950/90 text-amber-100'
      }`}>
        <Icon size={18} className="mt-0.5 flex-shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{success ? 'Welcome back' : 'Login needs attention'}</p>
          <p className="text-xs opacity-75 mt-0.5 leading-relaxed">{message}</p>
        </div>
        <button onClick={() => setResult(null)} className="p-1 rounded-lg hover:bg-white/10" aria-label="Dismiss notification">
          <X size={14} />
        </button>
      </div>
    </div>
  );
}

class PageErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('Dashboard page failed to render', error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="min-h-full flex items-center justify-center p-6">
        <div className="cyber-card max-w-md w-full p-7 text-center animate-slide-up" role="alert">
          <div className="w-12 h-12 mx-auto mb-4 rounded-2xl flex items-center justify-center bg-red-500/10 border border-red-500/20 text-red-300">
            <AlertTriangle size={22} />
          </div>
          <h2 className="text-lg font-semibold text-white">This page could not load</h2>
          <p className="text-sm text-zinc-500 mt-2 leading-relaxed">
            The dashboard may have been updated while it was open. Retry the page or return to Overview.
          </p>
          <div className="flex justify-center gap-2 mt-5">
            <button onClick={() => window.location.reload()} className="cyber-button-solid">Retry</button>
            <button
              onClick={() => { this.setState({ error: null }); window.location.hash = 'overview'; }}
              className="cyber-button"
            >
              Overview
            </button>
          </div>
        </div>
      </div>
    );
  }
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
              aria-current={active ? 'page' : undefined}
              aria-label={item.label}
              className={`flex flex-col items-center justify-center gap-0.5 text-[10px] transition-colors ${active ? 'text-cyan-200' : 'text-zinc-500 hover:text-zinc-300'}`}
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
  const [apiReachable, setApiReachable] = useState(null);
  const [browserOnline, setBrowserOnline] = useState(() => window.navigator.onLine);
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
    const title = PAGE_TITLES[page] || (page === 'home' ? 'Home' : 'Dashboard');
    const guild = selectedGuild?.name ? ` · ${selectedGuild.name}` : '';
    document.title = `${title}${guild} — EB BOT`;
  }, [page, selectedGuild]);

  useEffect(() => {
    const update = () => setBrowserOnline(window.navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') setMobileOpen(false);
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
      setApiReachable(Boolean(h));
      const remembered = rememberedGuild();
      setSelectedGuild(list.find((x) => x.id === remembered) || list[0] || null);
    }).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const t = setInterval(() => {
      api.get('/api/health')
        .then((nextHealth) => {
          setHealth(nextHealth);
          setApiReachable(true);
        })
        // Preserve the last known status instead of making the whole header
        // flicker offline during one transient failed poll.
        .catch(() => setApiReachable(false));
    }, 15000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!selectedGuild) return undefined;
    let current = true;
    rememberGuild(selectedGuild.id);
    setGuildData(null);
    api.get(`/api/guild/${selectedGuild.id}`)
      .then((data) => { if (current) setGuildData(data); })
      .catch(() => {});
    return () => { current = false; };
  }, [selectedGuild]);

  useEffect(() => {
    if (!selectedGuild) return undefined;
    let current = true;
    api.get(`/api/guild/${selectedGuild.id}/permissions/my-level`)
      .then((d) => {
        if (!current) return;
        setPermLevel(d.level ?? 0);
        setPermLevelName(d.levelName ?? 'Viewer');
      })
      .catch(() => {
        if (!current) return;
        setPermLevel(0);
        setPermLevelName('Viewer');
      });
    return () => { current = false; };
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
        <OAuthNotice />
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
            {!browserOnline && (
              <div className="px-4 sm:px-6 py-2 text-xs text-red-200 bg-red-500/10 border-b border-red-500/20 flex items-center justify-between gap-3" role="alert">
                <span>You are offline. Changes will not be saved until your connection returns.</span>
                <span className="flex-shrink-0 font-semibold">No connection</span>
              </div>
            )}
            {browserOnline && apiReachable === false && (
              <div className="px-4 sm:px-6 py-2 text-xs text-amber-200 bg-amber-500/10 border-b border-amber-500/20 flex items-center justify-between gap-3">
                <span>Dashboard API is unreachable. The service may be restarting.</span>
                <button onClick={() => window.location.reload()} className="flex-shrink-0 px-2.5 py-1 rounded-lg border border-amber-400/25 hover:bg-amber-400/10 font-semibold">
                  Retry
                </button>
              </div>
            )}
            {apiReachable === true && health !== null && !health.botOnline && (
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
                  <PageErrorBoundary key="developer">
                    <Suspense fallback={<PageLoading />}>
                      <Developer />
                    </Suspense>
                  </PageErrorBoundary>
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
                  <PageErrorBoundary key={page}>
                    <Suspense fallback={<PageLoading />}>
                      <PageComponent
                        guild={selectedGuild}
                        guildData={guildData}
                        setGuildData={setGuildData}
                        permLevel={permLevel}
                        onNavigate={navigate}
                        pageHint={PAGE_HINTS[page]}
                        publicUrl={publicUrl}
                      />
                    </Suspense>
                  </PageErrorBoundary>
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

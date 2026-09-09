import React, { lazy, Suspense, useState, useEffect, useCallback } from 'react';
import Sidebar from './components/Sidebar.jsx';
import CommandPalette from './components/CommandPalette.jsx';
import CopyButton from './components/CopyButton.jsx';
import LanguageMenu from './components/LanguageMenu.jsx';
import { ToastProvider } from './components/Toast.jsx';
import Home from './pages/Home.jsx';

// Load dashboard tools only when they are opened. The previous eager imports
// shipped every admin page in one 617 kB bundle, slowing down login and mobile
// navigation even when a user only needed Overview.
const Overview = lazy(() => import('./pages/Overview.jsx'));
const SystemStatus = lazy(() => import('./pages/SystemStatus.jsx'));
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
const Profile = lazy(() => import('./pages/Profile.jsx'));
const Login = lazy(() => import('./pages/Login.jsx'));
const Register = lazy(() => import('./pages/Register.jsx'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword.jsx'));
const ResetPassword = lazy(() => import('./pages/ResetPassword.jsx'));
const VerifyEmail = lazy(() => import('./pages/VerifyEmail.jsx'));
const AccountSecurity = lazy(() => import('./pages/AccountSecurity.jsx'));
const AccountSettings = lazy(() => import('./pages/AccountSettings.jsx'));
import api from './api.js';
import { useAuth } from './auth/AuthContext.jsx';
import { PAGE_TITLES, PAGE_HINTS, DOCK_PAGES, SEARCHABLE_PAGES } from './nav.js';
import { rememberRecentPage } from './lib/clipboard.js';
import { useI18n } from './i18n.jsx';
import { Activity, AlertTriangle, CheckCircle2, Search, Wifi, WifiOff, X } from 'lucide-react';

const PAGES = {
  overview: Overview,
  system: SystemStatus,
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
  // Developer Area leaves from the product diagram. They share the single
  // role-scoped control center and open directly on the matching tab, so the
  // sidebar matches Bot Control / System / Logs / API / Database /
  // Monitoring / Security without duplicating backend routes.
  'dev-logs': Developer,
  'dev-api': Developer,
  'dev-database': Developer,
  'dev-monitoring': Developer,
  'dev-security': Developer,
  'dev-flags': Developer,
  profile: Profile,
  login: Login,
  register: Register,
  forgotPassword: ForgotPassword,
  resetPassword: ResetPassword,
  verifyEmail: VerifyEmail,
  accountSecurity: AccountSecurity,
  accountSettings: AccountSettings,
};

export const PermContext = React.createContext({ level: 0, levelName: 'Viewer' });

// Developer Area leaves from the product diagram. `developer` keeps its
// historic hash for backwards compatibility; the dev-* ids deep-link into the
// same control center on a specific tab. Module scope: the mapping is static
// and must not be rebuilt on every render.
const DEV_TAB_BY_PAGE = {
  developer: 'overview',
  'dev-flags': 'flags',
  'dev-logs': 'logs',
  // API leaf opens the command catalog; the bot-config tab stays one click away.
  'dev-api': 'commands',
  'dev-database': 'db',
  'dev-monitoring': 'performance',
  'dev-security': 'audit',
};

function developerInitialTab(page) {
  // hasOwnProperty (not `in` or startsWith): page comes from the URL hash, so
  // prototype names like "constructor" must never match.
  return Object.prototype.hasOwnProperty.call(DEV_TAB_BY_PAGE, page)
    ? DEV_TAB_BY_PAGE[page]
    : undefined;
}

function isDeveloperAreaPage(page) {
  return page === 'system' || developerInitialTab(page) !== undefined;
}

function getHashPage() {
  const pathRoutes = {
    '/profile': 'profile', '/login': 'login', '/register': 'register',
    '/forgot-password': 'forgotPassword', '/reset-password': 'resetPassword',
    '/verify-email': 'verifyEmail', '/settings': 'accountSettings',
    '/settings/security': 'accountSecurity',
  };
  if (pathRoutes[window.location.pathname]) return pathRoutes[window.location.pathname];
  const h = window.location.hash.replace('#', '').trim();
  if (!h || h === 'home') return 'home';
  if (PAGES[h]) return h;
  // Unknown hash: fall back to Overview but normalize the URL so the address
  // bar never disagrees with the visible page (previously #typo silently
  // rendered Overview while the URL kept the invalid hash).
  try {
    const url = new URL(window.location.href);
    url.hash = 'overview';
    window.history.replaceState({}, '', url);
  } catch { window.location.hash = 'overview'; }
  return 'overview';
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
  const { t } = useI18n();
  return (
    <div className="page-shell" aria-label={t('shell.loadingPage', 'Loading page')} aria-busy="true" role="status">
      <div className="glass-panel mesh-glow p-5 flex items-center gap-4 mb-2">
        <div className="skeleton h-11 w-11 !rounded-2xl flex-shrink-0" aria-hidden="true" />
        <div className="space-y-2 flex-1">
          <div className="skeleton h-5 w-52 max-w-full" aria-hidden="true" />
          <div className="skeleton h-3 w-80 max-w-full" aria-hidden="true" />
        </div>
        <div className="skeleton h-8 w-24 hidden sm:block" aria-hidden="true" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[0, 1, 2, 3].map((n) => (
          <div key={n} className="cyber-card p-4 flex items-center gap-3">
            <div className="skeleton h-11 w-11 !rounded-2xl flex-shrink-0" aria-hidden="true" />
            <div className="space-y-2 flex-1">
              <div className="skeleton h-3 w-16" aria-hidden="true" />
              <div className="skeleton h-5 w-20" aria-hidden="true" />
            </div>
          </div>
        ))}
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {[0, 1, 2, 3, 4, 5].map((n) => (
          <div key={n} className="cyber-card p-5 space-y-4">
            <div className="skeleton h-10 w-10 !rounded-xl" aria-hidden="true" />
            <div className="skeleton h-4 w-2/3" aria-hidden="true" />
            <div className="skeleton h-3 w-full" aria-hidden="true" />
            <div className="skeleton h-3 w-4/5" aria-hidden="true" />
          </div>
        ))}
      </div>
      <span className="sr-only">{t('shell.loadingPage', 'Loading page')}</span>
    </div>
  );
}

function AuthLoading() {
  const { t } = useI18n();
  return (
    <div className="min-h-screen flex items-center justify-center p-6" aria-label={t('shell.loadingPage', 'Loading page')} aria-busy="true" role="status">
      <div className="w-full max-w-sm space-y-4">
        <div className="skeleton h-12 w-12 !rounded-2xl mx-auto" aria-hidden="true" />
        <div className="skeleton h-5 w-40 mx-auto" aria-hidden="true" />
        <div className="cyber-card p-6 space-y-3">
          <div className="skeleton h-4 w-24" aria-hidden="true" />
          <div className="skeleton h-10 w-full !rounded-xl" aria-hidden="true" />
          <div className="skeleton h-4 w-24" aria-hidden="true" />
          <div className="skeleton h-10 w-full !rounded-xl" aria-hidden="true" />
          <div className="skeleton h-10 w-full !rounded-xl" aria-hidden="true" />
        </div>
        <span className="sr-only">{t('shell.loadingPage', 'Loading page')}</span>
      </div>
    </div>
  );
}

function OAuthNotice() {
  const { t } = useI18n();
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
    ? t('oauth.success', 'Signed in with Discord. Your servers and permissions are ready.')
    : result === 'session'
      ? t('oauth.sessionError', 'The login session could not be saved. Please try again.')
      : t('oauth.codeError', 'Discord did not return a login code. Please start the login again.');
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
          <p className="text-sm font-semibold">{success ? t('oauth.welcome', 'Welcome back') : t('oauth.attention', 'Login needs attention')}</p>
          <p className="text-xs opacity-75 mt-0.5 leading-relaxed">{message}</p>
        </div>
        <button onClick={() => setResult(null)} className="p-1 rounded-lg hover:bg-white/10" aria-label="Dismiss notification">
          <X size={14} />
        </button>
      </div>
    </div>
  );
}

function PageErrorCard({ onOverview }) {
  const { t } = useI18n();
  return (
    <div className="min-h-full flex items-center justify-center p-6">
      <div className="cyber-card max-w-md w-full p-7 text-center animate-slide-up" role="alert">
        <div className="w-12 h-12 mx-auto mb-4 rounded-2xl flex items-center justify-center bg-red-500/10 border border-red-500/20 text-red-300">
          <AlertTriangle size={22} />
        </div>
        <h2 className="text-lg font-semibold text-white">{t('err.title', 'This page could not load')}</h2>
        <p className="text-sm text-zinc-500 mt-2 leading-relaxed">
          {t('err.text', 'The dashboard may have been updated while it was open. Retry the page or return to Overview.')}
        </p>
        <div className="flex justify-center gap-2 mt-5">
          <button onClick={() => window.location.reload()} className="cyber-button-solid">{t('err.retry', 'Retry')}</button>
          <button onClick={onOverview} className="cyber-button">
            {t('nav.overview', 'Overview')}
          </button>
        </div>
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
      <PageErrorCard
        onOverview={() => { this.setState({ error: null }); window.location.hash = 'overview'; }}
      />
    );
  }
}

function MobileDock({ page, onNavigate, onSearch, canSeeMusicDesk }) {
  const { t } = useI18n();
  const dockIds = DOCK_PAGES.filter((id) => {
    const item = SEARCHABLE_PAGES.find((p) => p.id === id);
    if (!item) return false;
    if (item.devOnly && !canSeeMusicDesk) return false;
    return true;
  });
  return (
    <nav
      aria-label={t('shell.quickNav', 'Quick navigation')}
      className="md:hidden fixed bottom-3 inset-x-3 z-40 pb-[env(safe-area-inset-bottom)]"
    >
      <div className="dock-glass rounded-3xl px-2 py-2 flex items-stretch justify-between gap-1">
        {dockIds.map((id) => {
          const item = SEARCHABLE_PAGES.find((p) => p.id === id);
          if (!item) return null;
          const Icon = item.icon;
          const active = page === id;
          const label = t(`nav.${id}`, item.label);
          return (
            <button
              key={id}
              onClick={() => onNavigate(id)}
              aria-current={active ? 'page' : undefined}
              aria-label={label}
              title={label}
              className={`relative flex-1 min-w-0 min-h-[52px] flex flex-col items-center justify-center gap-1 py-2 px-1 rounded-2xl text-[10px] font-medium transition-all duration-200 active:scale-95 ${
                active
                  ? 'text-cyan-100 bg-gradient-to-b from-cyan-400/20 to-indigo-400/10 border border-cyan-300/25 shadow-[0_0_20px_rgba(34,211,238,0.15)]'
                  : 'text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.05] border border-transparent'
              }`}
            >
              <Icon size={17} className={active ? 'text-cyan-200' : undefined} aria-hidden="true" />
              <span className="max-w-full truncate leading-tight">{label}</span>
              {active && (
                <span className="absolute -top-0.5 w-8 h-0.5 rounded-full bg-gradient-to-r from-cyan-300 to-indigo-300 shadow-[0_0_8px_rgba(103,232,249,0.9)]" />
              )}
            </button>
          );
        })}
        <button
          onClick={onSearch}
          aria-label={t('common.search', 'Search')}
          className="flex-1 min-w-0 min-h-[52px] flex flex-col items-center justify-center gap-1 py-2 px-1 rounded-2xl text-[10px] font-medium text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.05] border border-transparent transition-all active:scale-95"
        >
          <span className="w-[34px] h-[26px] rounded-xl flex items-center justify-center bg-white/[0.05] border border-white/10">
            <Search size={14} aria-hidden="true" />
          </span>
          <span className="max-w-full truncate leading-tight">{t('common.search', 'Search')}</span>
        </button>
      </div>
    </nav>
  );
}

export default function App() {
  const { t } = useI18n();
  const { auth, account, discord, displayUser: me, loading: authLoading } = useAuth();
  const [page, setPage] = useState(getHashPage);
  const [guilds, setGuilds] = useState([]);
  const [selectedGuild, setSelectedGuild] = useState(null);
  const [guildData, setGuildData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [permLevel, setPermLevel] = useState(0);
  const [permLevelName, setPermLevelName] = useState('Viewer');
  const [developerAccess, setDeveloperAccess] = useState({ role: 'NONE', baseRole: 'NONE', unlocked: false });
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
    document.title = `${title}${guild} — EB V2`;
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
    const media = window.matchMedia('(min-width: 768px)');
    const closeOnDesktop = (event) => { if (event.matches) setMobileOpen(false); };
    media.addEventListener('change', closeOnDesktop);
    closeOnDesktop(media);
    return () => media.removeEventListener('change', closeOnDesktop);
  }, []);

  useEffect(() => {
    const quickIds = ['overview', 'analytics', 'livefeed', 'members', 'tickets', 'music'];
    const onKey = (e) => {
      if (e.key === 'Escape') setMobileOpen(false);
      const tag = (e.target?.tagName || '').toLowerCase();
      const typing = tag === 'input' || tag === 'textarea' || e.target?.isContentEditable;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((v) => !v);
        return;
      }
      // ⌘1…⌘6 quick-switch between primary desks (palette stays authoritative
      // for permission gating: hidden pages are ignored).
      if ((e.metaKey || e.ctrlKey) && /^[1-6]$/.test(e.key)) {
        const target = quickIds[Number(e.key) - 1];
        if (target) {
          e.preventDefault();
          setPaletteOpen(false);
          navigate(target);
        }
        return;
      }
      if (!typing && e.key === '/' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        setPaletteOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate]);

  useEffect(() => {
    Promise.all([
      api.get('/api/guilds').catch(() => []),
      api.get('/api/health').catch(() => null),
      api.get('/api/developer/whoami').catch(() => ({ role: 'NONE', baseRole: 'NONE', unlocked: false })),
    ]).then(([g, h, dev]) => {
      const list = Array.isArray(g) ? g : [];
      setGuilds(list);
      setDeveloperAccess(dev || { role: 'NONE', baseRole: 'NONE', unlocked: false });
      setHealth(h);
      setApiReachable(Boolean(h));
      const remembered = rememberedGuild();
      setSelectedGuild(list.find((x) => x.id === remembered) || list[0] || null);
    }).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const poll = () => {
      api.get('/api/health')
        .then((nextHealth) => {
          setHealth(nextHealth);
          setApiReachable(true);
        })
        // Preserve the last known status instead of making the whole header
        // flicker offline during one transient failed poll.
        .catch(() => setApiReachable(false));
    };
    const t = setInterval(poll, 15000);
    return () => clearInterval(t);
  }, []);

  const retryHealth = useCallback(() => {
    // Inline retry keeps guild selection, scroll, and form state — a full
    // page reload was overkill for one failed health poll.
    setApiReachable(null);
    api.get('/api/health')
      .then((nextHealth) => {
        setHealth(nextHealth);
        setApiReachable(true);
      })
      .catch(() => setApiReachable(false));
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

  const accountProtectedPage = ['profile', 'accountSettings', 'accountSecurity'].includes(page);
  useEffect(() => {
    if (!authLoading && accountProtectedPage && !account) {
      const returnPath = `${window.location.pathname}${window.location.search}`;
      window.location.replace(`/login?return=${window.encodeURIComponent(returnPath)}`);
    }
  }, [accountProtectedPage, account, authLoading]);

  const PageComponent = PAGES[page] || Overview;
  const isLive = page === 'livefeed';
  const isHome = page === 'home';
  const isDeveloperPage = isDeveloperAreaPage(page);
  const initialTab = developerInitialTab(page);
  const canSeeSystem = developerAccess.baseRole !== 'NONE'
    || developerAccess.role !== 'NONE'
    || developerAccess.canUnlock === true;
  const systemPageDenied = isDeveloperPage && !canSeeSystem;
  // The Music desk is developer-only (SUPPORT excluded), mirroring the
  // backend SYSTEM_ROLES.DEVELOPER gate on /api/music/*.
  const canSeeMusicDesk = ['DEVELOPER', 'SUPER_ADMIN'].includes(developerAccess.baseRole)
    || ['DEVELOPER', 'SUPER_ADMIN'].includes(developerAccess.role);
  const musicPageDenied = page === 'music' && !canSeeMusicDesk;
  const botControlsDenied = page === 'botcontrols' && !canSeeMusicDesk;
  const settingsDenied = page === 'settings' && !canSeeMusicDesk;
  const publicUrl = health?.publicUrl || '';

  if (loading || authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center animate-fade-in">
          <img src="/eb_logo.svg" alt="EB BOT" className="w-16 h-16 mx-auto mb-5 rounded-2xl object-cover ring-1 ring-white/10 shadow-[0_12px_32px_rgba(0,0,0,0.45)]" />
          <div className="relative w-10 h-10 mx-auto mb-4">
            <div className="absolute inset-0 rounded-full border-2 border-cyan-500/15" />
            <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-cyan-300 animate-spin" />
          </div>
          <p className="text-cyan-200 text-sm font-semibold glow-text">{t('shell.starting', 'Starting EB Dashboard')}</p>
          <p className="text-zinc-400 text-xs mt-1">{t('shell.connecting', 'Connecting to the bot…')}</p>
        </div>
      </div>
    );
  }

  if (accountProtectedPage && !account) return <AuthLoading />;

  if (['login', 'register', 'forgotPassword', 'resetPassword', 'verifyEmail'].includes(page)) {
    return (
      <ToastProvider>
        <PageErrorBoundary key={page}>
          <Suspense fallback={<AuthLoading />}><PageComponent /></Suspense>
        </PageErrorBoundary>
      </ToastProvider>
    );
  }

  return (
    <ToastProvider>
      <PermContext.Provider value={{ level: permLevel, levelName: permLevelName }}>
        <OAuthNotice />
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[100] focus:px-3 focus:py-2 focus:rounded-lg focus:bg-cyan-400 focus:text-black text-sm font-semibold">
          {t('shell.skip', 'Skip to content')}
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
            account={account}
            permLevel={permLevel}
            auth={auth}
            developerAccess={developerAccess}
            mobileOpen={mobileOpen}
            setMobileOpen={setMobileOpen}
            collapsed={collapsed}
            onToggleCollapsed={toggleCollapsed}
          />
          <div className="flex-1 min-w-0 flex flex-col">
            <header className="min-h-16 flex-shrink-0 pl-14 md:pl-5 pr-3 sm:pr-5 py-2 glass-header flex items-center justify-between gap-3">
              <div className="min-w-0 flex items-center gap-3 flex-1">
                {selectedGuild ? (
                  selectedGuild.icon
                    ? <img src={selectedGuild.icon} alt="" className="w-9 h-9 rounded-2xl ring-1 ring-white/15 flex-shrink-0 hidden sm:block" />
                    : <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-cyan-400/25 to-indigo-400/25 border border-white/10 hidden sm:flex items-center justify-center text-sm text-cyan-200 font-bold flex-shrink-0">
                        {selectedGuild.name?.[0] || '?'}
                      </div>
                ) : null}
                <div className="min-w-0 flex-1">
                  <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.16em] text-zinc-500 truncate">
                    <span className="truncate max-w-[140px] sm:max-w-none">{selectedGuild?.name || 'EB Dashboard'}</span>
                    <span className="text-zinc-700 flex-shrink-0">/</span>
                    <span className="text-zinc-400 flex-shrink-0">V2</span>
                    {PAGE_HINTS[page] && (
                      <span className="hidden xl:inline normal-case tracking-normal text-zinc-500 truncate font-normal">
                        · {PAGE_HINTS[page]}
                      </span>
                    )}
                  </nav>
                  <h2 className="text-[15px] font-bold text-white truncate leading-tight tracking-tight">
                    {t(`nav.${page}`, PAGE_TITLES[page] || 'Dashboard')}
                  </h2>
                </div>
              </div>

              <div className="flex items-center gap-2 sm:gap-2.5 flex-shrink-0">
                <button
                  onClick={() => setPaletteOpen(true)}
                  className="hidden md:flex items-center gap-2.5 h-10 px-3.5 rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.05] to-white/[0.02] text-zinc-400 hover:text-zinc-100 hover:border-cyan-300/35 hover:shadow-[0_0_24px_rgba(34,211,238,0.12)] transition-all min-w-[220px] lg:min-w-[260px] group"
                  aria-label="Open command palette"
                >
                  <Search size={14} className="text-zinc-400 group-hover:text-cyan-300 transition-colors flex-shrink-0" />
                  <span className="text-xs flex-1 text-start truncate">{t('shell.searchPlaceholder', 'Search pages, members, music…')}</span>
                  <span className="flex items-center gap-1 flex-shrink-0">
                    <kbd className="kbd">⌘K</kbd>
                  </span>
                </button>
                <button
                  onClick={() => setPaletteOpen(true)}
                  className="md:hidden w-10 h-10 dock-glass rounded-2xl flex items-center justify-center text-zinc-400"
                  aria-label="Search"
                >
                  <Search size={16} />
                </button>

                {publicUrl && (
                  <div className="hidden lg:block">
                    <CopyButton value={publicUrl} label={t('shell.copyUrl', 'Copy URL')} className="cyber-button flex items-center gap-1.5 text-xs py-2 px-3 !rounded-2xl" />
                  </div>
                )}

                <div className="hidden sm:flex items-center gap-1 p-1 rounded-2xl border border-white/[0.07] bg-white/[0.02]">
                  <LanguageMenu />
                  <span className="w-px h-5 bg-white/[0.07]" />
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[11px] font-semibold" title={health?.uptime ? `Uptime ${formatUptime(health.uptime)}` : undefined}>
                    <span className={`relative flex w-2 h-2`}>
                      <span className={`absolute inline-flex h-full w-full rounded-full opacity-60 animate-ping ${health?.botOnline ? 'bg-emerald-400' : 'bg-red-400'}`} />
                      <span className={`relative inline-flex rounded-full h-2 w-2 ${health?.botOnline ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)]' : 'bg-red-400'}`} />
                    </span>
                    <span className={health?.botOnline ? 'text-emerald-300' : 'text-red-300'}>
                      {health?.botOnline ? t('common.online', 'Online') : t('common.offline', 'Offline')}
                    </span>
                    {health?.uptime ? <span className="hidden lg:inline text-zinc-400 font-normal tabular-nums">· {formatUptime(health.uptime)}</span> : null}
                  </span>
                  <span className="hidden md:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-zinc-400 text-[11px] tabular-nums" title="Connected servers">
                    <Activity size={11} className="text-zinc-400" />
                    {health?.guilds ?? 0}
                  </span>
                </div>
                {/* Compact status for small screens */}
                <span className={`sm:hidden inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border text-[11px] font-medium ${
                  health?.botOnline
                    ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300'
                    : 'border-red-500/25 bg-red-500/10 text-red-300'
                }`}>
                  {health?.botOnline ? <Wifi size={11} /> : <WifiOff size={11} />}
                </span>
              </div>
            </header>

            {health?.maintenance && (
              <div className="px-4 sm:px-6 py-2 text-xs text-fuchsia-200 bg-fuchsia-500/10 border-b border-fuchsia-500/20">
                {t('shell.maintenance', 'Maintenance mode is on — slash commands are blocked for everyone except the owner.')}
              </div>
            )}
            {guildData?.degraded && (
              <div className="px-4 sm:px-6 py-2 text-xs text-amber-200 bg-amber-500/10 border-b border-amber-500/20">
                {t('shell.dbDegraded', 'No database connected — everything works, but all data is temporary and lost on restart. Connect DATABASE_URL to persist.')}
              </div>
            )}
            {!browserOnline && (
              <div className="px-4 sm:px-6 py-2 text-xs text-red-200 bg-red-500/10 border-b border-red-500/20 flex items-center justify-between gap-3" role="alert">
                <span>{t('shell.browserOffline', 'You are offline. Changes will not be saved until your connection returns.')}</span>
                <span className="flex-shrink-0 font-semibold">{t('shell.noConnection', 'No connection')}</span>
              </div>
            )}
            {browserOnline && apiReachable === false && (
              <div className="px-4 sm:px-6 py-2 text-xs text-amber-200 bg-amber-500/10 border-b border-amber-500/20 flex items-center justify-between gap-3">
                <span>{t('shell.apiUnavailable', 'Dashboard API is unreachable. The service may be restarting.')}</span>
                <button onClick={retryHealth} className="flex-shrink-0 min-h-[32px] px-3 py-1 rounded-lg border border-amber-400/25 hover:bg-amber-400/10 font-semibold">
                  {t('common.retry', 'Retry')}
                </button>
              </div>
            )}
            {apiReachable === true && health !== null && !health.botOnline && (
              <div className="px-4 sm:px-6 py-2 text-xs text-amber-200 bg-amber-500/10 border-b border-amber-500/20">
                {t('shell.botOffline', 'Bot appears offline. Commands and live data may be delayed until it reconnects.')}
              </div>
            )}

            <main id="main" className={`flex-1 min-w-0 ${isLive ? 'overflow-hidden' : 'overflow-auto'}`}>
              {auth.oauthEnabled && !auth.loggedIn && auth.redirectUri && !auth.redirectUri.includes('localhost') && (
                <div className="mx-4 sm:mx-6 mt-4 px-4 py-3 rounded-xl bg-cyan-500/10 border border-cyan-500/25 text-xs text-cyan-200">
                  {t('shell.oauthRedirect', 'Add this Redirect URI in the Discord Developer Portal → OAuth2 → Redirects:')}
                  <code className="block mt-1 text-[11px] text-cyan-300 break-all">{auth.redirectUri}</code>
                </div>
              )}
              {systemPageDenied || musicPageDenied || botControlsDenied || settingsDenied ? (
                <div className="min-h-full flex items-center justify-center p-8">
                  <div className="cyber-card max-w-sm p-7 text-center">
                    <AlertTriangle size={28} className="mx-auto text-red-300 mb-3" />
                    <p className="text-white font-semibold">{t('denied.title', 'System access required')}</p>
                    <p className="text-sm text-zinc-500 mt-2">{musicPageDenied
                      ? t('denied.music', 'The Music desk is available only to configured DEVELOPER or SUPER_ADMIN identities.')
                      : botControlsDenied
                        ? t('denied.botcontrols', 'Bot Controls are available only to configured DEVELOPER or SUPER_ADMIN identities.')
                      : settingsDenied
                        ? t('denied.settings', 'Server Settings are available only to configured DEVELOPER or SUPER_ADMIN identities.')
                      : t('denied.developer', 'This backend page is available only to configured SUPPORT, DEVELOPER, or SUPER_ADMIN identities.')}</p>
                    <button onClick={() => navigate('overview')} className="cyber-button mt-5">{t('denied.back', 'Return to dashboard')}</button>
                  </div>
                </div>
              ) : isDeveloperPage ? (
                <div className="h-full animate-fade-in">
                  <PageErrorBoundary key={page}>
                    <Suspense fallback={<PageLoading />}>
                      <PageComponent pageHint={PAGE_HINTS[page]} onNavigate={navigate} developerAccess={developerAccess} {...(initialTab === undefined ? {} : { initialTab })} />
                    </Suspense>
                  </PageErrorBoundary>
                </div>
              ) : ['profile', 'accountSettings', 'accountSecurity'].includes(page) ? (
                <div className="h-full animate-fade-in">
                  <PageErrorBoundary key={page}>
                    <Suspense fallback={<PageLoading />}>
                      <PageComponent account={account} discord={discord} auth={auth} />
                    </Suspense>
                  </PageErrorBoundary>
                </div>
              ) : !selectedGuild ? (
                <div className="min-h-full flex items-center justify-center p-8">
                  <div className="text-center max-w-sm cyber-card p-8 animate-slide-up">
                    <img src="/eb_logo.svg" alt="EB BOT" className="w-14 h-14 mx-auto mb-4 rounded-2xl object-cover ring-1 ring-white/10" />
                    <p className="text-white font-semibold mb-2">{t('shell.noServer', 'No server selected')}</p>
                    <p className="text-sm text-zinc-500 mb-5">
                      {auth.oauthEnabled && !auth.loggedIn
                        ? t('shell.loginToSee', 'Log in with Discord to see the servers you can manage.')
                        : t('shell.inviteRefresh', 'Invite the bot to a server, then refresh this page.')}
                    </p>
                    {auth.oauthEnabled && !auth.loggedIn && (
                      <a href="/api/auth/discord" className="cyber-button-solid inline-flex">{t('common.loginDiscord', 'Login with Discord')}</a>
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
                        developerAccess={developerAccess}
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

        {!isHome && !mobileOpen && !paletteOpen && (
          <MobileDock page={page} onNavigate={navigate} onSearch={() => setPaletteOpen(true)} canSeeMusicDesk={canSeeMusicDesk} />
        )}

        <CommandPalette
          open={paletteOpen}
          onClose={() => setPaletteOpen(false)}
          onNavigate={navigate}
          permLevel={permLevel}
          developerAccess={developerAccess}
          page={page}
          publicUrl={publicUrl}
        />
      </PermContext.Provider>
    </ToastProvider>
  );
}

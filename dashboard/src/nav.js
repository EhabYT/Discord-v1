import {
  Activity, LayoutDashboard, Music, MessageSquare, Ticket, TrendingUp,
  ScrollText, Shield, Gift, Users, BarChart3, Settings,
  SlidersHorizontal, ShieldCheck, Trophy, Radio, Send, Zap, Terminal, BadgeCheck, Tags, Cake, Lightbulb, Vote, Hash, Ghost, Megaphone,
  FileText, Code2, Database, Cpu, Lock, Flag,
} from 'lucide-react';

// Information architecture mirrors the product diagram:
//
//   Dashboard
//   ├─ Public Dashboard (guild-scoped, permission levels 0-3)
//   │  ├─ Guild Settings · Moderation · AutoMod · Tickets · Music · Roles · Logging
//   └─ Developer Area (system roles SUPPORT / DEVELOPER / SUPER_ADMIN)
//      ├─ Bot Control · System · Logs · API · Database · Monitoring · Security
//   Backend → Permission System → Discord Bot / DB
//
// `section` renders the two top-level areas in the sidebar.
// `group` renders the diagram leaf inside that area (e.g. "Tickets", "Database").
// Guild pages keep their existing `id`s so deep links (#overview, …) keep working.
// Developer leaves other than Bot Control / System are deep links into the single
// Developer control center via `tab`; App.jsx maps each id to an initialTab.
export const NAV = [
  { section: 'Public Dashboard', area: 'public' },
  // Guild Settings
  { id: 'overview',      icon: LayoutDashboard,  label: 'Overview',       hint: 'Server health, uptime and audit log', keywords: 'home status ping cpu memory audit', area: 'public', group: 'Guild Settings' },
  { id: 'analytics',     icon: BarChart3,         label: 'Analytics',      hint: '24h messages, joins and commands', keywords: 'stats chart csv peak', area: 'public', group: 'Guild Settings' },
  { id: 'leaderboard',   icon: Trophy,            label: 'Leaderboard',    hint: 'XP ranks and top members', keywords: 'rank xp top levels', area: 'public', group: 'Guild Settings' },
  { id: 'livefeed',      icon: Radio,             label: 'Live Feed',      hint: 'Realtime joins, messages and mods', keywords: 'realtime events stream', area: 'public', group: 'Guild Settings' },
  // Settings is developer-only like Music and Bot Control: its exclusive
  // routes (config, backup/restore, webhook bridge, leave) are gated
  // DEVELOPER/SUPER_ADMIN backend-side. Shared toggles keep guild levels.
  { id: 'settings',      icon: Settings,          label: 'Settings',       hint: 'Prefixes, locale and server options', devOnly: true, keywords: 'prefix dj xp backup restore', area: 'public', group: 'Guild Settings' },
  { id: 'welcome',       icon: MessageSquare,     label: 'Welcome',        hint: 'Join messages and auto roles', keywords: 'join leave autorole goodbye', area: 'public', group: 'Guild Settings' },
  { id: 'verification',  icon: BadgeCheck,        label: 'Verification',   hint: 'Gate, captcha, pending members', keywords: 'verify captcha unverified role gate panel rules', area: 'public', group: 'Guild Settings' },
  { id: 'commands',      icon: Zap,               label: 'Commands',       hint: 'Browse and toggle slash commands', keywords: 'slash fun games tools toggle catalog', area: 'public', group: 'Guild Settings' },
  { id: 'progression',   icon: TrendingUp,        label: 'XP & Levels',    hint: 'Leveling, rewards and XP boosts', keywords: 'level reward boost voice', area: 'public', group: 'Guild Settings' },
  { id: 'giveaways',     icon: Gift,              label: 'Giveaways',      hint: 'Create and manage giveaways', keywords: 'prize winners raffle', area: 'public', group: 'Guild Settings' },
  { id: 'birthdays',     icon: Cake,              label: 'Birthdays',      hint: 'Upcoming dates and announcements', keywords: 'birthday cake announce role celebrate', area: 'public', group: 'Guild Settings' },
  { id: 'suggestions',   icon: Lightbulb,         label: 'Suggestions',    hint: 'Inbox, approve and deny ideas', keywords: 'suggest inbox approve deny community idea', area: 'public', group: 'Guild Settings' },
  { id: 'polls',         icon: Vote,              label: 'Polls',          hint: 'Create votes and close results', keywords: 'poll vote options yes no survey', area: 'public', group: 'Guild Settings' },
  { id: 'tags',          icon: Hash,              label: 'Tags',           hint: 'Reusable FAQ and snippet tags', keywords: 'tag snippet faq custom text', area: 'public', group: 'Guild Settings' },
  { id: 'confessions',   icon: Ghost,             label: 'Confessions',    hint: 'Anonymous channel and staff log', keywords: 'confess anonymous secret cooldown', area: 'public', group: 'Guild Settings' },
  // Moderation
  { id: 'members',       icon: Users,             label: 'Members',        hint: 'Staff tools, notes, kick and warnings', keywords: 'warn kick ban timeout notes staff mute', area: 'public', group: 'Moderation' },
  { id: 'board',         icon: Megaphone,         label: 'Staff Board',    hint: 'Announce, AFK list and reminders', keywords: 'announce afk reminder ping everyone', area: 'public', group: 'Moderation' },
  // AutoMod
  { id: 'security',      icon: Shield,            label: 'Security',       hint: 'AutoMod, anti-raid, anti-invite', keywords: 'raid automod antispam', area: 'public', group: 'AutoMod' },
  // Tickets
  { id: 'tickets',       icon: Ticket,            label: 'Tickets',        hint: 'Support panels and open tickets', keywords: 'support inbox close transcript', area: 'public', group: 'Tickets' },
  // Music — shown under Public per the diagram, but the desk drives voice
  // connections remotely so the backend (/api/music/*) and this entry keep the
  // DEVELOPER/SUPER_ADMIN gate. SUPPORT and guild levels receive 403.
  { id: 'music',         icon: Music,             label: 'Music',          hint: 'Queue, filters and playback (developers only)', devOnly: true, keywords: 'play pause queue voice spotify youtube', area: 'public', group: 'Music' },
  // Roles
  { id: 'reactionroles', icon: Tags,              label: 'Reaction Roles', hint: 'Button and reaction self-roles', keywords: 'roles reaction button self assign exclusive', area: 'public', group: 'Roles' },
  { id: 'permissions',   icon: ShieldCheck,       label: 'Permissions',    hint: 'Dashboard access levels', keywords: 'roles admin mod viewer', area: 'public', group: 'Roles' },
  { id: 'embedbuilder',  icon: Send,              label: 'Embed Builder',  hint: 'Compose and send rich embeds', minLevel: 3, keywords: 'embed send announce', area: 'public', group: 'Roles' },
  { id: 'autoresponder', icon: Zap,               label: 'Auto-Responder', hint: 'Keyword replies', minLevel: 3, keywords: 'trigger reply exact keyword', area: 'public', group: 'Roles' },
  // Logging
  { id: 'logs',          icon: ScrollText,        label: 'Logs',           hint: 'Mod and event log channels', keywords: 'logs logging modlog message delete', area: 'public', group: 'Logging' },
  { section: 'Developer Area', area: 'developer', systemOnly: true, always: true },
  // Bot Control — guild presence controls plus the global overview/flags/deploy center.
  // Developer-only like the Music desk: presence and nickname drive the bot's
  // public identity, so guild levels alone must not unlock them.
  { id: 'botcontrols',   icon: SlidersHorizontal, label: 'Bot Control',    hint: 'Nickname, presence and status', devOnly: true, keywords: 'nick presence status activity bot control', area: 'developer', group: 'Bot Control' },
  { id: 'developer',     icon: Terminal,          label: 'Control Center', hint: 'Role-scoped backend control center', systemOnly: true, always: true, keywords: 'dev logs env token tunnel debug overview flags deploy', area: 'developer', group: 'Bot Control', tab: 'overview' },
  { id: 'dev-flags',     icon: Flag,              label: 'Flags',          hint: 'Feature flags and maintenance policy (SUPER_ADMIN writes)', systemOnly: true, always: true, keywords: 'dev flags maintenance verbose policy', area: 'developer', group: 'Bot Control', tab: 'flags' },
  // System
  { id: 'system',        icon: Activity,          label: 'System',         hint: 'V2 backend readiness for Dashboard, Discord and Supabase', systemOnly: true, always: true, keywords: 'health ready status database oauth v2 system', area: 'developer', group: 'System' },
  // Logs
  { id: 'dev-logs',      icon: FileText,          label: 'Logs',           hint: 'Backend logs and developer audit trail', systemOnly: true, always: true, keywords: 'dev logs audit general error tunnel cloudflared', area: 'developer', group: 'Logs', tab: 'logs' },
  // API
  { id: 'dev-api',       icon: Code2,             label: 'API',            hint: 'Slash-command catalog and bot config', systemOnly: true, always: true, keywords: 'dev api commands config metadata schema', area: 'developer', group: 'API', tab: 'commands' },
  // Database
  { id: 'dev-database',  icon: Database,          label: 'Database',       hint: 'Supabase key counts and guild inventory', systemOnly: true, always: true, keywords: 'dev database postgres keys prefixes guilds', area: 'developer', group: 'Database', tab: 'db' },
  // Monitoring
  { id: 'dev-monitoring', icon: Cpu,              label: 'Monitoring',     hint: 'Performance metrics and scheduler jobs', systemOnly: true, always: true, keywords: 'dev monitoring performance metrics latency jobs scheduler', area: 'developer', group: 'Monitoring', tab: 'performance' },
  // Security
  { id: 'dev-security',  icon: Lock,              label: 'Security',       hint: 'Environment status and audit log', systemOnly: true, always: true, keywords: 'dev security env audit maintenance flags', area: 'developer', group: 'Security', tab: 'audit' },
];

export const PAGE_TITLES = {
  ...Object.fromEntries(NAV.filter((item) => item.id).map((item) => [item.id, item.label])),
  profile: 'Profile',
  accountSecurity: 'Account Security',
  accountSettings: 'Account Settings',
};

export const PAGE_HINTS = Object.fromEntries(
  NAV.filter((item) => item.id).map((item) => [item.id, item.hint || ''])
);

export const SEARCHABLE_PAGES = NAV.filter((item) => item.id);

export const DOCK_PAGES = ['overview', 'members', 'music', 'tickets'];

// Premium navigation IA: stable group order for collapsible sections and
// the command-palette grouping. Keys must match `group` above.
export const GROUP_ORDER = [
  'Guild Settings',
  'Moderation',
  'AutoMod',
  'Tickets',
  'Music',
  'Roles',
  'Logging',
  'Bot Control',
  'System',
  'Logs',
  'API',
  'Database',
  'Monitoring',
  'Security',
];

// Mnemonic shortcuts shown in the sidebar + palette (no global binding yet,
// except ⌘K / / which opens the palette). Single chars stay unbound to avoid
// colliding with typing; displayed as discovery hints.
export const SHORTCUT_BY_ID = {
  overview: '⌘1',
  analytics: '⌘2',
  livefeed: '⌘3',
  members: '⌘4',
  tickets: '⌘5',
  music: '⌘6',
};

// Single source of truth for "may this identity see this nav entry?".
// Applies to area sections, group pages, and palette entries alike, so the
// sidebar, command palette, and App.jsx guards can never diverge again.
// `flags` mirrors the caller-side access state; the backend remains
// authoritative if a URL is entered manually.
export function isNavItemVisible(item, flags = {}) {
  const { permLevel = 0, canSeeDeveloper = false, canSeeMusicDesk = false } = flags;
  if (item.minLevel && !item.always && permLevel < item.minLevel) return false;
  if (item.systemOnly && !canSeeDeveloper) return false;
  if (item.devOnly && !canSeeMusicDesk) return false;
  return true;
}

// Flat render model for the sidebar: section headers, diagram group
// sub-headers (Guild Settings, Tickets, …), and page entries in display order.
// Group headers are emitted before the first *visible* page of each group, so
// hidden pages never leave orphan labels behind.
export function visibleNavNodes({ compact = false, ...flags } = {}) {
  const nodes = [];
  let lastGroup = null;
  NAV.forEach((item, index) => {
    if (item.section) {
      lastGroup = null;
      if (!isNavItemVisible(item, flags)) return;
      nodes.push(compact
        ? { type: 'divider', key: `divider-${index}` }
        : { type: 'section', key: `section-${index}`, item });
      return;
    }
    if (!isNavItemVisible(item, flags)) return;
    if (!compact && item.group && item.group !== lastGroup) {
      nodes.push({ type: 'group', key: `group-${item.group}`, item });
    }
    if (item.group) lastGroup = item.group;
    nodes.push({ type: 'page', key: item.id, item });
  });
  return nodes;
}

export const LEVEL_LABELS = ['Viewer', 'DJ', 'Mod', 'Admin'];
export const LEVEL_COLORS = ['text-zinc-400', 'text-sky-300', 'text-amber-300', 'text-cyan-300'];

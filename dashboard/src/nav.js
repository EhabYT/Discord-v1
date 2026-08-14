import {
  LayoutDashboard, Music, MessageSquare, Ticket, TrendingUp,
  ScrollText, Shield, Gift, Users, BarChart3, Settings,
  SlidersHorizontal, ShieldCheck, Trophy, Radio, Send, Zap, Terminal, BadgeCheck, Tags, Cake, Lightbulb, Vote, Hash, Ghost, Megaphone,
} from 'lucide-react';

export const NAV = [
  { section: 'Core' },
  { id: 'overview',      icon: LayoutDashboard,  label: 'Overview',       hint: 'Server health, uptime and audit log', keywords: 'home status ping cpu memory audit' },
  { id: 'analytics',     icon: BarChart3,         label: 'Analytics',      hint: '24h messages, joins and commands', keywords: 'stats chart csv peak' },
  { id: 'leaderboard',   icon: Trophy,            label: 'Leaderboard',    hint: 'XP ranks and top members', keywords: 'rank xp top levels' },
  { id: 'livefeed',      icon: Radio,             label: 'Live Feed',      hint: 'Realtime joins, messages and mods', keywords: 'realtime events stream' },
  { id: 'members',       icon: Users,             label: 'Members',        hint: 'Staff tools, notes, kick and warnings', keywords: 'warn kick ban timeout notes staff mute' },
  { section: 'Features' },
  { id: 'music',         icon: Music,             label: 'Music',          hint: 'Queue, filters and playback', keywords: 'play pause queue voice spotify youtube' },
  { id: 'giveaways',     icon: Gift,              label: 'Giveaways',      hint: 'Create and manage giveaways', keywords: 'prize winners raffle' },
  { id: 'progression',   icon: TrendingUp,        label: 'XP & Levels',    hint: 'Leveling, rewards and XP boosts', keywords: 'level reward boost voice' },
  { id: 'tickets',       icon: Ticket,            label: 'Tickets',        hint: 'Support panels and open tickets', keywords: 'support inbox close transcript' },
  { id: 'reactionroles', icon: Tags,              label: 'Reaction Roles', hint: 'Button and reaction self-roles', keywords: 'roles reaction button self assign exclusive' },
  { id: 'birthdays',     icon: Cake,              label: 'Birthdays',      hint: 'Upcoming dates and announcements', keywords: 'birthday cake announce role celebrate' },
  { id: 'suggestions',   icon: Lightbulb,         label: 'Suggestions',    hint: 'Inbox, approve and deny ideas', keywords: 'suggest inbox approve deny community idea' },
  { id: 'polls',         icon: Vote,              label: 'Polls',          hint: 'Create votes and close results', keywords: 'poll vote options yes no survey' },
  { id: 'tags',          icon: Hash,              label: 'Tags',           hint: 'Reusable FAQ and snippet tags', keywords: 'tag snippet faq custom text' },
  { id: 'confessions',   icon: Ghost,             label: 'Confessions',    hint: 'Anonymous channel and staff log', keywords: 'confess anonymous secret cooldown' },
  { id: 'board',         icon: Megaphone,         label: 'Staff Board',    hint: 'Announce, AFK list and reminders', keywords: 'announce afk reminder ping everyone' },
  { section: 'Config' },
  { id: 'welcome',       icon: MessageSquare,     label: 'Welcome',        hint: 'Join messages and auto roles', keywords: 'join leave autorole goodbye' },
  { id: 'verification',  icon: BadgeCheck,        label: 'Verification',   hint: 'Gate, captcha, pending members', keywords: 'verify captcha unverified role gate panel rules' },
  { id: 'logs',          icon: ScrollText,        label: 'Logs',           hint: 'Mod and event log channels', keywords: 'logs logging modlog message delete' },
  { id: 'security',      icon: Shield,            label: 'Security',       hint: 'AutoMod, anti-raid, anti-invite', keywords: 'raid automod antispam' },
  { id: 'commands',      icon: Zap,               label: 'Commands',       hint: 'Browse and toggle slash commands', keywords: 'slash fun games tools toggle catalog' },
  { id: 'settings',      icon: Settings,          label: 'Settings',       hint: 'Prefixes, locale and server options', keywords: 'prefix dj xp backup restore' },
  { id: 'botcontrols',   icon: SlidersHorizontal, label: 'Bot Controls',   hint: 'Nickname, presence and status', keywords: 'nick presence status activity' },
  { id: 'permissions',   icon: ShieldCheck,       label: 'Permissions',    hint: 'Dashboard access levels', keywords: 'roles admin mod viewer' },
  { section: 'Owner', minLevel: 3 },
  { id: 'embedbuilder',  icon: Send,              label: 'Embed Builder',  hint: 'Compose and send rich embeds', minLevel: 3, keywords: 'embed send announce' },
  { id: 'autoresponder', icon: Zap,               label: 'Auto-Responder', hint: 'Keyword replies', minLevel: 3, keywords: 'trigger reply exact keyword' },
  { section: 'Developer', always: true },
  { id: 'developer',     icon: Terminal,          label: 'Developer',      hint: 'Owner-only backend, logs and tunnel', always: true, keywords: 'dev logs env token tunnel debug' },
];

export const PAGE_TITLES = Object.fromEntries(
  NAV.filter((item) => item.id).map((item) => [item.id, item.label])
);

export const PAGE_HINTS = Object.fromEntries(
  NAV.filter((item) => item.id).map((item) => [item.id, item.hint || ''])
);

export const SEARCHABLE_PAGES = NAV.filter((item) => item.id);

export const DOCK_PAGES = ['overview', 'members', 'music', 'tickets'];

export const LEVEL_LABELS = ['Viewer', 'DJ', 'Mod', 'Admin'];
export const LEVEL_COLORS = ['text-zinc-400', 'text-sky-300', 'text-amber-300', 'text-cyan-300'];

import React from 'react';
import { useI18n } from '../i18n.jsx';
import {
  AlertTriangle, ArrowRight, BarChart3, Gift, Languages, LayoutDashboard, Music, Shield, Ticket,
  Trophy, Users, Wifi, WifiOff, Zap, Command, Radio, Terminal, Sparkles,
  MessageSquare, SlidersHorizontal, Play, Hash, Lock, Lightbulb, Vote, Ghost, Megaphone,
} from 'lucide-react';

const FEATURES = [
  { id: 'members', icon: Shield, title: 'Moderation', text: 'Warnings, notes, timeouts and bans in one staff workspace.' },
  { id: 'music', icon: Music, title: 'Music', text: 'Queue, filters, lyrics, autoplay and voice controls.' },
  { id: 'progression', icon: Trophy, title: 'XP & Levels', text: 'Ranks, role rewards and configurable multipliers.' },
  { id: 'tickets', icon: Ticket, title: 'Tickets', text: 'Support panels, transcripts, claims and inbox.' },
  { id: 'reactionroles', icon: Hash, title: 'Reaction Roles', text: 'Button or emoji self-roles with exclusive groups.' },
  { id: 'birthdays', icon: Gift, title: 'Birthdays', text: 'Dates, announcement channels and celebration roles.' },
  { id: 'suggestions', icon: Lightbulb, title: 'Suggestions', text: 'Community inbox, approval, denial and staff notes.' },
  { id: 'polls', icon: Vote, title: 'Polls', text: 'Publish votes, inspect results and close automatically.' },
  { id: 'tags', icon: Hash, title: 'Tags', text: 'Reusable FAQ snippets managed from the dashboard.' },
  { id: 'confessions', icon: Ghost, title: 'Confessions', text: 'Anonymous channels, cooldowns and optional staff logs.' },
  { id: 'board', icon: Megaphone, title: 'Staff Board', text: 'Announcements, AFK lists and reminders in one place.' },
  { id: 'giveaways', icon: Gift, title: 'Giveaways', text: 'Start, reroll and track winners.' },
  { id: 'analytics', icon: BarChart3, title: 'Analytics', text: '24-hour charts, command usage and live activity.' },
  { id: 'commands', icon: Command, title: 'Commands', text: 'One hundred slash commands across twelve categories.' },
  { id: 'verification', icon: Lock, title: 'Verification', text: 'Member gates, captcha, pending kicks and verify logs.' },
  { id: 'security', icon: Zap, title: 'Automation', text: 'Welcome flows, AutoMod, anti-raid and keyword replies.' },
];

const STEPS = [
  { n: '01', title: 'Invite EB', text: 'Add the bot to your Discord server with slash commands.' },
  { n: '02', title: 'Open the dashboard', text: 'Check status, staff tools, music and tickets.' },
  { n: '03', title: 'Run your community', text: 'Moderate, play, level and support from one place.' },
];

const PACKS = [
  { name: '/fun', items: '8ball · meme · roast · cat · fox · rate' },
  { name: '/games', items: 'trivia · hangman · blackjack · wordle · tictactoe' },
  { name: '/tools', items: 'weather · wiki · crypto · translate · hash' },
  { name: '/ticket', items: 'setup · panel · claim · rename · transcript' },
];

const COMMANDS = ['/ping', '/play', '/warn', '/ticket', '/suggest', '/poll', '/fun', '/games', '/tools', '/help'];

const PREVIEW = [
  { id: 'members', icon: Users, label: 'Members', hint: 'Staff-Desk' },
  { id: 'music', icon: Play, label: 'Music', hint: 'Queue live' },
  { id: 'tickets', icon: Ticket, label: 'Tickets', hint: 'Inbox' },
  { id: 'analytics', icon: BarChart3, label: 'Analytics', hint: '24h' },
  { id: 'welcome', icon: MessageSquare, label: 'Welcome', hint: 'Join cards' },
  { id: 'verification', icon: Lock, label: 'Verify', hint: 'Member gate' },
  { id: 'botcontrols', icon: SlidersHorizontal, label: 'Controls', hint: 'Presence' },
];

function formatUptime(ms) {
  if (!ms) return '—';
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export default function Home({ health, auth, onEnter }) {
  const { locale, t, toggleLocale } = useI18n();
  const online = !!health?.botOnline;
  const go = (id) => onEnter(id || 'overview');
  const inviteUrl = auth?.clientId
    ? `https://discord.com/oauth2/authorize?client_id=${window.encodeURIComponent(auth.clientId)}&permissions=8&scope=bot%20applications.commands`
    : null;

  return (
    <div className="min-h-screen overflow-auto">
      <header className="sticky top-0 z-30 glass-header">
        <div className="max-w-6xl mx-auto px-5 h-16 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <img src="/eb_logo.svg" alt="EB BOT" className="w-10 h-10 rounded-xl object-cover ring-1 ring-white/10" />
            <div className="min-w-0">
              <p className="text-sm font-bold text-white leading-none">EB BOT</p>
              <p className="text-[10px] uppercase tracking-[0.16em] text-zinc-500 mt-1">Homepage</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={toggleLocale}
              className="cyber-icon-button"
              aria-label={locale === 'ar' ? 'Switch to English' : 'التبديل إلى العربية'}
              title={locale === 'ar' ? 'English' : 'العربية'}
            >
              <Languages size={16} />
            </button>
            <span className={`hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-medium ${
              online ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300' : 'border-red-500/25 bg-red-500/10 text-red-300'
            }`}>
              {online ? <Wifi size={11} /> : <WifiOff size={11} />}
              {online ? t('common.online', 'Online') : t('common.offline', 'Offline')}
              {health?.uptime ? <span className="hidden md:inline text-zinc-500">· {formatUptime(health.uptime * 1000)}</span> : null}
            </span>
            {inviteUrl && (
              <a href={inviteUrl} target="_blank" rel="noreferrer" className="hidden sm:inline-flex cyber-button text-xs px-3 py-2">
                {t('home.invite', 'Invite')}
              </a>
            )}
            <button onClick={() => go('overview')} className="cyber-button-solid text-xs px-3 py-2 inline-flex items-center gap-1.5">
              {t('home.openDashboard', 'Open dashboard')} <ArrowRight size={13} />
            </button>
          </div>
        </div>
      </header>

      {auth?.authRequired && auth?.oauthError && (
        <div className="max-w-6xl mx-auto px-5 pt-5" role="alert">
          <div className="cyber-warning text-sm">
            <AlertTriangle size={17} className="text-amber-300 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-amber-100">Discord login is not configured</p>
              <p className="text-xs text-amber-200/70 mt-0.5">{auth.oauthError} Update the Render environment and redeploy.</p>
            </div>
          </div>
        </div>
      )}

      <section className="max-w-6xl mx-auto px-5 pt-12 sm:pt-16 pb-8">
        <div className="grid lg:grid-cols-[1.15fr_0.85fr] gap-10 items-center">
          <div className="animate-fade-in">
            <p className="cyber-label mb-3 inline-flex items-center gap-1.5">
              <Sparkles size={11} className="text-cyan-300" /> {t('home.kicker', 'Discord All-in-One')}
            </p>
            <h1 className="text-4xl sm:text-6xl font-bold text-white tracking-tight leading-[1.02] mb-5">
              {t('home.titleA', 'Your server.')}<br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-200 via-sky-200 to-indigo-200">{t('home.titleB', 'One desk.')}</span>
            </h1>
            <p className="text-zinc-400 text-base sm:text-lg max-w-xl leading-relaxed mb-7">
              {t('home.subtitle', 'Moderation, music, XP, tickets and live analytics — in one place.')}
              {' '}100 Slash Commands · Dashboard V2.
            </p>
            <div className="flex flex-wrap gap-3">
              <button onClick={() => go('overview')} className="cyber-button-solid px-5 py-2.5 inline-flex items-center gap-2">
                {t('home.openDashboard', 'Open dashboard')} <ArrowRight size={16} />
              </button>
              {inviteUrl && (
                <a href={inviteUrl} target="_blank" rel="noreferrer" className="cyber-button px-5 py-2.5 inline-flex items-center">
                  {t('home.invite', 'Invite to Discord')}
                </a>
              )}
              {auth?.oauthEnabled && !auth?.loggedIn && (
                <a href="/api/auth/discord" className="cyber-button px-5 py-2.5">{t('common.loginDiscord', 'Login with Discord')}</a>
              )}
            </div>
          </div>

          <div className="relative flex justify-center animate-slide-up">
            <div className="absolute inset-6 rounded-full bg-cyan-400/15 blur-3xl pointer-events-none" />
            <div className="relative">
              <img
                src="/eb_logo.svg"
                alt="EB BOT"
                className="relative w-64 h-64 sm:w-80 sm:h-80 rounded-[2rem] object-cover ring-1 ring-white/10 shadow-[0_30px_80px_rgba(0,0,0,0.55)]"
              />
              <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 cyber-card px-3 py-1.5 flex items-center gap-2 whitespace-nowrap">
                <span className={`w-1.5 h-1.5 rounded-full ${online ? 'bg-emerald-400 glow-dot' : 'bg-red-400'}`} />
                <span className="text-[11px] text-zinc-300">{online ? '𝑬𝑩#8552 online' : 'Bot offline'}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-14">
          {[
            { label: 'Status', value: online ? t('common.online', 'Online') : t('common.offline', 'Offline'), sub: health?.uptime ? formatUptime(health.uptime * 1000) : '—' },
            { label: 'Server', value: health?.guilds ?? '—', sub: 'verbunden' },
            { label: 'Commands', value: '100', sub: 'Slash bereit' },
            { label: 'Dashboard', value: 'V2', sub: health?.maintenance ? 'maintenance' : 'live control' },
          ].map((s) => (
            <div key={s.label} className="cyber-card p-4">
              <p className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">{s.label}</p>
              <p className="text-2xl font-bold text-white mt-1 tabular-nums">{s.value}</p>
              <p className="text-[11px] text-zinc-600 mt-0.5">{s.sub}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-5 pb-14">
        <div className="mb-6">
          <p className="cyber-label mb-2">{t('home.how', 'How it works')}</p>
          <h2 className="text-2xl font-bold text-white">{t('home.howTitle', 'Three steps to get started.')}</h2>
        </div>
        <div className="grid md:grid-cols-3 gap-3">
          {STEPS.map((s) => (
            <div key={s.n} className="cyber-card p-5">
              <p className="text-xs font-mono text-cyan-300 mb-3">{s.n}</p>
              <p className="text-sm font-semibold text-white">{t(`step.${s.n}.title`, s.title)}</p>
              <p className="text-xs text-zinc-500 mt-1 leading-relaxed">{t(`step.${s.n}.text`, s.text)}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-5 pb-14">
        <div className="mb-6 flex items-end justify-between gap-4 flex-wrap">
          <div>
            <p className="cyber-label mb-2">{t('home.toolkit', 'Toolkit')}</p>
            <h2 className="text-2xl font-bold text-white">{t('home.toolkitTitle', 'Everything your staff needs')}</h2>
          </div>
          <button onClick={() => go('overview')} className="text-xs text-cyan-300 hover:text-cyan-200 inline-flex items-center gap-1">
            <LayoutDashboard size={12} /> {t('home.openDashboard', 'Open dashboard')}
          </button>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {FEATURES.map(({ id, icon: Icon, title, text }) => (
            <button key={title} onClick={() => go(id)} className="cyber-card-hover p-4 text-start">
              <span className="w-9 h-9 rounded-xl bg-cyan-400/10 border border-cyan-400/15 flex items-center justify-center text-cyan-300 mb-3">
                <Icon size={16} />
              </span>
              <p className="text-sm font-semibold text-white">{t(`nav.${id}`, title)}</p>
              <p className="text-xs text-zinc-500 mt-1 leading-relaxed">{t(`feature.${id}`, text)}</p>
            </button>
          ))}
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-5 pb-14">
        <div className="mb-6">
          <p className="cyber-label mb-2">{t('home.preview', 'Dashboard preview')}</p>
          <h2 className="text-2xl font-bold text-white">{t('home.previewTitle', 'Jump directly into the tools.')}</h2>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2">
          {PREVIEW.map(({ id, icon: Icon, label, hint }) => (
            <button key={id} onClick={() => go(id)} className="cyber-card-hover p-3 text-start">
              <Icon size={15} className="text-cyan-300 mb-2" />
              <p className="text-xs font-semibold text-white">{t(`nav.${id}`, label)}</p>
              <p className="text-[10px] text-zinc-600">{hint}</p>
            </button>
          ))}
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-5 pb-14">
        <div className="cyber-card-accent p-6 sm:p-8">
          <div className="flex items-center gap-2 mb-3">
            <Hash size={14} className="text-cyan-300" />
            <p className="cyber-label">In Discord</p>
          </div>
          <h2 className="text-xl font-bold text-white mb-2">{t('home.commandsTitle', '100 slash commands. One bot.')}</h2>
          <p className="text-xs text-zinc-500 mb-5">{t('home.commandsSub', 'Full commands with extra features in subcommands.')}</p>
          <div className="flex flex-wrap gap-2 mb-6">
            {COMMANDS.map((c) => (
              <span key={c} className="font-mono text-xs px-3 py-1.5 rounded-lg bg-black/25 border border-white/10 text-cyan-200">{c}</span>
            ))}
          </div>
          <div className="grid sm:grid-cols-2 gap-2">
            {PACKS.map((p) => (
              <div key={p.name} className="rounded-xl bg-black/20 border border-white/[0.06] px-3 py-2.5">
                <p className="font-mono text-xs text-cyan-200">{p.name}</p>
                <p className="text-[11px] text-zinc-500 mt-0.5">{p.items}</p>
              </div>
            ))}
          </div>
          <p className="text-xs text-zinc-500 mt-5 inline-flex items-center gap-1.5">
            <Radio size={12} className="text-cyan-400" /> {t('home.liveNote', 'Live feed and logs stay in the dashboard.')}
          </p>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-5 pb-16">
        <div className="cyber-card p-8 sm:p-10 text-center">
          <img src="/eb_logo.svg" alt="" className="w-16 h-16 mx-auto mb-4 rounded-2xl object-cover ring-1 ring-white/10" />
          <h2 className="text-2xl font-bold text-white mb-2">{t('home.ready', 'Ready when you are.')}</h2>
          <p className="text-sm text-zinc-500 mb-6 max-w-md mx-auto">
            {t('home.readyText', 'Run your community from one fast, secure dashboard.')}
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <button onClick={() => go('overview')} className="cyber-button-solid px-5 py-2.5 inline-flex items-center gap-2">
              {t('home.openDashboard', 'Open dashboard')} <ArrowRight size={16} />
            </button>
            {inviteUrl && <a href={inviteUrl} target="_blank" rel="noreferrer" className="cyber-button px-5 py-2.5">{t('home.invite', 'Invite')}</a>}
            <button onClick={() => go('developer')} className="cyber-button px-5 py-2.5 inline-flex items-center gap-1.5">
              <Terminal size={13} /> Developer
            </button>
          </div>
          {health?.maintenance && (
            <p className="mt-5 text-[11px] text-fuchsia-300 inline-flex items-center gap-1.5">
              <Lock size={11} /> {t('shell.maintenance', 'Maintenance mode is active — slash commands are owner-only.')}
            </p>
          )}
        </div>
      </section>

      <footer className="border-t border-white/[0.06]">
        <div className="max-w-6xl mx-auto px-5 py-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-zinc-600">
          <span>EB BOT · Homepage · Dashboard + Discord</span>
          <div className="flex items-center gap-4">
            <button onClick={() => go('home')} className="text-zinc-500 hover:text-zinc-300">#home</button>
            <button onClick={() => go('overview')} className="text-cyan-300 hover:text-cyan-200">Dashboard →</button>
          </div>
        </div>
      </footer>
    </div>
  );
}

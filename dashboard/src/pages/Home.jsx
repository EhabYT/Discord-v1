import React from 'react';
import {
  AlertTriangle, ArrowRight, BarChart3, Gift, LayoutDashboard, Music, Shield, Ticket,
  Trophy, Users, Wifi, WifiOff, Zap, Command, Radio, Terminal, Sparkles,
  MessageSquare, SlidersHorizontal, Play, Hash, Lock, Lightbulb, Vote, Ghost, Megaphone,
} from 'lucide-react';

const FEATURES = [
  { id: 'members', icon: Shield, title: 'Moderation', text: 'Warns, Notizen, Timeouts, Bans — komplettes Staff-Desk.' },
  { id: 'music', icon: Music, title: 'Musik', text: 'Queue, Filter, Lyrics, Autoplay und Voice-Steuerung.' },
  { id: 'progression', icon: Trophy, title: 'XP & Level', text: 'Ränge, Rollen-Rewards und Multiplikatoren.' },
  { id: 'tickets', icon: Ticket, title: 'Tickets', text: 'Support-Panels, Transcripts, Claim und Inbox.' },
  { id: 'reactionroles', icon: Hash, title: 'Reaction Roles', text: 'Buttons oder Emojis — self-assign, exclusive groups.' },
  { id: 'birthdays', icon: Gift, title: 'Birthdays', text: 'Termine, Announce-Kanal und 24h-Rolle.' },
  { id: 'suggestions', icon: Lightbulb, title: 'Suggestions', text: 'Inbox: posten, approve, deny, Staff-Notiz.' },
  { id: 'polls', icon: Vote, title: 'Polls', text: 'Abstimmungen posten, Ergebnisse und Auto-Close.' },
  { id: 'tags', icon: Hash, title: 'Tags', text: 'FAQ-Snippets — /tag get, Desk zum Editieren.' },
  { id: 'confessions', icon: Ghost, title: 'Confessions', text: 'Anonymer Kanal, Cooldown und optionales Staff-Log.' },
  { id: 'board', icon: Megaphone, title: 'Staff Board', text: 'Announce, AFK-Liste und Reminders an einem Ort.' },
  { id: 'giveaways', icon: Gift, title: 'Giveaways', text: 'Starten, rerollen und Gewinner tracken.' },
  { id: 'analytics', icon: BarChart3, title: 'Analytics', text: '24h-Charts, Command-Usage und Live-Feed.' },
  { id: 'commands', icon: Command, title: 'Commands', text: '100 Slash-Commands — /fun, /games, /tools.' },
  { id: 'verification', icon: Lock, title: 'Verification', text: 'Gate, Captcha, Pending-Kick und Verify-Logs.' },
  { id: 'security', icon: Zap, title: 'Automation', text: 'Welcome, AutoMod, Anti-Raid und Keyword-Replies.' },
];

const STEPS = [
  { n: '01', title: 'EB einladen', text: 'Bot auf den Discord-Server holen — Slash-Commands inklusive.' },
  { n: '02', title: 'Desk öffnen', text: 'Dashboard: Status, Staff-Tools, Musik, Tickets.' },
  { n: '03', title: 'Server fahren', text: 'Warnen, spielen, leveln und Tickets — an einem Ort.' },
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
            <span className={`hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-medium ${
              online ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300' : 'border-red-500/25 bg-red-500/10 text-red-300'
            }`}>
              {online ? <Wifi size={11} /> : <WifiOff size={11} />}
              {online ? 'Online' : 'Offline'}
              {health?.uptime ? <span className="hidden md:inline text-zinc-500">· {formatUptime(health.uptime * 1000)}</span> : null}
            </span>
            {inviteUrl && (
              <a href={inviteUrl} target="_blank" rel="noreferrer" className="hidden sm:inline-flex cyber-button text-xs px-3 py-2">
                Einladen
              </a>
            )}
            <button onClick={() => go('overview')} className="cyber-button-solid text-xs px-3 py-2 inline-flex items-center gap-1.5">
              Dashboard <ArrowRight size={13} />
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
              <Sparkles size={11} className="text-cyan-300" /> Discord All-in-One
            </p>
            <h1 className="text-4xl sm:text-6xl font-bold text-white tracking-tight leading-[1.02] mb-5">
              Dein Server.<br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-200 via-sky-200 to-indigo-200">Ein Desk.</span>
            </h1>
            <p className="text-zinc-400 text-base sm:text-lg max-w-xl leading-relaxed mb-7">
              Moderation, Musik, XP, Tickets und Live-Analytics — für Staff, die Tempo wollen.
              100 Slash-Commands. Dashboard v6.
            </p>
            <div className="flex flex-wrap gap-3">
              <button onClick={() => go('overview')} className="cyber-button-solid px-5 py-2.5 inline-flex items-center gap-2">
                Homepage verlassen · Desk <ArrowRight size={16} />
              </button>
              {inviteUrl && (
                <a href={inviteUrl} target="_blank" rel="noreferrer" className="cyber-button px-5 py-2.5 inline-flex items-center">
                  Zu Discord einladen
                </a>
              )}
              {auth?.oauthEnabled && !auth?.loggedIn && (
                <a href="/api/auth/discord" className="cyber-button px-5 py-2.5">Mit Discord einloggen</a>
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
            { label: 'Status', value: online ? 'Online' : 'Offline', sub: health?.uptime ? formatUptime(health.uptime * 1000) : '—' },
            { label: 'Server', value: health?.guilds ?? '—', sub: 'verbunden' },
            { label: 'Commands', value: '100', sub: 'Slash bereit' },
            { label: 'Dashboard', value: 'v6', sub: health?.maintenance ? 'maintenance' : 'live control' },
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
          <p className="cyber-label mb-2">So läuft’s</p>
          <h2 className="text-2xl font-bold text-white">Drei Schritte. Dann fährst du.</h2>
        </div>
        <div className="grid md:grid-cols-3 gap-3">
          {STEPS.map((s) => (
            <div key={s.n} className="cyber-card p-5">
              <p className="text-xs font-mono text-cyan-300 mb-3">{s.n}</p>
              <p className="text-sm font-semibold text-white">{s.title}</p>
              <p className="text-xs text-zinc-500 mt-1 leading-relaxed">{s.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-5 pb-14">
        <div className="mb-6 flex items-end justify-between gap-4 flex-wrap">
          <div>
            <p className="cyber-label mb-2">Toolkit</p>
            <h2 className="text-2xl font-bold text-white">Was Staff wirklich nutzt</h2>
          </div>
          <button onClick={() => go('overview')} className="text-xs text-cyan-300 hover:text-cyan-200 inline-flex items-center gap-1">
            <LayoutDashboard size={12} /> Desk öffnen
          </button>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {FEATURES.map(({ id, icon: Icon, title, text }) => (
            <button key={title} onClick={() => go(id)} className="cyber-card-hover p-4 text-left">
              <span className="w-9 h-9 rounded-xl bg-cyan-400/10 border border-cyan-400/15 flex items-center justify-center text-cyan-300 mb-3">
                <Icon size={16} />
              </span>
              <p className="text-sm font-semibold text-white">{title}</p>
              <p className="text-xs text-zinc-500 mt-1 leading-relaxed">{text}</p>
            </button>
          ))}
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-5 pb-14">
        <div className="mb-6">
          <p className="cyber-label mb-2">Desk Preview</p>
          <h2 className="text-2xl font-bold text-white">Direkt in die Module.</h2>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2">
          {PREVIEW.map(({ id, icon: Icon, label, hint }) => (
            <button key={id} onClick={() => go(id)} className="cyber-card-hover p-3 text-left">
              <Icon size={15} className="text-cyan-300 mb-2" />
              <p className="text-xs font-semibold text-white">{label}</p>
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
          <h2 className="text-xl font-bold text-white mb-2">100 Slash-Commands. Ein Bot.</h2>
          <p className="text-xs text-zinc-500 mb-5">Limit voll — Extra-Features sitzen in Subcommands.</p>
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
            <Radio size={12} className="text-cyan-400" /> Live-Feed und Logs bleiben im Dashboard.
          </p>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-5 pb-16">
        <div className="cyber-card p-8 sm:p-10 text-center">
          <img src="/eb_logo.svg" alt="" className="w-16 h-16 mx-auto mb-4 rounded-2xl object-cover ring-1 ring-white/10" />
          <h2 className="text-2xl font-bold text-white mb-2">Bereit, wenn du bist.</h2>
          <p className="text-sm text-zinc-500 mb-6 max-w-md mx-auto">
            Homepage ist die Tür. Dashboard ist der Desk. Invite holt EB auf den nächsten Server.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <button onClick={() => go('overview')} className="cyber-button-solid px-5 py-2.5 inline-flex items-center gap-2">
              Dashboard öffnen <ArrowRight size={16} />
            </button>
            {inviteUrl && <a href={inviteUrl} target="_blank" rel="noreferrer" className="cyber-button px-5 py-2.5">Einladen</a>}
            <button onClick={() => go('developer')} className="cyber-button px-5 py-2.5 inline-flex items-center gap-1.5">
              <Terminal size={13} /> Developer
            </button>
          </div>
          {health?.maintenance && (
            <p className="mt-5 text-[11px] text-fuchsia-300 inline-flex items-center gap-1.5">
              <Lock size={11} /> Maintenance aktiv — Slash-Commands nur für den Owner.
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

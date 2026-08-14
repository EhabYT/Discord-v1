import React, { useState, useEffect } from 'react';
import {
  Save, MessageSquare, Eye, Send, Loader, Layers,
  LogOut, Info, Image, User, Hash
} from 'lucide-react';
import CyanToggle from '../components/CyanToggle.jsx';
import PageHeader from '../components/PageHeader.jsx';
import { useToast } from '../components/Toast.jsx';
import api from '../api.js';

/* ── Variable pill ─────────────────────────────────────────────── */
const VARS = [
  { v: '{user}',     desc: 'Mention the member (@NewMember)' },
  { v: '{userName}', desc: 'Username without @' },
  { v: '{guild}',    desc: 'Server name' },
  { v: '{count}',    desc: 'Current member count' },
];

function VarPills({ onInsert }) {
  const [tip, setTip] = useState(null);
  return (
    <div className="flex items-center gap-1 flex-wrap">
      {VARS.map(({ v, desc }) => (
        <button
          key={v}
          onClick={() => onInsert(v)}
          onMouseEnter={() => setTip(desc)}
          onMouseLeave={() => setTip(null)}
          className="relative text-[10px] px-2 py-0.5 rounded-md bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 hover:bg-cyan-500/20 transition-colors font-mono"
        >
          {v}
          {tip === desc && (
            <span className="absolute -top-7 left-0 bg-[#0B0E14] border border-white/10 text-gray-300 text-[10px] px-2 py-1 rounded whitespace-nowrap z-10 pointer-events-none">
              {desc}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

/* ── Discord message preview ────────────────────────────────────── */
function DiscordPreview({ text, embed, guildName }) {
  const replace = str => str
    ?.replace(/{user}/g, '@NewMember')
    .replace(/{userName}/g, 'NewMember')
    .replace(/{guild}/g, guildName || 'Your Server')
    .replace(/{count}/g, '1,234');

  return (
    <div className="rounded-xl bg-[#36393f] border border-white/10 p-4">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-full overflow-hidden border border-white/10 flex-shrink-0">
          <img src="/eb_logo.svg" alt="EB" className="w-full h-full object-cover" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 mb-1">
            <span className="text-sm font-semibold text-white">𝑬𝑩</span>
            <span className="text-[10px] text-gray-500">
              Today at {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
          {text && (
            <p className="text-sm text-gray-200 leading-relaxed mb-2">
              {replace(text) || <span className="text-gray-600 italic">No message set</span>}
            </p>
          )}
          {embed?.enabled && (embed.title || embed.description) && (
            <div className="rounded-r-lg overflow-hidden" style={{ borderLeft: `4px solid ${embed.color || '#00fbff'}` }}>
              <div className="bg-[#2f3136] p-3 space-y-1">
                {embed.author && <p className="text-[11px] text-gray-300 font-semibold">{replace(embed.author)}</p>}
                {embed.title  && <p className="text-sm font-bold text-white">{replace(embed.title)}</p>}
                {embed.description && <p className="text-xs text-gray-300 leading-relaxed">{replace(embed.description)}</p>}
                {embed.footer && <p className="text-[10px] text-gray-500 pt-2 border-t border-white/10">{replace(embed.footer)}</p>}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Section wrapper ────────────────────────────────────────────── */
function Section({ title, icon: Icon, children, className = '' }) {
  return (
    <div className={`cyber-card p-5 space-y-4 ${className}`}>
      {title && (
        <div className="flex items-center gap-2 pb-2 border-b border-white/[0.05]">
          {Icon && <Icon size={13} className="text-cyan-400" />}
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{title}</h2>
        </div>
      )}
      {children}
    </div>
  );
}

/* ── Main component ─────────────────────────────────────────────── */
export default function WelcomeAutoResponse({ guild, guildData }) {
  const toast = useToast();
  const [tab, setTab] = useState('join');

  /* Join state */
  const [join, setJoin] = useState({
    enabled: false, message: 'Welcome {user} to {guild}!',
    channelId: null, autoRoleId: null, cardEnabled: false,
  });

  /* Welcome embed (embedded inside join message) */
  const [wEmbed, setWEmbed] = useState({
    enabled: false, color: '#00fbff', title: '', description: '',
    author: '', footer: '',
  });

  /* Leave state */
  const [leave, setLeave] = useState({
    enabled: false, channelId: null,
    message: '{userName} has left the server. We now have {count} members.',
  });

  /* DM state */
  const [dm, setDm] = useState({
    enabled: false, message: 'Welcome to {guild}, {userName}! Enjoy your stay.',
  });

  const [saving, setSaving]   = useState(false);
  const [testing, setTesting] = useState(false);

  const channels = guildData?.guild?.channels?.filter(c => c.type === 0) || [];
  const roles    = guildData?.guild?.roles || [];

  useEffect(() => {
    if (!guildData?.welcome) return;
    const cfg = guildData.welcome;
    setJoin(j => ({ ...j,
      enabled:     cfg.enabled     ?? false,
      message:     cfg.message     ?? j.message,
      channelId:   cfg.channelId   ?? null,
      autoRoleId:  cfg.autoRoleId  ?? null,
      cardEnabled: cfg.cardEnabled ?? false,
    }));
    if (cfg.embed) {
      setWEmbed(e => ({ ...e, enabled: true, ...cfg.embed }));
    }
    if (cfg.leaveChannel || cfg.leaveMessage || typeof cfg.leaveEnabled === 'boolean') {
      setLeave(l => ({
        ...l,
        enabled:   cfg.leaveEnabled ?? false,
        channelId: cfg.leaveChannel ?? l.channelId,
        message:   cfg.leaveMessage ?? l.message,
      }));
    }
    if (cfg.dmEnabled || cfg.dmMessage) {
      setDm(d => ({
        ...d,
        enabled: cfg.dmEnabled ?? false,
        message: cfg.dmMessage ?? d.message,
      }));
    }
  }, [guildData]);

  const save = async () => {
    setSaving(true);
    try {
      const payload = {
        enabled:      join.enabled,
        message:      join.message,
        channelId:    join.channelId,
        autoRoleId:   join.autoRoleId,
        cardEnabled:  join.cardEnabled,
        embed:        wEmbed.enabled ? wEmbed : null,
        leaveEnabled: leave.enabled,
        leaveChannel: leave.channelId,
        leaveMessage: leave.message,
        dmEnabled:    dm.enabled,
        dmMessage:    dm.message,
      };
      const r = await api.post(`/api/guild/${guild.id}/welcome`, payload);
      setJoin(j => ({ ...j, ...r }));
      toast.success('Welcome settings saved!');
    } catch {
      toast.error('Failed to save welcome settings.');
    }
    setSaving(false);
  };

  const test = async () => {
    if (!join.channelId) { toast.error('Set a welcome channel first.'); return; }
    setTesting(true);
    try {
      await api.post(`/api/guild/${guild.id}/welcome/test`, { channelId: join.channelId });
      toast.success('Test welcome sent!');
    } catch {
      toast.error('Failed to send test message.');
    }
    setTesting(false);
  };

  if (!guild) return <div className="p-6 text-gray-500 text-sm">Select a server first.</div>;

  const TABS = [
    { id: 'join',  label: 'Join Message',  icon: MessageSquare },
    { id: 'leave', label: 'Leave Message', icon: LogOut        },
    { id: 'dm',    label: 'DM on Join',    icon: User          },
  ];

  return (
    <div className="page-shell-sm animate-fade-in">
      <PageHeader
        icon={MessageSquare}
        title="Welcome System"
        subtitle={`Configure join/leave messages and DMs for ${guild.name}`}
      >
        <button onClick={save} disabled={saving} className="cyber-button-solid flex items-center gap-2">
          {saving ? <Loader size={13} className="animate-spin" /> : <Save size={13} />}
          {saving ? 'Saving…' : 'Save All'}
        </button>
      </PageHeader>

      <div className="seg-tabs">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setTab(id)} className={tab === id ? 'seg-tab-active' : 'seg-tab'}>
            <Icon size={12} />{label}
          </button>
        ))}
      </div>

      {/* ── JOIN MESSAGE ──────────────────────────────────────────── */}
      {tab === 'join' && (
        <div className="space-y-4 animate-fade-in">
          <Section title="Channel & Role" icon={Hash}>
            <CyanToggle
              enabled={join.enabled}
              onChange={v => setJoin(j => ({ ...j, enabled: v }))}
              label="Enable Join Messages"
              description="Send a message to a channel when a new member joins"
            />
            <div className="grid md:grid-cols-2 gap-3">
              <div>
                <label className="cyber-label mb-1.5">Welcome Channel</label>
                <select value={join.channelId || ''} onChange={e => setJoin(j => ({ ...j, channelId: e.target.value || null }))} className="cyber-select">
                  <option value="">— None —</option>
                  {channels.map(c => <option key={c.id} value={c.id}>#{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="cyber-label mb-1.5">Auto-Assign Role on Join</label>
                <select value={join.autoRoleId || ''} onChange={e => setJoin(j => ({ ...j, autoRoleId: e.target.value || null }))} className="cyber-select">
                  <option value="">— None —</option>
                  {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </div>
            </div>
          </Section>

          <Section title="Message Template" icon={MessageSquare}>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="cyber-label">Message text</label>
                <VarPills onInsert={v => setJoin(j => ({ ...j, message: (j.message || '') + v }))} />
              </div>
              <textarea
                value={join.message || ''} rows={3}
                onChange={e => setJoin(j => ({ ...j, message: e.target.value }))}
                className="cyber-input resize-none" placeholder="Welcome {user} to {guild}!"
              />
            </div>
            <CyanToggle
              enabled={!!join.cardEnabled}
              onChange={v => setJoin(j => ({ ...j, cardEnabled: v }))}
              label="Canvas Welcome Card"
              description="Attach a stylized image card alongside the message"
            />
          </Section>

          {/* Embed mode */}
          <Section title="Embed Mode" icon={Layers}>
            <CyanToggle
              enabled={wEmbed.enabled}
              onChange={v => setWEmbed(e => ({ ...e, enabled: v }))}
              label="Send as Discord Embed"
              description="Adds a rich embed below the text message. Supports variables."
            />
            {wEmbed.enabled && (
              <div className="space-y-3 pt-1 animate-fade-in">
                <div className="grid grid-cols-[1fr_auto] gap-3 items-end">
                  <div>
                    <label className="cyber-label mb-1.5">Embed Title</label>
                    <input type="text" placeholder="e.g. Welcome to {guild}!"
                      value={wEmbed.title}
                      onChange={e => setWEmbed(em => ({ ...em, title: e.target.value }))}
                      className="cyber-input" />
                  </div>
                  <div>
                    <label className="cyber-label mb-1.5">Color</label>
                    <div className="flex gap-2 items-center">
                      <input type="color" value={wEmbed.color}
                        onChange={e => setWEmbed(em => ({ ...em, color: e.target.value }))}
                        className="h-9 w-12 rounded-lg border border-cyan-500/20 cursor-pointer p-0.5 bg-transparent" />
                      <input type="text" value={wEmbed.color} maxLength={7}
                        onChange={e => setWEmbed(em => ({ ...em, color: e.target.value }))}
                        className="cyber-input font-mono text-xs w-24" />
                    </div>
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="cyber-label">Embed Description</label>
                    <VarPills onInsert={v => setWEmbed(em => ({ ...em, description: (em.description || '') + v }))} />
                  </div>
                  <textarea rows={3} placeholder="Glad to have you here, {user}!"
                    value={wEmbed.description}
                    onChange={e => setWEmbed(em => ({ ...em, description: e.target.value }))}
                    className="cyber-input resize-none" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="cyber-label mb-1.5">Author text</label>
                    <input type="text" placeholder="e.g. New Member Alert"
                      value={wEmbed.author}
                      onChange={e => setWEmbed(em => ({ ...em, author: e.target.value }))}
                      className="cyber-input" />
                  </div>
                  <div>
                    <label className="cyber-label mb-1.5">Footer text</label>
                    <input type="text" placeholder="e.g. Member #{count}"
                      value={wEmbed.footer}
                      onChange={e => setWEmbed(em => ({ ...em, footer: e.target.value }))}
                      className="cyber-input" />
                  </div>
                </div>
              </div>
            )}
          </Section>

          {/* Preview */}
          <Section title="Live Preview" icon={Eye}>
            <DiscordPreview
              text={join.message}
              embed={wEmbed}
              guildName={guild.name}
            />
          </Section>

          <div className="flex gap-2">
            <button onClick={save} disabled={saving} className="cyber-button-solid flex items-center gap-2">
              {saving ? <Loader size={13} className="animate-spin" /> : <Save size={13} />}
              {saving ? 'Saving…' : 'Save Configuration'}
            </button>
            <button onClick={test} disabled={testing || !join.channelId} className="cyber-button flex items-center gap-2"
              title={!join.channelId ? 'Set a welcome channel first' : ''}>
              {testing ? <Loader size={13} className="animate-spin" /> : <Send size={13} />}
              {testing ? 'Sending…' : 'Test Welcome'}
            </button>
          </div>
        </div>
      )}

      {/* ── LEAVE MESSAGE ─────────────────────────────────────────── */}
      {tab === 'leave' && (
        <div className="space-y-4 animate-fade-in">
          <div className="cyber-info">
            <Info size={14} className="text-cyan-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-gray-400 leading-relaxed">
              Leave messages are sent when a member leaves <strong>or is kicked</strong>. Uses the same variables as join messages.
            </p>
          </div>

          <Section title="Channel & Toggle" icon={LogOut}>
            <CyanToggle
              enabled={leave.enabled}
              onChange={v => setLeave(l => ({ ...l, enabled: v }))}
              label="Enable Leave Messages"
              description="Send a message when a member leaves the server"
            />
            <div>
              <label className="cyber-label mb-1.5">Leave Channel</label>
              <select value={leave.channelId || ''} onChange={e => setLeave(l => ({ ...l, channelId: e.target.value || null }))} className="cyber-select">
                <option value="">— Same as welcome channel —</option>
                {channels.map(c => <option key={c.id} value={c.id}>#{c.name}</option>)}
              </select>
            </div>
          </Section>

          <Section title="Message Template" icon={MessageSquare}>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="cyber-label">Leave message</label>
                <VarPills onInsert={v => setLeave(l => ({ ...l, message: (l.message || '') + v }))} />
              </div>
              <textarea
                value={leave.message || ''} rows={3}
                onChange={e => setLeave(l => ({ ...l, message: e.target.value }))}
                className="cyber-input resize-none"
                placeholder="{userName} has left the server. We now have {count} members."
              />
            </div>
          </Section>

          <Section title="Preview" icon={Eye}>
            <DiscordPreview text={leave.message} guildName={guild.name} />
          </Section>

          <button onClick={save} disabled={saving} className="cyber-button-solid flex items-center gap-2">
            {saving ? <Loader size={13} className="animate-spin" /> : <Save size={13} />}
            {saving ? 'Saving…' : 'Save Leave Settings'}
          </button>
        </div>
      )}

      {/* ── DM ON JOIN ───────────────────────────────────────────── */}
      {tab === 'dm' && (
        <div className="space-y-4 animate-fade-in">
          <div className="cyber-warning">
            <Info size={14} className="text-yellow-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-gray-400 leading-relaxed">
              The DM is sent to new members directly. If a member has DMs disabled, the message will silently fail — this is normal Discord behavior.
            </p>
          </div>

          <Section title="DM Welcome Message" icon={User}>
            <CyanToggle
              enabled={dm.enabled}
              onChange={v => setDm(d => ({ ...d, enabled: v }))}
              label="Send DM on Join"
              description="Send a private message to members when they join"
            />
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="cyber-label">DM message content</label>
                <VarPills onInsert={v => setDm(d => ({ ...d, message: (d.message || '') + v }))} />
              </div>
              <textarea
                value={dm.message || ''} rows={4}
                onChange={e => setDm(d => ({ ...d, message: e.target.value }))}
                className="cyber-input resize-none"
                placeholder="Welcome to {guild}, {userName}! Here are some useful links…"
              />
              <p className="text-[10px] text-gray-600 mt-1">Supports the same variables as the join message.</p>
            </div>
          </Section>

          <Section title="DM Preview" icon={Eye}>
            <div className="rounded-xl bg-[#36393f] border border-white/10 p-4">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center flex-shrink-0">
                  <img src="/eb_logo.svg" alt="" className="w-full h-full object-cover rounded-full" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] text-gray-500 mb-1">
                    <span className="text-white font-semibold">𝑬𝑩</span> → <span className="text-cyan-400">NewMember</span>
                    <span className="ml-2">Private Message</span>
                  </p>
                  <p className="text-sm text-gray-200 leading-relaxed">
                    {dm.message
                      ?.replace(/{user}/g, '@NewMember')
                      .replace(/{userName}/g, 'NewMember')
                      .replace(/{guild}/g, guild.name)
                      .replace(/{count}/g, '1,234')
                      || <span className="text-gray-600 italic">No message set</span>}
                  </p>
                </div>
              </div>
            </div>
          </Section>

          <button onClick={save} disabled={saving} className="cyber-button-solid flex items-center gap-2">
            {saving ? <Loader size={13} className="animate-spin" /> : <Save size={13} />}
            {saving ? 'Saving…' : 'Save DM Settings'}
          </button>
        </div>
      )}
    </div>
  );
}

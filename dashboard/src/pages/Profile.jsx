import React from 'react';
import { BadgeCheck, CalendarDays, Link2, Mail, ShieldCheck, UserRound } from 'lucide-react';
import PageHeader from '../components/PageHeader.jsx';

export default function Profile({ account, discord, auth }) {
  if (!auth?.loggedIn) {
    return (
      <div className="min-h-full flex items-center justify-center p-5">
        <div className="cyber-card max-w-md w-full p-7 text-center animate-slide-up">
          <img src="/eb_logo.svg" alt="EB BOT" className="w-14 h-14 rounded-2xl mx-auto ring-1 ring-white/10" />
          <h1 className="text-xl font-bold text-white mt-4">Sign in to view your profile</h1>
          <p className="text-sm text-zinc-500 mt-2">Your EB account and linked Discord identity are protected by the existing server session.</p>
          {auth?.oauthEnabled && <a href="/api/auth/discord" className="cyber-button-solid inline-flex mt-5">Continue with Discord</a>}
        </div>
      </div>
    );
  }

  if (!account) {
    return (
      <div className="page-shell-sm">
        <div className="cyber-warning">Account storage is not ready. Your Discord session remains active; retry after PostgreSQL is available.</div>
      </div>
    );
  }

  const avatar = account.avatarUrl || discord?.avatar;
  return (
    <div className="page-shell-sm animate-fade-in">
      <PageHeader title="Profile" description="Your EB account and linked Discord identity." icon={UserRound} />

      <section className="cyber-card p-5 sm:p-6 flex flex-col sm:flex-row items-center sm:items-start gap-5">
        {avatar
          ? <img src={avatar} alt="" className="w-24 h-24 rounded-2xl object-cover ring-2 ring-cyan-400/30" />
          : <div className="w-24 h-24 rounded-2xl bg-cyan-400/10 border border-cyan-400/20 flex items-center justify-center text-3xl font-bold text-cyan-300">{account.displayName?.[0]?.toUpperCase() || '?'}</div>}
        <div className="min-w-0 flex-1 text-center sm:text-start">
          <h2 className="text-xl font-bold text-white truncate">{account.displayName}</h2>
          <p className="text-sm text-cyan-300 mt-1">@{account.username}</p>
          <div className="flex flex-wrap justify-center sm:justify-start gap-2 mt-4">
            <span className={account.emailVerified ? 'cyber-badge-green' : 'cyber-badge-yellow'}>
              {account.emailVerified ? 'Email verified' : 'Email not added'}
            </span>
            <span className="cyber-badge-cyan">{discord ? 'Discord linked' : 'Discord not linked'}</span>
          </div>
          {!account.emailVerified && account.email && <a href="/verify-email" className="cyber-button inline-flex mt-4 text-xs">Verify email</a>}
        </div>
      </section>

      <section className="grid sm:grid-cols-2 gap-3">
        <div className="cyber-card p-4">
          <p className="cyber-label flex items-center gap-1.5"><Mail size={12} /> Email</p>
          <p className="text-sm text-zinc-200 mt-2 break-all">{account.email || 'Not added yet'}</p>
        </div>
        <div className="cyber-card p-4">
          <p className="cyber-label flex items-center gap-1.5"><CalendarDays size={12} /> Account created</p>
          <p className="text-sm text-zinc-200 mt-2">{account.createdAt ? new Date(account.createdAt).toLocaleString() : '—'}</p>
        </div>
        <div className="cyber-card p-4">
          <p className="cyber-label flex items-center gap-1.5"><Link2 size={12} /> Linked Discord</p>
          <p className="text-sm text-zinc-200 mt-2 truncate">{discord?.username || 'Not linked'}</p>
          {discord?.id && <p className="text-[11px] font-mono text-zinc-600 mt-1">{discord.id}</p>}
        </div>
        <div className="cyber-card p-4">
          <p className="cyber-label flex items-center gap-1.5"><ShieldCheck size={12} /> Account security</p>
          <p className="text-sm text-zinc-200 mt-2 inline-flex items-center gap-1.5"><BadgeCheck size={14} className="text-cyan-300" /> Foundation active</p>
          <p className="text-xs text-zinc-600 mt-1">Password, email verification, and MFA arrive in the approved later stages.</p>
        </div>
      </section>
    </div>
  );
}

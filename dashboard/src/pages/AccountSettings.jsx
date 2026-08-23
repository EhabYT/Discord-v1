import React from 'react';
import { ChevronRight, ShieldCheck, UserRound } from 'lucide-react';
import PageHeader from '../components/PageHeader.jsx';
import { useAuth } from '../auth/AuthContext.jsx';

export default function AccountSettings() {
  const { account, discord } = useAuth();
  if (!account) return <div className="page-shell-sm"><div className="cyber-warning">Sign in to manage account settings.</div></div>;
  const links = [
    { href: '/profile', icon: UserRound, title: 'Profile', text: 'Display name, username, avatar, email, and Discord link.' },
    { href: '/settings/security', icon: ShieldCheck, title: 'Security', text: 'Password, MFA, recovery codes, sessions, activity, and deactivation.' },
  ];
  return (
    <div className="page-shell-sm animate-fade-in">
      <PageHeader title="Account Settings" description="Your EB account controls in the existing Dashboard design." />
      <section className="grid sm:grid-cols-2 gap-3">{links.map(({ href, icon: Icon, title, text }) => <a key={href} href={href} className="cyber-card-hover p-5 flex items-start gap-3"><span className="w-10 h-10 rounded-xl bg-cyan-400/10 text-cyan-300 flex items-center justify-center"><Icon size={18} /></span><span className="min-w-0 flex-1"><span className="font-semibold text-white">{title}</span><span className="block text-xs text-zinc-500 mt-1 leading-relaxed">{text}</span></span><ChevronRight size={15} className="text-zinc-600 mt-1" /></a>)}</section>
      <section className="cyber-card p-5 grid sm:grid-cols-3 gap-3 text-center"><div><p className="cyber-label">Email</p><p className={account.emailVerified ? 'text-emerald-300 text-sm mt-2' : 'text-amber-300 text-sm mt-2'}>{account.emailVerified ? 'Verified' : 'Unverified'}</p></div><div><p className="cyber-label">MFA</p><p className={account.mfaEnabled ? 'text-emerald-300 text-sm mt-2' : 'text-zinc-400 text-sm mt-2'}>{account.mfaEnabled ? 'Enabled' : 'Disabled'}</p></div><div><p className="cyber-label">Discord</p><p className={discord ? 'text-cyan-300 text-sm mt-2' : 'text-zinc-400 text-sm mt-2'}>{discord ? 'Linked' : 'Not linked'}</p></div></section>
    </div>
  );
}

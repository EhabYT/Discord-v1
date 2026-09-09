import React from 'react';
import { AlertTriangle, ChevronRight, Globe, Link2, ShieldCheck, UserRound } from 'lucide-react';
import PageHeader from '../components/PageHeader.jsx';
import { useAuth } from '../auth/AuthContext.jsx';
import { useI18n } from '../i18n.jsx';

export default function AccountSettings() {
  const { account, discord } = useAuth();
  const { t } = useI18n();
  if (!account) return <div className="page-shell-sm"><div className="cyber-warning">{t('aset.signin', 'Sign in to manage account settings.')}</div></div>;
  const cards = [
    { href: '/profile#profile-account', icon: UserRound, title: t('aset.account', 'Account information'), text: t('aset.accountText', 'Avatar, full name, username, email verification and bio.') },
    { href: '/profile#profile-security', icon: ShieldCheck, title: t('aset.security', 'Security'), text: t('aset.securityText', 'Password modal, 2FA toggle + QR setup, sessions with revoke.') },
    { href: '/profile#profile-linked', icon: Link2, title: t('aset.linked', 'Linked accounts'), text: t('aset.linkedText', 'Discord status, plus GitHub and Google link / disconnect.') },
    { href: '/profile#profile-preferences', icon: Globe, title: t('aset.preferences', 'Preferences'), text: t('aset.preferencesText', 'Theme, language, timezone and notification toggles.') },
    { href: '/profile#profile-danger', icon: AlertTriangle, title: t('aset.danger', 'Danger Zone'), text: t('aset.dangerText', 'Delete account behind reauthentication + typed DELETE.') },
  ];
  return (
    <div className="page-shell-sm animate-fade-in">
      <PageHeader title={t('aset.title', 'Account Settings')} description={t('aset.desc', 'Everything about your EB identity — deep-links jump straight into the matching Profile section.')} />
      <section className="grid sm:grid-cols-2 gap-3">
        {cards.map(({ href, icon: Icon, title, text }) => (
          <a key={href} href={href} className="cyber-card-hover p-5 flex items-start gap-3">
            <span className="w-10 h-10 rounded-xl bg-cyan-400/10 text-cyan-300 flex items-center justify-center flex-shrink-0"><Icon size={18} /></span>
            <span className="min-w-0 flex-1">
              <span className="font-semibold text-white">{title}</span>
              <span className="block text-xs text-zinc-500 mt-1 leading-relaxed">{text}</span>
            </span>
            <ChevronRight size={15} className="text-zinc-600 mt-1 flex-shrink-0" />
          </a>
        ))}
        <a href="/settings/security" className="cyber-card-hover p-5 flex items-start gap-3 sm:col-span-2">
          <span className="w-10 h-10 rounded-xl bg-cyan-400/10 text-cyan-300 flex items-center justify-center flex-shrink-0"><ShieldCheck size={18} /></span>
          <span className="min-w-0 flex-1">
            <span className="font-semibold text-white">{t('aset.log', 'Security log')}</span>
            <span className="block text-xs text-zinc-500 mt-1 leading-relaxed">{t('aset.logText', 'MFA, recovery codes, full session inventory, activity trail and deactivation.')}</span>
          </span>
          <ChevronRight size={15} className="text-zinc-600 mt-1 flex-shrink-0" />
        </a>
      </section>
      <section className="cyber-card p-5 grid sm:grid-cols-3 gap-3 text-center">
        <div><p className="cyber-label">{t('aset.email', 'Email')}</p><p className={account.emailVerified ? 'text-emerald-300 text-sm mt-2' : 'text-amber-300 text-sm mt-2'}>{account.emailVerified ? t('aset.verified', 'Verified') : t('aset.unverified', 'Unverified')}</p></div>
        <div><p className="cyber-label">{t('aset.mfa', 'MFA')}</p><p className={account.mfaEnabled ? 'text-emerald-300 text-sm mt-2' : 'text-zinc-400 text-sm mt-2'}>{account.mfaEnabled ? t('aset.enabled', 'Enabled') : t('aset.disabled', 'Disabled')}</p></div>
        <div><p className="cyber-label">{t('aset.discord', 'Discord')}</p><p className={discord ? 'text-cyan-300 text-sm mt-2' : 'text-zinc-400 text-sm mt-2'}>{discord ? t('aset.linkedState', 'Linked') : t('aset.notLinked', 'Not linked')}</p></div>
      </section>
    </div>
  );
}

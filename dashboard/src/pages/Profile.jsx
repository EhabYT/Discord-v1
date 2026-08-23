import React, { useEffect, useState } from 'react';
import { BadgeCheck, CalendarDays, Link2, Mail, Save, ShieldCheck, Trash2, Upload, UserRound } from 'lucide-react';
import PageHeader from '../components/PageHeader.jsx';
import PasswordField from '../auth/PasswordField.jsx';
import { useAuth } from '../auth/AuthContext.jsx';
import { useToast } from '../components/Toast.jsx';
import api from '../api.js';

export default function Profile({ account, discord, auth }) {
  const { applyAccount } = useAuth();
  const toast = useToast();
  const [profile, setProfile] = useState({ displayName: account?.displayName || '', username: account?.username || '' });
  const [email, setEmail] = useState({ email: '', currentPassword: '' });
  const [avatarFile, setAvatarFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState('');

  useEffect(() => setProfile({ displayName: account?.displayName || '', username: account?.username || '' }), [account]);
  useEffect(() => {
    if (!avatarFile) { setPreview(null); return undefined; }
    const url = window.URL.createObjectURL(avatarFile);
    setPreview(url);
    return () => window.URL.revokeObjectURL(url);
  }, [avatarFile]);

  if (!auth?.loggedIn) {
    return <div className="min-h-full flex items-center justify-center p-5"><div className="cyber-card max-w-md w-full p-7 text-center animate-slide-up"><img src="/eb_logo.svg" alt="EB BOT" className="w-14 h-14 rounded-2xl mx-auto ring-1 ring-white/10" /><h1 className="text-xl font-bold text-white mt-4">Sign in to view your profile</h1><p className="text-sm text-zinc-500 mt-2">Your account is protected by the existing server session.</p><a href="/login" className="cyber-button-solid inline-flex mt-5">Sign in</a></div></div>;
  }
  if (!account) return <div className="page-shell-sm"><div className="cyber-warning">Account storage is not ready.</div></div>;

  const avatar = preview || account.avatarUrl || discord?.avatar;
  const saveProfile = async event => {
    event.preventDefault(); setBusy('profile');
    try { const result = await api.patch('/api/account/profile', profile); applyAccount(result.account); toast.success('Profile updated'); }
    catch (err) { toast.error(err.message); }
    finally { setBusy(''); }
  };
  const changeEmail = async event => {
    event.preventDefault(); setBusy('email');
    try { const result = await api.post('/api/account/email/change', email); setEmail({ email: '', currentPassword: '' }); toast.success(result.message); }
    catch (err) { toast.error(err.message); }
    finally { setBusy(''); }
  };
  const upload = async () => {
    if (!avatarFile) return; setBusy('avatar');
    try { const data = new FormData(); data.append('avatar', avatarFile); const result = await api.upload('/api/account/avatar', data); applyAccount(result.account); setAvatarFile(null); toast.success('Avatar updated'); }
    catch (err) { toast.error(err.message); }
    finally { setBusy(''); }
  };
  const removeAvatar = async () => {
    setBusy('avatar');
    try { const result = await api.delete('/api/account/avatar'); applyAccount(result.account); setAvatarFile(null); toast.success('Custom avatar removed'); }
    catch (err) { toast.error(err.message); }
    finally { setBusy(''); }
  };

  return (
    <div className="page-shell-sm animate-fade-in">
      <PageHeader title="Profile" description="Manage your EB account. Discord identity remains read-only for server authorization." icon={UserRound} />
      <section className="cyber-card p-5 sm:p-6 flex flex-col sm:flex-row items-center sm:items-start gap-5">
        {avatar ? <img src={avatar} alt="" className="w-24 h-24 rounded-2xl object-cover ring-2 ring-cyan-400/30" /> : <div className="w-24 h-24 rounded-2xl bg-cyan-400/10 border border-cyan-400/20 flex items-center justify-center text-3xl font-bold text-cyan-300">{account.displayName?.[0]?.toUpperCase() || '?'}</div>}
        <div className="min-w-0 flex-1 text-center sm:text-start"><h2 className="text-xl font-bold text-white truncate">{account.displayName}</h2><p className="text-sm text-cyan-300 mt-1">@{account.username}</p><div className="flex flex-wrap justify-center sm:justify-start gap-2 mt-4"><span className={account.emailVerified ? 'cyber-badge-green' : 'cyber-badge-yellow'}>{account.emailVerified ? 'Email verified' : 'Email not verified'}</span><span className={discord ? 'cyber-badge-cyan' : 'cyber-badge-yellow'}>{discord ? 'Discord linked' : 'Discord not linked'}</span></div>{!discord && <a href="/api/auth/discord" className="cyber-button inline-flex mt-4 text-xs">Link Discord for server access</a>}</div>
      </section>

      <section className="cyber-card p-5 space-y-4">
        <div><p className="cyber-label flex items-center gap-1.5"><Upload size={12} /> Profile picture</p><p className="text-xs text-zinc-600 mt-1">PNG, JPEG, or WebP up to 2 MiB. Images are decoded, square-cropped, and re-encoded by the server.</p></div>
        <input type="file" accept="image/png,image/jpeg,image/webp" onChange={event => setAvatarFile(event.target.files?.[0] || null)} className="cyber-input text-xs file:mr-3 file:border-0 file:rounded-lg file:bg-cyan-400/10 file:text-cyan-200 file:px-3 file:py-1" />
        <div className="flex flex-wrap gap-2"><button onClick={upload} disabled={!avatarFile || busy === 'avatar'} className="cyber-button-solid inline-flex items-center gap-2"><Upload size={14} /> Upload avatar</button>{account.avatarUrl && <button onClick={removeAvatar} disabled={busy === 'avatar'} className="cyber-button-danger inline-flex items-center gap-2"><Trash2 size={14} /> Remove custom avatar</button>}</div>
      </section>

      <form onSubmit={saveProfile} className="cyber-card p-5 space-y-4">
        <div><p className="cyber-label">Profile details</p><p className="text-xs text-zinc-600 mt-1">Username changes are limited to once every 30 days.</p></div>
        <label className="block"><span className="cyber-label">Display name</span><input required maxLength={64} value={profile.displayName} onChange={event => setProfile({ ...profile, displayName: event.target.value })} className="cyber-input mt-1.5" /></label>
        <label className="block"><span className="cyber-label">Username</span><input required pattern="[A-Za-z][A-Za-z0-9_]{2,23}" minLength={3} maxLength={24} value={profile.username} onChange={event => setProfile({ ...profile, username: event.target.value })} className="cyber-input mt-1.5" /></label>
        <button disabled={busy === 'profile'} className="cyber-button-solid inline-flex items-center gap-2"><Save size={14} /> {busy === 'profile' ? 'Saving…' : 'Save profile'}</button>
      </form>

      <form onSubmit={changeEmail} className="cyber-card p-5 space-y-4">
        <div><p className="cyber-label flex items-center gap-1.5"><Mail size={12} /> Change email</p><p className="text-xs text-zinc-600 mt-1">Current: {account.email || 'not set'}. The new address replaces it only after verification.</p></div>
        <label className="block"><span className="cyber-label">New email</span><input type="email" required maxLength={254} autoComplete="email" value={email.email} onChange={event => setEmail({ ...email, email: event.target.value })} className="cyber-input mt-1.5" /></label>
        <PasswordField label="Current password" required autoComplete="current-password" value={email.currentPassword} onChange={event => setEmail({ ...email, currentPassword: event.target.value })} />
        <button disabled={busy === 'email'} className="cyber-button inline-flex items-center gap-2"><Mail size={14} /> {busy === 'email' ? 'Requesting…' : 'Verify new email'}</button>
      </form>

      <section className="grid sm:grid-cols-2 gap-3">
        <div className="cyber-card p-4"><p className="cyber-label flex items-center gap-1.5"><CalendarDays size={12} /> Account created</p><p className="text-sm text-zinc-200 mt-2">{account.createdAt ? new Date(account.createdAt).toLocaleString() : '—'}</p></div>
        <div className="cyber-card p-4"><p className="cyber-label flex items-center gap-1.5"><Link2 size={12} /> Linked Discord</p><p className="text-sm text-zinc-200 mt-2 truncate">{discord?.username || 'Not linked'}</p>{discord?.id && <p className="text-[11px] font-mono text-zinc-600 mt-1">{discord.id}</p>}</div>
        <div className="cyber-card p-4 sm:col-span-2"><p className="cyber-label flex items-center gap-1.5"><ShieldCheck size={12} /> Account security</p><p className="text-sm text-zinc-200 mt-2 inline-flex items-center gap-1.5"><BadgeCheck size={14} className="text-cyan-300" /> Password and verified-email recovery active</p><a href="/settings/security" className="cyber-button inline-flex mt-3 text-xs">Manage two-factor authentication</a></div>
      </section>
    </div>
  );
}

import React, { useEffect, useState } from 'react';
import { History, KeyRound, LockKeyhole, Monitor, RefreshCw, ShieldCheck, UserX } from 'lucide-react';
import PageHeader from '../components/PageHeader.jsx';
import PasswordField from '../auth/PasswordField.jsx';
import CopyButton from '../components/CopyButton.jsx';
import { useAuth } from '../auth/AuthContext.jsx';
import { useToast } from '../components/Toast.jsx';
import api from '../api.js';

export default function AccountSecurity() {
  const { account, applyAccount } = useAuth();
  const toast = useToast();
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [enrollment, setEnrollment] = useState(null);
  const [recoveryCodes, setRecoveryCodes] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [activity, setActivity] = useState([]);
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '', code: '', revokeOtherSessions: true });
  const [reauth, setReauth] = useState({ currentPassword: '', code: '', confirmation: '' });
  const [reauthenticated, setReauthenticated] = useState(false);
  const [busy, setBusy] = useState('');
  useEffect(() => {
    if (!account) return;
    Promise.all([api.get('/api/account/sessions'), api.get('/api/account/activity')])
      .then(([nextSessions, nextActivity]) => { setSessions(nextSessions); setActivity(nextActivity); })
      .catch(() => {});
  }, [account]);
  if (!account) return <div className="page-shell-sm"><div className="cyber-warning">Sign in to manage account security.</div></div>;

  const enroll = async event => {
    event.preventDefault(); setBusy('enroll');
    try { setEnrollment(await api.post('/api/account/mfa/enroll', { currentPassword: password })); setPassword(''); }
    catch (err) { toast.error(err.message); }
    finally { setBusy(''); }
  };
  const confirm = async event => {
    event.preventDefault(); setBusy('confirm');
    try { const result = await api.post('/api/account/mfa/confirm', { code }); applyAccount(result.account); setRecoveryCodes(result.recoveryCodes); setEnrollment(null); setCode(''); toast.success('Two-factor authentication enabled'); }
    catch (err) { toast.error(err.message); }
    finally { setBusy(''); }
  };
  const sensitive = action => async event => {
    event.preventDefault(); setBusy(action);
    try {
      const path = action === 'disable' ? '/api/account/mfa/disable' : '/api/account/recovery-codes/regenerate';
      const result = await api.post(path, { currentPassword: password, code });
      if (result.account) applyAccount(result.account);
      if (result.recoveryCodes) setRecoveryCodes(result.recoveryCodes);
      setPassword(''); setCode(''); toast.success(action === 'disable' ? 'MFA disabled' : 'Recovery codes regenerated');
    } catch (err) { toast.error(err.message); }
    finally { setBusy(''); }
  };
  const download = () => {
    const blob = new Blob([`${recoveryCodes.join('\n')}\n`], { type: 'text/plain' });
    const url = window.URL.createObjectURL(blob); const link = document.createElement('a');
    link.href = url; link.download = 'eb-recovery-codes.txt'; link.click(); window.URL.revokeObjectURL(url);
  };
  const changePassword = async event => {
    event.preventDefault(); setBusy('password');
    try { const result = await api.post('/api/account/password/change', passwordForm); setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '', code: '', revokeOtherSessions: true }); toast.success(`Password changed${result.otherSessionsRevoked ? `; ${result.otherSessionsRevoked} other session(s) revoked` : ''}`); setSessions(await api.get('/api/account/sessions')); }
    catch (err) { toast.error(err.message); }
    finally { setBusy(''); }
  };
  const revokeSession = async id => {
    try { const result = await api.delete(`/api/account/sessions/${id}`); if (result.currentSessionRevoked) window.location.replace('/login'); else { setSessions(items => items.filter(item => item.id !== id)); toast.success('Session revoked'); } }
    catch (err) { toast.error(err.message); }
  };
  const revokeOthers = async () => {
    try { const result = await api.post('/api/account/sessions/revoke-others', {}); setSessions(items => items.filter(item => item.current)); toast.success(`${result.revoked} other session(s) revoked`); }
    catch (err) { toast.error(err.message); }
  };
  const revokeAll = async () => {
    try { await api.post('/api/account/sessions/revoke-all', {}); window.location.replace('/login'); }
    catch (err) { toast.error(err.message); }
  };
  const performReauth = async event => {
    event.preventDefault(); setBusy('reauth');
    try { await api.post('/api/account/reauthenticate', reauth); setReauthenticated(true); toast.success('Identity confirmed for ten minutes'); }
    catch (err) { toast.error(err.message); }
    finally { setBusy(''); }
  };
  const deactivate = async () => {
    try { await api.post('/api/account/deactivate', { confirmation: reauth.confirmation }); window.location.replace('/login'); }
    catch (err) { toast.error(err.message); }
  };

  return (
    <div className="page-shell-sm animate-fade-in">
      <PageHeader title="Account Security" description="Two-factor authentication and one-time recovery codes." icon={ShieldCheck} />
      <section className="cyber-card p-5">
        <div className="flex items-center justify-between gap-3"><div><p className="font-semibold text-white">Authenticator app</p><p className="text-xs text-zinc-500 mt-1">TOTP codes are required after your password.</p></div><span className={account.mfaEnabled ? 'cyber-badge-green' : 'cyber-badge-yellow'}>{account.mfaEnabled ? 'Enabled' : 'Disabled'}</span></div>
      </section>

      {!account.mfaEnabled && !enrollment && <form onSubmit={enroll} className="cyber-card p-5 space-y-4"><p className="text-sm text-zinc-400">Re-enter your password to begin enrollment.</p><PasswordField label="Current password" required value={password} onChange={event => setPassword(event.target.value)} /><button disabled={busy === 'enroll'} className="cyber-button-solid">Enable two-factor authentication</button></form>}

      {enrollment && <form onSubmit={confirm} className="cyber-card p-5 space-y-4"><div className="flex justify-center"><img src={enrollment.qrDataUrl} alt="Authenticator QR code" className="w-60 h-60 rounded-2xl bg-white p-2" /></div><div><p className="cyber-label">Manual setup key</p><code className="block mt-1 p-3 rounded-xl bg-black/30 text-cyan-200 break-all text-xs">{enrollment.secret}</code></div><label className="block"><span className="cyber-label">First 6-digit code</span><input required inputMode="numeric" autoComplete="one-time-code" value={code} onChange={event => setCode(event.target.value)} className="cyber-input mt-1.5 font-mono tracking-widest" /></label><button disabled={busy === 'confirm'} className="cyber-button-solid w-full">Confirm and enable MFA</button></form>}

      {recoveryCodes.length > 0 && <section className="cyber-card-accent p-5 space-y-4"><div><p className="font-semibold text-white">Save your recovery codes now</p><p className="text-xs text-zinc-500 mt-1">They are displayed once. Each code works once.</p></div><div className="grid sm:grid-cols-2 gap-2">{recoveryCodes.map(item => <code key={item} className="p-2 rounded-lg bg-black/30 text-cyan-100 text-xs text-center">{item}</code>)}</div><div className="flex gap-2 flex-wrap"><CopyButton value={recoveryCodes.join('\n')} label="Copy all" /><button onClick={download} className="cyber-button">Download</button><button onClick={() => setRecoveryCodes([])} className="cyber-button">I saved them</button></div></section>}

      {account.mfaEnabled && <form onSubmit={sensitive('regenerate')} className="cyber-card p-5 space-y-4"><div><p className="font-semibold text-white flex items-center gap-2"><KeyRound size={16} className="text-cyan-300" /> Recovery and factor management</p><p className="text-xs text-zinc-500 mt-1">Enter your password and a current authenticator or recovery code.</p></div><PasswordField label="Current password" required value={password} onChange={event => setPassword(event.target.value)} /><label className="block"><span className="cyber-label">Current code</span><input required value={code} onChange={event => setCode(event.target.value)} className="cyber-input mt-1.5 font-mono" /></label><div className="flex flex-wrap gap-2"><button disabled={!!busy} className="cyber-button">Regenerate recovery codes</button><button type="button" onClick={sensitive('disable')} disabled={!!busy} className="cyber-button-danger">Disable MFA</button></div></form>}

      <form onSubmit={changePassword} className="cyber-card p-5 space-y-4">
        <p className="font-semibold text-white flex items-center gap-2"><LockKeyhole size={16} className="text-cyan-300" /> Change password</p>
        <PasswordField label="Current password" required value={passwordForm.currentPassword} onChange={event => setPasswordForm({ ...passwordForm, currentPassword: event.target.value })} />
        {account.mfaEnabled && <label className="block"><span className="cyber-label">Current MFA or recovery code</span><input required value={passwordForm.code} onChange={event => setPasswordForm({ ...passwordForm, code: event.target.value })} className="cyber-input mt-1.5 font-mono" /></label>}
        <PasswordField label="New password" required minLength={15} value={passwordForm.newPassword} onChange={event => setPasswordForm({ ...passwordForm, newPassword: event.target.value })} />
        <PasswordField label="Confirm new password" required minLength={15} value={passwordForm.confirmPassword} onChange={event => setPasswordForm({ ...passwordForm, confirmPassword: event.target.value })} />
        <label className="flex items-center gap-2 text-xs text-zinc-400"><input type="checkbox" checked={passwordForm.revokeOtherSessions} onChange={event => setPasswordForm({ ...passwordForm, revokeOtherSessions: event.target.checked })} /> Sign out all other sessions</label>
        <button disabled={busy === 'password'} className="cyber-button-solid">Change password</button>
      </form>

      <section className="cyber-card p-5 space-y-4">
        <div className="flex items-center justify-between gap-3"><div><p className="font-semibold text-white flex items-center gap-2"><Monitor size={16} className="text-cyan-300" /> Active sessions</p><p className="text-xs text-zinc-500 mt-1">30-minute idle timeout · 24-hour absolute lifetime</p></div><button onClick={() => api.get('/api/account/sessions').then(setSessions)} className="cyber-icon-button" aria-label="Refresh sessions"><RefreshCw size={14} /></button></div>
        <div className="space-y-2">{sessions.length ? sessions.map(item => <div key={item.id} className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-3 flex items-start gap-3"><Monitor size={15} className="text-zinc-500 mt-0.5" /><div className="min-w-0 flex-1"><p className="text-xs text-zinc-200 truncate">{item.device}</p><p className="text-[10px] text-zinc-600 mt-1">Last active {new Date(item.lastActiveAt).toLocaleString()} {item.current && '· Current session'}</p></div><button onClick={() => revokeSession(item.id)} className="text-[11px] text-red-400 hover:text-red-300">Revoke</button></div>) : <p className="text-xs text-zinc-600">No session metadata available yet.</p>}</div>
        <div className="flex flex-wrap gap-2"><button onClick={revokeOthers} className="cyber-button">Logout all other sessions</button><button onClick={revokeAll} className="cyber-button-danger">Logout all sessions</button></div>
      </section>

      <section className="cyber-card p-5 space-y-3">
        <p className="font-semibold text-white flex items-center gap-2"><History size={16} className="text-cyan-300" /> Security activity</p>
        <div className="space-y-2 max-h-72 overflow-y-auto">{activity.length ? activity.map((item, index) => <div key={`${item.at}-${index}`} className="flex items-center justify-between gap-3 border-b border-white/[0.05] py-2"><span className="text-xs text-zinc-300">{String(item.event).replaceAll('_', ' ')}</span><time className="text-[10px] text-zinc-600">{new Date(item.at).toLocaleString()}</time></div>) : <p className="text-xs text-zinc-600">No security events recorded.</p>}</div>
      </section>

      <form onSubmit={performReauth} className="cyber-card p-5 space-y-4">
        <p className="font-semibold text-white">Recent reauthentication</p><p className="text-xs text-zinc-500">Confirm identity for ten minutes before Danger Zone actions.</p>
        <PasswordField label="Current password" required value={reauth.currentPassword} onChange={event => setReauth({ ...reauth, currentPassword: event.target.value })} />
        {account.mfaEnabled && <label className="block"><span className="cyber-label">Current MFA or recovery code</span><input required value={reauth.code} onChange={event => setReauth({ ...reauth, code: event.target.value })} className="cyber-input mt-1.5 font-mono" /></label>}
        <button disabled={busy === 'reauth'} className="cyber-button">Confirm identity</button>
      </form>

      <section className="cyber-card border-red-500/20 p-5 space-y-4"><div><p className="font-semibold text-red-300 flex items-center gap-2"><UserX size={16} /> Danger Zone</p><p className="text-xs text-zinc-500 mt-1">Deactivation signs out every session and retains security/moderation records according to policy.</p></div><input disabled={!reauthenticated} placeholder="Type DELETE" value={reauth.confirmation} onChange={event => setReauth({ ...reauth, confirmation: event.target.value })} className="cyber-input" /><button onClick={deactivate} disabled={!reauthenticated || reauth.confirmation !== 'DELETE'} className="cyber-button-danger">Deactivate account</button></section>
    </div>
  );
}

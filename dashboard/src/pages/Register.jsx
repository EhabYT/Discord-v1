import React, { useEffect, useState } from 'react';
import AuthLayout from '../auth/AuthLayout.jsx';
import PasswordField, { PasswordStrength } from '../auth/PasswordField.jsx';
import { useAuth } from '../auth/AuthContext.jsx';

export default function Register() {
  const { account, register } = useAuth();
  const [form, setForm] = useState({ displayName: '', username: '', email: '', password: '', confirmPassword: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { if (account) window.location.replace('/profile'); }, [account]);
  const update = key => event => setForm(current => ({ ...current, [key]: event.target.value }));
  const submit = async event => {
    event.preventDefault(); setError('');
    if (form.password !== form.confirmPassword) return setError('Passwords do not match');
    setBusy(true);
    try { await register(form); window.location.replace('/profile'); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };
  return (
    <AuthLayout eyebrow="Create account" title="Join EB Dashboard" description="Create an unverified EB account now. Email verification will be required before sensitive account recovery is available." footer={<>Already registered? <a href="/login" className="text-cyan-300 hover:text-cyan-200">Sign in</a></>}>
      <form onSubmit={submit} className="space-y-4">
        {error && <div className="cyber-warning text-sm text-amber-200" role="alert">{error}</div>}
        <label className="block"><span className="cyber-label">Display name</span><input required maxLength={64} autoComplete="name" value={form.displayName} onChange={update('displayName')} className="cyber-input mt-1.5" /></label>
        <label className="block"><span className="cyber-label">Username</span><input required minLength={3} maxLength={24} pattern="[A-Za-z][A-Za-z0-9_]{2,23}" autoComplete="username" value={form.username} onChange={update('username')} className="cyber-input mt-1.5" /><span className="text-[11px] text-zinc-600 mt-1 block">3–24 letters, numbers, or underscores; start with a letter.</span></label>
        <label className="block"><span className="cyber-label">Email</span><input type="email" required maxLength={254} autoComplete="email" value={form.email} onChange={update('email')} className="cyber-input mt-1.5" /></label>
        <div><PasswordField label="Password" required minLength={15} maxLength={128} autoComplete="new-password" value={form.password} onChange={update('password')} /><PasswordStrength password={form.password} /></div>
        <PasswordField label="Confirm password" required minLength={15} maxLength={128} autoComplete="new-password" value={form.confirmPassword} onChange={update('confirmPassword')} />
        <button disabled={busy} className="cyber-button-solid w-full">{busy ? 'Creating account…' : 'Create account'}</button>
      </form>
    </AuthLayout>
  );
}

import React, { useEffect, useState } from 'react';
import AuthLayout from '../auth/AuthLayout.jsx';
import PasswordField from '../auth/PasswordField.jsx';
import { useAuth } from '../auth/AuthContext.jsx';

export default function Login() {
  const { auth, account, login } = useAuth();
  const [form, setForm] = useState({ identifier: '', password: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { if (account) window.location.replace('/profile'); }, [account]);
  const submit = async event => {
    event.preventDefault(); setBusy(true); setError('');
    try { await login(form); window.location.replace('/profile'); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };
  return (
    <AuthLayout eyebrow="Account access" title="Welcome back" description="Sign in to your EB account. Discord linking remains required for server administration." footer={<>New to EB? <a href="/register" className="text-cyan-300 hover:text-cyan-200">Create an account</a></>}>
      <form onSubmit={submit} className="space-y-4">
        {error && <div className="cyber-warning text-sm text-amber-200" role="alert">{error}</div>}
        <label className="block"><span className="cyber-label">Email or username</span><input autoComplete="username" required value={form.identifier} onChange={e => setForm({ ...form, identifier: e.target.value })} className="cyber-input mt-1.5" /></label>
        <PasswordField label="Password" autoComplete="current-password" required value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} />
        <div className="flex justify-end"><a href="/forgot-password" className="text-xs text-cyan-300 hover:text-cyan-200">Forgot password?</a></div>
        <button disabled={busy} className="cyber-button-solid w-full">{busy ? 'Signing in…' : 'Sign in'}</button>
        {auth.oauthEnabled && <a href="/api/auth/discord" className="cyber-button w-full flex justify-center">Continue with Discord</a>}
      </form>
    </AuthLayout>
  );
}

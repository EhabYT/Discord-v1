import React, { useEffect, useState } from 'react';
import AuthLayout from '../auth/AuthLayout.jsx';
import PasswordField from '../auth/PasswordField.jsx';
import { useAuth } from '../auth/AuthContext.jsx';

export default function Login() {
  const { auth, account, login, verifyMfa } = useAuth();
  const [form, setForm] = useState({ identifier: '', password: '' });
  const [mfaRequired, setMfaRequired] = useState(() => new window.URLSearchParams(window.location.search).get('mfa') === '1');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { if (account) window.location.replace('/profile'); }, [account]);
  const submit = async event => {
    event.preventDefault(); setBusy(true); setError('');
    try { const result = await login(form); if (result.mfaRequired) setMfaRequired(true); else window.location.replace('/profile'); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };
  const submitMfa = async event => {
    event.preventDefault(); setBusy(true); setError('');
    try { await verifyMfa(code); window.location.replace('/profile'); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };
  return (
    <AuthLayout eyebrow="Account access" title="Welcome back" description="Sign in to your EB account. Discord linking remains required for server administration." footer={<>New to EB? <a href="/register" className="text-cyan-300 hover:text-cyan-200">Create an account</a></>}>
      {mfaRequired ? (
        <form onSubmit={submitMfa} className="space-y-4">
          {error && <div className="cyber-warning text-sm text-amber-200" role="alert">{error}</div>}
          <div className="cyber-info text-sm">Enter the 6-digit authenticator code or one unused recovery code. The challenge expires in five minutes.</div>
          <label className="block"><span className="cyber-label">Authentication code</span><input autoFocus required autoComplete="one-time-code" value={code} onChange={event => setCode(event.target.value)} className="cyber-input mt-1.5 font-mono tracking-widest" /></label>
          <button disabled={busy} className="cyber-button-solid w-full">{busy ? 'Verifying…' : 'Verify and sign in'}</button>
          <button type="button" onClick={() => { setMfaRequired(false); setCode(''); setError(''); }} className="cyber-button w-full">Start over</button>
        </form>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          {error && <div className="cyber-warning text-sm text-amber-200" role="alert">{error}</div>}
          <label className="block"><span className="cyber-label">Email or username</span><input autoComplete="username" required value={form.identifier} onChange={e => setForm({ ...form, identifier: e.target.value })} className="cyber-input mt-1.5" /></label>
          <PasswordField label="Password" autoComplete="current-password" required value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} />
          <div className="flex justify-end"><a href="/forgot-password" className="text-xs text-cyan-300 hover:text-cyan-200">Forgot password?</a></div>
          <button disabled={busy} className="cyber-button-solid w-full">{busy ? 'Signing in…' : 'Sign in'}</button>
          {auth.oauthEnabled && <a href="/api/auth/discord" className="cyber-button w-full flex justify-center">Continue with Discord</a>}
        </form>
      )}
    </AuthLayout>
  );
}

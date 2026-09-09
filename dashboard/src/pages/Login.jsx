import React, { useEffect, useState } from 'react';
import AuthLayout from '../auth/AuthLayout.jsx';
import PasswordField from '../auth/PasswordField.jsx';
import { useAuth } from '../auth/AuthContext.jsx';
import { useI18n } from '../i18n.jsx';

export default function Login() {
  const { t } = useI18n();
  const { auth, account, login, verifyMfa } = useAuth();
  const [form, setForm] = useState({ identifier: '', password: '' });
  const [mfaRequired, setMfaRequired] = useState(() => new window.URLSearchParams(window.location.search).get('mfa') === '1');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const requestedReturn = new window.URLSearchParams(window.location.search).get('return') || '';
  const destination = requestedReturn.startsWith('/') && !requestedReturn.startsWith('//') ? requestedReturn : '/profile';
  useEffect(() => { if (account) window.location.replace(destination); }, [account, destination]);
  const submit = async event => {
    event.preventDefault(); setBusy(true); setError('');
    try { const result = await login(form); if (result.mfaRequired) setMfaRequired(true); else window.location.replace(destination); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };
  const submitMfa = async event => {
    event.preventDefault(); setBusy(true); setError('');
    try { await verifyMfa(code); window.location.replace(destination); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };
  return (
    <AuthLayout eyebrow={t('auth.loginEyebrow', 'Account access')} title={t('auth.loginTitle', 'Welcome back')} description={t('auth.loginDesc', 'Sign in to your EB account. Discord linking remains required for server administration.')} footer={<>{t('auth.loginFooterPre', 'New to EB?')} <a href="/register" className="text-cyan-300 hover:text-cyan-200">{t('auth.loginFooterLink', 'Create an account')}</a></>}>
      {mfaRequired ? (
        <form onSubmit={submitMfa} className="space-y-4">
          {error && <div className="cyber-warning text-sm text-amber-200" role="alert">{error}</div>}
          <div className="cyber-info text-sm">{t('auth.mfaInfo', 'Enter the 6-digit authenticator code or one unused recovery code. The challenge expires in five minutes.')}</div>
          <label className="block"><span className="cyber-label">{t('auth.mfaCode', 'Authentication code')}</span><input autoFocus required autoComplete="one-time-code" value={code} onChange={event => setCode(event.target.value)} className="cyber-input mt-1.5 font-mono tracking-widest" /></label>
          <button disabled={busy} className="cyber-button-solid w-full">{busy ? t('auth.verifying', 'Verifying…') : t('auth.verifySignin', 'Verify and sign in')}</button>
          <button type="button" onClick={() => { setMfaRequired(false); setCode(''); setError(''); }} className="cyber-button w-full">{t('auth.startOver', 'Start over')}</button>
        </form>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          {error && <div className="cyber-warning text-sm text-amber-200" role="alert">{error}</div>}
          <label className="block"><span className="cyber-label">{t('auth.identifier', 'Email or username')}</span><input autoComplete="username" required value={form.identifier} onChange={e => setForm({ ...form, identifier: e.target.value })} className="cyber-input mt-1.5" /></label>
          <PasswordField label={t('auth.password', 'Password')} autoComplete="current-password" required value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} />
          <div className="flex justify-end"><a href="/forgot-password" className="text-xs text-cyan-300 hover:text-cyan-200">{t('auth.forgot', 'Forgot password?')}</a></div>
          <button disabled={busy} className="cyber-button-solid w-full">{busy ? t('auth.signingIn', 'Signing in…') : t('auth.signIn', 'Sign in')}</button>
          {auth.oauthEnabled && <a href="/api/auth/discord" className="cyber-button w-full flex justify-center">{t('auth.continueDiscord', 'Continue with Discord')}</a>}
        </form>
      )}
    </AuthLayout>
  );
}

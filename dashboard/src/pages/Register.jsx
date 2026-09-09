import React, { useEffect, useState } from 'react';
import AuthLayout from '../auth/AuthLayout.jsx';
import PasswordField, { PasswordStrength } from '../auth/PasswordField.jsx';
import { useAuth } from '../auth/AuthContext.jsx';
import { useI18n } from '../i18n.jsx';

export default function Register() {
  const { t } = useI18n();
  const { account, register } = useAuth();
  const [form, setForm] = useState({ displayName: '', username: '', email: '', password: '', confirmPassword: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { if (account) window.location.replace('/profile'); }, [account]);
  const update = key => event => setForm(current => ({ ...current, [key]: event.target.value }));
  const submit = async event => {
    event.preventDefault(); setError('');
    if (form.password !== form.confirmPassword) return setError(t('auth.passwordsMismatch', 'Passwords do not match'));
    setBusy(true);
    try { await register(form); window.location.replace('/profile'); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };
  return (
    <AuthLayout eyebrow={t('auth.regEyebrow', 'Create account')} title={t('auth.regTitle', 'Join EB Dashboard')} description={t('auth.regDesc', 'Create an unverified EB account now. Email verification will be required before sensitive account recovery is available.')} footer={<>{t('auth.regFooterPre', 'Already registered?')} <a href="/login" className="text-cyan-300 hover:text-cyan-200">{t('auth.regFooterLink', 'Sign in')}</a></>}>
      <form onSubmit={submit} className="space-y-4">
        {error && <div className="cyber-warning text-sm text-amber-200" role="alert">{error}</div>}
        <label className="block"><span className="cyber-label">{t('auth.displayName', 'Display name')}</span><input required maxLength={64} autoComplete="name" value={form.displayName} onChange={update('displayName')} className="cyber-input mt-1.5" /></label>
        <label className="block"><span className="cyber-label">{t('auth.username', 'Username')}</span><input required minLength={3} maxLength={24} pattern="[A-Za-z][A-Za-z0-9_]{2,23}" autoComplete="username" value={form.username} onChange={update('username')} className="cyber-input mt-1.5" /><span className="text-[11px] text-zinc-600 mt-1 block">{t('auth.usernameHint', '3–24 letters, numbers, or underscores; start with a letter.')}</span></label>
        <label className="block"><span className="cyber-label">{t('auth.email', 'Email')}</span><input type="email" required maxLength={254} autoComplete="email" value={form.email} onChange={update('email')} className="cyber-input mt-1.5" /></label>
        <div><PasswordField label={t('auth.password', 'Password')} required minLength={15} maxLength={128} autoComplete="new-password" value={form.password} onChange={update('password')} /><PasswordStrength password={form.password} /></div>
        <PasswordField label={t('auth.confirmPassword', 'Confirm password')} required minLength={15} maxLength={128} autoComplete="new-password" value={form.confirmPassword} onChange={update('confirmPassword')} />
        <button disabled={busy} className="cyber-button-solid w-full">{busy ? t('auth.creating', 'Creating account…') : t('auth.createAccount', 'Create account')}</button>
      </form>
    </AuthLayout>
  );
}

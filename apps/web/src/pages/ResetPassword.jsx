import React, { useState } from 'react';
import AuthLayout from '../auth/AuthLayout.jsx';
import PasswordField, { PasswordStrength } from '../auth/PasswordField.jsx';
import { useI18n } from '../i18n.jsx';
import api from '../api.js';

export default function ResetPassword() {
  const { t } = useI18n();
  const token = new window.URLSearchParams(window.location.search).get('token') || '';
  const [form, setForm] = useState({ password: '', confirmPassword: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const submit = async event => {
    event.preventDefault(); setError('');
    if (form.password !== form.confirmPassword) return setError(t('auth.passwordsMismatch', 'Passwords do not match'));
    setBusy(true);
    try { await api.post('/api/auth/reset-password', { token, ...form }); setDone(true); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };
  return (
    <AuthLayout eyebrow={t('auth.recoverEyebrow', 'Account recovery')} title={t('auth.resetTitle', 'Choose a new password')} description={t('auth.resetDesc', 'The link is single-use and expires after 30 minutes. A successful reset revokes all existing sessions.')} footer={<a href="/login" className="text-cyan-300 hover:text-cyan-200">{t('auth.returnSignin', 'Return to sign in')}</a>}>
      {done ? <div className="cyber-info text-sm text-cyan-100">{t('auth.resetDone', 'Password changed and existing sessions revoked.')} <a href="/login" className="underline">{t('auth.signInAgain', 'Sign in again')}</a>.</div> : !token ? <div className="cyber-warning text-sm">{t('auth.noToken', 'This reset link is missing its token.')}</div> : (
        <form onSubmit={submit} className="space-y-4">
          {error && <div className="cyber-warning text-sm" role="alert">{error}</div>}
          <div><PasswordField label={t('auth.newPassword', 'New password')} required minLength={15} maxLength={128} autoComplete="new-password" value={form.password} onChange={event => setForm({ ...form, password: event.target.value })} /><PasswordStrength password={form.password} /></div>
          <PasswordField label={t('auth.confirmNewPassword', 'Confirm new password')} required minLength={15} maxLength={128} autoComplete="new-password" value={form.confirmPassword} onChange={event => setForm({ ...form, confirmPassword: event.target.value })} />
          <button disabled={busy} className="cyber-button-solid w-full">{busy ? t('auth.changing', 'Changing password…') : t('auth.changePassword', 'Change password')}</button>
        </form>
      )}
    </AuthLayout>
  );
}

import React, { useState } from 'react';
import AuthLayout from '../auth/AuthLayout.jsx';
import { useI18n } from '../i18n.jsx';
import api from '../api.js';

export default function ForgotPassword() {
  const { t } = useI18n();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const submit = async event => {
    event.preventDefault(); setBusy(true);
    try { const result = await api.post('/api/auth/forgot-password', { email }); setMessage(result.message); }
    catch { setMessage(t('auth.forgotFallback', 'If that verified account exists, a password reset email has been requested.')); }
    finally { setBusy(false); }
  };
  return (
    <AuthLayout eyebrow={t('auth.recoverEyebrow', 'Account recovery')} title={t('auth.forgotTitle', 'Forgot your password?')} description={t('auth.forgotDesc', 'Enter your verified email. The response is intentionally the same whether an account exists or not.')} footer={<a href="/login" className="text-cyan-300 hover:text-cyan-200">{t('auth.returnSignin', 'Return to sign in')}</a>}>
      {message ? <div className="cyber-info text-sm text-cyan-100" role="status">{message}</div> : (
        <form onSubmit={submit} className="space-y-4">
          <label className="block"><span className="cyber-label">{t('auth.email', 'Email')}</span><input type="email" required maxLength={254} autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} className="cyber-input mt-1.5" /></label>
          <button disabled={busy} className="cyber-button-solid w-full">{busy ? t('auth.requesting', 'Requesting…') : t('auth.requestReset', 'Request reset link')}</button>
        </form>
      )}
    </AuthLayout>
  );
}

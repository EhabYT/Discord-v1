import React, { useEffect, useState } from 'react';
import AuthLayout from '../auth/AuthLayout.jsx';
import api from '../api.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { useI18n } from '../i18n.jsx';

export default function VerifyEmail() {
  const { t } = useI18n();
  const token = new window.URLSearchParams(window.location.search).get('token') || '';
  const { account, refresh } = useAuth();
  const [state, setState] = useState(token ? 'working' : 'missing');
  const [message, setMessage] = useState('');
  useEffect(() => {
    if (!token) return;
    api.post('/api/auth/verify-email', { token })
      .then(() => { setState('done'); setMessage(t('auth.verified', 'Your email is verified.')); return refresh(); })
      .catch(err => { setState('error'); setMessage(err.message); });
  }, [token, refresh, t]);
  const resend = async () => {
    try { const result = await api.post('/api/auth/resend-verification', {}); setMessage(result.message); }
    catch (err) { setMessage(err.message); }
  };
  return (
    <AuthLayout eyebrow={t('auth.verifyEyebrow', 'Email verification')} title={t('auth.verifyTitle', 'Verify your email')} description={t('auth.verifyDesc', 'Verification links are time-limited, single-use, and replaced when a new link is requested.')} footer={<a href="/profile" className="text-cyan-300 hover:text-cyan-200">{t('auth.verifyFooter', 'Go to profile')}</a>}>
      {state === 'working' && <div className="cyber-info text-sm">{t('auth.checking', 'Checking verification link…')}</div>}
      {state === 'done' && <div className="cyber-info text-sm text-cyan-100">{message}</div>}
      {(state === 'missing' || state === 'error') && <div className="space-y-4"><div className="cyber-warning text-sm">{message || t('auth.badLink', 'This verification link is missing or invalid.')}</div>{account && !account.emailVerified && <button onClick={resend} className="cyber-button w-full">{t('auth.resend', 'Request a new verification email')}</button>}</div>}
    </AuthLayout>
  );
}

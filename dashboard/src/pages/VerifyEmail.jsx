import React, { useEffect, useState } from 'react';
import AuthLayout from '../auth/AuthLayout.jsx';
import api from '../api.js';
import { useAuth } from '../auth/AuthContext.jsx';

export default function VerifyEmail() {
  const token = new window.URLSearchParams(window.location.search).get('token') || '';
  const { account, refresh } = useAuth();
  const [state, setState] = useState(token ? 'working' : 'missing');
  const [message, setMessage] = useState('');
  useEffect(() => {
    if (!token) return;
    api.post('/api/auth/verify-email', { token })
      .then(() => { setState('done'); setMessage('Your email is verified.'); return refresh(); })
      .catch(err => { setState('error'); setMessage(err.message); });
  }, [token, refresh]);
  const resend = async () => {
    try { const result = await api.post('/api/auth/resend-verification', {}); setMessage(result.message); }
    catch (err) { setMessage(err.message); }
  };
  return (
    <AuthLayout eyebrow="Email verification" title="Verify your email" description="Verification links are time-limited, single-use, and replaced when a new link is requested." footer={<a href="/profile" className="text-cyan-300 hover:text-cyan-200">Go to profile</a>}>
      {state === 'working' && <div className="cyber-info text-sm">Checking verification link…</div>}
      {state === 'done' && <div className="cyber-info text-sm text-cyan-100">{message}</div>}
      {(state === 'missing' || state === 'error') && <div className="space-y-4"><div className="cyber-warning text-sm">{message || 'This verification link is missing or invalid.'}</div>{account && !account.emailVerified && <button onClick={resend} className="cyber-button w-full">Request a new verification email</button>}</div>}
    </AuthLayout>
  );
}

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import api from '../api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [auth, setAuth] = useState({ oauthEnabled: false, loggedIn: false, authRequired: true });
  const [account, setAccount] = useState(null);
  const [discord, setDiscord] = useState(null);
  const [me, setMe] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    // Anonymous visitors are the common case on /, /login and /register:
    // resolve the session first and only then touch session-gated endpoints,
    // so a logged-out load costs one cheap status call instead of three
    // guaranteed-401s (less noise, less session-store pressure).
    const nextAuth = await api.get('/api/auth/status').catch(() => ({ oauthEnabled: false, loggedIn: false, authRequired: true }));
    setAuth(nextAuth);
    if (!nextAuth?.loggedIn) {
      setMe(null);
      setAccount(null);
      setDiscord(null);
      return;
    }
    const [nextMe, projection] = await Promise.all([
      // /api/me requires the Discord-linked session user (requireAuth) and
      // can only 401 for credential-only accounts — each 401 also fires
      // eb:unauthorized, which retriggers refresh: an unbounded loop. The
      // status payload already carries discordLinked, so skip the probe.
      nextAuth?.discordLinked ? api.get('/api/me').catch(() => null) : Promise.resolve(null),
      api.get('/api/account').catch(() => null),
    ]);
    setMe(nextMe);
    setAccount(projection?.account || null);
    setDiscord(projection?.discord || nextMe || null);
  }, []);

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, [refresh]);

  const login = useCallback(async (credentials) => {
    const result = await api.post('/api/auth/login', credentials);
    if (result.mfaRequired) return result;
    setAccount(result.account);
    setDiscord(null);
    setMe(null);
    setAuth(current => ({ ...current, loggedIn: true, accountAuthenticated: true, discordLinked: false }));
    return result;
  }, []);

  const verifyMfa = useCallback(async (code) => {
    const result = await api.post('/api/auth/mfa/verify', { code });
    setAccount(result.account);
    setDiscord(null);
    setMe(null);
    setAuth(current => ({ ...current, loggedIn: true, accountAuthenticated: true, discordLinked: false }));
    return result;
  }, []);

  const register = useCallback(async (details) => {
    const result = await api.post('/api/auth/register', details);
    setAccount(result.account);
    setDiscord(null);
    setMe(null);
    setAuth(current => ({ ...current, loggedIn: true, accountAuthenticated: true, discordLinked: false }));
    return result;
  }, []);

  const applyAccount = useCallback(nextAccount => setAccount(nextAccount), []);

  const value = useMemo(() => ({
    auth, account, discord, me, loading, refresh, login, verifyMfa, register, applyAccount,
    displayUser: account ? {
      ...me,
      username: account.displayName || account.username,
      tag: `@${account.username}`,
      avatar: account.avatarUrl || discord?.avatar || me?.avatar,
      loggedIn: true,
    } : me,
  }), [auth, account, discord, me, loading, refresh, login, verifyMfa, register, applyAccount]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}

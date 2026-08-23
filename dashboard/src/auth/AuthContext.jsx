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
    const [nextAuth, nextMe] = await Promise.all([
      api.get('/api/auth/status').catch(() => ({ oauthEnabled: false, loggedIn: false, authRequired: true })),
      api.get('/api/me').catch(() => null),
    ]);
    setAuth(nextAuth);
    setMe(nextMe);
    if (nextAuth?.loggedIn) {
      const projection = await api.get('/api/account').catch(() => null);
      setAccount(projection?.account || null);
      setDiscord(projection?.discord || nextMe || null);
    } else {
      setAccount(null);
      setDiscord(null);
    }
  }, []);

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, [refresh]);

  const login = useCallback(async (credentials) => {
    const result = await api.post('/api/auth/login', credentials);
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

  const value = useMemo(() => ({
    auth, account, discord, me, loading, refresh, login, register,
    displayUser: account ? {
      ...me,
      username: account.displayName || account.username,
      tag: `@${account.username}`,
      avatar: account.avatarUrl || discord?.avatar || me?.avatar,
      loggedIn: true,
    } : me,
  }), [auth, account, discord, me, loading, refresh, login, register]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}

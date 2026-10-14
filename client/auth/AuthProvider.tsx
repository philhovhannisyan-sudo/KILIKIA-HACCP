import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, setUnauthorizedListener } from '../api';

export interface Me { id: string; login: string; fullName: string; roles: string[]; permissions: string[]; canWrite: boolean }

interface AuthValue {
  me: Me | null;
  loading: boolean;
  login: (login: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  can: (permission: string) => boolean;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try { setMe(await api<Me>('/api/auth/me')); } catch { setMe(null); } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    setUnauthorizedListener(() => setMe(null));
    void refresh();
  }, [refresh]);

  const value = useMemo<AuthValue>(() => {
    const perms = new Set(me?.permissions ?? []);
    return {
      me, loading, refresh,
      login: async (login, password) => setMe(await api<Me>('/api/auth/login', { method: 'POST', json: { login, password } })),
      logout: async () => { await api('/api/auth/logout', { method: 'POST' }); setMe(null); },
      can: (p) => perms.has(p),
    };
  }, [me, loading, refresh]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth outside AuthProvider');
  return ctx;
}

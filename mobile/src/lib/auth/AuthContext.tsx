import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

import apiClient, { setAuthToken } from '../api/client';
import { me as fetchMe, type PublicUser } from '../api/auth';
import { clearStoredToken, getStoredToken, setStoredToken } from './tokenStorage';

type AuthContextValue = {
  user: PublicUser | null;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  // Adopts a session the caller already obtained - used by sign-up, where
  // /auth/register hands back a token for the account it just created.
  adoptSession: (token: string, user: PublicUser) => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // On mount, try to resume a session from a previously stored token by
  // asking the API who it belongs to.
  useEffect(() => {
    let cancelled = false;

    async function hydrate() {
      const storedToken = await getStoredToken();

      if (!storedToken) {
        setIsLoading(false);
        return;
      }

      setAuthToken(storedToken);

      try {
        const data = await fetchMe();
        if (!cancelled) setUser(data.user);
      } catch {
        await clearStoredToken();
        setAuthToken(null);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    hydrate();

    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const data = await apiClient.post('/auth/login', { username, password });
    await setStoredToken(data.token);
    setAuthToken(data.token);
    setUser(data.user);
  }, []);

  const adoptSession = useCallback(async (token: string, nextUser: PublicUser) => {
    await setStoredToken(token);
    setAuthToken(token);
    setUser(nextUser);
  }, []);

  const logout = useCallback(async () => {
    await clearStoredToken();
    setAuthToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout, adoptSession }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

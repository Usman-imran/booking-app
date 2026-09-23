import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

import apiClient, { ApiRequestError, setAuthToken } from '../api/client';
import { me as fetchMe, type PublicUser } from '../api/auth';
import { readJson, writeJson } from '../offline/storage';
import { startSyncService } from '../syncService';
import { clearStoredToken, getStoredToken, setStoredToken } from './tokenStorage';

// The last user /auth/me returned. Lets a booker who opens the app with no
// signal carry on under their stored token instead of being signed out. It
// is only a profile (no secret) - the token itself stays in SecureStore.
const CACHED_USER_KEY = 'orderBookingApp.cachedUser';

function cacheUser(user: PublicUser | null) {
  return writeJson(CACHED_USER_KEY, user).catch(() => {});
}

type AuthContextValue = {
  user: PublicUser | null;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  // Adopts a session the caller already obtained - used by sign-up, where
  // /auth/register hands back a token for the account it just created.
  adoptSession: (token: string, user: PublicUser) => Promise<void>;
  // Re-reads the session's user from the API - after a rename in Settings,
  // so every screen showing the company name picks it up at once.
  refreshUser: () => Promise<PublicUser>;
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
        cacheUser(data.user);
      } catch (err) {
        // Only a 401 means the token is bad. Anything else - no signal, the
        // backend asleep or erroring - says nothing about the session, so
        // the booker continues as the user last seen with this token.
        const cached = err instanceof ApiRequestError && err.status === 401 ? null : await readJson<PublicUser>(CACHED_USER_KEY);
        if (cached) {
          if (!cancelled) setUser(cached);
        } else {
          await clearStoredToken();
          setAuthToken(null);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    hydrate();

    return () => {
      cancelled = true;
    };
  }, []);

  // The offline queue and catalogue cache follow whoever is signed in.
  const userId = user?.id ?? null;
  useEffect(() => (userId === null ? undefined : startSyncService(userId)), [userId]);

  const login = useCallback(async (username: string, password: string) => {
    const data = await apiClient.post('/auth/login', { username, password });
    await setStoredToken(data.token);
    setAuthToken(data.token);
    setUser(data.user);
    cacheUser(data.user);
  }, []);

  const adoptSession = useCallback(async (token: string, nextUser: PublicUser) => {
    await setStoredToken(token);
    setAuthToken(token);
    setUser(nextUser);
    cacheUser(nextUser);
  }, []);

  const refreshUser = useCallback(async () => {
    const data = await fetchMe();
    setUser(data.user);
    cacheUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(async () => {
    await clearStoredToken();
    setAuthToken(null);
    setUser(null);
    cacheUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout, adoptSession, refreshUser }}>
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

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import apiClient, { setAuthToken } from '../api/client.js';

const TOKEN_STORAGE_KEY = 'orderBookingApp.authToken';
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  // On mount (including page refresh), try to resume a session from a
  // previously stored token by asking the API who it belongs to.
  useEffect(() => {
    let cancelled = false;

    async function hydrate() {
      const storedToken = localStorage.getItem(TOKEN_STORAGE_KEY);

      if (!storedToken) {
        setIsLoading(false);
        return;
      }

      setAuthToken(storedToken);

      try {
        const data = await apiClient.get('/auth/me');
        if (!cancelled) setUser(data.user);
      } catch {
        localStorage.removeItem(TOKEN_STORAGE_KEY);
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

  const login = useCallback(async (username, password) => {
    const data = await apiClient.post('/auth/login', { username, password });
    localStorage.setItem(TOKEN_STORAGE_KEY, data.token);
    setAuthToken(data.token);
    setUser(data.user);
  }, []);

  // Adopts a session the caller already obtained — used by first-run signup,
  // where /auth/register hands back a token for the account it just created.
  //
  // Deliberately separate from login(): an existing booker adding a
  // colleague also gets a token back, and must NOT be switched into the new
  // account. Only the caller knows which case it is.
  const adoptSession = useCallback((token, nextUser) => {
    localStorage.setItem(TOKEN_STORAGE_KEY, token);
    setAuthToken(token);
    setUser(nextUser);
  }, []);

  // Re-reads the signed-in user from the API. Used after a settings change
  // so the sidebar and receipts pick up the new company name straight away,
  // rather than waiting for the next page load.
  const refreshUser = useCallback(async () => {
    const data = await apiClient.get('/auth/me');
    setUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    setAuthToken(null);
    setUser(null);
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

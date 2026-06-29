import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import client from '../api/client';

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('auth_token');
    if (!token) { setIsLoading(false); return; }

    client.get('/api/auth/me')
      .then(u => setUser(u))
      .catch(() => localStorage.removeItem('auth_token'))
      .finally(() => setIsLoading(false));
  }, []);

  const login = useCallback((token, userData) => {
    localStorage.setItem('auth_token', token);
    setUser(userData);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('auth_token');
    setUser(null);
  }, []);

  return (
    <AppContext.Provider value={{ user, setUser, isLoading, login, logout }}>
      {children}
    </AppContext.Provider>
  );
}

export const useApp = () => useContext(AppContext);

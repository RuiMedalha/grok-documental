'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api } from './api';

interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  tenantId: string;
}

interface Tenant {
  id: string;
  name: string;
  slug: string;
}

interface AuthState {
  user: User | null;
  tenant: Tenant | null;
  accessToken: string | null;
  refreshToken: string | null;
  isLoading: boolean;
  login: (email: string, password: string, tenantSlug: string) => Promise<void>;
  register: (data: {
    tenantName: string;
    tenantSlug: string;
    tenantNif?: string;
    email: string;
    password: string;
    name: string;
  }) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

const STORAGE_KEY = 'docflow_auth';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        setUser(parsed.user);
        setTenant(parsed.tenant);
        setAccessToken(parsed.accessToken);
        setRefreshToken(parsed.refreshToken);
      }
    } catch {
      // ignore
    } finally {
      setIsLoading(false);
    }
  }, []);

  const persist = useCallback((data: any) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    setUser(data.user);
    setTenant(data.tenant);
    setAccessToken(data.accessToken);
    setRefreshToken(data.refreshToken);
  }, []);

  const login = async (email: string, password: string, tenantSlug: string) => {
    const res = await api.login({ email, password, tenantSlug });
    persist(res);
  };

  const register = async (data: any) => {
    const res = await api.register(data);
    persist(res);
  };

  const logout = () => {
    localStorage.removeItem(STORAGE_KEY);
    setUser(null);
    setTenant(null);
    setAccessToken(null);
    setRefreshToken(null);
  };

  return (
    <AuthContext.Provider
      value={{ user, tenant, accessToken, refreshToken, isLoading, login, register, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

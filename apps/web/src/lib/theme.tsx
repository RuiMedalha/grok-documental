'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';

type Theme = 'dark' | 'light';

interface ThemeCtx {
  theme: Theme;
  toggle: () => void;
  setTheme: (t: Theme) => void;
}

const Ctx = createContext<ThemeCtx | null>(null);
const KEY = 'docflow_theme';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('dark');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(KEY) as Theme | null;
      const preferred =
        stored ||
        (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
      setThemeState(preferred);
      document.documentElement.classList.toggle('dark', preferred === 'dark');
      document.documentElement.classList.toggle('light', preferred === 'light');
      document.documentElement.setAttribute('data-theme', preferred);
    } catch {
      // ignore
    }
    setReady(true);
  }, []);

  function setTheme(t: Theme) {
    setThemeState(t);
    localStorage.setItem(KEY, t);
    document.documentElement.classList.toggle('dark', t === 'dark');
    document.documentElement.classList.toggle('light', t === 'light');
    document.documentElement.setAttribute('data-theme', t);
  }

  function toggle() {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  }

  if (!ready) {
    return <div className="min-h-screen bg-[#070b14]" />;
  }

  return <Ctx.Provider value={{ theme, toggle, setTheme }}>{children}</Ctx.Provider>;
}

export function useTheme() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}

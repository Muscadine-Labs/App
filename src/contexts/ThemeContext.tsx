'use client';

import { createContext, useContext, useEffect, useState, useMemo, ReactNode } from 'react';

export type Theme = 'Dark' | 'Light' | 'Auto';

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  effectiveTheme: 'dark' | 'light'; // The actual theme being applied (resolved from Auto)
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const THEME_STORAGE_KEY = 'muscadine-theme';

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Use lazy initialization to avoid setState in effect
  const [theme, setThemeState] = useState<Theme>(() => {
    if (typeof window === 'undefined') return 'Auto';
    const stored = localStorage.getItem(THEME_STORAGE_KEY) as Theme | null;
    if (stored && (stored === 'Dark' || stored === 'Light' || stored === 'Auto')) {
      return stored;
    }
    return 'Auto';
  });
  const [systemTheme, setSystemTheme] = useState<'dark' | 'light'>(() => {
    if (typeof window === 'undefined') return 'dark';
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  // Subscribe to system preference changes when theme is Auto
  useEffect(() => {
    if (theme === 'Auto') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const updateSystemTheme = () => {
        setSystemTheme(mediaQuery.matches ? 'dark' : 'light');
      };
      
      // Subscribe to system preference changes
      mediaQuery.addEventListener('change', updateSystemTheme);
      
      return () => {
        mediaQuery.removeEventListener('change', updateSystemTheme);
      };
    }
  }, [theme]);

  // Compute effective theme - use memoization to avoid setState in effect
  const effectiveTheme = useMemo(() => {
    if (theme === 'Auto') {
      return systemTheme;
    }
    return theme === 'Dark' ? 'dark' : 'light';
  }, [theme, systemTheme]);

  // Apply theme to document
  useEffect(() => {
    const root = document.documentElement;
    
    if (theme === 'Auto') {
      // Remove data-theme attribute to let CSS media query handle it
      root.removeAttribute('data-theme');
    } else if (theme === 'Light') {
      // Explicitly set light theme to override system preference
      root.setAttribute('data-theme', 'light');
    } else {
      // Set explicit dark theme
      root.setAttribute('data-theme', 'dark');
    }
  }, [theme]);

  // Persist theme to localStorage
  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme);
    if (typeof window !== 'undefined') {
      localStorage.setItem(THEME_STORAGE_KEY, newTheme);
    }
  };

  return (
    <ThemeContext.Provider value={{ theme, setTheme, effectiveTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}


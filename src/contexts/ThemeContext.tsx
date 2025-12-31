'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';

export type Theme = 'Dark' | 'Light' | 'Auto';

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  effectiveTheme: 'dark' | 'light'; // The actual theme being applied (resolved from Auto)
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const THEME_STORAGE_KEY = 'muscadine-theme';

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Safe SSR defaults - no localStorage or matchMedia access during render
  const [theme, setThemeState] = useState<Theme>('Auto');
  const [effectiveTheme, setEffectiveTheme] = useState<'dark' | 'light'>('dark');

  // Initialize theme from localStorage after mount
  useEffect(() => {
    const stored = localStorage.getItem(THEME_STORAGE_KEY) as Theme | null;
    if (stored && (stored === 'Dark' || stored === 'Light' || stored === 'Auto')) {
      setThemeState(stored);
    }
  }, []); // Run only once on mount

  // Update effective theme when theme changes and subscribe to matchMedia changes
  useEffect(() => {
    if (theme === 'Auto') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const updateEffectiveTheme = () => {
        setEffectiveTheme(mediaQuery.matches ? 'dark' : 'light');
      };
      
      // Set initial effective theme
      updateEffectiveTheme();
      
      // Subscribe to system preference changes
      mediaQuery.addEventListener('change', updateEffectiveTheme);
      
      return () => {
        mediaQuery.removeEventListener('change', updateEffectiveTheme);
      };
    } else {
      // For explicit themes, set effectiveTheme directly
      setEffectiveTheme(theme === 'Dark' ? 'dark' : 'light');
    }
  }, [theme]);

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


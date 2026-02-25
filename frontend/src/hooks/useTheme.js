import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'flowread-theme';

export function useTheme() {
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) || 'cream';
    } catch {
      return 'cream';
    }
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch { /* silent */ }
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === 'dark' ? 'cream' : 'dark'));
  }, []);

  return { theme, setTheme, toggleTheme };
}

import { useCallback, useSyncExternalStore } from 'react';

export type Theme = 'light' | 'dark';
const KEY = 'gumado-theme';
const listeners = new Set<() => void>();

const read = (): Theme => (document.documentElement.classList.contains('dark') ? 'dark' : 'light');

export function setTheme(theme: Theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark');
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    /* storage unavailable */
  }
  listeners.forEach((l) => l());
}

export function useTheme() {
  const theme = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    read,
    () => 'light' as Theme,
  );
  const toggle = useCallback(() => setTheme(read() === 'dark' ? 'light' : 'dark'), []);
  return { theme, toggle };
}

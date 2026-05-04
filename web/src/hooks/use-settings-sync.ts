import { useEffect, useRef } from 'react';
import { useSystemStore } from '@/stores/useSystemStore';
import { useDesktopStore } from '@/stores/useDesktopStore';
import { settingsClient, type SettingsDoc } from '@/lib/settings';

/**
 * Bootstraps user settings from the server on mount, then keeps the server
 * in sync as the local zustand stores change.
 *
 * Server is the source of truth for cross-device prefs. zustand persistence
 * to localStorage stays as a warm cache so the desktop renders before the
 * `/api/settings` round-trip completes.
 */
export function useSettingsSync() {
  const setTheme = useSystemStore((s) => s.setTheme);
  const setLanguage = useSystemStore((s) => s.setLanguage);
  const setWallpaper = useDesktopStore((s) => s.setWallpaper);

  const hydrated = useRef(false);
  const lastWritten = useRef<string>('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 1) Bootstrap.
  useEffect(() => {
    let alive = true;
    void settingsClient
      .get()
      .then((s) => {
        if (!alive) return;
        // patch zustand from server
        setTheme(s.theme);
        setLanguage(s.language);
        if (s.wallpaper) {
          // useDesktopStore.setWallpaper accepts the WallpaperId union;
          // accept anything, the store stores it as-is.
          setWallpaper(s.wallpaper as never);
        }
        lastWritten.current = JSON.stringify(s);
        hydrated.current = true;
      })
      .catch(() => {
        // No server settings yet (or transient failure) — keep zustand as is.
        hydrated.current = true;
      });
    return () => {
      alive = false;
    };
  }, [setTheme, setLanguage, setWallpaper]);

  // 2) Subscribe and write back, debounced.
  useEffect(() => {
    const sched = (next: Partial<SettingsDoc>) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        if (!hydrated.current) return;
        const sig = JSON.stringify(next);
        if (sig === lastWritten.current) return;
        void settingsClient
          .patch(next)
          .then((s) => {
            lastWritten.current = JSON.stringify(s);
          })
          .catch(() => {
            // ignore — UI already reflects intent
          });
      }, 300);
    };

    const unsubSys = useSystemStore.subscribe((state, prev) => {
      if (state.theme === prev.theme && state.language === prev.language) return;
      sched({ theme: state.theme, language: state.language });
    });
    const unsubDesk = useDesktopStore.subscribe((state, prev) => {
      if (state.wallpaper === prev.wallpaper) return;
      sched({ wallpaper: state.wallpaper });
    });
    return () => {
      unsubSys();
      unsubDesk();
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);
}

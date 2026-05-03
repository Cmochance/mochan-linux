import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface Notification {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  timestamp: number;
}

interface SystemState {
  theme: 'ink' | 'dark' | 'light';
  language: 'zh' | 'en';
  volume: number;
  brightness: number;
  notifications: Notification[];
  booted: boolean;
  uptime: number;
  locked: boolean;
  launcherOpen: boolean;

  toggleTheme: () => void;
  setTheme: (theme: 'ink' | 'dark' | 'light') => void;
  setLanguage: (lang: 'zh' | 'en') => void;
  toggleLanguage: () => void;
  setVolume: (volume: number) => void;
  setBrightness: (brightness: number) => void;
  addNotification: (notification: Omit<Notification, 'id' | 'timestamp'>) => void;
  dismissNotification: (id: string) => void;
  setBooted: (booted: boolean) => void;
  setLocked: (locked: boolean) => void;
  incrementUptime: () => void;
  setLauncherOpen: (open: boolean) => void;
}

let notificationIdCounter = 0;

export const useSystemStore = create<SystemState>()(
  persist(
    (set, get) => ({
      theme: 'ink',
      language: 'zh',
      volume: 70,
      brightness: 100,
      notifications: [],
      booted: false,
      uptime: 0,
      locked: false,
      launcherOpen: false,

      setLauncherOpen: (open) => set({ launcherOpen: open }),

      toggleTheme: () =>
        set((state) => ({
          theme: state.theme === 'ink' ? 'dark' : state.theme === 'dark' ? 'light' : 'ink',
        })),

      setTheme: (theme) => set({ theme }),

      setLanguage: (language) => set({ language }),

      toggleLanguage: () =>
        set((state) => ({
          language: state.language === 'zh' ? 'en' : 'zh',
        })),

      setVolume: (volume) => set({ volume: Math.max(0, Math.min(100, volume)) }),

      setBrightness: (brightness) => set({ brightness: Math.max(20, Math.min(100, brightness)) }),

      addNotification: (notification) => {
        const id = `notif-${++notificationIdCounter}-${Date.now()}`;
        set((state) => ({
          notifications: [
            { ...notification, id, timestamp: Date.now() },
            ...state.notifications,
          ].slice(0, 50),
        }));

        // Auto-dismiss after 5s
        setTimeout(() => {
          get().dismissNotification(id);
        }, 5000);
      },

      dismissNotification: (id) =>
        set((state) => ({
          notifications: state.notifications.filter((n) => n.id !== id),
        })),

      setBooted: (booted) => set({ booted }),

      setLocked: (locked) => set({ locked }),

      incrementUptime: () =>
        set((state) => ({ uptime: state.uptime + 1 })),
    }),
    {
      name: 'ink-os-system',
      partialize: (state) => ({
        theme: state.theme,
        language: state.language,
        volume: state.volume,
        brightness: state.brightness,
      }),
    }
  )
);

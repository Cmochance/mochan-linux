import { create } from 'zustand';

export interface WindowData {
  id: string;
  appId: string;
  title: string;
  x: number;
  y: number;
  width: number;
  height: number;
  isMinimized: boolean;
  isMaximized: boolean;
  zIndex: number;
  isActive: boolean;
  prevX?: number;
  prevY?: number;
  prevWidth?: number;
  prevHeight?: number;
}

interface WindowState {
  windows: WindowData[];
  activeWindowId: string | null;
  nextZIndex: number;
  lastOpenPosition: { x: number; y: number };

  openWindow: (appId: string, title: string, config?: Partial<Omit<WindowData, 'id' | 'appId' | 'title'>>) => string;
  closeWindow: (id: string) => void;
  minimizeWindow: (id: string) => void;
  maximizeWindow: (id: string) => void;
  restoreWindow: (id: string) => void;
  focusWindow: (id: string) => void;
  updateWindowPosition: (id: string, x: number, y: number) => void;
  updateWindowSize: (id: string, width: number, height: number) => void;
  bringToFront: (id: string) => void;
  getWindowById: (id: string) => WindowData | undefined;
  getWindowsByAppId: (appId: string) => WindowData[];
}

let windowIdCounter = 0;

export const useWindowStore = create<WindowState>((set, get) => ({
  windows: [],
  activeWindowId: null,
  nextZIndex: 100,
  lastOpenPosition: { x: 80, y: 60 },

  openWindow: (appId, title, config = {}) => {
    const state = get();
    const id = `window-${++windowIdCounter}`;

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let newX = state.lastOpenPosition.x + 30;
    let newY = state.lastOpenPosition.y + 30;

    // Wrap around if too far
    if (newX + 400 > viewportWidth) newX = 80;
    if (newY + 300 > viewportHeight - 92) newY = 60;

    const width = config.width ?? 800;
    const height = config.height ?? 600;

    // Clamp to viewport
    newX = Math.min(newX, viewportWidth - width - 20);
    newY = Math.min(newY, viewportHeight - height - 92);
    newX = Math.max(newX, 10);
    newY = Math.max(newY, 36);

    const newWindow: WindowData = {
      id,
      appId,
      title,
      x: newX,
      y: newY,
      width: Math.min(width, viewportWidth - 40),
      height: Math.min(height, viewportHeight - 128),
      isMinimized: false,
      isMaximized: false,
      zIndex: state.nextZIndex,
      isActive: true,
      ...config,
    };

    set({
      windows: [
        ...state.windows.map(w => ({ ...w, isActive: false })),
        newWindow,
      ],
      activeWindowId: id,
      nextZIndex: state.nextZIndex + 1,
      lastOpenPosition: { x: newX, y: newY },
    });

    return id;
  },

  closeWindow: (id) => {
    set((state) => ({
      windows: state.windows.filter((w) => w.id !== id),
      activeWindowId: state.activeWindowId === id
        ? (state.windows.filter((w) => w.id !== id).slice(-1)[0]?.id ?? null)
        : state.activeWindowId,
    }));
  },

  minimizeWindow: (id) => {
    set((state) => ({
      windows: state.windows.map((w) =>
        w.id === id ? { ...w, isMinimized: true, isActive: false } : w
      ),
      activeWindowId: state.activeWindowId === id
        ? (state.windows.find((w) => w.id !== id && !w.isMinimized)?.id ?? null)
        : state.activeWindowId,
    }));
  },

  maximizeWindow: (id) => {
    const { windows } = get();
    const win = windows.find((w) => w.id === id);
    if (!win) return;

    set({
      windows: windows.map((w) =>
        w.id === id
          ? {
              ...w,
              prevX: w.x,
              prevY: w.y,
              prevWidth: w.width,
              prevHeight: w.height,
              x: 0,
              y: 28,
              width: window.innerWidth,
              height: window.innerHeight - 92,
              isMaximized: true,
              isActive: true,
            }
          : { ...w, isActive: false }
      ),
      activeWindowId: id,
      nextZIndex: get().nextZIndex + 1,
    });
  },

  restoreWindow: (id) => {
    set((state) => ({
      windows: state.windows.map((w) =>
        w.id === id
          ? {
              ...w,
              x: w.prevX ?? w.x,
              y: w.prevY ?? w.y,
              width: w.prevWidth ?? w.width,
              height: w.prevHeight ?? w.height,
              isMaximized: false,
              isMinimized: false,
              isActive: true,
            }
          : w
      ),
      activeWindowId: id,
      nextZIndex: get().nextZIndex + 1,
    }));
  },

  focusWindow: (id) => {
    const state = get();
    const targetWin = state.windows.find((w) => w.id === id);
    if (!targetWin || targetWin.isMinimized) return;

    set({
      windows: state.windows.map((w) =>
        w.id === id
          ? { ...w, isActive: true, zIndex: state.nextZIndex }
          : { ...w, isActive: false }
      ),
      activeWindowId: id,
      nextZIndex: state.nextZIndex + 1,
    });
  },

  updateWindowPosition: (id, x, y) => {
    set((state) => ({
      windows: state.windows.map((w) =>
        w.id === id ? { ...w, x, y } : w
      ),
    }));
  },

  updateWindowSize: (id, width, height) => {
    set((state) => ({
      windows: state.windows.map((w) =>
        w.id === id ? { ...w, width, height } : w
      ),
    }));
  },

  bringToFront: (id) => {
    const state = get();
    set({
      windows: state.windows.map((w) =>
        w.id === id
          ? { ...w, zIndex: state.nextZIndex, isActive: true }
          : { ...w, isActive: false }
      ),
      activeWindowId: id,
      nextZIndex: state.nextZIndex + 1,
    });
  },

  getWindowById: (id) => {
    return get().windows.find((w) => w.id === id);
  },

  getWindowsByAppId: (appId) => {
    return get().windows.filter((w) => w.appId === appId);
  },
}));

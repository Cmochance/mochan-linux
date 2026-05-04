import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface DesktopIconData {
  id: string;
  appId: string;
  label: string;
  x: number;
  y: number;
}

// Wallpaper id: a bundled name like "wallpaper-bamboo", or a user-uploaded
// filename like "myphoto.png". Stored verbatim; resolved through
// `wallpaperUrl` in `lib/settings`.
export type WallpaperId = string;

interface ContextMenuState {
  x: number;
  y: number;
  items: ContextMenuItem[];
}

export interface ContextMenuItem {
  label: string;
  action: string;
  icon?: string;
  separator?: boolean;
  submenu?: ContextMenuItem[];
}

interface DesktopState {
  wallpaper: WallpaperId;
  icons: DesktopIconData[];
  showGrid: boolean;
  contextMenu: ContextMenuState | null;

  setWallpaper: (wallpaper: WallpaperId) => void;
  arrangeIcons: () => void;
  updateIconPosition: (id: string, x: number, y: number) => void;
  showContextMenu: (menu: ContextMenuState) => void;
  hideContextMenu: () => void;
  addIcon: (icon: DesktopIconData) => void;
  removeIcon: (id: string) => void;
}

const GRID_COL_WIDTH = 96;
const GRID_ROW_HEIGHT = 104;
const GRID_PADDING_X = 24;
const GRID_PADDING_Y = 24;

const DEFAULT_ICONS: DesktopIconData[] = [
  { id: 'desktop-filemanager', appId: 'filemanager', label: '文件管理', x: 0, y: 0 },
  { id: 'desktop-terminal', appId: 'terminal', label: '终端', x: 1, y: 0 },
  { id: 'desktop-settings', appId: 'settings', label: '设置', x: 2, y: 0 },
  { id: 'desktop-browser', appId: 'browser', label: '浏览器', x: 3, y: 0 },
  { id: 'desktop-notes', appId: 'notes', label: '便签', x: 0, y: 1 },
  { id: 'desktop-calculator', appId: 'calculator', label: '计算器', x: 1, y: 1 },
  { id: 'desktop-calendar', appId: 'calendar', label: '日历', x: 2, y: 1 },
  { id: 'desktop-trash', appId: 'trash', label: '废纸篓', x: 3, y: 1 },
];

// Convert grid positions to pixel positions
const initializeIcons = (): DesktopIconData[] => {
  return DEFAULT_ICONS.map((icon) => ({
    ...icon,
    x: GRID_PADDING_X + icon.x * (GRID_COL_WIDTH + 16),
    y: GRID_PADDING_Y + icon.y * (GRID_ROW_HEIGHT + 20),
  }));
};

export const useDesktopStore = create<DesktopState>()(
  persist(
    (set, get) => ({
      wallpaper: 'wallpaper-default',
      icons: initializeIcons(),
      showGrid: true,
      contextMenu: null,

      setWallpaper: (wallpaper) => set({ wallpaper }),

      arrangeIcons: () => {
        const viewportWidth = window.innerWidth;
        const icons = get().icons;
        const cols = Math.floor((viewportWidth - GRID_PADDING_X * 2) / (GRID_COL_WIDTH + 16));

        const arranged = icons.map((icon, index) => {
          const col = index % Math.max(cols, 1);
          const row = Math.floor(index / Math.max(cols, 1));
          return {
            ...icon,
            x: GRID_PADDING_X + col * (GRID_COL_WIDTH + 16),
            y: GRID_PADDING_Y + row * (GRID_ROW_HEIGHT + 20),
          };
        });

        set({ icons: arranged });
      },

      updateIconPosition: (id, x, y) => {
        const state = get();
        if (state.showGrid) {
          // Snap to grid
          const col = Math.round((x - GRID_PADDING_X) / (GRID_COL_WIDTH + 16));
          const row = Math.round((y - GRID_PADDING_Y) / (GRID_ROW_HEIGHT + 20));
          const snappedX = GRID_PADDING_X + col * (GRID_COL_WIDTH + 16);
          const snappedY = GRID_PADDING_Y + row * (GRID_ROW_HEIGHT + 20);

          set({
            icons: state.icons.map((icon) =>
              icon.id === id ? { ...icon, x: Math.max(GRID_PADDING_X, snappedX), y: Math.max(GRID_PADDING_Y, snappedY) } : icon
            ),
          });
        } else {
          set({
            icons: state.icons.map((icon) =>
              icon.id === id ? { ...icon, x, y } : icon
            ),
          });
        }
      },

      showContextMenu: (menu) => set({ contextMenu: menu }),

      hideContextMenu: () => set({ contextMenu: null }),

      addIcon: (icon) => set((state) => ({ icons: [...state.icons, icon] })),

      removeIcon: (id) =>
        set((state) => ({
          icons: state.icons.filter((icon) => icon.id !== id),
        })),
    }),
    {
      name: 'ink-os-desktop',
      partialize: (state) => ({
        wallpaper: state.wallpaper,
        icons: state.icons,
        showGrid: state.showGrid,
      }),
    }
  )
);

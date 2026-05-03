import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppStore, APP_CATEGORIES } from '@/stores/useAppStore';
import { useWindowStore } from '@/stores/useWindowStore';
import type { AppDefinition } from '@/stores/useAppStore';
import {
  FolderOpen,
  Terminal,
  Activity,
  Settings,
  Calculator,
  Calendar,
  Clock,
  Camera,
  StickyNote,
  Trash2,
  ListTodo,
  CloudSun,
  FileText,
  FileCode2,
  Table2,
  Palette,
  GitFork,
  Presentation,
  BookOpen,
  Languages,
  Music,
  PlayCircle,
  Image,
  Mic,
  Images,
  Radio,
  Timer,
  Globe,
  Mail,
  MessageCircle,
  HardDriveUpload,
  Shield,
  Download,
  Rss,
  Bookmark,
  GitBranch,
  Braces,
  Search,
  Plug,
  Pipette,
  Code2,
  QrCode,
  KeyRound,
  CircleDot,
  Grid3X3,
  LayoutGrid,
  Grid2X2,
  Snail,
  Combine,
  Puzzle,
  BookMarked,
  NotebookPen,
  Waves,
  CheckCircle2,
} from 'lucide-react';

const LUCIDE_ICONS: Record<string, React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>> = {
  FolderOpen, Terminal, Activity, Settings, Calculator, Calendar, Clock,
  Camera, StickyNote, Trash2, ListTodo, CloudSun, FileText, FileCode2,
  Table2, Palette, GitFork, Presentation, BookOpen, Languages, Music,
  PlayCircle, Image, Mic, Images, Radio, Timer, Globe, Mail,
  MessageCircle, HardDriveUpload, Shield, Download, Rss, Bookmark,
  GitBranch, Braces, Search, Plug, Pipette, Code2, QrCode, KeyRound,
  CircleDot, Grid3X3, LayoutGrid, Grid2X2, Snail, Combine, Puzzle,
  BookMarked, NotebookPen, Waves, CheckCircle2,
};

export function Dock() {
  const dockApps = useAppStore((s) => s.dockApps);
  const pinToDock = useAppStore((s) => s.pinToDock);
  const unpinFromDock = useAppStore((s) => s.unpinFromDock);
  const getAppById = useAppStore((s) => s.getAppById);
  const windows = useWindowStore((s) => s.windows);
  const openWindow = useWindowStore((s) => s.openWindow);
  const focusWindow = useWindowStore((s) => s.focusWindow);

  const [hoveredApp, setHoveredApp] = useState<string | null>(null);
  const [tooltipApp, setTooltipApp] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; appId: string } | null>(null);
  const [bouncingApp, setBouncingApp] = useState<string | null>(null);

  const pinnedApps = useMemo(() => {
    return dockApps
      .map((id) => getAppById(id))
      .filter(Boolean) as AppDefinition[];
  }, [dockApps, getAppById]);

  // Open apps that aren't pinned (center section)
  const openAppIds = useMemo(() => {
    const openIds = new Set(windows.filter((w) => !w.isMinimized).map((w) => w.appId));
    return Array.from(openIds).filter((id) => !dockApps.includes(id));
  }, [windows, dockApps]);

  const openApps = useMemo(() => {
    return openAppIds
      .map((id) => getAppById(id))
      .filter(Boolean) as AppDefinition[];
  }, [openAppIds, getAppById]);

  const handleLaunch = (app: AppDefinition) => {
    // Check if app already has an open window
    const existingWindows = windows.filter((w) => w.appId === app.id && !w.isMinimized);
    if (existingWindows.length > 0) {
      // Focus the most recent window
      const mostRecent = existingWindows.sort((a, b) => b.zIndex - a.zIndex)[0];
      focusWindow(mostRecent.id);
    } else {
      openWindow(app.id, app.name);
    }

    // Bounce animation
    setBouncingApp(app.id);
    setTimeout(() => setBouncingApp(null), 300);
  };

  const handleContextMenu = (e: React.MouseEvent, appId: string) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY - 80, appId });
  };

  const isAppPinned = (appId: string) => dockApps.includes(appId);
  const hasOpenWindow = (appId: string) => windows.some((w) => w.appId === appId);
  const isMinimized = (appId: string) => windows.some((w) => w.appId === appId && w.isMinimized);

  const renderDockItem = (app: AppDefinition, section: 'pinned' | 'open') => {
    const Icon = LUCIDE_ICONS[app.icon];
    const pinned = isAppPinned(app.id);
    const open = hasOpenWindow(app.id);
    const minimized = isMinimized(app.id);
    const isBouncing = bouncingApp === app.id;

    return (
      <div
        key={`${section}-${app.id}`}
        className="relative flex flex-col items-center"
        onMouseEnter={() => {
          setHoveredApp(app.id);
          setTooltipApp(app.id);
        }}
        onMouseLeave={() => {
          setHoveredApp(null);
          setTooltipApp(null);
        }}
        onContextMenu={(e) => handleContextMenu(e, app.id)}
      >
        {/* Tooltip */}
        <AnimatePresence>
          {tooltipApp === app.id && (
            <motion.div
              className="absolute -top-8 px-2 py-0.5 rounded text-caption whitespace-nowrap"
              style={{
                backgroundColor: 'var(--ink-800)',
                color: 'var(--ink-50)',
              }}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              transition={{ duration: 0.08 }}
            >
              {app.name}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Icon container */}
        <motion.button
          className="flex items-center justify-center rounded-[10px] transition-colors"
          style={{
            width: '48px',
            height: '48px',
            backgroundColor: hoveredApp === app.id ? 'var(--wash-light)' : 'transparent',
          }}
          animate={isBouncing ? { y: [0, -8, 0] } : { y: 0 }}
          transition={isBouncing
            ? { duration: 0.3, ease: [0.34, 1.56, 0.64, 1] as [number, number, number, number] }
            : { duration: 0.08 }
          }
          onClick={() => handleLaunch(app)}
        >
          {Icon && <Icon size={24} strokeWidth={1.5} className="text-ink-800" />}
        </motion.button>

        {/* Active indicator dot */}
        {open && (
          <div
            className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 rounded-full"
            style={{
              width: '4px',
              height: '4px',
              backgroundColor: 'var(--cinnabar)',
              boxShadow: minimized ? '0 0 0 1px var(--cinnabar)' : 'none',
              ...(minimized ? { backgroundColor: 'transparent' } : {}),
            }}
          />
        )}
      </div>
    );
  };

  return (
    <>
      <div
        className="fixed bottom-0 left-1/2 -translate-x-1/2 glass flex items-center gap-2 px-4"
        style={{
          height: '64px',
          borderRadius: '16px 16px 0 0',
          borderTop: '1px solid var(--glass-border)',
          boxShadow: '0 -4px 20px rgba(26,26,26,0.06)',
          zIndex: 2000,
          maxWidth: '90vw',
        }}
      >
        {/* Pinned apps */}
        <div className="flex items-center gap-2">
          {pinnedApps.filter((a) => a.id !== 'trash').map((app) => renderDockItem(app, 'pinned'))}
        </div>

        {/* Divider */}
        {openApps.length > 0 && (
          <div
            className="mx-1 flex-shrink-0"
            style={{
              width: '1px',
              height: '32px',
              backgroundColor: 'var(--ink-200)',
            }}
          />
        )}

        {/* Open apps */}
        <div className="flex items-center gap-2">
          {openApps.map((app) => renderDockItem(app, 'open'))}
        </div>

        {/* Divider + Trash */}
        <div
          className="mx-1 flex-shrink-0"
          style={{
            width: '1px',
            height: '32px',
            backgroundColor: 'var(--ink-200)',
          }}
        />
        {pinnedApps.filter((a) => a.id === 'trash').map((app) => renderDockItem(app, 'pinned'))}
      </div>

      {/* Context Menu */}
      <AnimatePresence>
        {contextMenu && (
          <>
            <div className="fixed inset-0 z-[2100]" onClick={() => setContextMenu(null)} />
            <motion.div
              className="fixed glass-active rounded-md overflow-hidden"
              style={{
                left: contextMenu.x,
                top: contextMenu.y,
                boxShadow: 'var(--shadow-md)',
                zIndex: 2101,
                minWidth: '160px',
              }}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.1 }}
            >
              <button
                className="w-full text-left text-body-sm px-4 py-2 transition-colors"
                style={{ color: 'var(--ink-800)' }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--wash-light)';
                  e.currentTarget.style.borderLeft = '2px solid var(--cinnabar)';
                  e.currentTarget.style.paddingLeft = '14px';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                  e.currentTarget.style.borderLeft = '2px solid transparent';
                  e.currentTarget.style.paddingLeft = '16px';
                }}
                onClick={() => {
                  handleLaunch(getAppById(contextMenu.appId)!);
                  setContextMenu(null);
                }}
              >
                打开
              </button>
              <button
                className="w-full text-left text-body-sm px-4 py-2 transition-colors"
                style={{ color: 'var(--ink-800)' }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--wash-light)';
                  e.currentTarget.style.borderLeft = '2px solid var(--cinnabar)';
                  e.currentTarget.style.paddingLeft = '14px';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                  e.currentTarget.style.borderLeft = '2px solid transparent';
                  e.currentTarget.style.paddingLeft = '16px';
                }}
                onClick={() => {
                  const app = getAppById(contextMenu.appId);
                  if (app) {
                    openWindow(app.id, app.name);
                  }
                  setContextMenu(null);
                }}
              >
                新建窗口
              </button>
              <div style={{ height: '1px', backgroundColor: 'var(--ink-200)', margin: '4px 0' }} />
              <button
                className="w-full text-left text-body-sm px-4 py-2 transition-colors"
                style={{ color: 'var(--ink-800)' }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--wash-light)';
                  e.currentTarget.style.borderLeft = '2px solid var(--cinnabar)';
                  e.currentTarget.style.paddingLeft = '14px';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                  e.currentTarget.style.borderLeft = '2px solid transparent';
                  e.currentTarget.style.paddingLeft = '16px';
                }}
                onClick={() => {
                  if (isAppPinned(contextMenu.appId)) {
                    unpinFromDock(contextMenu.appId);
                  } else {
                    pinToDock(contextMenu.appId);
                  }
                  setContextMenu(null);
                }}
              >
                {isAppPinned(contextMenu.appId) ? '从 Dock 移除' : '保留在 Dock'}
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

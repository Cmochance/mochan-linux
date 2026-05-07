import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppStore, APP_CATEGORIES, APPS } from '@/stores/useAppStore';
import { useWindowStore } from '@/stores/useWindowStore';
import { useSystemStore } from '@/stores/useSystemStore';
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
  AppWindow,
  X,
  SearchIcon,
} from 'lucide-react';

const LUCIDE_ICONS: Record<string, React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>> = {
  FolderOpen, Terminal, Activity, Settings, Calculator, Calendar, Clock,
  Camera, StickyNote, Trash2, ListTodo, CloudSun, FileText,
  Table2, Palette, GitFork, Presentation, BookOpen, Languages, Music,
  PlayCircle, Image, Mic, Images, Radio, Timer, Globe, Mail,
  MessageCircle, HardDriveUpload, Shield, Download, Rss, Bookmark,
  GitBranch, Braces, Search, Plug, Pipette, Code2, QrCode, KeyRound,
  CircleDot, Grid3X3, LayoutGrid, Grid2X2, Snail, Combine, Puzzle,
  BookMarked, NotebookPen, Waves, CheckCircle2,
  AppWindow,
};

export function AppLauncher() {
  const [searchQuery, setSearchQuery] = useState('');
  const [isVisible, setIsVisible] = useState(false);

  const apps = useAppStore((s) => s.apps);
  const recentApps = useAppStore((s) => s.recentApps);
  const dockApps = useAppStore((s) => s.dockApps);
  const openWindow = useWindowStore((s) => s.openWindow);
  const clearLaunchedApp = useAppStore((s) => s.clearLaunchedApp);
  const launchedApp = useAppStore((s) => s.launchedApp);

  const launcherOpen = useSystemStore((s) => s.launcherOpen);
  const setLauncherOpen = useSystemStore((s) => s.setLauncherOpen);

  // Sync with global store
  useEffect(() => {
    setIsVisible(launcherOpen);
  }, [launcherOpen]);

  // Keyboard shortcut: Meta key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Meta' || e.key === 'OS') {
        e.preventDefault();
        setLauncherOpen(!useSystemStore.getState().launcherOpen);
      }
      if (e.key === 'Escape' && isVisible) {
        setLauncherOpen(false);
        setIsVisible(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isVisible, setLauncherOpen]);

  const handleLaunch = (appId: string) => {
    const app = apps.find((a) => a.id === appId);
    if (app) {
      openWindow(app.id, app.name);
    }
    setIsVisible(false);
    setSearchQuery('');
    setLauncherOpen(false);
  };

  // Filter apps by search
  const filteredApps = useMemo(() => {
    if (!searchQuery.trim()) return apps;
    const q = searchQuery.toLowerCase();
    return apps.filter(
      (app) =>
        app.name.toLowerCase().includes(q) ||
        app.nameEn.toLowerCase().includes(q) ||
        app.description.toLowerCase().includes(q)
    );
  }, [apps, searchQuery]);

  // Group by category
  const groupedApps = useMemo(() => {
    const groups: Record<string, typeof apps> = {};
    const categories = ['system', 'office', 'media', 'network', 'dev', 'games', 'education'] as const;

    categories.forEach((cat) => {
      const catApps = filteredApps.filter((app) => app.category === cat);
      if (catApps.length > 0) {
        groups[cat] = catApps;
      }
    });

    return groups;
  }, [filteredApps]);

  // Recent apps data
  const recentAppData = useMemo(() => {
    return recentApps
      .map((id) => apps.find((a) => a.id === id))
      .filter(Boolean)
      .slice(0, 6) as typeof apps;
  }, [recentApps, apps]);

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          className="fixed inset-0 flex flex-col items-center"
          style={{
            zIndex: 3000,
            top: '28px',
            bottom: '64px',
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] as [number, number, number, number] }}
          onClick={() => {
            setIsVisible(false);
            setSearchQuery('');
          }}
        >
          {/* Background overlay */}
          <div
            className="absolute inset-0"
            style={{
              backgroundColor: 'rgba(240, 235, 228, 0.92)',
              backdropFilter: 'blur(24px)',
              WebkitBackdropFilter: 'blur(24px)',
            }}
          />

          {/* Content */}
          <div
            className="relative w-full h-full flex flex-col items-center pt-8 pb-20 overflow-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close button */}
            <button
              className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full transition-colors"
              style={{ color: 'var(--ink-600)' }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--wash-light)')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              onClick={() => {
                setIsVisible(false);
                setSearchQuery('');
              }}
            >
              <X size={20} strokeWidth={1.5} />
            </button>

            {/* Search bar */}
            <div
              className="relative w-full max-w-[480px] mx-4"
              style={{ marginBottom: '32px' }}
            >
              <div className="absolute left-4 top-1/2 -translate-y-1/2" style={{ color: 'var(--ink-400)' }}>
                <SearchIcon size={18} strokeWidth={1.5} />
              </div>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜索应用..."
                className="w-full text-body-md rounded-full outline-none transition-all"
                style={{
                  padding: '10px 16px 10px 44px',
                  backgroundColor: 'var(--glass-active)',
                  border: '1px solid transparent',
                  color: 'var(--ink-900)',
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = 'var(--cinnabar)';
                  e.currentTarget.style.boxShadow = 'var(--shadow-focus)';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = 'transparent';
                  e.currentTarget.style.boxShadow = 'none';
                }}
                autoFocus
              />
            </div>

            {/* Recent apps */}
            {!searchQuery && recentAppData.length > 0 && (
              <div className="w-full max-w-[960px] px-8 mb-6">
                <h3
                  className="text-heading-sm mb-3"
                  style={{ color: 'var(--ink-600)' }}
                >
                  最近使用
                </h3>
                <div className="flex gap-4">
                  {recentAppData.map((app, index) => (
                    <motion.div
                      key={app.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{
                        delay: index * 0.05,
                        duration: 0.25,
                        ease: [0, 0, 0.2, 1] as [number, number, number, number],
                      }}
                    >
                      <AppGridItem app={app} onClick={() => handleLaunch(app.id)} index={index} />
                    </motion.div>
                  ))}
                </div>
              </div>
            )}

            {/* App Grid */}
            <div className="w-full max-w-[960px] px-8">
              {Object.entries(groupedApps).map(([category, catApps]) => (
                <div key={category} className="mb-6">
                  <h3
                    className="text-heading-sm mb-3"
                    style={{ color: 'var(--ink-600)' }}
                  >
                    {APP_CATEGORIES[category as keyof typeof APP_CATEGORIES]?.label || category}
                  </h3>
                  <div
                    className="grid gap-x-6 gap-y-7"
                    style={{
                      gridTemplateColumns: 'repeat(auto-fill, minmax(88px, 1fr))',
                    }}
                  >
                    {catApps.map((app, index) => (
                      <motion.div
                        key={app.id}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{
                          delay: index * 0.03,
                          duration: 0.25,
                          ease: [0, 0, 0.2, 1] as [number, number, number, number],
                        }}
                      >
                        <AppGridItem
                          app={app}
                          onClick={() => handleLaunch(app.id)}
                          index={index}
                        />
                      </motion.div>
                    ))}
                  </div>
                </div>
              ))}

              {filteredApps.length === 0 && (
                <div className="text-center py-20">
                  <div className="text-body-lg" style={{ color: 'var(--ink-400)' }}>
                    未找到匹配的应用
                  </div>
                </div>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function AppGridItem({
  app,
  onClick,
  index,
}: {
  app: (typeof APPS)[0];
  onClick: () => void;
  index: number;
}) {
  const [isHovered, setIsHovered] = useState(false);
  const Icon = LUCIDE_ICONS[app.icon];

  return (
    <button
      className="flex flex-col items-center gap-2 group"
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      title={app.name}
    >
      <motion.div
        className="flex items-center justify-center rounded-[14px]"
        style={{
          width: '56px',
          height: '56px',
          backgroundColor: 'var(--ink-100)',
          boxShadow: 'var(--shadow-sm)',
        }}
        animate={{
          scale: isHovered ? 1.12 : 1,
          backgroundColor: isHovered ? 'var(--ink-50)' : 'var(--ink-100)',
        }}
        transition={{ duration: 0.15 }}
      >
        {Icon && (
          <Icon
            size={28}
            strokeWidth={1.5}
            className="text-ink-800"
          />
        )}
      </motion.div>
      <span
        className="text-caption text-center"
        style={{
          color: 'var(--ink-700)',
          maxWidth: '80px',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          lineHeight: '1.3',
        }}
      >
        {app.name}
      </span>
    </button>
  );
}

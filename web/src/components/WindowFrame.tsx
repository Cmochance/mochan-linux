import { useRef, useCallback, useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import type { WindowData } from '@/stores/useWindowStore';
import { useWindowStore } from '@/stores/useWindowStore';
import { useAppStore } from '@/stores/useAppStore';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  X,
  Minus,
  Maximize2,
  Minimize2,
} from 'lucide-react';

// Heights of the persistent chrome on mobile (StatusBar at top, Dock at bottom).
const MOBILE_STATUSBAR_PX = 28;
const MOBILE_DOCK_PX = 56;

interface WindowFrameProps {
  window: WindowData;
  children: React.ReactNode;
}

type ResizeDirection = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

const RESIZE_HANDLES: { direction: ResizeDirection; className: string; cursor: string }[] = [
  { direction: 'n', className: 'top-0 left-2 right-2 h-2 -mt-1', cursor: 'ns-resize' },
  { direction: 's', className: 'bottom-0 left-2 right-2 h-2 -mb-1', cursor: 'ns-resize' },
  { direction: 'e', className: 'top-2 bottom-2 right-0 w-2 -mr-1', cursor: 'ew-resize' },
  { direction: 'w', className: 'top-2 bottom-2 left-0 w-2 -ml-1', cursor: 'ew-resize' },
  { direction: 'ne', className: 'top-0 right-0 w-3 h-3 -mt-1 -mr-1', cursor: 'nesw-resize' },
  { direction: 'nw', className: 'top-0 left-0 w-3 h-3 -mt-1 -ml-1', cursor: 'nwse-resize' },
  { direction: 'se', className: 'bottom-0 right-0 w-3 h-3 -mb-1 -mr-1', cursor: 'nwse-resize' },
  { direction: 'sw', className: 'bottom-0 left-0 w-3 h-3 -mb-1 -ml-1', cursor: 'nesw-resize' },
];

export function WindowFrame({ window: win, children }: WindowFrameProps) {
  const {
    focusWindow,
    closeWindow,
    minimizeWindow,
    maximizeWindow,
    restoreWindow,
    updateWindowPosition,
    updateWindowSize,
    bringToFront,
  } = useWindowStore();

  const getAppById = useAppStore((s) => s.getAppById);
  const app = getAppById(win.appId);

  const isMobile = useIsMobile();
  const frameRef = useRef<HTMLDivElement>(null);
  const dragState = useRef<{ startX: number; startY: number; initialX: number; initialY: number } | null>(null);
  const resizeState = useRef<{ direction: ResizeDirection; startX: number; startY: number; initialW: number; initialH: number; initialX: number; initialY: number } | null>(null);

  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [hoveredButton, setHoveredButton] = useState<string | null>(null);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (isMobile) return;
      if ((e.target as HTMLElement).closest('[data-no-drag]')) return;
      e.preventDefault();
      focusWindow(win.id);

      if (win.isMaximized) return;

      dragState.current = {
        startX: e.clientX,
        startY: e.clientY,
        initialX: win.x,
        initialY: win.y,
      };
      setIsDragging(true);
    },
    [isMobile, win.id, win.x, win.y, win.isMaximized, focusWindow]
  );

  const handleResizeStart = useCallback(
    (e: React.MouseEvent, direction: ResizeDirection) => {
      e.preventDefault();
      e.stopPropagation();
      if (win.isMaximized || win.isMinimized) return;

      resizeState.current = {
        direction,
        startX: e.clientX,
        startY: e.clientY,
        initialW: win.width,
        initialH: win.height,
        initialX: win.x,
        initialY: win.y,
      };
      setIsResizing(true);
      bringToFront(win.id);
    },
    [win.id, win.width, win.height, win.x, win.y, win.isMaximized, win.isMinimized, bringToFront]
  );

  useEffect(() => {
    if (!isDragging && !isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (dragState.current && isDragging) {
        const dx = e.clientX - dragState.current.startX;
        const dy = e.clientY - dragState.current.startY;

        let newX = dragState.current.initialX + dx;
        let newY = dragState.current.initialY + dy;

        // Clamp to viewport - keep at least 40px visible
        const viewportW = window.innerWidth;
        const viewportH = window.innerHeight;
        newX = Math.max(40 - win.width, Math.min(newX, viewportW - 40));
        newY = Math.max(28, Math.min(newY, viewportH - 40));

        updateWindowPosition(win.id, newX, newY);
      }

      if (resizeState.current && isResizing) {
        const dx = e.clientX - resizeState.current.startX;
        const dy = e.clientY - resizeState.current.startY;
        const { direction, initialW, initialH, initialX, initialY } = resizeState.current;

        let newW = initialW;
        let newH = initialH;
        let newX = initialX;
        let newY = initialY;

        if (direction.includes('e')) newW = Math.max(280, initialW + dx);
        if (direction.includes('s')) newH = Math.max(200, initialH + dy);
        if (direction.includes('w')) {
          newW = Math.max(280, initialW - dx);
          newX = initialX + (initialW - newW);
        }
        if (direction.includes('n')) {
          newH = Math.max(200, initialH - dy);
          newY = initialY + (initialH - newH);
        }

        updateWindowSize(win.id, newW, newH);
        if (newX !== initialX) updateWindowPosition(win.id, newX, newY);
        if (newY !== initialY) updateWindowPosition(win.id, newX, newY);
      }
    };

    const handleMouseUp = () => {
      dragState.current = null;
      resizeState.current = null;
      setIsDragging(false);
      setIsResizing(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, isResizing, win.id, win.width, updateWindowPosition, updateWindowSize]);

  const handleClose = () => closeWindow(win.id);
  const handleMinimize = () => minimizeWindow(win.id);
  const handleMaximizeRestore = () => {
    if (win.isMaximized) restoreWindow(win.id);
    else maximizeWindow(win.id);
  };

  const isActive = win.isActive;

  // On mobile, the window is forced to fill the area between the StatusBar
  // and the Dock; drag / resize / non-fullscreen positioning are disabled.
  const mobileLayout = isMobile
    ? {
        left: 0,
        top: MOBILE_STATUSBAR_PX,
        width: '100vw' as const,
        height: `calc(100vh - ${MOBILE_STATUSBAR_PX + MOBILE_DOCK_PX}px)` as const,
        borderRadius: 0,
      }
    : null;

  return (
    <motion.div
      ref={frameRef}
      className="absolute flex flex-col will-change-transform"
      style={{
        left: mobileLayout ? mobileLayout.left : win.x,
        top: mobileLayout ? mobileLayout.top : win.y,
        width: mobileLayout ? mobileLayout.width : win.width,
        height: mobileLayout ? mobileLayout.height : win.height,
        zIndex: win.zIndex,
        borderRadius: mobileLayout ? mobileLayout.borderRadius : '8px',
        overflow: 'hidden',
        scale: isDragging ? 1.005 : 1,
      }}
      initial={{ scale: 0.92, opacity: 0 }}
      animate={{
        scale: win.isMinimized ? 0.15 : isDragging ? 1.005 : 1,
        opacity: win.isMinimized ? 0.2 : 1,
      }}
      exit={{ scale: 0.92, opacity: 0 }}
      transition={{
        scale: { duration: 0.25, ease: [0, 0, 0.2, 1] as [number, number, number, number] },
        opacity: { duration: 0.25 },
      }}
      onMouseDown={() => focusWindow(win.id)}
    >
      {/* Window border and background */}
      <div
        className="flex flex-col w-full h-full"
        style={{
          backgroundColor: isActive ? 'var(--ink-100)' : 'rgba(240, 235, 228, 0.65)',
          border: `1px solid ${isActive ? 'var(--ink-300)' : 'rgba(158,158,158,0.2)'}`,
          borderRadius: '8px',
          boxShadow: isActive ? 'var(--shadow-xl)' : 'var(--shadow-lg)',
          transition: 'background-color 0.15s, border-color 0.15s, box-shadow 0.15s',
        }}
      >
        {/* Title Bar */}
        <div
          className="flex items-center justify-between flex-shrink-0 cursor-move"
          style={{
            height: '36px',
            padding: '0 12px',
            backgroundColor: isActive ? 'var(--ink-100)' : 'rgba(232,228,223,0.7)',
            borderBottom: `1px solid ${isActive ? 'var(--ink-200)' : 'rgba(189,189,189,0.3)'}`,
            borderRadius: '8px 8px 0 0',
            transition: 'background-color 0.15s',
          }}
          onMouseDown={handleMouseDown}
        >
          {/* Left: icon + title */}
          <div className="flex items-center gap-2 overflow-hidden" style={{ maxWidth: '60%' }}>
            {app && (
              <span className="flex items-center justify-center" style={{ color: 'var(--ink-700)' }}>
                <AppIcon iconName={app.icon} size={14} />
              </span>
            )}
            <span
              className="text-body-md truncate"
              style={{
                color: isActive ? 'var(--ink-900)' : 'var(--ink-500)',
                fontWeight: 500,
                transition: 'color 0.15s',
              }}
            >
              {win.title}
            </span>
          </div>

          {/* Right: traffic light buttons */}
          <div data-no-drag className="flex items-center gap-1.5">
            {/* Minimize */}
            <button
              className="relative flex items-center justify-center rounded-full transition-colors"
              style={{
                width: isMobile ? '22px' : '12px',
                height: isMobile ? '22px' : '12px',
                backgroundColor: hoveredButton === 'min' ? '#b8a01a' : 'var(--ink-300)',
                cursor: 'pointer',
              }}
              onMouseEnter={() => setHoveredButton('min')}
              onMouseLeave={() => setHoveredButton(null)}
              onClick={(e) => {
                e.stopPropagation();
                handleMinimize();
              }}
            >
              {hoveredButton === 'min' && <Minus size={8} strokeWidth={2} className="text-white" />}
            </button>

            {/* Maximize / Restore */}
            <button
              className="relative flex items-center justify-center rounded-full transition-colors"
              style={{
                width: isMobile ? '22px' : '12px',
                height: isMobile ? '22px' : '12px',
                backgroundColor: hoveredButton === 'max' ? '#4a7c59' : 'var(--ink-300)',
                cursor: 'pointer',
              }}
              onMouseEnter={() => setHoveredButton('max')}
              onMouseLeave={() => setHoveredButton(null)}
              onClick={(e) => {
                e.stopPropagation();
                handleMaximizeRestore();
              }}
            >
              {hoveredButton === 'max' &&
                (win.isMaximized ? (
                  <Minimize2 size={8} strokeWidth={2} className="text-white" />
                ) : (
                  <Maximize2 size={8} strokeWidth={2} className="text-white" />
                ))}
            </button>

            {/* Close */}
            <button
              className="relative flex items-center justify-center rounded-full transition-colors"
              style={{
                width: isMobile ? '22px' : '12px',
                height: isMobile ? '22px' : '12px',
                backgroundColor: hoveredButton === 'close' ? 'var(--cinnabar-light)' : 'var(--cinnabar)',
                cursor: 'pointer',
              }}
              onMouseEnter={() => setHoveredButton('close')}
              onMouseLeave={() => setHoveredButton(null)}
              onClick={(e) => {
                e.stopPropagation();
                handleClose();
              }}
            >
              {hoveredButton === 'close' && <X size={8} strokeWidth={2.5} className="text-white" />}
            </button>
          </div>
        </div>

        {/* Window Content */}
        <div
          className="flex-1 overflow-hidden"
          style={{
            backgroundColor: isActive ? 'var(--ink-50)' : 'rgba(240, 235, 228, 0.8)',
            borderRadius: '0 0 8px 8px',
            transition: 'background-color 0.15s',
          }}
        >
          {children}
        </div>
      </div>

      {/* Resize handles */}
      {!win.isMaximized && !win.isMinimized && !isMobile && (
        <>
          {RESIZE_HANDLES.map(({ direction, className, cursor }) => (
            <div
              key={direction}
              className={`absolute ${className}`}
              style={{ cursor, zIndex: 10 }}
              onMouseDown={(e) => handleResizeStart(e, direction)}
            />
          ))}
          {/* Visual resize indicator (bottom-right corner) */}
          <div
            className="absolute bottom-1 right-1 pointer-events-none opacity-0 hover:opacity-100 transition-opacity"
            style={{
              width: '8px',
              height: '8px',
              borderRight: '2px solid var(--ink-400)',
              borderBottom: '2px solid var(--ink-400)',
              borderRadius: '0 0 2px 0',
            }}
          />
        </>
      )}
    </motion.div>
  );
}

// Helper: map icon names to Lucide components
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
  FileCode2 as FileCode2Icon,
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

const ICON_MAP: Record<string, React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>> = {
  FolderOpen, Terminal, Activity, Settings, Calculator, Calendar, Clock,
  Camera, StickyNote, Trash2, ListTodo, CloudSun, FileText, FileCode2Icon,
  Table2, Palette, GitFork, Presentation, BookOpen, Languages, Music,
  PlayCircle, Image, Mic, Images, Radio, Timer, Globe, Mail,
  MessageCircle, HardDriveUpload, Shield, Download, Rss, Bookmark,
  GitBranch, Braces, Search, Plug, Pipette, Code2, QrCode, KeyRound,
  CircleDot, Grid3X3, LayoutGrid, Grid2X2, Snail, Combine, Puzzle,
  BookMarked, NotebookPen, Waves, CheckCircle2,
};

function AppIcon({ iconName, size = 14 }: { iconName: string; size?: number }) {
  const Icon = ICON_MAP[iconName];
  if (!Icon) return <span style={{ fontSize: size }}>App</span>;
  return <Icon size={size} strokeWidth={1.5} />;
}

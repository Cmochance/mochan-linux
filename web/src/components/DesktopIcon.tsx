import { useState, useRef, useCallback, useEffect } from 'react';
import { motion } from 'framer-motion';
import type { DesktopIconData } from '@/stores/useDesktopStore';
import { useDesktopStore } from '@/stores/useDesktopStore';
import { useAppStore } from '@/stores/useAppStore';
import { useWindowStore } from '@/stores/useWindowStore';
import {
  FolderOpen,
  Terminal,
  Settings,
  Globe,
  StickyNote,
  Trash2,
  Calculator,
  Calendar,
} from 'lucide-react';

const DESKTOP_ICONS: Record<string, React.ComponentType<{ size?: number; strokeWidth?: number }>> = {
  filemanager: FolderOpen,
  terminal: Terminal,
  settings: Settings,
  browser: Globe,
  notes: StickyNote,
  trash: Trash2,
  calculator: Calculator,
  calendar: Calendar,
};

interface DesktopIconProps {
  icon: DesktopIconData;
}

export function DesktopIcon({ icon }: DesktopIconProps) {
  const updateIconPosition = useDesktopStore((s) => s.updateIconPosition);
  const getAppById = useAppStore((s) => s.getAppById);
  const openWindow = useWindowStore((s) => s.openWindow);

  const [isDragging, setIsDragging] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [isSelected, setIsSelected] = useState(false);
  const dragState = useRef<{ startX: number; startY: number; initialX: number; initialY: number } | null>(null);

  const app = getAppById(icon.appId);
  const Icon = app ? DESKTOP_ICONS[icon.appId] || FolderOpen : FolderOpen;

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsSelected(true);

      dragState.current = {
        startX: e.clientX,
        startY: e.clientY,
        initialX: icon.x,
        initialY: icon.y,
      };
      setIsDragging(true);
    },
    [icon.x, icon.y]
  );

  const handleDoubleClick = useCallback(() => {
    if (app) {
      openWindow(app.id, app.name);
    }
  }, [app, openWindow]);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!dragState.current) return;
      const dx = e.clientX - dragState.current.startX;
      const dy = e.clientY - dragState.current.startY;

      updateIconPosition(
        icon.id,
        dragState.current.initialX + dx,
        dragState.current.initialY + dy
      );
    };

    const handleMouseUp = () => {
      dragState.current = null;
      setIsDragging(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, icon.id, updateIconPosition]);

  // Deselect on click outside
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('[data-desktop-icon]')) {
        setIsSelected(false);
      }
    };
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, []);

  return (
    <motion.div
      data-desktop-icon
      className="absolute flex flex-col items-center gap-1 cursor-pointer select-none"
      style={{
        left: icon.x,
        top: icon.y,
        width: '96px',
      }}
      onMouseDown={handleMouseDown}
      onDoubleClick={handleDoubleClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      animate={{
        scale: isHovered && !isDragging ? 1.08 : 1,
      }}
      transition={{ duration: 0.08 }}
    >
      {/* Icon container */}
      <div
        className="flex items-center justify-center rounded-xl"
        style={{
          width: '56px',
          height: '56px',
          backgroundColor: isSelected
            ? 'rgba(45, 45, 45, 0.10)'
            : isHovered
            ? 'rgba(232, 228, 223, 0.95)'
            : 'rgba(232, 228, 223, 0.85)',
          borderLeft: isSelected ? '2px solid var(--cinnabar)' : '2px solid transparent',
          boxShadow: 'var(--shadow-sm)',
          transition: 'background-color 0.08s, border-color 0.08s',
        }}
      >
        <Icon size={28} strokeWidth={1.5} style={{ color: 'var(--ink-800)' }} />
      </div>

      {/* Label */}
      <span
        className="text-caption text-center desktop-icon-label px-1 rounded"
        style={{
          color: 'var(--ink-50)',
          maxWidth: '88px',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          textShadow: '0 1px 4px rgba(0,0,0,0.5)',
        }}
      >
        {icon.label}
      </span>
    </motion.div>
  );
}

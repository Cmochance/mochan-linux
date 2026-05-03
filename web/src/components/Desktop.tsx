import { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useDesktopStore } from '@/stores/useDesktopStore';
import { useAppStore } from '@/stores/useAppStore';
import { useSystemStore } from '@/stores/useSystemStore';
import { useWindowStore } from '@/stores/useWindowStore';
import { DesktopIcon } from './DesktopIcon';

export function Desktop() {
  const wallpaper = useDesktopStore((s) => s.wallpaper);
  const icons = useDesktopStore((s) => s.icons);
  const contextMenu = useDesktopStore((s) => s.contextMenu);
  const showContextMenu = useDesktopStore((s) => s.showContextMenu);
  const hideContextMenu = useDesktopStore((s) => s.hideContextMenu);
  const arrangeIcons = useDesktopStore((s) => s.arrangeIcons);
  const setWallpaper = useDesktopStore((s) => s.setWallpaper);
  const launchApp = useAppStore((s) => s.launchApp);
  const openWindow = useWindowStore((s) => s.openWindow);
  const addNotification = useSystemStore((s) => s.addNotification);

  const desktopRef = useRef<HTMLDivElement>(null);
  const [showGrid, setShowGrid] = useState(true);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const items = [
        {
          label: '新建',
          action: 'submenu',
          submenu: [
            { label: '文件夹', action: 'new-folder', icon: 'folder' },
            { label: '文本文档', action: 'new-text', icon: 'file' },
            { label: 'Markdown文档', action: 'new-md', icon: 'file' },
            { label: '便签', action: 'new-note', icon: 'note' },
          ],
        },
        { label: '刷新桌面', action: 'refresh', icon: 'refresh' },
        { label: '整理图标', action: 'arrange', icon: 'grid' },
        {
          label: `显示网格 ${showGrid ? '✓' : ''}`,
          action: 'toggle-grid',
          icon: 'grid',
        },
        {
          label: '更改壁纸',
          action: 'submenu',
          submenu: [
            { label: '山水画 (默认)', action: 'wallpaper-default', icon: 'image' },
            { label: '水墨飞溅', action: 'wallpaper-ink-splash', icon: 'image' },
            { label: '竹林', action: 'wallpaper-bamboo', icon: 'image' },
            { label: '荷花', action: 'wallpaper-lotus', icon: 'image' },
            { label: '书法', action: 'wallpaper-calligraphy', icon: 'image' },
          ],
        },
        { label: '显示设置', action: 'display-settings', icon: 'settings' },
      ];

      showContextMenu({ x: e.clientX, y: e.clientY, items });
    },
    [showContextMenu, showGrid]
  );

  const handleMenuAction = useCallback(
    (action: string) => {
      hideContextMenu();

      switch (action) {
        case 'refresh':
          addNotification({
            title: '桌面已刷新',
            message: '桌面图标已重新加载',
            type: 'info',
          });
          break;
        case 'arrange':
          arrangeIcons();
          break;
        case 'toggle-grid':
          setShowGrid((g) => !g);
          break;
        case 'display-settings':
          openWindow('settings', '设置');
          break;
        case 'wallpaper-default':
        case 'wallpaper-ink-splash':
        case 'wallpaper-bamboo':
        case 'wallpaper-lotus':
        case 'wallpaper-calligraphy':
          setWallpaper(action as Parameters<typeof setWallpaper>[0]);
          break;
        case 'new-folder':
        case 'new-text':
        case 'new-md':
        case 'new-note':
          addNotification({
            title: '新建文件',
            message: '功能开发中...',
            type: 'warning',
          });
          break;
        default:
          break;
      }
    },
    [hideContextMenu, arrangeIcons, setWallpaper, openWindow, addNotification]
  );

  // Close context menu on click outside
  useEffect(() => {
    const handleClick = () => hideContextMenu();
    if (contextMenu) {
      document.addEventListener('click', handleClick);
      return () => document.removeEventListener('click', handleClick);
    }
  }, [contextMenu, hideContextMenu]);

  return (
    <div
      ref={desktopRef}
      className="fixed inset-0"
      style={{
        top: '28px',
        bottom: '64px',
        backgroundImage: `url(./${wallpaper}.jpg)`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        zIndex: 0,
      }}
      onContextMenu={handleContextMenu}
      onClick={hideContextMenu}
    >
      {/* Desktop Icons */}
      <div className="absolute inset-0 p-6">
        {icons.map((icon) => (
          <DesktopIcon key={icon.id} icon={icon} />
        ))}
      </div>

      {/* Context Menu */}
      <AnimatePresence>
        {contextMenu && (
          <motion.div
            className="absolute glass-active rounded-md overflow-hidden py-1"
            style={{
              left: contextMenu.x,
              top: contextMenu.y,
              boxShadow: 'var(--shadow-md)',
              zIndex: 1100,
              minWidth: '180px',
            }}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.1 }}
            onClick={(e) => e.stopPropagation()}
          >
            {contextMenu.items.map((item, index) => (
              <div key={index}>
                {item.separator ? (
                  <div
                    className="my-1"
                    style={{
                      height: '1px',
                      backgroundColor: 'var(--ink-200)',
                    }}
                  />
                ) : item.submenu ? (
                  <div className="group relative">
                    <button
                      className="w-full text-left text-body-sm px-4 py-1.5 transition-colors flex items-center justify-between"
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
                    >
                      <span>{item.label}</span>
                      <span style={{ color: 'var(--ink-400)' }}>&rsaquo;</span>
                    </button>
                    {/* Submenu */}
                    <div
                      className="absolute left-full top-0 ml-0.5 glass-active rounded-md overflow-hidden py-1 hidden group-hover:block"
                      style={{
                        boxShadow: 'var(--shadow-md)',
                        minWidth: '160px',
                      }}
                    >
                      {item.submenu.map((sub, subIndex) => (
                        <button
                          key={subIndex}
                          className="w-full text-left text-body-sm px-4 py-1.5 transition-colors"
                          style={{ color: 'var(--ink-800)' }}
                          onClick={() => handleMenuAction(sub.action)}
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
                        >
                          {sub.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <button
                    className="w-full text-left text-body-sm px-4 py-1.5 transition-colors"
                    style={{ color: 'var(--ink-800)' }}
                    onClick={() => handleMenuAction(item.action)}
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
                  >
                    {item.label}
                  </button>
                )}
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

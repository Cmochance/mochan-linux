import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { format } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { useSystemStore } from '@/stores/useSystemStore';
import { useWindowStore } from '@/stores/useWindowStore';
import { useAuthStore } from '@/stores/useAuthStore';
import {
  Volume2,
  Volume1,
  VolumeX,
  Wifi,
  BatteryFull,
  BatteryMedium,
  BatteryLow,
  LogOut,
  User,
  KeyRound,
  Mail,
} from 'lucide-react';

export function StatusBar() {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [showCalendar, setShowCalendar] = useState(false);
  const [showVolume, setShowVolume] = useState(false);

  const language = useSystemStore((s) => s.language);
  const toggleLanguage = useSystemStore((s) => s.toggleLanguage);
  const username = useAuthStore((s) => s.username);
  const role = useAuthStore((s) => s.role);
  const logout = useAuthStore((s) => s.logout);
  const openWindow = useWindowStore((s) => s.openWindow);
  const [showUser, setShowUser] = useState(false);

  const openSettingsTab = (tab: 'account' | 'invites') => {
    setShowUser(false);
    openWindow('settings', '设置', { width: 920, height: 640, payload: { initialTab: tab } });
  };
  const volume = useSystemStore((s) => s.volume);
  const setVolume = useSystemStore((s) => s.setVolume);
  const launcherOpen = useSystemStore((s) => s.launcherOpen);
  const setLauncherOpen = useSystemStore((s) => s.setLauncherOpen);
  const windows = useWindowStore((s) => s.windows);
  const activeWindowId = useWindowStore((s) => s.activeWindowId);

  const activeWindow = windows.find((w) => w.id === activeWindowId);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const VolumeIcon = volume === 0 ? VolumeX : volume < 50 ? Volume1 : Volume2;

  const BatteryIcon = (() => {
    if (volume > 60) return BatteryFull;
    if (volume > 30) return BatteryMedium;
    return BatteryLow;
  })();

  return (
    <div
      className="fixed top-0 left-0 right-0 flex items-center justify-between px-2 glass"
      style={{
        height: '28px',
        zIndex: 2000,
        borderBottom: '1px solid var(--glass-border)',
      }}
    >
      {/* Left: App menu button */}
      <button
        className="flex items-center gap-1.5 px-3 h-full rounded transition-colors"
        style={{ color: 'var(--ink-800)' }}
        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--wash-light)')}
        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
        onClick={() => setLauncherOpen(!launcherOpen)}
      >
        <span className="font-display text-sm">墨</span>
        <span className="text-caption font-medium">Ink OS</span>
      </button>

      {/* Center: Active window title */}
      <div
        className="absolute left-1/2 -translate-x-1/2 text-caption font-medium truncate"
        style={{
          maxWidth: '200px',
          color: 'var(--ink-800)',
          opacity: activeWindow ? 1 : 0,
          transition: 'opacity 0.15s',
        }}
      >
        {activeWindow?.title}
      </div>

      {/* Right: System indicators */}
      <div className="flex items-center gap-2">
        {/* User / Logout */}
        <div className="relative">
          <button
            className="flex items-center gap-1 h-5 px-1.5 rounded transition-colors"
            style={{ color: 'var(--ink-700)' }}
            onClick={() => setShowUser((v) => !v)}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--wash-light)')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            <User size={14} strokeWidth={1.5} />
            {username && <span className="text-caption">{username}</span>}
          </button>

          <AnimatePresence>
            {showUser && (
              <motion.div
                className="absolute top-8 right-0 glass-active rounded-lg overflow-hidden"
                style={{ boxShadow: 'var(--shadow-md)', minWidth: '180px' }}
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.15 }}
              >
                <div
                  className="px-3 py-2 text-caption border-b"
                  style={{ color: 'var(--ink-500)', borderColor: 'var(--glass-border)' }}
                >
                  当前用户:{' '}
                  <span className="font-mono" style={{ color: 'var(--ink-800)' }}>
                    {username ?? '-'}
                  </span>
                </div>
                <button
                  className="w-full flex items-center gap-2 px-3 py-2 text-caption transition-colors"
                  style={{ color: 'var(--ink-700)' }}
                  onClick={() => openSettingsTab('account')}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--wash-light)')}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                >
                  <KeyRound size={14} strokeWidth={1.5} />
                  账户与密码
                </button>
                {role === 'admin' && (
                  <button
                    className="w-full flex items-center gap-2 px-3 py-2 text-caption transition-colors"
                    style={{ color: 'var(--ink-700)' }}
                    onClick={() => openSettingsTab('invites')}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--wash-light)')}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                  >
                    <Mail size={14} strokeWidth={1.5} />
                    邀请码管理
                  </button>
                )}
                <div className="border-t" style={{ borderColor: 'var(--glass-border)' }} />
                <button
                  className="w-full flex items-center gap-2 px-3 py-2 text-caption transition-colors"
                  style={{ color: 'var(--ink-700)' }}
                  onClick={async () => {
                    setShowUser(false);
                    await logout();
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--wash-light)')}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                >
                  <LogOut size={14} strokeWidth={1.5} />
                  退出登录
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Language */}
        <button
          className="text-caption font-medium px-1.5 h-5 rounded transition-colors"
          style={{ color: 'var(--ink-700)' }}
          onClick={toggleLanguage}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--wash-light)')}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
        >
          {language === 'zh' ? '中' : 'EN'}
        </button>

        {/* Volume */}
        <div className="relative">
          <button
            className="flex items-center h-full px-1 rounded transition-colors"
            onClick={() => setShowVolume(!showVolume)}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--wash-light)')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            <VolumeIcon size={14} strokeWidth={1.5} style={{ color: 'var(--ink-700)' }} />
          </button>

          <AnimatePresence>
            {showVolume && (
              <motion.div
                className="absolute top-8 right-0 glass-active rounded-lg p-3"
                style={{ boxShadow: 'var(--shadow-md)', width: '40px' }}
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.15 }}
              >
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={volume}
                  onChange={(e) => setVolume(Number(e.target.value))}
                  className="w-24 origin-center -rotate-90 absolute"
                  style={{
                    left: '-42px',
                    top: '66px',
                    accentColor: 'var(--cinnabar)',
                  }}
                />
                <div className="h-24" />
                <div className="text-center text-caption mt-1" style={{ color: 'var(--ink-600)' }}>
                  {volume}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Network */}
        <div className="flex items-center px-1">
          <Wifi size={14} strokeWidth={1.5} style={{ color: 'var(--ink-700)' }} />
        </div>

        {/* Battery */}
        <div className="flex items-center px-1">
          <BatteryIcon size={14} strokeWidth={1.5} style={{ color: 'var(--ink-700)' }} />
        </div>

        {/* Date & Time */}
        <div className="relative">
          <button
            className="text-caption font-medium px-1.5 h-5 rounded transition-colors"
            style={{ color: 'var(--ink-800)' }}
            onClick={() => setShowCalendar(!showCalendar)}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--wash-light)')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            {format(currentTime, 'yyyy年M月d日 E HH:mm', { locale: zhCN })}
          </button>

          <AnimatePresence>
            {showCalendar && (
              <motion.div
                className="absolute top-8 right-0 glass-active rounded-lg p-4"
                style={{ boxShadow: 'var(--shadow-lg)', width: '240px' }}
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.15 }}
              >
                <div className="text-heading-sm text-center mb-3" style={{ color: 'var(--ink-900)' }}>
                  {format(currentTime, 'yyyy年 M月', { locale: zhCN })}
                </div>
                <CalendarGrid date={currentTime} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

function CalendarGrid({ date }: { date: Date }) {
  const year = date.getFullYear();
  const month = date.getMonth();
  const today = date.getDate();

  const firstDayOfMonth = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const days = [];
  // Empty cells for days before the 1st
  for (let i = 0; i < firstDayOfMonth; i++) {
    days.push(null);
  }
  // Days of the month
  for (let i = 1; i <= daysInMonth; i++) {
    days.push(i);
  }

  const weekDays = ['日', '一', '二', '三', '四', '五', '六'];

  return (
    <div>
      {/* Weekday headers */}
      <div className="grid grid-cols-7 gap-1 mb-1">
        {weekDays.map((d) => (
          <div
            key={d}
            className="text-center text-caption font-medium"
            style={{ color: 'var(--ink-500)' }}
          >
            {d}
          </div>
        ))}
      </div>

      {/* Days */}
      <div className="grid grid-cols-7 gap-1">
        {days.map((day, i) => (
          <div
            key={i}
            className="text-center text-body-sm py-1 rounded"
            style={{
              color: day === today ? 'white' : day ? 'var(--ink-700)' : 'transparent',
              backgroundColor: day === today ? 'var(--cinnabar)' : 'transparent',
              fontWeight: day === today ? 600 : 400,
            }}
          >
            {day || ''}
          </div>
        ))}
      </div>
    </div>
  );
}

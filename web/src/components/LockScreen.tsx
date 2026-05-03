import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSystemStore } from '@/stores/useSystemStore';
import { useDesktopStore } from '@/stores/useDesktopStore';
import { format } from 'date-fns';
import { zhCN } from 'date-fns/locale';

export function LockScreen() {
  const setLocked = useSystemStore((s) => s.setLocked);
  const wallpaper = useDesktopStore((s) => s.wallpaper);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [slideUp, setSlideUp] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const handleUnlock = () => {
    setSlideUp(true);
    setTimeout(() => {
      setLocked(false);
      setSlideUp(false);
    }, 400);
  };

  return (
    <AnimatePresence>
      {!slideUp ? (
        <motion.div
          className="fixed inset-0 z-[5000] flex flex-col items-center justify-center cursor-pointer"
          style={{
            backgroundImage: `url(./${wallpaper}.jpg)`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
          onClick={handleUnlock}
          initial={{ y: 0 }}
          exit={{ y: '-100%' }}
          transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] as [number, number, number, number] }}
        >
          {/* Dark overlay */}
          <div
            className="absolute inset-0"
            style={{
              backgroundColor: 'rgba(26,26,26,0.55)',
              backdropFilter: 'blur(8px) brightness(0.4)',
              WebkitBackdropFilter: 'blur(8px) brightness(0.4)',
            }}
          />

          {/* Content */}
          <div className="relative z-10 flex flex-col items-center">
            {/* Time */}
            <div
              className="text-heading-lg"
              style={{
                fontSize: '48px',
                color: 'var(--ink-50)',
                fontFamily: "'Noto Serif SC', Georgia, serif",
              }}
            >
              {format(currentTime, 'HH:mm')}
            </div>

            {/* Date */}
            <div
              className="mt-2 text-heading-md"
              style={{ color: 'var(--ink-200)' }}
            >
              {format(currentTime, 'yyyy年M月d日 EEEE', { locale: zhCN })}
            </div>

            {/* Unlock prompt */}
            <motion.div
              className="mt-12 text-body-md"
              style={{ color: 'var(--ink-300)' }}
              animate={{ opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 2, repeat: Infinity }}
            >
              点击或按任意键解锁
            </motion.div>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSystemStore } from '@/stores/useSystemStore';

export function BootScreen() {
  const setBooted = useSystemStore((s) => s.setBooted);
  const [phase, setPhase] = useState<'logo' | 'text' | 'loading' | 'done'>('logo');
  const [exit, setExit] = useState(false);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase('text'), 200),
      setTimeout(() => setPhase('loading'), 400),
      setTimeout(() => setPhase('done'), 2400),
      setTimeout(() => setExit(true), 2600),
      setTimeout(() => setBooted(true), 2900),
    ];
    return () => timers.forEach(clearTimeout);
  }, [setBooted]);

  return (
    <AnimatePresence>
      {!exit && (
        <motion.div
          className="fixed inset-0 z-[9999] flex flex-col items-center justify-center"
          style={{ backgroundColor: 'var(--ink-900)' }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
        >
          {/* Logo Character */}
          <motion.div
            className="text-display-xl"
            style={{ color: 'var(--ink-50)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: phase === 'logo' ? 0 : 1 }}
            transition={{ duration: 0.4, ease: [0, 0, 0.2, 1] as [number, number, number, number] }}
          >
            <img
              src="./logo-ink-os.png"
              alt="墨"
              className="w-20 h-20 object-contain"
            />
          </motion.div>

          {/* Ink OS text */}
          <motion.div
            className="mt-4 font-english-display text-lg tracking-[0.15em]"
            style={{ color: 'var(--ink-400)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: phase === 'text' || phase === 'logo' ? 0 : 1 }}
            transition={{ duration: 0.4, ease: [0, 0, 0.2, 1] as [number, number, number, number] }}
          >
            Ink OS
          </motion.div>

          {/* Loading bar */}
          <motion.div
            className="mt-8 w-40 h-[2px] rounded-full overflow-hidden"
            style={{ backgroundColor: 'var(--ink-700)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: phase === 'loading' || phase === 'done' ? 1 : 0 }}
            transition={{ duration: 0.2 }}
          >
            <motion.div
              className="h-full rounded-full"
              style={{ backgroundColor: 'var(--cinnabar)' }}
              initial={{ width: '0%' }}
              animate={{ width: phase === 'done' ? '100%' : '85%' }}
              transition={{
                duration: phase === 'done' ? 0.2 : 1.8,
                ease: [0.25, 0.1, 0.25, 1] as [number, number, number, number],
              }}
            />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

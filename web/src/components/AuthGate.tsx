import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { format } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { useAuthStore } from '@/stores/useAuthStore';
import { useDesktopStore } from '@/stores/useDesktopStore';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { ApiError } from '@/lib/api';

export function AuthGate({ children }: { children: ReactNode }) {
  const status = useAuthStore((s) => s.status);
  const check = useAuthStore((s) => s.check);

  useEffect(() => {
    void check();
  }, [check]);

  if (status === 'unknown') {
    return <SessionSplash />;
  }
  if (status === 'unauthenticated') {
    return <LoginScreen />;
  }
  return <>{children}</>;
}

function SessionSplash() {
  const wallpaper = useDesktopStore((s) => s.wallpaper);
  return (
    <div
      className="fixed inset-0 z-[6000]"
      style={{
        backgroundImage: `url(./${wallpaper}.jpg)`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      <div
        className="absolute inset-0 flex items-center justify-center"
        style={{
          backgroundColor: 'rgba(26,26,26,0.65)',
          backdropFilter: 'blur(8px) brightness(0.4)',
          WebkitBackdropFilter: 'blur(8px) brightness(0.4)',
        }}
      >
        <div
          className="text-body-md"
          style={{ color: 'var(--ink-200)', fontFamily: "'Noto Serif SC', Georgia, serif" }}
        >
          正在确认会话…
        </div>
      </div>
    </div>
  );
}

function LoginScreen() {
  const wallpaper = useDesktopStore((s) => s.wallpaper);
  const login = useAuthStore((s) => s.login);
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      await login(username.trim(), password);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setError('账号或密码错误');
      } else if (err instanceof ApiError) {
        setError(`登录失败 (${err.status})`);
      } else {
        setError('网络错误,请重试');
      }
    } finally {
      setSubmitting(false);
      setPassword('');
    }
  };

  return (
    <motion.div
      className="fixed inset-0 z-[6000] flex flex-col items-center justify-center px-4"
      style={{
        backgroundImage: `url(./${wallpaper}.jpg)`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
    >
      <div
        className="absolute inset-0"
        style={{
          backgroundColor: 'rgba(26,26,26,0.65)',
          backdropFilter: 'blur(8px) brightness(0.45)',
          WebkitBackdropFilter: 'blur(8px) brightness(0.45)',
        }}
      />

      <div className="relative z-10 flex w-full max-w-sm flex-col items-center gap-8">
        <div className="flex flex-col items-center gap-1">
          <div
            style={{
              fontSize: '40px',
              color: 'var(--ink-50)',
              fontFamily: "'Noto Serif SC', Georgia, serif",
            }}
          >
            {format(now, 'HH:mm')}
          </div>
          <div className="text-body-sm" style={{ color: 'var(--ink-300)' }}>
            {format(now, 'yyyy年M月d日 EEEE', { locale: zhCN })}
          </div>
        </div>

        <div className="flex flex-col items-center">
          <div
            style={{
              fontSize: '24px',
              color: 'var(--ink-50)',
              fontFamily: "'Noto Serif SC', Georgia, serif",
              letterSpacing: '0.05em',
            }}
          >
            水墨 Linux
          </div>
          <div className="mt-1 text-body-xs" style={{ color: 'var(--ink-400)' }}>
            请登录以进入系统
          </div>
        </div>

        <form
          onSubmit={onSubmit}
          className="w-full rounded-2xl p-6 shadow-lg"
          style={{
            backgroundColor: 'rgba(26,26,26,0.55)',
            border: '1px solid rgba(255,255,255,0.08)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
          }}
        >
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="username" style={{ color: 'var(--ink-200)' }}>
                账号
              </Label>
              <Input
                id="username"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={submitting}
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="password" style={{ color: 'var(--ink-200)' }}>
                密码
              </Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={submitting}
                required
                autoFocus
              />
            </div>
            {error && (
              <div
                className="text-body-xs"
                style={{ color: '#f87171' }}
                role="alert"
              >
                {error}
              </div>
            )}
            <Button type="submit" disabled={submitting} className="mt-2">
              {submitting ? '验证中…' : '登录'}
            </Button>
          </div>
        </form>
      </div>
    </motion.div>
  );
}

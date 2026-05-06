import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { format } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { useAuthStore } from '@/stores/useAuthStore';
import { useDesktopStore } from '@/stores/useDesktopStore';
import { wallpaperUrl } from '@/lib/settings';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { ApiError, apiFetch } from '@/lib/api';

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
    return <AuthScreen />;
  }
  return <>{children}</>;
}

function AuthScreen() {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  return mode === 'login' ? (
    <LoginScreen onSwitchToRegister={() => setMode('register')} />
  ) : (
    <RegisterScreen onSwitchToLogin={() => setMode('login')} />
  );
}

function SessionSplash() {
  const wallpaper = useDesktopStore((s) => s.wallpaper);
  return (
    <div
      className="fixed inset-0 z-[6000]"
      style={{
        backgroundImage: `url(${wallpaperUrl(wallpaper)})`,
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

function LoginScreen({ onSwitchToRegister }: { onSwitchToRegister: () => void }) {
  const wallpaper = useDesktopStore((s) => s.wallpaper);
  const login = useAuthStore((s) => s.login);
  const [identifier, setIdentifier] = useState('admin');
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
      await login(identifier.trim(), password);
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
        backgroundImage: `url(${wallpaperUrl(wallpaper)})`,
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
              <Label htmlFor="identifier" style={{ color: 'var(--ink-200)' }}>
                账号或邮箱
              </Label>
              <Input
                id="identifier"
                autoComplete="username"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
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
            <button
              type="button"
              onClick={onSwitchToRegister}
              disabled={submitting}
              className="text-body-xs underline-offset-2 hover:underline"
              style={{ color: 'var(--ink-300)' }}
            >
              没有账号？凭邀请码注册
            </button>
          </div>
        </form>
      </div>
    </motion.div>
  );
}

function RegisterScreen({ onSwitchToLogin }: { onSwitchToLogin: () => void }) {
  const wallpaper = useDesktopStore((s) => s.wallpaper);
  const login = useAuthStore((s) => s.login);
  const [email, setEmail] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [code, setCode] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const sendCode = async () => {
    if (!email) {
      setError('请先填写邮箱');
      return;
    }
    setError(null);
    setInfo(null);
    try {
      const res = await apiFetch('/api/verify/send', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim(), purpose: 'register' }),
      });
      if (!res.ok) {
        const text = await res.text();
        if (res.status === 429) {
          const data = (() => { try { return JSON.parse(text) as { cooldown?: number }; } catch { return {}; } })();
          if (data.cooldown) setCooldown(data.cooldown);
          setError('请求太频繁,请稍后再试');
        } else if (res.status === 503) {
          setError('服务器尚未配置邮件服务');
        } else {
          setError(text || '验证码发送失败');
        }
        return;
      }
      const data = (await res.json()) as { cooldown?: number };
      setCooldown(data.cooldown ?? 60);
      setInfo('验证码已发送至邮箱,5 分钟内有效');
    } catch {
      setError('网络错误');
    }
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      const res = await apiFetch('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          username: username.trim(),
          email: email.trim(),
          password,
          code: code.trim(),
          invite_code: inviteCode.trim(),
        }),
      });
      if (!res.ok) {
        setError(await res.text());
        setSubmitting(false);
        return;
      }
      // Auto-login on success.
      await login(username.trim(), password);
    } catch (err) {
      setError(err instanceof Error ? err.message : '注册失败');
      setSubmitting(false);
    }
  };

  return (
    <motion.div
      className="fixed inset-0 z-[6000] flex flex-col items-center justify-center px-4"
      style={{
        backgroundImage: `url(${wallpaperUrl(wallpaper)})`,
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
      <div className="relative z-10 flex w-full max-w-sm flex-col items-center gap-6">
        <div
          style={{
            fontSize: '24px',
            color: 'var(--ink-50)',
            fontFamily: "'Noto Serif SC', Georgia, serif",
            letterSpacing: '0.05em',
          }}
        >
          注册账号
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
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="invite_code" style={{ color: 'var(--ink-200)' }}>邀请码</Label>
              <Input id="invite_code" value={inviteCode} onChange={(e) => setInviteCode(e.target.value)} disabled={submitting} required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email" style={{ color: 'var(--ink-200)' }}>邮箱</Label>
              <Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={submitting} required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="code" style={{ color: 'var(--ink-200)' }}>邮箱验证码</Label>
              <div className="flex gap-2">
                <Input id="code" inputMode="numeric" pattern="\d{6}" maxLength={6} value={code} onChange={(e) => setCode(e.target.value)} disabled={submitting} required />
                <Button type="button" variant="secondary" onClick={sendCode} disabled={submitting || cooldown > 0}>
                  {cooldown > 0 ? `${cooldown}s` : '发送'}
                </Button>
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="reg_username" style={{ color: 'var(--ink-200)' }}>用户名</Label>
              <Input id="reg_username" autoComplete="username" minLength={2} maxLength={50} value={username} onChange={(e) => setUsername(e.target.value)} disabled={submitting} required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="reg_password" style={{ color: 'var(--ink-200)' }}>密码</Label>
              <Input id="reg_password" type="password" autoComplete="new-password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} disabled={submitting} required />
            </div>
            {error && (<div className="text-body-xs" style={{ color: '#f87171' }} role="alert">{error}</div>)}
            {info && (<div className="text-body-xs" style={{ color: 'var(--ink-300)' }}>{info}</div>)}
            <Button type="submit" disabled={submitting} className="mt-2">
              {submitting ? '注册中…' : '注册并登录'}
            </Button>
            <button type="button" onClick={onSwitchToLogin} disabled={submitting} className="text-body-xs underline-offset-2 hover:underline" style={{ color: 'var(--ink-300)' }}>
              已有账号？返回登录
            </button>
          </div>
        </form>
      </div>
    </motion.div>
  );
}

import { useEffect, useRef, useState } from 'react';
import {
  Palette, Globe, Info, Image as ImageIcon, Upload, Trash2,
  Check, Server, Cpu, MemoryStick, HardDrive, Activity, ExternalLink,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSystemStore } from '@/stores/useSystemStore';
import { useDesktopStore } from '@/stores/useDesktopStore';
import { useAuthStore } from '@/stores/useAuthStore';
import { settingsClient, wallpaperUrl, type Wallpaper } from '@/lib/settings';
import { sysClient, formatBytes, formatUptime, type SysStat } from '@/lib/sys';
import { ApiError } from '@/lib/api';

type Tab = 'appearance' | 'language' | 'about';

export default function Settings() {
  const [tab, setTab] = useState<Tab>('appearance');

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'appearance', label: '外观', icon: <Palette className="h-4 w-4" /> },
    { id: 'language', label: '语言', icon: <Globe className="h-4 w-4" /> },
    { id: 'about', label: '关于', icon: <Info className="h-4 w-4" /> },
  ];

  return (
    <div className="flex h-full" style={{ backgroundColor: 'var(--ink-50)' }}>
      <nav
        className="flex w-44 shrink-0 flex-col gap-1 border-r p-3"
        style={{ borderColor: 'var(--ink-200)' }}
      >
        {tabs.map((t) => (
          <button
            key={t.id}
            className="flex items-center gap-2 rounded px-3 py-2 text-left text-sm"
            style={{
              backgroundColor: tab === t.id ? 'var(--ink-200)' : 'transparent',
              color: tab === t.id ? 'var(--ink-900)' : 'var(--ink-700)',
            }}
            onClick={() => setTab(t.id)}
          >
            {t.icon}
            <span>{t.label}</span>
          </button>
        ))}
      </nav>
      <div className="flex-1 overflow-auto p-6">
        {tab === 'appearance' && <AppearanceTab />}
        {tab === 'language' && <LanguageTab />}
        {tab === 'about' && <AboutTab />}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <div className="mb-2 text-sm font-medium" style={{ color: 'var(--ink-600)' }}>
        {title}
      </div>
      <div
        className="rounded-lg border p-4"
        style={{ borderColor: 'var(--ink-200)', backgroundColor: 'var(--ink-100)' }}
      >
        {children}
      </div>
    </div>
  );
}

// ----- Appearance: theme + wallpaper -----

function AppearanceTab() {
  const theme = useSystemStore((s) => s.theme);
  const setTheme = useSystemStore((s) => s.setTheme);
  const wallpaper = useDesktopStore((s) => s.wallpaper);
  const setWallpaper = useDesktopStore((s) => s.setWallpaper);

  const [wallpapers, setWallpapers] = useState<Wallpaper[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const refresh = async () => {
    setLoading(true);
    try {
      const r = await settingsClient.listWallpapers();
      setWallpapers(r.wallpapers);
      setError(null);
    } catch (e) {
      setError(toMsg(e));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void refresh();
  }, []);

  const onUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    try {
      await settingsClient.uploadWallpaper(files);
      void refresh();
    } catch (e) {
      setError(toMsg(e));
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const onDelete = async (w: Wallpaper) => {
    if (w.source !== 'user') return;
    if (!window.confirm(`删除壁纸 "${w.name}"?`)) return;
    try {
      await settingsClient.deleteWallpaper(w.name);
      if (wallpaper === w.name) setWallpaper('wallpaper-default' as never);
      void refresh();
    } catch (e) {
      setError(toMsg(e));
    }
  };

  return (
    <div>
      <Section title="主题">
        <div className="flex gap-2">
          {(['ink', 'dark', 'light'] as const).map((t) => (
            <Button
              key={t}
              variant={theme === t ? 'default' : 'outline'}
              size="sm"
              onClick={() => setTheme(t)}
            >
              {theme === t && <Check className="mr-1 h-3.5 w-3.5" />}
              {t === 'ink' ? '水墨' : t === 'dark' ? '夜色' : '宣纸'}
            </Button>
          ))}
        </div>
      </Section>

      <Section title="桌面壁纸">
        <div className="mb-3 flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => onUpload(e.target.files)}
          />
          <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()}>
            <Upload className="mr-1 h-3.5 w-3.5" />
            上传新壁纸
          </Button>
          <span className="text-xs" style={{ color: 'var(--ink-500)' }}>
            {wallpapers.length} 张可选 · 上传到 <span className="font-mono">/var/lib/mochan/wallpapers/</span>
          </span>
        </div>

        {error && (
          <div className="mb-3 rounded border border-red-300 bg-red-50 p-2 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="grid grid-cols-3 gap-3 md:grid-cols-4">
          {wallpapers.map((w) => {
            const url = w.source === 'bundled' ? wallpaperUrl(w.name) : w.url;
            const active = wallpaper === w.name;
            return (
              <button
                key={w.name}
                onClick={() => setWallpaper(w.name as never)}
                className="group relative overflow-hidden rounded border-2 transition-all"
                style={{
                  aspectRatio: '16/10',
                  borderColor: active ? 'var(--cinnabar)' : 'transparent',
                  backgroundColor: 'var(--ink-200)',
                }}
              >
                <img src={url} alt={w.name} className="h-full w-full object-cover" loading="lazy" />
                {active && (
                  <div
                    className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full"
                    style={{ backgroundColor: 'var(--cinnabar)' }}
                  >
                    <Check className="h-3 w-3 text-white" />
                  </div>
                )}
                {w.source === 'user' && (
                  <button
                    className="absolute left-1 top-1 hidden rounded bg-red-600 p-1 text-white group-hover:block"
                    title="删除"
                    onClick={(ev) => {
                      ev.stopPropagation();
                      void onDelete(w);
                    }}
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                )}
                <div
                  className="absolute bottom-0 left-0 right-0 truncate px-1.5 py-0.5 text-[10px]"
                  style={{ backgroundColor: 'rgba(0,0,0,0.6)', color: '#fff' }}
                >
                  {w.source === 'bundled' ? <ImageIcon className="mr-0.5 inline h-2.5 w-2.5" /> : null}
                  {w.name}
                </div>
              </button>
            );
          })}
          {wallpapers.length === 0 && !loading && (
            <div className="col-span-full text-sm" style={{ color: 'var(--ink-400)' }}>
              （未找到壁纸）
            </div>
          )}
        </div>
      </Section>
    </div>
  );
}

// ----- Language tab -----

function LanguageTab() {
  const language = useSystemStore((s) => s.language);
  const setLanguage = useSystemStore((s) => s.setLanguage);

  return (
    <div>
      <Section title="界面语言">
        <div className="flex gap-2">
          <Button variant={language === 'zh' ? 'default' : 'outline'} size="sm" onClick={() => setLanguage('zh')}>
            {language === 'zh' && <Check className="mr-1 h-3.5 w-3.5" />}
            中文
          </Button>
          <Button variant={language === 'en' ? 'default' : 'outline'} size="sm" onClick={() => setLanguage('en')}>
            {language === 'en' && <Check className="mr-1 h-3.5 w-3.5" />}
            English
          </Button>
        </div>
        <div className="mt-3 text-xs" style={{ color: 'var(--ink-500)' }}>
          目前桌面壳层只支持中文和英文,各应用内部的语言可能需要在应用内单独切换。
        </div>
      </Section>
    </div>
  );
}

// ----- About tab -----

function AboutTab() {
  const username = useAuthStore((s) => s.username);
  const [stat, setStat] = useState<SysStat | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void sysClient
      .stat()
      .then(setStat)
      .catch((e) => setError(toMsg(e)));
  }, []);

  return (
    <div>
      <Section title="关于本系统">
        <div className="flex items-start gap-4">
          <div
            className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl"
            style={{ backgroundColor: 'var(--ink-200)', color: 'var(--ink-700)' }}
          >
            <span className="text-3xl" style={{ fontFamily: "'Noto Serif SC', serif" }}>
              墨
            </span>
          </div>
          <div>
            <div className="text-xl font-medium" style={{ color: 'var(--ink-900)', fontFamily: "'Noto Serif SC', serif" }}>
              水墨 Linux
            </div>
            <div className="mt-1 text-sm" style={{ color: 'var(--ink-500)' }}>
              Self-hosted browser-accessible Linux workstation
            </div>
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <a
                href="https://github.com/Cmochance/mochan-linux"
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 rounded border px-2 py-1"
                style={{ borderColor: 'var(--ink-300)', color: 'var(--ink-700)' }}
              >
                <ExternalLink className="h-3 w-3" />
                GitHub
              </a>
              <a
                href="https://github.com/Cmochance/mochan-linux/releases"
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 rounded border px-2 py-1"
                style={{ borderColor: 'var(--ink-300)', color: 'var(--ink-700)' }}
              >
                <ExternalLink className="h-3 w-3" />
                Releases
              </a>
            </div>
          </div>
        </div>
      </Section>

      <Section title="主机信息">
        {error && <div className="text-sm text-red-600">{error}</div>}
        {!stat && !error && (
          <div className="text-sm" style={{ color: 'var(--ink-400)' }}>加载中…</div>
        )}
        {stat && (
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
            <KV icon={<Server className="h-3.5 w-3.5" />} k="主机名" v={stat.hostname} />
            <KV icon={<Server className="h-3.5 w-3.5" />} k="操作系统" v={stat.os} />
            <KV icon={<Server className="h-3.5 w-3.5" />} k="内核" v={stat.kernel} />
            <KV icon={<Cpu className="h-3.5 w-3.5" />} k="架构" v={stat.arch} />
            <KV icon={<Activity className="h-3.5 w-3.5" />} k="已运行" v={formatUptime(stat.uptime)} />
            <KV icon={<Cpu className="h-3.5 w-3.5" />} k="CPU 核数" v={String(stat.cpu_count)} />
            <KV icon={<MemoryStick className="h-3.5 w-3.5" />} k="内存" v={`${formatBytes(stat.mem_used)} / ${formatBytes(stat.mem_total)}`} />
            <KV icon={<HardDrive className="h-3.5 w-3.5" />} k="磁盘挂载" v={`${stat.disks.length} 个`} />
            <KV icon={<Activity className="h-3.5 w-3.5" />} k="负载" v={`${stat.load_1.toFixed(2)} / ${stat.load_5.toFixed(2)} / ${stat.load_15.toFixed(2)}`} />
            <KV icon={<Activity className="h-3.5 w-3.5" />} k="当前用户" v={username || '-'} />
          </div>
        )}
      </Section>
    </div>
  );
}

function KV({ icon, k, v }: { icon: React.ReactNode; k: string; v: string }) {
  return (
    <div className="flex items-center justify-between border-b border-dashed py-1" style={{ borderColor: 'var(--ink-200)' }}>
      <span className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--ink-500)' }}>
        {icon}
        {k}
      </span>
      <span className="font-mono text-xs tabular-nums" style={{ color: 'var(--ink-800)' }}>
        {v}
      </span>
    </div>
  );
}

function toMsg(e: unknown): string {
  if (e instanceof ApiError) return e.body || `错误 ${e.status}`;
  if (e instanceof Error) return e.message;
  return String(e);
}

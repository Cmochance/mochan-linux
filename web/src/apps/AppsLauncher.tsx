import { useEffect, useState } from 'react';
import { Loader2, Play, Square, RefreshCw, Terminal as TerminalIcon, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useWindowStore } from '@/stores/useWindowStore';
import { useAuthStore } from '@/stores/useAuthStore';
import { guiAppsClient, type DesktopApp, type GUISession } from '@/lib/guiapps';
import { ApiError } from '@/lib/api';

/**
 * Launcher for GUI Linux apps. Lists scanned .desktop entries plus a
 * free-form command field; clicking 启动 calls /api/gui/launch and
 * opens a GUIRunner window pointing at the new xpra session.
 *
 * Admin only: launching arbitrary commands runs them as root via xpra.
 */
export default function AppsLauncher() {
  const role = useAuthStore((s) => s.role);
  const openWindow = useWindowStore((s) => s.openWindow);
  const [apps, setApps] = useState<DesktopApp[]>([]);
  const [sessions, setSessions] = useState<GUISession[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [customCmd, setCustomCmd] = useState('');

  const refresh = async () => {
    setLoading(true);
    try {
      const [appsList, sessList] = await Promise.all([
        guiAppsClient.listApps(),
        guiAppsClient.listSessions(),
      ]);
      setApps(appsList);
      setSessions(sessList);
      setError(null);
    } catch (e) {
      setError(toMsg(e));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { void refresh(); }, []);

  const launch = async (command: string, displayName: string) => {
    if (!command.trim()) return;
    setBusy(command);
    setError(null);
    try {
      const sess = await guiAppsClient.launch(command.trim());
      openWindow('guirunner', `${displayName}`, {
        width: 1024,
        height: 720,
        payload: {
          sessionId: sess.id,
          sessionUrl: sess.url,
          command: sess.command,
        },
      });
      await refresh();
    } catch (e) {
      setError(toMsg(e));
    } finally {
      setBusy(null);
    }
  };

  const stop = async (id: string) => {
    setBusy(id);
    try {
      await guiAppsClient.stop(id);
      await refresh();
    } catch (e) {
      setError(toMsg(e));
    } finally {
      setBusy(null);
    }
  };

  if (role !== 'admin') {
    return (
      <div className="flex h-full items-center justify-center" style={{ backgroundColor: 'var(--ink-50)' }}>
        <div className="text-sm" style={{ color: 'var(--ink-500)' }}>
          仅管理员可启动 GUI 应用(因为会以 root 身份执行命令)。
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col" style={{ backgroundColor: 'var(--ink-50)' }}>
      <div className="flex items-center gap-2 border-b px-4 py-2"
           style={{ borderColor: 'var(--ink-200)', backgroundColor: 'var(--ink-100)' }}>
        <span className="text-sm font-medium" style={{ color: 'var(--ink-800)' }}>已装的 GUI 应用</span>
        <span className="text-xs" style={{ color: 'var(--ink-500)' }}>
          {apps.length} 个 · {sessions.length} 个运行中
        </span>
        <Button size="sm" variant="ghost" onClick={() => void refresh()} disabled={loading}>
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {error && (
        <div className="mx-4 mt-3 rounded border border-red-300 bg-red-50 p-2 text-xs text-red-700">
          <AlertCircle className="mr-1 inline h-3 w-3" />
          {error}
        </div>
      )}

      {/* Running sessions */}
      {sessions.length > 0 && (
        <div className="border-b px-4 py-2" style={{ borderColor: 'var(--ink-200)' }}>
          <div className="mb-1 text-xs" style={{ color: 'var(--ink-500)' }}>运行中</div>
          <div className="flex flex-wrap gap-2">
            {sessions.map((s) => (
              <div key={s.id} className="flex items-center gap-2 rounded border px-2 py-1"
                   style={{ borderColor: 'var(--ink-300)', backgroundColor: 'var(--ink-100)' }}>
                <span className="font-mono text-xs" style={{ color: 'var(--ink-700)' }}>
                  :{s.display}
                </span>
                <span className="max-w-[280px] truncate text-xs" style={{ color: 'var(--ink-700)' }}
                      title={s.command}>
                  {s.command}
                </span>
                <Button size="sm" variant="outline" onClick={() => void stop(s.id)} disabled={busy === s.id}>
                  <Square className="mr-1 h-3 w-3" />
                  停止
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* App grid */}
      <div className="flex-1 overflow-auto p-4">
        {loading && apps.length === 0 ? (
          <div className="flex h-full items-center justify-center gap-2 text-sm"
               style={{ color: 'var(--ink-500)' }}>
            <Loader2 className="h-4 w-4 animate-spin" /> 扫描 .desktop …
          </div>
        ) : apps.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm"
               style={{ color: 'var(--ink-500)' }}>
            未找到 GUI 应用,可在下面用自定义命令启动。
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
            {apps.map((a) => (
              <button
                key={a.id}
                onClick={() => void launch(a.exec, a.name)}
                disabled={busy === a.exec}
                className="flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-all hover:shadow-md disabled:opacity-50"
                style={{ borderColor: 'var(--ink-300)', backgroundColor: 'var(--ink-100)' }}
              >
                <div className="flex w-full items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium" style={{ color: 'var(--ink-800)' }}>
                    {a.name}
                  </span>
                  <Play className="h-3.5 w-3.5 shrink-0" style={{ color: 'var(--cinnabar)' }} />
                </div>
                <span className="line-clamp-2 text-xs" style={{ color: 'var(--ink-500)' }}>
                  {a.comment || a.exec}
                </span>
                <span className="truncate font-mono text-[10px]" style={{ color: 'var(--ink-400)' }}>
                  {a.id}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Custom command */}
      <div className="border-t p-3" style={{ borderColor: 'var(--ink-200)', backgroundColor: 'var(--ink-100)' }}>
        <Label htmlFor="custom_cmd" className="mb-1 flex items-center gap-1 text-xs"
               style={{ color: 'var(--ink-500)' }}>
          <TerminalIcon className="h-3 w-3" /> 自定义命令(以 root 身份在 xpra session 内运行)
        </Label>
        <div className="flex gap-2">
          <Input
            id="custom_cmd"
            value={customCmd}
            onChange={(e) => setCustomCmd(e.target.value)}
            placeholder='例如: codex-app-transfer 或 xterm -e "lazygit"'
            className="font-mono text-sm"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && customCmd.trim()) void launch(customCmd, customCmd);
            }}
          />
          <Button onClick={() => void launch(customCmd, customCmd)}
                  disabled={!customCmd.trim() || busy === customCmd}>
            <Play className="mr-1 h-3.5 w-3.5" />
            启动
          </Button>
        </div>
      </div>
    </div>
  );
}

function toMsg(e: unknown): string {
  if (e instanceof ApiError) return e.body || `HTTP ${e.status}`;
  if (e instanceof Error) return e.message;
  return String(e);
}

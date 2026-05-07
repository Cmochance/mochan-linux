import { useEffect, useState } from 'react';
import { Loader2, AlertCircle } from 'lucide-react';
import { useWindowStore } from '@/stores/useWindowStore';
import { guiAppsClient, type GUISession } from '@/lib/guiapps';

interface GUIRunnerPayload {
  sessionId?: string;
  sessionUrl?: string;
  command?: string;
}

interface GUIRunnerProps {
  windowId?: string;
}

/**
 * Full-bleed iframe pointing at /xpra/{id}/ — the xpra HTML5 client
 * served by the per-session reverse proxy. Closing the window stops
 * the underlying xpra session via /api/gui/sessions/{id}/stop.
 */
export default function GUIRunner({ windowId }: GUIRunnerProps) {
  const win = windowId ? useWindowStore.getState().getWindowById(windowId) : undefined;
  const closeWindow = useWindowStore((s) => s.closeWindow);
  const payload = (win?.payload ?? {}) as GUIRunnerPayload;
  const [session, setSession] = useState<GUISession | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Resolve the session: either pre-attached on payload, or kick off a
  // launch right now from the supplied command. We only do this once.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        if (payload.sessionId && payload.sessionUrl) {
          setSession({
            id: payload.sessionId,
            url: payload.sessionUrl,
            display: 0,
            port: 0,
            command: payload.command ?? '',
            unit_name: '',
            actor: '',
            started_at: '',
          });
          return;
        }
        if (payload.command) {
          const fresh = await guiAppsClient.launch(payload.command);
          if (alive) setSession(fresh);
        } else {
          setError('未提供 session 或启动命令');
        }
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Stop the xpra session when the window is being torn down. We tap
  // into useWindowStore.subscribe so we observe the window leaving the
  // store regardless of which path closed it (X button, dock action,
  // logout cascade, etc.).
  useEffect(() => {
    if (!session || !windowId) return;
    const unsub = useWindowStore.subscribe((state, prev) => {
      const wasOpen = prev.windows.some((w) => w.id === windowId);
      const isOpen = state.windows.some((w) => w.id === windowId);
      if (wasOpen && !isOpen) {
        // Fire-and-forget; we don't have a place to surface a cleanup error.
        void guiAppsClient.stop(session.id).catch(() => {});
      }
    });
    return () => unsub();
  }, [session, windowId]);

  if (error) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-3 p-6"
           style={{ backgroundColor: 'var(--ink-50)' }}>
        <AlertCircle size={36} style={{ color: 'var(--cinnabar)' }} />
        <div className="text-sm font-medium" style={{ color: 'var(--ink-800)' }}>
          GUI 会话启动失败
        </div>
        <div className="max-w-md text-center text-xs" style={{ color: 'var(--ink-500)' }}>
          {error}
        </div>
        <button
          className="mt-2 rounded px-3 py-1 text-xs"
          style={{ backgroundColor: 'var(--ink-800)', color: 'var(--ink-50)' }}
          onClick={() => windowId && closeWindow(windowId)}
        >
          关闭
        </button>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-3"
           style={{ backgroundColor: 'var(--ink-50)' }}>
        <Loader2 size={32} className="animate-spin" style={{ color: 'var(--ink-500)' }} />
        <div className="text-xs" style={{ color: 'var(--ink-500)' }}>
          {payload.command ? `正在启动 ${payload.command} …` : '连接中 …'}
        </div>
      </div>
    );
  }

  // xpra HTML5 client uses relative paths internally, so the iframe URL
  // MUST end with `/`. The session URL from the server already does.
  return (
    <iframe
      src={session.url}
      title={`GUI session ${session.id}`}
      className="h-full w-full"
      style={{ border: '0', backgroundColor: '#000' }}
      // Sandboxing: xpra HTML5 needs scripts + same-origin (it lives at
      // the same origin as the desktop) + form submission for its
      // settings UI. Pointer-lock would be nice but xpra-html5-3 doesn't
      // use it.
      sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
      allow="clipboard-read; clipboard-write"
    />
  );
}

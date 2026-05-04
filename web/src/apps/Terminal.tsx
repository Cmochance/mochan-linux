import { useEffect, useRef } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

const ENCODER = new TextEncoder();
const DECODER = new TextDecoder();

// Reconnect strategy: jittered exponential backoff, capped at MAX_BACKOFF_MS.
const FIRST_BACKOFF_MS = 600;
const MAX_BACKOFF_MS = 8000;
const BACKOFF_MULT = 1.6;

type CtlMsg = { type: 'attached'; session_id: string; cols: number; rows: number; buffer_len: number };

export default function Terminal() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = containerRef.current;
    if (!host) return;

    const term = new XTerm({
      cursorBlink: true,
      cursorStyle: 'bar',
      fontFamily:
        '"JetBrains Mono", "Fira Code", "SF Mono", Menlo, Consolas, "Courier New", monospace',
      fontSize: 13,
      lineHeight: 1.2,
      scrollback: 5000,
      allowProposedApi: true,
      theme: {
        background: '#1a1a1a',
        foreground: '#e8e8e8',
        cursor: '#9ec5fe',
        selectionBackground: '#3a3a3a',
        black: '#1a1a1a',
        red: '#ff6b6b',
        green: '#90ee90',
        yellow: '#ffd966',
        blue: '#7fb4f7',
        magenta: '#c39bd3',
        cyan: '#7fdbff',
        white: '#e8e8e8',
        brightBlack: '#5c5c5c',
        brightRed: '#ff8a8a',
        brightGreen: '#a8f0a8',
        brightYellow: '#ffe88a',
        brightBlue: '#a3c8f9',
        brightMagenta: '#d4b3e0',
        brightCyan: '#a3e8ff',
        brightWhite: '#ffffff',
      },
    });

    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(host);
    fit.fit();

    let sessionId =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID().replace(/-/g, '')
        : Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);

    let ws: WebSocket | null = null;
    let backoffMs = FIRST_BACKOFF_MS;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;
    let waitingForBuffer = 0; // bytes still expected in the replay before we resume normal output styling
    let attachedOnce = false;

    const writeStatus = (msg: string, color: string) => {
      term.write(`\r\n\x1b[2m\x1b[${color}m${msg}\x1b[0m\r\n`);
    };

    const connect = () => {
      if (cancelled) return;
      const wsScheme = location.protocol === 'https:' ? 'wss:' : 'ws:';
      const url = `${wsScheme}//${location.host}/ws/pty?session=${sessionId}&cols=${term.cols}&rows=${term.rows}`;
      ws = new WebSocket(url);
      ws.binaryType = 'arraybuffer';

      let opened = false;

      ws.onopen = () => {
        opened = true;
        backoffMs = FIRST_BACKOFF_MS;
        if (attachedOnce) writeStatus('[已重新连接]', '32');
        term.focus();
      };

      ws.onmessage = (ev) => {
        if (typeof ev.data === 'string') {
          // text frame = control message
          try {
            const msg = JSON.parse(ev.data) as CtlMsg;
            if (msg.type === 'attached') {
              if (msg.session_id) sessionId = msg.session_id;
              waitingForBuffer = msg.buffer_len;
              attachedOnce = true;
              if (msg.buffer_len > 0) {
                // The next binary frame is the replay; xterm will redraw fine
                // — TUIs almost always emit a CUP/CLEAR after a SIGWINCH or
                // mode change, which the new resize triggers anyway.
              }
            }
          } catch {
            // ignore malformed control frame
          }
          return;
        }
        if (ev.data instanceof ArrayBuffer) {
          const bytes = new Uint8Array(ev.data);
          if (waitingForBuffer > 0) {
            waitingForBuffer = Math.max(0, waitingForBuffer - bytes.length);
          }
          term.write(bytes);
        } else {
          term.write(DECODER.decode(ev.data as ArrayBuffer));
        }
      };

      ws.onerror = () => {
        if (!opened) writeStatus('[连接错误]', '31');
      };

      ws.onclose = (ev) => {
        if (cancelled) return;
        if (ev.code === 1000) {
          writeStatus('[会话结束]', '33');
          return;
        }
        // Schedule a reconnect.
        const wait = Math.min(MAX_BACKOFF_MS, backoffMs);
        backoffMs = Math.min(MAX_BACKOFF_MS, Math.floor(backoffMs * BACKOFF_MULT));
        writeStatus(`[连接断开,${Math.round(wait / 100) / 10}s 后重连…]`, '33');
        reconnectTimer = setTimeout(connect, wait);
      };
    };

    const dataDisp = term.onData((data) => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(ENCODER.encode(data));
      }
    });

    const resizeDisp = term.onResize(({ cols, rows }) => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'resize', cols, rows }));
      }
    });

    const ro = new ResizeObserver(() => {
      try {
        fit.fit();
      } catch {
        /* container detached */
      }
    });
    ro.observe(host);

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      ro.disconnect();
      dataDisp.dispose();
      resizeDisp.dispose();
      try {
        ws?.close();
      } catch {
        /* already closed */
      }
      term.dispose();
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="h-full w-full"
      style={{ backgroundColor: '#1a1a1a', padding: 8 }}
    />
  );
}

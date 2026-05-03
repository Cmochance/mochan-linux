import { useEffect, useRef } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

const ENCODER = new TextEncoder();

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

    const wsScheme = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${wsScheme}//${location.host}/ws/pty?cols=${term.cols}&rows=${term.rows}`;
    const ws = new WebSocket(url);
    ws.binaryType = 'arraybuffer';

    let opened = false;
    let closed = false;

    const writeStatus = (msg: string, color: string) => {
      term.write(`\r\n\x1b[2m\x1b[${color}m${msg}\x1b[0m\r\n`);
    };

    ws.onopen = () => {
      opened = true;
      term.focus();
    };

    ws.onmessage = (ev) => {
      if (ev.data instanceof ArrayBuffer) {
        term.write(new Uint8Array(ev.data));
      } else if (typeof ev.data === 'string') {
        term.write(ev.data);
      }
    };

    ws.onerror = () => {
      writeStatus('[连接错误]', '31');
    };
    ws.onclose = (ev) => {
      closed = true;
      if (ev.code === 1006) writeStatus('[连接异常断开]', '31');
      else if (!opened) writeStatus('[未能连接到服务器,请检查登录状态]', '31');
      else writeStatus('[会话已结束]', '33');
    };

    const dataDisp = term.onData((data) => {
      if (!closed && ws.readyState === WebSocket.OPEN) {
        ws.send(ENCODER.encode(data));
      }
    });

    const resizeDisp = term.onResize(({ cols, rows }) => {
      if (!closed && ws.readyState === WebSocket.OPEN) {
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

    return () => {
      ro.disconnect();
      dataDisp.dispose();
      resizeDisp.dispose();
      try {
        ws.close();
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

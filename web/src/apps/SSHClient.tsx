import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, Lock, RefreshCw, Terminal, Unlock, X } from 'lucide-react';

interface SSHClientProps {
  windowId?: string;
}

interface OutputLine {
  id: string;
  type: 'system' | 'output' | 'error' | 'input';
  text: string;
}

function wsURL(path: string): string {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}${path}`;
}

export default function SSHClient({ windowId: _windowId }: SSHClientProps) {
  const [host, setHost] = useState('');
  const [port, setPort] = useState('22');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [lines, setLines] = useState<OutputLine[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [lines]);

  const addLine = useCallback((type: OutputLine['type'], text: string) => {
    setLines(prev => [...prev, { id: `${Date.now()}-${Math.random()}`, type, text }].slice(-1000));
  }, []);

  const disconnect = useCallback(() => {
    wsRef.current?.send(JSON.stringify({ type: 'close' }));
    wsRef.current?.close();
    wsRef.current = null;
    setConnected(false);
    setConnecting(false);
    addLine('system', 'Connection closed.');
  }, [addLine]);

  useEffect(() => () => {
    wsRef.current?.close();
  }, []);

  const connect = () => {
    if (!host.trim() || !username.trim()) return;
    setConnecting(true);
    setLines([]);
    addLine('system', `Connecting to ${host}:${port || '22'} as ${username}...`);
    const ws = new WebSocket(wsURL('/ws/ssh'));
    wsRef.current = ws;
    ws.onopen = () => {
      ws.send(JSON.stringify({
        type: 'connect',
        host: host.trim(),
        port: Number(port) || 22,
        username: username.trim(),
        password,
        host_key_policy: 'session',
        cols: 100,
        rows: 30,
      }));
    };
    ws.onmessage = event => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'connected') {
          setConnected(true);
          setConnecting(false);
          addLine('system', 'SSH session connected. Host key policy: session-only.');
        } else if (msg.type === 'data') {
          String(msg.data || '').split(/\r?\n/).forEach((line, index, arr) => {
            if (line || index < arr.length - 1) addLine('output', line);
          });
        } else if (msg.type === 'error') {
          setConnected(false);
          setConnecting(false);
          addLine('error', msg.message || 'SSH error');
        } else if (msg.type === 'closed') {
          setConnected(false);
          setConnecting(false);
          addLine('system', msg.message || 'Session closed.');
        }
      } catch {
        addLine('output', String(event.data));
      }
    };
    ws.onerror = () => {
      setConnected(false);
      setConnecting(false);
      addLine('error', 'WebSocket connection failed.');
    };
    ws.onclose = () => {
      setConnected(false);
      setConnecting(false);
    };
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!connected || !inputValue.trim()) return;
    addLine('input', `$ ${inputValue}`);
    wsRef.current?.send(JSON.stringify({ type: 'input', data: `${inputValue}\n` }));
    setInputValue('');
  };

  return (
    <div className="w-full h-full flex flex-col" style={{ backgroundColor: '#242424', color: '#f0ebe4' }}>
      <div className="flex items-center gap-2 px-3 py-2" style={{ backgroundColor: '#1a1a1a', borderBottom: '1px solid #3d3d3d' }}>
        <Terminal size={16} style={{ color: connected ? '#4a7c59' : '#9e9e9e' }} />
        <span className="text-body-sm font-medium">SSH Client</span>
        <span className="text-caption" style={{ color: '#9e9e9e' }}>
          {connected ? `${username}@${host}:${port || '22'}` : 'Disconnected'}
        </span>
        <div className="flex-1" />
        {connected && (
          <button onClick={disconnect} className="flex items-center gap-1 px-3 py-1 rounded text-caption" style={{ backgroundColor: '#8f332a', color: '#fff' }}>
            <Unlock size={12} /> Disconnect
          </button>
        )}
      </div>

      {!connected && !connecting && lines.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="w-96 p-6 rounded-md" style={{ backgroundColor: '#333' }}>
            <div className="flex items-center gap-2 mb-5">
              <Terminal size={20} style={{ color: '#4a7c59' }} />
              <h2 className="text-heading-sm">SSH 连接 (SSH Connection)</h2>
            </div>
            <div className="space-y-3">
              <Field label="主机 (Host)" value={host} onChange={setHost} />
              <Field label="端口 (Port)" value={port} onChange={setPort} />
              <Field label="用户名 (Username)" value={username} onChange={setUsername} />
              <Field label="密码 (Password)" value={password} onChange={setPassword} type="password" />
              <div className="flex items-start gap-2 text-caption" style={{ color: '#c8c1b8' }}>
                <AlertCircle size={13} className="mt-0.5 flex-shrink-0" />
                <span>凭据只保存在当前会话内，主机密钥策略为 session-only，不会写入服务器磁盘。</span>
              </div>
              <button onClick={connect} disabled={!host.trim() || !username.trim()} className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded text-body-sm disabled:opacity-50" style={{ backgroundColor: '#4a7c59', color: '#f0ebe4' }}>
                <Lock size={14} /> Connect
              </button>
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="flex-1 overflow-auto p-3 font-mono text-sm">
            {lines.map(line => (
              <div key={line.id} style={{ color: line.type === 'error' ? '#e06c5f' : line.type === 'system' ? '#d8a94f' : line.type === 'input' ? '#74b083' : '#f0ebe4', whiteSpace: 'pre-wrap' }}>
                {line.text}
              </div>
            ))}
            {connecting && <div style={{ color: '#d8a94f' }}><RefreshCw size={12} className="inline animate-spin mr-1" /> Connecting...</div>}
            <div ref={scrollRef} />
          </div>
          {connected ? (
            <form onSubmit={submit} className="flex items-center gap-2 px-3 py-2" style={{ backgroundColor: '#1a1a1a', borderTop: '1px solid #3d3d3d' }}>
              <span className="font-mono text-sm" style={{ color: '#74b083' }}>$</span>
              <input value={inputValue} onChange={e => setInputValue(e.target.value)} className="flex-1 bg-transparent outline-none font-mono text-sm" style={{ color: '#f0ebe4' }} autoFocus spellCheck={false} />
            </form>
          ) : (
            <div className="flex items-center gap-2 px-3 py-2" style={{ backgroundColor: '#1a1a1a', borderTop: '1px solid #3d3d3d' }}>
              <button onClick={() => setLines([])} className="flex items-center gap-1 px-3 py-1 rounded text-caption hover:bg-white/10"><X size={12} /> Back</button>
              <button onClick={connect} disabled={connecting} className="flex items-center gap-1 px-3 py-1 rounded text-caption" style={{ backgroundColor: '#4a7c59', color: '#f0ebe4' }}><RefreshCw size={12} /> Reconnect</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Field({ label, value, onChange, type = 'text' }: { label: string; value: string; onChange: (value: string) => void; type?: string }) {
  return (
    <div>
      <label className="text-caption block mb-1" style={{ color: '#b8b0a8' }}>{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} className="w-full px-3 py-2 rounded text-body-sm outline-none" style={{ backgroundColor: '#242424', border: '1px solid #5c5c5c', color: '#f0ebe4' }} />
    </div>
  );
}

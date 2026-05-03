import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Terminal, Plus, X, Lock, RefreshCw,
  AlertCircle
} from 'lucide-react';

interface Session {
  id: string;
  host: string;
  port: string;
  username: string;
  connected: boolean;
  output: OutputLine[];
  currentDir: string;
  commandHistory: string[];
  historyIndex: number;
}

interface OutputLine {
  id: string;
  type: 'command' | 'output' | 'error' | 'system' | 'prompt';
  text: string;
}

interface FileNode {
  name: string;
  type: 'file' | 'dir';
  size: number;
  perms: string;
}

interface SSHClientProps {
  windowId?: string;
}

// Simulated remote file system
const REMOTE_FS: Record<string, FileNode[]> = {
  '/': [
    { name: 'bin', type: 'dir', size: 4096, perms: 'drwxr-xr-x' },
    { name: 'etc', type: 'dir', size: 4096, perms: 'drwxr-xr-x' },
    { name: 'home', type: 'dir', size: 4096, perms: 'drwxr-xr-x' },
    { name: 'tmp', type: 'dir', size: 4096, perms: 'drwxrwxrwt' },
    { name: 'usr', type: 'dir', size: 4096, perms: 'drwxr-xr-x' },
    { name: 'var', type: 'dir', size: 4096, perms: 'drwxr-xr-x' },
    { name: 'boot', type: 'dir', size: 4096, perms: 'drwxr-xr-x' },
    { name: 'README', type: 'file', size: 1024, perms: '-rw-r--r--' },
  ],
  '/home': [
    { name: 'ink', type: 'dir', size: 4096, perms: 'drwxr-xr-x' },
    { name: 'guest', type: 'dir', size: 4096, perms: 'drwxr-xr-x' },
  ],
  '/home/ink': [
    { name: 'documents', type: 'dir', size: 4096, perms: 'drwxr-xr-x' },
    { name: 'projects', type: 'dir', size: 4096, perms: 'drwxr-xr-x' },
    { name: '.bashrc', type: 'file', size: 2200, perms: '-rw-r--r--' },
    { name: '.profile', type: 'file', size: 807, perms: '-rw-r--r--' },
    { name: 'notes.txt', type: 'file', size: 1543, perms: '-rw-rw-r--' },
    { name: 'script.sh', type: 'file', size: 512, perms: '-rwxr-xr-x' },
  ],
  '/home/ink/documents': [
    { name: 'poetry.md', type: 'file', size: 3200, perms: '-rw-rw-r--' },
    { name: 'essay.md', type: 'file', size: 4800, perms: '-rw-rw-r--' },
    { name: 'todo.txt', type: 'file', size: 256, perms: '-rw-rw-r--' },
  ],
  '/home/ink/projects': [
    { name: 'ink-os', type: 'dir', size: 4096, perms: 'drwxr-xr-x' },
    { name: 'website', type: 'dir', size: 4096, perms: 'drwxr-xr-x' },
    { name: 'app.js', type: 'file', size: 4096, perms: '-rw-rw-r--' },
  ],
  '/etc': [
    { name: 'hosts', type: 'file', size: 253, perms: '-rw-r--r--' },
    { name: 'passwd', type: 'file', size: 1824, perms: '-rw-r--r--' },
    { name: 'nginx', type: 'dir', size: 4096, perms: 'drwxr-xr-x' },
    { name: 'ssh', type: 'dir', size: 4096, perms: 'drwxr-xr-x' },
  ],
  '/usr': [
    { name: 'bin', type: 'dir', size: 12288, perms: 'drwxr-xr-x' },
    { name: 'lib', type: 'dir', size: 4096, perms: 'drwxr-xr-x' },
    { name: 'share', type: 'dir', size: 4096, perms: 'drwxr-xr-x' },
  ],
  '/tmp': [
    { name: 'session.dat', type: 'file', size: 128, perms: '-rw-rw-rw-' },
    { name: 'cache', type: 'dir', size: 4096, perms: 'drwxrwxrwt' },
  ],
};

const FILE_CONTENTS: Record<string, string> = {
  '/home/ink/README': 'Welcome to Ink OS Remote Server\n================================\n\nThis is a simulated remote server environment.\nFeel free to explore the filesystem.\n',
  '/home/ink/notes.txt': '个人笔记\n========\n- 学习水墨画技法\n- 练习书法行书\n- 阅读《兰亭集序》\n- 准备诗会朗诵\n',
  '/home/ink/script.sh': '#!/bin/bash\necho "Hello from Ink OS!"\necho "Current date: $(date)"\n',
  '/home/ink/documents/poetry.md': '# 诗词集\n\n## 静夜思\n床前明月光，疑是地上霜。\n举头望明月，低头思故乡。\n\n## 登鹳雀楼\n白日依山尽，黄河入海流。\n欲穷千里目，更上一层楼。\n',
  '/home/ink/documents/essay.md': '# 水墨画论\n\n水墨画是中国传统绘画的重要组成部分，\n以墨色的浓淡干湿表现物象的阴阳向背。\n\n## 基本技法\n1. 勾勒 - 用线条勾勒轮廓\n2. 皴擦 - 表现纹理质感\n3. 点染 - 点缀和渲染\n4. 泼墨 - 大胆泼洒墨汁\n',
  '/home/ink/documents/todo.txt': '- [x] 完成山水画习作\n- [ ] 准备书法展览\n- [ ] 整理诗词集\n- [ ] 学习篆刻\n',
  '/home/ink/projects/app.js': 'const express = require("express");\nconst app = express();\n\napp.get("/", (req, res) => {\n  res.send("Welcome to Ink OS!");\n});\n\napp.listen(3000);\n',
  '/etc/hosts': '127.0.0.1   localhost\n::1         localhost\n192.168.1.100   ink-os.local\n',
};

let sessionCounter = 0;

function getPrompt(username: string, host: string, dir: string): string {
  const displayDir = dir === `/home/${username}` ? '~' : dir;
  return `[${username}@${host}:${displayDir}]$`;
}

export default function SSHClient({ windowId: _windowId }: SSHClientProps) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [host, setHost] = useState('shell.ink-os.local');
  const [port, setPort] = useState('22');
  const [username, setUsername] = useState('ink');
  const [password, setPassword] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  const activeSession = sessions.find(s => s.id === activeSessionId);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeSession?.output]);

  const addOutput = useCallback((sessionId: string, lines: OutputLine[]) => {
    setSessions(prev => prev.map(s => {
      if (s.id !== sessionId) return s;
      return { ...s, output: [...s.output, ...lines] };
    }));
  }, []);

  const executeCommand = useCallback((sessionId: string, cmd: string) => {
    const session = sessions.find(s => s.id === sessionId);
    if (!session) return;

    const trimmed = cmd.trim();
    const parts = trimmed.split(/\s+/);
    const command = parts[0];
    const args = parts.slice(1);

    const outputLines: OutputLine[] = [];

    switch (command) {
      case '':
        break;
      case 'ls': {
        const showAll = args.includes('-a') || args.includes('-la') || args.includes('-al');
        const showLong = args.includes('-l') || args.includes('-la') || args.includes('-al');
        const targetDir = args.find(a => !a.startsWith('-')) || session.currentDir;
        const resolvedDir = targetDir.startsWith('/') ? targetDir : `${session.currentDir}/${targetDir}`;
        const entries = REMOTE_FS[resolvedDir] || [];
        if (entries.length === 0 && !REMOTE_FS[resolvedDir]) {
          outputLines.push({ id: `o-${Date.now()}`, type: 'error', text: `ls: cannot access '${targetDir}': No such file or directory` });
        } else {
          for (const entry of entries) {
            if (!showAll && entry.name.startsWith('.')) continue;
            if (showLong) {
              outputLines.push({
                id: `o-${Date.now()}-${entry.name}`,
                type: 'output',
                text: `${entry.perms} 1 ${session.username} ${session.username} ${entry.size.toString().padStart(8)} Jan 15 09:00 ${entry.name}`
              });
            } else {
              outputLines.push({ id: `o-${Date.now()}-${entry.name}`, type: 'output', text: entry.name });
            }
          }
        }
        break;
      }
      case 'pwd':
        outputLines.push({ id: `o-${Date.now()}`, type: 'output', text: session.currentDir });
        break;
      case 'cd': {
        const target = args[0] || `/home/${session.username}`;
        let newDir: string;
        if (target === '~') {
          newDir = `/home/${session.username}`;
        } else if (target.startsWith('/')) {
          newDir = target;
        } else if (target === '..') {
          const parts = session.currentDir.split('/').filter(Boolean);
          parts.pop();
          newDir = '/' + parts.join('/');
          if (newDir === '/') newDir = '/';
        } else {
          newDir = session.currentDir === '/' ? `/${target}` : `${session.currentDir}/${target}`;
        }
        const entries = REMOTE_FS[newDir];
        if (entries) {
          setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, currentDir: newDir } : s));
        } else {
          outputLines.push({ id: `o-${Date.now()}`, type: 'error', text: `bash: cd: ${target}: No such file or directory` });
        }
        break;
      }
      case 'cat': {
        const target = args[0];
        if (!target) {
          outputLines.push({ id: `o-${Date.now()}`, type: 'error', text: 'cat: missing file operand' });
          break;
        }
        const filePath = target.startsWith('/') ? target : `${session.currentDir}/${target}`;
        const content = FILE_CONTENTS[filePath];
        if (content) {
          content.split('\n').forEach((line, i) => {
            outputLines.push({ id: `o-${Date.now()}-${i}`, type: 'output', text: line });
          });
        } else {
          const dirEntries = REMOTE_FS[filePath];
          if (dirEntries) {
            outputLines.push({ id: `o-${Date.now()}`, type: 'error', text: `cat: ${target}: Is a directory` });
          } else {
            outputLines.push({ id: `o-${Date.now()}`, type: 'error', text: `cat: ${target}: No such file or directory` });
          }
        }
        break;
      }
      case 'ps': {
        outputLines.push({ id: `o-${Date.now()}`, type: 'output', text: '  PID TTY          TIME CMD' });
        outputLines.push({ id: `o-1`, type: 'output', text: '    1 ?        00:00:01 systemd' });
        outputLines.push({ id: `o-2`, type: 'output', text: '  512 ?        00:00:03 nginx' });
        outputLines.push({ id: `o-3`, type: 'output', text: ` 1024 pts/0    00:00:00 bash` });
        outputLines.push({ id: `o-4`, type: 'output', text: ` 2048 pts/0    00:00:00 ${trimmed}` });
        break;
      }
      case 'top': {
        outputLines.push({ id: `o-${Date.now()}`, type: 'output', text: 'top - 09:00:00 up 15 days, 3:24, 1 user, load average: 0.12, 0.08, 0.05' });
        outputLines.push({ id: `o-1`, type: 'output', text: 'Tasks: 128 total,   1 running, 127 sleeping' });
        outputLines.push({ id: `o-2`, type: 'output', text: '%Cpu(s):  2.3 us,  1.0 sy,  0.0 ni, 96.7 id' });
        outputLines.push({ id: `o-3`, type: 'output', text: 'MiB Mem :   4096.0 total,   2048.0 free,   1024.0 used,   1024.0 buff/cache' });
        break;
      }
      case 'df': {
        outputLines.push({ id: `o-${Date.now()}`, type: 'output', text: 'Filesystem     1K-blocks     Used Available Use% Mounted on' });
        outputLines.push({ id: `o-1`, type: 'output', text: '/dev/sda1       10240000  3584000   6656000  35% /' });
        outputLines.push({ id: `o-2`, type: 'output', text: 'tmpfs             204800        0    204800   0% /dev/shm' });
        break;
      }
      case 'uname':
        if (args.includes('-a')) {
          outputLines.push({ id: `o-${Date.now()}`, type: 'output', text: 'Linux ink-os 5.15.0-ink #1 SMP PREEMPT x86_64 GNU/Linux' });
        } else {
          outputLines.push({ id: `o-${Date.now()}`, type: 'output', text: 'Linux' });
        }
        break;
      case 'whoami':
        outputLines.push({ id: `o-${Date.now()}`, type: 'output', text: session.username });
        break;
      case 'date':
        outputLines.push({ id: `o-${Date.now()}`, type: 'output', text: new Date().toUTCString() });
        break;
      case 'echo':
        outputLines.push({ id: `o-${Date.now()}`, type: 'output', text: args.join(' ') });
        break;
      case 'clear':
        setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, output: [] } : s));
        return;
      case 'mkdir': {
        const dirName = args[0];
        if (!dirName) {
          outputLines.push({ id: `o-${Date.now()}`, type: 'error', text: 'mkdir: missing operand' });
        } else {
          outputLines.push({ id: `o-${Date.now()}`, type: 'system', text: `Created directory: ${dirName}` });
        }
        break;
      }
      case 'rm': {
        const target = args[args.length - 1];
        if (!target) {
          outputLines.push({ id: `o-${Date.now()}`, type: 'error', text: 'rm: missing operand' });
        } else {
          outputLines.push({ id: `o-${Date.now()}`, type: 'system', text: `Removed: ${target}` });
        }
        break;
      }
      case 'chmod':
        outputLines.push({ id: `o-${Date.now()}`, type: 'system', text: 'Permissions updated.' });
        break;
      case 'ssh':
        outputLines.push({ id: `o-${Date.now()}`, type: 'error', text: 'Nested SSH connections are not supported in this simulation.' });
        break;
      case 'exit': {
        setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, connected: false } : s));
        outputLines.push({ id: `o-${Date.now()}`, type: 'system', text: 'Connection closed.' });
        break;
      }
      case 'help': {
        outputLines.push({ id: `o-${Date.now()}`, type: 'output', text: 'Available commands:' });
        const commands = ['ls [-la]', 'cd [dir]', 'pwd', 'cat <file>', 'ps', 'top', 'df', 'uname [-a]', 'whoami', 'date', 'echo <text>', 'mkdir <dir>', 'rm <file>', 'chmod', 'clear', 'exit', 'help'];
        outputLines.push({ id: `o-1`, type: 'output', text: commands.join('  ') });
        break;
      }
      default:
        outputLines.push({ id: `o-${Date.now()}`, type: 'error', text: `bash: ${command}: command not found` });
    }

    addOutput(sessionId, outputLines);
  }, [sessions, addOutput]);

  const connect = () => {
    setConnecting(true);
    setTimeout(() => {
      const id = `session-${++sessionCounter}`;
      const newSession: Session = {
        id,
        host,
        port,
        username,
        connected: true,
        currentDir: `/home/${username}`,
        commandHistory: [],
        historyIndex: -1,
        output: [
          { id: 's1', type: 'system', text: `Connecting to ${host} port ${port}...` },
          { id: 's2', type: 'system', text: 'Connection established.' },
          { id: 's3', type: 'system', text: `Authenticating as ${username}...` },
          { id: 's4', type: 'system', text: 'Authentication successful.' },
          { id: 's5', type: 'system', text: `Welcome to Ink OS Remote Server, ${username}!` },
          { id: 's6', type: 'system', text: 'Type "help" for available commands.' },
        ],
      };
      setSessions(prev => [...prev, newSession]);
      setActiveSessionId(id);
      setConnecting(false);
    }, 1500);
  };

  const closeSession = (sessionId: string) => {
    setSessions(prev => {
      const filtered = prev.filter(s => s.id !== sessionId);
      if (activeSessionId === sessionId) {
        setActiveSessionId(filtered.length > 0 ? filtered[filtered.length - 1].id : null);
      }
      return filtered;
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || !activeSession?.connected) return;

    const cmd = inputValue.trim();
    const prompt = getPrompt(activeSession.username, activeSession.host, activeSession.currentDir);

    addOutput(activeSessionId!, [
      { id: `p-${Date.now()}`, type: 'prompt', text: `${prompt} ${cmd}` },
    ]);

    executeCommand(activeSessionId!, cmd);

    setSessions(prev => prev.map(s =>
      s.id === activeSessionId
        ? { ...s, commandHistory: [...s.commandHistory, cmd], historyIndex: -1 }
        : s
    ));

    setInputValue('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!activeSession) return;
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      const newIndex = Math.min(activeSession.historyIndex + 1, activeSession.commandHistory.length - 1);
      if (newIndex >= 0 && newIndex < activeSession.commandHistory.length) {
        setSessions(prev => prev.map(s => s.id === activeSessionId ? { ...s, historyIndex: newIndex } : s));
        setInputValue(activeSession.commandHistory[activeSession.commandHistory.length - 1 - newIndex] || '');
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      const newIndex = Math.max(activeSession.historyIndex - 1, -1);
      setSessions(prev => prev.map(s => s.id === activeSessionId ? { ...s, historyIndex: newIndex } : s));
      setInputValue(newIndex >= 0 ? activeSession.commandHistory[activeSession.commandHistory.length - 1 - newIndex] : '');
    }
  };

  // Connection form (no active session)
  if (sessions.length === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center" style={{ backgroundColor: '#2d2d2d' }}>
        <div className="w-96 p-6 rounded-lg" style={{ backgroundColor: '#3d3d3d' }}>
          <div className="flex items-center gap-2 mb-5">
            <Terminal size={20} style={{ color: '#4a7c59' }} />
            <h2 className="text-heading-sm" style={{ color: '#f0ebe4' }}>SSH 连接 (SSH Connection)</h2>
          </div>
          <div className="space-y-3">
            <div>
              <label className="text-caption block mb-1" style={{ color: '#9e9e9e' }}>主机 (Host)</label>
              <input
                type="text"
                value={host}
                onChange={(e) => setHost(e.target.value)}
                className="w-full px-3 py-2 rounded text-body-sm outline-none"
                style={{ backgroundColor: '#2d2d2d', border: '1px solid #5c5c5c', color: '#f0ebe4' }}
              />
            </div>
            <div>
              <label className="text-caption block mb-1" style={{ color: '#9e9e9e' }}>端口 (Port)</label>
              <input
                type="text"
                value={port}
                onChange={(e) => setPort(e.target.value)}
                className="w-full px-3 py-2 rounded text-body-sm outline-none"
                style={{ backgroundColor: '#2d2d2d', border: '1px solid #5c5c5c', color: '#f0ebe4' }}
              />
            </div>
            <div>
              <label className="text-caption block mb-1" style={{ color: '#9e9e9e' }}>用户名 (Username)</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-3 py-2 rounded text-body-sm outline-none"
                style={{ backgroundColor: '#2d2d2d', border: '1px solid #5c5c5c', color: '#f0ebe4' }}
              />
            </div>
            <div>
              <label className="text-caption block mb-1" style={{ color: '#9e9e9e' }}>密码 (Password)</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 rounded text-body-sm outline-none"
                style={{ backgroundColor: '#2d2d2d', border: '1px solid #5c5c5c', color: '#f0ebe4' }}
                placeholder="可选 (Optional)"
              />
            </div>
            <button
              onClick={connect}
              disabled={connecting || !host.trim()}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded text-body-sm font-medium transition-all duration-150 hover:scale-[1.02] disabled:opacity-50"
              style={{ backgroundColor: '#4a7c59', color: '#f0ebe4' }}
            >
              {connecting ? <RefreshCw size={14} className="animate-spin" /> : <Lock size={14} />}
              {connecting ? '连接中... (Connecting...)' : '连接 (Connect)'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col" style={{ backgroundColor: '#2d2d2d' }}>
      {/* Session tabs */}
      <div className="flex items-center gap-1 px-2 overflow-x-auto flex-shrink-0" style={{ backgroundColor: '#1a1a1a', borderBottom: '1px solid #3d3d3d' }}>
        {sessions.map(session => (
          <div
            key={session.id}
            onClick={() => setActiveSessionId(session.id)}
            className="flex items-center gap-2 px-3 py-1.5 cursor-pointer transition-all duration-150"
            style={{
              backgroundColor: activeSessionId === session.id ? '#3d3d3d' : 'transparent',
              borderTop: activeSessionId === session.id ? '2px solid var(--cinnabar)' : '2px solid transparent',
            }}
          >
            <Terminal size={12} style={{ color: session.connected ? '#4a7c59' : '#7a7a7a' }} />
            <span className="text-caption truncate max-w-[120px]" style={{ color: activeSessionId === session.id ? '#f0ebe4' : '#9e9e9e' }}>
              {session.username}@{session.host}
            </span>
            <button
              onClick={(e) => { e.stopPropagation(); closeSession(session.id); }}
              className="p-0.5 rounded hover:bg-white/10"
            >
              <X size={10} style={{ color: '#9e9e9e' }} />
            </button>
          </div>
        ))}
        <button
          onClick={() => { setActiveSessionId(null); setSessions([]); }}
          className="p-1.5 rounded hover:bg-white/10 ml-1"
        >
          <Plus size={14} style={{ color: '#9e9e9e' }} />
        </button>
      </div>

      {/* Terminal output */}
      {activeSession && (
        <>
          <div className="flex-1 overflow-auto p-3 font-mono text-sm" style={{ backgroundColor: '#2d2d2d', color: '#f0ebe4' }}>
            {activeSession.output.map(line => (
              <div key={line.id} style={{
                color: line.type === 'error' ? '#c94a3f' : line.type === 'system' ? '#b8860b' : line.type === 'prompt' ? '#4a7c59' : '#f0ebe4',
              }}>
                {line.text}
              </div>
            ))}
            {activeSession.connected && (
              <div ref={scrollRef} />
            )}
            {!activeSession.connected && activeSession.output.length > 0 && (
              <div className="mt-4 flex items-center gap-2">
                <AlertCircle size={14} style={{ color: '#c94a3f' }} />
                <span style={{ color: '#9e9e9e' }}>连接已断开 (Disconnected)</span>
                <button
                  onClick={() => {
                    setHost(activeSession.host);
                    setPort(activeSession.port);
                    setUsername(activeSession.username);
                    connect();
                  }}
                  className="ml-2 px-3 py-1 rounded text-caption transition-all duration-150 hover:scale-105"
                  style={{ backgroundColor: '#4a7c59', color: '#f0ebe4' }}
                >
                  重新连接 (Reconnect)
                </button>
              </div>
            )}
          </div>

          {/* Input */}
          {activeSession.connected && (
            <form onSubmit={handleSubmit} className="flex items-center gap-2 px-3 py-2 flex-shrink-0" style={{ backgroundColor: '#1a1a1a', borderTop: '1px solid #3d3d3d' }}>
              <span className="text-mono-md whitespace-nowrap flex-shrink-0" style={{ color: '#4a7c59' }}>
                {getPrompt(activeSession.username, activeSession.host, activeSession.currentDir)}
              </span>
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                className="flex-1 bg-transparent outline-none font-mono text-sm"
                style={{ color: '#f0ebe4' }}
                autoFocus
                spellCheck={false}
              />
            </form>
          )}
        </>
      )}
    </div>
  );
}

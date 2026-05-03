import { useState, useCallback } from 'react';
import {
  Folder, File, RefreshCw, Trash2, Plus,
  HardDrive, Server, Upload, Download, X,
  ChevronRight, Lock, Unlock, Settings,
  CheckCircle
} from 'lucide-react';

interface FileItem {
  id: string;
  name: string;
  type: 'file' | 'folder';
  size: string;
  modified: string;
  parentId: string | null;
}

interface Transfer {
  id: string;
  fileName: string;
  direction: 'upload' | 'download';
  progress: number;
  status: 'queued' | 'transferring' | 'completed' | 'failed' | 'cancelled';
  speed: string;
  size: string;
}

interface FTPClientProps {
  windowId?: string;
}

const LOCAL_FILES: FileItem[] = [
  { id: 'root', name: '/', type: 'folder', size: '-', modified: '-', parentId: null },
  { id: 'l1', name: 'Documents', type: 'folder', size: '-', modified: '2024-01-15', parentId: 'root' },
  { id: 'l2', name: 'Pictures', type: 'folder', size: '-', modified: '2024-01-14', parentId: 'root' },
  { id: 'l3', name: 'Music', type: 'folder', size: '-', modified: '2024-01-13', parentId: 'root' },
  { id: 'l4', name: 'Downloads', type: 'folder', size: '-', modified: '2024-01-12', parentId: 'root' },
  { id: 'l5', name: 'readme.txt', type: 'file', size: '2.4 KB', modified: '2024-01-15', parentId: 'root' },
  { id: 'l6', name: 'notes.md', type: 'file', size: '8.1 KB', modified: '2024-01-14', parentId: 'root' },
  { id: 'l7', name: 'project_idea.txt', type: 'file', size: '1.2 KB', modified: '2024-01-10', parentId: 'l1' },
  { id: 'l8', name: 'budget.xlsx', type: 'file', size: '24 KB', modified: '2024-01-09', parentId: 'l1' },
  { id: 'l9', name: 'landscape.jpg', type: 'file', size: '3.2 MB', modified: '2024-01-08', parentId: 'l2' },
  { id: 'l10', name: 'portrait.png', type: 'file', size: '1.8 MB', modified: '2024-01-07', parentId: 'l2' },
  { id: 'l11', name: 'guqin.mp3', type: 'file', size: '12 MB', modified: '2024-01-06', parentId: 'l3' },
  { id: 'l12', name: 'ambient.mp3', type: 'file', size: '8.5 MB', modified: '2024-01-05', parentId: 'l3' },
];

const REMOTE_FILES: FileItem[] = [
  { id: 'rroot', name: '/', type: 'folder', size: '-', modified: '-', parentId: null },
  { id: 'r1', name: 'www', type: 'folder', size: '-', modified: '2024-01-15', parentId: 'rroot' },
  { id: 'r2', name: 'data', type: 'folder', size: '-', modified: '2024-01-14', parentId: 'rroot' },
  { id: 'r3', name: 'backup', type: 'folder', size: '-', modified: '2024-01-13', parentId: 'rroot' },
  { id: 'r4', name: 'public_html', type: 'folder', size: '-', modified: '2024-01-12', parentId: 'rroot' },
  { id: 'r5', name: 'index.html', type: 'file', size: '4.5 KB', modified: '2024-01-15', parentId: 'rroot' },
  { id: 'r6', name: 'config.ini', type: 'file', size: '1.2 KB', modified: '2024-01-14', parentId: 'rroot' },
  { id: 'r7', name: 'home.html', type: 'file', size: '8.2 KB', modified: '2024-01-11', parentId: 'r1' },
  { id: 'r8', name: 'about.html', type: 'file', size: '5.1 KB', modified: '2024-01-10', parentId: 'r1' },
  { id: 'r9', name: 'users.db', type: 'file', size: '256 KB', modified: '2024-01-09', parentId: 'r2' },
  { id: 'r10', name: 'backup_2024.zip', type: 'file', size: '45 MB', modified: '2024-01-08', parentId: 'r3' },
  { id: 'r11', name: 'style.css', type: 'file', size: '12 KB', modified: '2024-01-07', parentId: 'r4' },
  { id: 'r12', name: 'script.js', type: 'file', size: '28 KB', modified: '2024-01-06', parentId: 'r4' },
];

let transferIdCounter = 0;

export default function FTPClient({ windowId: _windowId }: FTPClientProps) {
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [host, setHost] = useState('demo.ink-os.local');
  const [port, setPort] = useState('21');
  const [username, setUsername] = useState('demo');
  const [, _setPassword] = useState('demo'); void _setPassword;
  const [localFiles] = useState<FileItem[]>(LOCAL_FILES);
  const [remoteFiles, setRemoteFiles] = useState<FileItem[]>(REMOTE_FILES);
  const [localCurrentFolder, setLocalCurrentFolder] = useState('root');
  const [remoteCurrentFolder, setRemoteCurrentFolder] = useState('rroot');
  const [selectedLocalFile, setSelectedLocalFile] = useState<string | null>(null);
  const [selectedRemoteFile, setSelectedRemoteFile] = useState<string | null>(null);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [logMessages, setLogMessages] = useState<string[]>([]);
  const [showSettings, setShowSettings] = useState(false);

  const addLog = useCallback((msg: string) => {
    setLogMessages(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev].slice(0, 50));
  }, []);

  const connect = () => {
    setConnecting(true);
    addLog(`正在连接到 ${host}:${port}...`);
    setTimeout(() => {
      setConnecting(false);
      setConnected(true);
      addLog(`已连接到 ${host}`);
      addLog(`用户 ${username} 登录成功`);
      addLog('当前目录: /');
    }, 1500);
  };

  const disconnect = () => {
    setConnected(false);
    addLog(`已断开与 ${host} 的连接`);
  };

  const getLocalChildren = (parentId: string) => localFiles.filter(f => f.parentId === parentId);
  const getRemoteChildren = (parentId: string) => remoteFiles.filter(f => f.parentId === parentId);

  const getBreadcrumbs = (files: FileItem[], currentId: string) => {
    const crumbs: FileItem[] = [];
    let curr = files.find(f => f.id === currentId);
    while (curr) {
      crumbs.unshift(curr);
      curr = curr.parentId ? files.find(f => f.id === curr!.parentId) : undefined;
    }
    return crumbs;
  };

  const addTransfer = (fileName: string, direction: 'upload' | 'download', size: string) => {
    const id = `transfer-${++transferIdCounter}`;
    const newTransfer: Transfer = {
      id,
      fileName,
      direction,
      progress: 0,
      status: 'queued',
      speed: '0 KB/s',
      size,
    };
    setTransfers(prev => [...prev, newTransfer]);
    addLog(`${direction === 'upload' ? '上传' : '下载'}: ${fileName}`);

    // Simulate transfer
    setTimeout(() => {
      setTransfers(prev => prev.map(t => t.id === id ? { ...t, status: 'transferring' as const, speed: `${(Math.random() * 5 + 1).toFixed(1)} MB/s` } : t));

      const interval = setInterval(() => {
        setTransfers(prev => {
          const t = prev.find(x => x.id === id);
          if (!t || t.status === 'cancelled') {
            clearInterval(interval);
            return prev;
          }
          const newProgress = t.progress + Math.random() * 20 + 5;
          if (newProgress >= 100) {
            clearInterval(interval);
            addLog(`${direction === 'upload' ? '上传' : '下载'}完成: ${fileName}`);
            return prev.map(x => x.id === id ? { ...x, progress: 100, status: 'completed' as const, speed: '0 KB/s' } : x);
          }
          return prev.map(x => x.id === id ? { ...x, progress: Math.min(newProgress, 99), speed: `${(Math.random() * 5 + 1).toFixed(1)} MB/s` } : x);
        });
      }, 500);
    }, 300);
  };

  const uploadFile = () => {
    if (!connected || !selectedLocalFile) return;
    const file = localFiles.find(f => f.id === selectedLocalFile);
    if (!file || file.type === 'folder') return;
    addTransfer(file.name, 'upload', file.size);
  };

  const downloadFile = () => {
    if (!connected || !selectedRemoteFile) return;
    const file = remoteFiles.find(f => f.id === selectedRemoteFile);
    if (!file || file.type === 'folder') return;
    addTransfer(file.name, 'download', file.size);
  };

  const cancelTransfer = (id: string) => {
    setTransfers(prev => prev.map(t => t.id === id ? { ...t, status: 'cancelled' as const } : t));
  };

  const deleteRemoteFile = () => {
    if (!connected || !selectedRemoteFile) return;
    const file = remoteFiles.find(f => f.id === selectedRemoteFile);
    if (!file) return;
    setRemoteFiles(prev => prev.filter(f => f.id !== selectedRemoteFile));
    setSelectedRemoteFile(null);
    addLog(`已删除: ${file.name}`);
  };

  const createRemoteFolder = () => {
    if (!connected) return;
    const name = prompt('文件夹名称 (Folder name):');
    if (!name) return;
    const newFolder: FileItem = {
      id: `rf-${Date.now()}`,
      name,
      type: 'folder',
      size: '-',
      modified: new Date().toISOString().split('T')[0],
      parentId: remoteCurrentFolder,
    };
    setRemoteFiles(prev => [...prev, newFolder]);
    addLog(`创建文件夹: ${name}`);
  };

  const localBreadcrumbs = getBreadcrumbs(localFiles, localCurrentFolder);
  const remoteBreadcrumbs = getBreadcrumbs(remoteFiles, remoteCurrentFolder);
  const localChildren = getLocalChildren(localCurrentFolder);
  const remoteChildren = getRemoteChildren(remoteCurrentFolder);

  const statusColors = {
    queued: 'var(--ink-400)',
    transferring: 'var(--cinnabar)',
    completed: 'var(--success)',
    failed: 'var(--cinnabar-light)',
    cancelled: 'var(--ink-300)',
  };

  return (
    <div className="w-full h-full flex flex-col" style={{ backgroundColor: 'var(--ink-50)' }}>
      {/* Connection bar */}
      <div className="flex items-center gap-3 px-4 py-2 flex-shrink-0" style={{ backgroundColor: 'var(--ink-100)', borderBottom: '1px solid var(--ink-200)' }}>
        {connected ? (
          <>
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: 'var(--success)' }} />
              <span className="text-caption" style={{ color: 'var(--success)' }}>已连接 (Connected)</span>
            </div>
            <span className="text-caption" style={{ color: 'var(--ink-500)' }}>{host}:{port}</span>
            <span className="text-caption" style={{ color: 'var(--ink-400)' }}>用户: {username}</span>
          </>
        ) : (
          <>
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: 'var(--cinnabar)' }} />
              <span className="text-caption" style={{ color: 'var(--cinnabar)' }}>未连接 (Disconnected)</span>
            </div>
          </>
        )}
        <div className="ml-auto flex items-center gap-2">
          {!connected ? (
            <>
              <input
                type="text"
                value={host}
                onChange={(e) => setHost(e.target.value)}
                placeholder="主机 (Host)"
                className="px-2 py-1 rounded text-caption outline-none w-32"
                style={{ backgroundColor: 'var(--ink-50)', border: '1px solid var(--ink-200)', color: 'var(--ink-700)' }}
              />
              <input
                type="text"
                value={port}
                onChange={(e) => setPort(e.target.value)}
                placeholder="端口 (Port)"
                className="px-2 py-1 rounded text-caption outline-none w-16"
                style={{ backgroundColor: 'var(--ink-50)', border: '1px solid var(--ink-200)', color: 'var(--ink-700)' }}
              />
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="用户名 (User)"
                className="px-2 py-1 rounded text-caption outline-none w-20"
                style={{ backgroundColor: 'var(--ink-50)', border: '1px solid var(--ink-200)', color: 'var(--ink-700)' }}
              />
              <button
                onClick={connect}
                disabled={connecting}
                className="flex items-center gap-1 px-3 py-1 rounded text-caption transition-all duration-150 hover:scale-[1.02] disabled:opacity-50"
                style={{ backgroundColor: 'var(--ink-800)', color: 'var(--ink-50)' }}
              >
                {connecting ? <RefreshCw size={12} className="animate-spin" /> : <Lock size={12} />}
                {connecting ? '连接中...' : '连接 (Connect)'}
              </button>
            </>
          ) : (
            <button
              onClick={disconnect}
              className="flex items-center gap-1 px-3 py-1 rounded text-caption transition-all duration-150 hover:scale-[1.02]"
              style={{ backgroundColor: 'var(--cinnabar)', color: 'white' }}
            >
              <Unlock size={12} />
              断开 (Disconnect)
            </button>
          )}
        </div>
      </div>

      {/* Action toolbar */}
      <div className="flex items-center gap-2 px-4 py-1.5 flex-shrink-0" style={{ backgroundColor: 'var(--ink-100)', borderBottom: '1px solid var(--ink-200)' }}>
        <button
          onClick={uploadFile}
          disabled={!connected || !selectedLocalFile}
          className="flex items-center gap-1 px-2 py-1 rounded text-caption transition-all duration-150 hover:bg-black/5 disabled:opacity-40"
          style={{ color: 'var(--ink-600)' }}
        >
          <Upload size={14} /> 上传 (Upload)
        </button>
        <button
          onClick={downloadFile}
          disabled={!connected || !selectedRemoteFile}
          className="flex items-center gap-1 px-2 py-1 rounded text-caption transition-all duration-150 hover:bg-black/5 disabled:opacity-40"
          style={{ color: 'var(--ink-600)' }}
        >
          <Download size={14} /> 下载 (Download)
        </button>
        <button
          onClick={deleteRemoteFile}
          disabled={!connected || !selectedRemoteFile}
          className="flex items-center gap-1 px-2 py-1 rounded text-caption transition-all duration-150 hover:bg-black/5 disabled:opacity-40"
          style={{ color: 'var(--error)' }}
        >
          <Trash2 size={14} /> 删除 (Delete)
        </button>
        <button
          onClick={createRemoteFolder}
          disabled={!connected}
          className="flex items-center gap-1 px-2 py-1 rounded text-caption transition-all duration-150 hover:bg-black/5 disabled:opacity-40"
          style={{ color: 'var(--ink-600)' }}
        >
          <Plus size={14} /> 新建文件夹 (New Folder)
        </button>
        <button
          onClick={() => setShowSettings(!showSettings)}
          className="flex items-center gap-1 px-2 py-1 rounded text-caption transition-all duration-150 hover:bg-black/5 ml-auto"
          style={{ color: 'var(--ink-600)' }}
        >
          <Settings size={14} /> 设置 (Settings)
        </button>
      </div>

      {/* Dual pane */}
      <div className="flex flex-1 overflow-hidden">
        {/* Local pane */}
        <div className="flex-1 flex flex-col overflow-hidden" style={{ borderRight: '1px solid var(--ink-200)' }}>
          <div className="flex items-center gap-2 px-3 py-1.5 flex-shrink-0" style={{ backgroundColor: 'var(--ink-100)', borderBottom: '1px solid var(--ink-200)' }}>
            <HardDrive size={14} style={{ color: 'var(--ink-600)' }} />
            <span className="text-caption font-medium" style={{ color: 'var(--ink-700)' }}>本地 (Local)</span>
            <div className="flex items-center gap-1 ml-2 text-caption" style={{ color: 'var(--ink-500)' }}>
              {localBreadcrumbs.map((crumb, i) => (
                <button key={crumb.id} onClick={() => setLocalCurrentFolder(crumb.id)} className="hover:underline flex items-center gap-0.5">
                  {i > 0 && <ChevronRight size={10} />}
                  {crumb.name}
                </button>
              ))}
            </div>
          </div>
          <div className="flex-1 overflow-auto">
            <table className="w-full">
              <thead>
                <tr style={{ backgroundColor: 'var(--ink-100)' }}>
                  <th className="text-left text-caption px-3 py-1 font-medium" style={{ color: 'var(--ink-500)' }}>名称</th>
                  <th className="text-left text-caption px-3 py-1 font-medium w-24" style={{ color: 'var(--ink-500)' }}>大小</th>
                  <th className="text-left text-caption px-3 py-1 font-medium w-28" style={{ color: 'var(--ink-500)' }}>修改日期</th>
                </tr>
              </thead>
              <tbody>
                {localChildren.map(file => (
                  <tr
                    key={file.id}
                    onClick={() => setSelectedLocalFile(file.id)}
                    onDoubleClick={() => file.type === 'folder' && setLocalCurrentFolder(file.id)}
                    className="cursor-pointer transition-all duration-150"
                    style={{
                      backgroundColor: selectedLocalFile === file.id ? 'var(--wash-light)' : 'transparent',
                    }}
                  >
                    <td className="px-3 py-1.5 flex items-center gap-2">
                      {file.type === 'folder' ? (
                        <Folder size={14} style={{ color: '#b8860b' }} />
                      ) : (
                        <File size={14} style={{ color: 'var(--ink-500)' }} />
                      )}
                      <span className="text-body-sm" style={{ color: 'var(--ink-700)' }}>{file.name}</span>
                    </td>
                    <td className="px-3 py-1.5 text-caption" style={{ color: 'var(--ink-500)' }}>{file.size}</td>
                    <td className="px-3 py-1.5 text-caption" style={{ color: 'var(--ink-400)' }}>{file.modified}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Remote pane */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-1.5 flex-shrink-0" style={{ backgroundColor: 'var(--ink-100)', borderBottom: '1px solid var(--ink-200)' }}>
            <Server size={14} style={{ color: 'var(--ink-600)' }} />
            <span className="text-caption font-medium" style={{ color: 'var(--ink-700)' }}>远程 (Remote)</span>
            <div className="flex items-center gap-1 ml-2 text-caption" style={{ color: 'var(--ink-500)' }}>
              {remoteBreadcrumbs.map((crumb, i) => (
                <button key={crumb.id} onClick={() => setRemoteCurrentFolder(crumb.id)} className="hover:underline flex items-center gap-0.5">
                  {i > 0 && <ChevronRight size={10} />}
                  {crumb.name}
                </button>
              ))}
            </div>
          </div>
          <div className="flex-1 overflow-auto">
            {!connected ? (
              <div className="flex flex-col items-center justify-center h-full gap-2">
                <Server size={32} style={{ color: 'var(--ink-300)' }} />
                <span className="text-body-sm" style={{ color: 'var(--ink-400)' }}>未连接 (Not Connected)</span>
              </div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr style={{ backgroundColor: 'var(--ink-100)' }}>
                    <th className="text-left text-caption px-3 py-1 font-medium" style={{ color: 'var(--ink-500)' }}>名称</th>
                    <th className="text-left text-caption px-3 py-1 font-medium w-24" style={{ color: 'var(--ink-500)' }}>大小</th>
                    <th className="text-left text-caption px-3 py-1 font-medium w-28" style={{ color: 'var(--ink-500)' }}>修改日期</th>
                  </tr>
                </thead>
                <tbody>
                  {remoteChildren.map(file => (
                    <tr
                      key={file.id}
                      onClick={() => setSelectedRemoteFile(file.id)}
                      onDoubleClick={() => file.type === 'folder' && setRemoteCurrentFolder(file.id)}
                      className="cursor-pointer transition-all duration-150"
                      style={{
                        backgroundColor: selectedRemoteFile === file.id ? 'var(--wash-light)' : 'transparent',
                      }}
                    >
                      <td className="px-3 py-1.5 flex items-center gap-2">
                        {file.type === 'folder' ? (
                          <Folder size={14} style={{ color: '#b8860b' }} />
                        ) : (
                          <File size={14} style={{ color: 'var(--ink-500)' }} />
                        )}
                        <span className="text-body-sm" style={{ color: 'var(--ink-700)' }}>{file.name}</span>
                      </td>
                      <td className="px-3 py-1.5 text-caption" style={{ color: 'var(--ink-500)' }}>{file.size}</td>
                      <td className="px-3 py-1.5 text-caption" style={{ color: 'var(--ink-400)' }}>{file.modified}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* Transfer queue */}
      <div className="h-28 flex-shrink-0 flex flex-col" style={{ backgroundColor: 'var(--ink-100)', borderTop: '1px solid var(--ink-200)' }}>
        <div className="flex items-center justify-between px-3 py-1 flex-shrink-0" style={{ borderBottom: '1px solid var(--ink-200)' }}>
          <span className="text-caption font-medium" style={{ color: 'var(--ink-600)' }}>传输队列 (Transfer Queue)</span>
          <span className="text-caption" style={{ color: 'var(--ink-400)' }}>{transfers.filter(t => t.status === 'transferring').length} 进行中</span>
        </div>
        <div className="flex-1 overflow-auto">
          {transfers.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <span className="text-caption" style={{ color: 'var(--ink-400)' }}>暂无传输任务 (No transfers)</span>
            </div>
          ) : (
            transfers.map(t => (
              <div key={t.id} className="flex items-center gap-3 px-3 py-1.5" style={{ borderBottom: '1px solid var(--ink-200)' }}>
                {t.direction === 'upload' ? <Upload size={12} style={{ color: 'var(--ink-500)' }} /> : <Download size={12} style={{ color: 'var(--ink-500)' }} />}
                <span className="text-caption w-32 truncate" style={{ color: 'var(--ink-700)' }}>{t.fileName}</span>
                <span className="text-caption w-14" style={{ color: 'var(--ink-400)' }}>{t.size}</span>
                <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--ink-200)' }}>
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${t.progress}%`,
                      backgroundColor: t.status === 'completed' ? 'var(--success)' : t.status === 'failed' ? 'var(--cinnabar-light)' : 'var(--cinnabar)',
                    }}
                  />
                </div>
                <span className="text-caption w-16 text-right" style={{ color: statusColors[t.status] }}>{Math.round(t.progress)}%</span>
                <span className="text-caption w-20 text-right" style={{ color: 'var(--ink-500)' }}>{t.speed}</span>
                {t.status === 'transferring' && (
                  <button onClick={() => cancelTransfer(t.id)} className="p-0.5 rounded hover:bg-black/5">
                    <X size={12} style={{ color: 'var(--ink-400)' }} />
                  </button>
                )}
                {t.status === 'completed' && (
                  <CheckCircle size={12} style={{ color: 'var(--success)' }} />
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Log panel */}
      <div className="h-20 flex-shrink-0 overflow-auto px-3 py-1" style={{ backgroundColor: 'var(--ink-800)', borderTop: '1px solid var(--ink-700)' }}>
        {logMessages.length === 0 ? (
          <span className="text-caption" style={{ color: 'var(--ink-500)' }}>FTP 日志 (FTP Log)</span>
        ) : (
          logMessages.map((msg, i) => (
            <div key={i} className="text-caption" style={{ color: 'var(--ink-300)' }}>{msg}</div>
          ))
        )}
      </div>
    </div>
  );
}

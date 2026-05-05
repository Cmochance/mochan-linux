import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { AlertCircle, Download, File, Folder, HardDrive, Lock, Plus, RefreshCw, Server, Trash2, Upload, Unlock } from 'lucide-react';
import { fileTransferClient, type RemoteEntry, type TransferConnection } from '@/lib/file-transfer';
import { formatMtime, formatSize, fsClient, type FsEntry } from '@/lib/fs';

interface FTPClientProps {
  windowId?: string;
}

interface TransferRow {
  id: string;
  name: string;
  direction: 'upload' | 'download';
  status: 'completed' | 'failed';
  detail: string;
}

function joinRemote(dir: string, name: string): string {
  const clean = dir.endsWith('/') ? dir.slice(0, -1) : dir;
  return `${clean || ''}/${name}`.replace(/\/+/g, '/');
}

function basename(path: string): string {
  return path.split('/').filter(Boolean).pop() || 'file';
}

export default function FTPClient({ windowId: _windowId }: FTPClientProps) {
  const [host, setHost] = useState('');
  const [port, setPort] = useState('22');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [connection, setConnection] = useState<TransferConnection | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [localPath, setLocalPath] = useState('');
  const [remotePath, setRemotePath] = useState('.');
  const [localEntries, setLocalEntries] = useState<FsEntry[]>([]);
  const [remoteEntries, setRemoteEntries] = useState<RemoteEntry[]>([]);
  const [selectedLocal, setSelectedLocal] = useState<FsEntry | null>(null);
  const [selectedRemote, setSelectedRemote] = useState<RemoteEntry | null>(null);
  const [transfers, setTransfers] = useState<TransferRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const connected = Boolean(connection);

  const loadLocal = useCallback(async (path?: string) => {
    setError('');
    try {
      const nextPath = path || localPath || await fsClient.home();
      const data = await fsClient.list(nextPath);
      setLocalPath(data.path);
      setLocalEntries(data.entries);
      setSelectedLocal(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [localPath]);

  const loadRemote = useCallback(async (path = remotePath) => {
    if (!connection) return;
    setBusy(true);
    setError('');
    try {
      const data = await fileTransferClient.list(connection, path);
      setRemotePath(data.path);
      setRemoteEntries(data.entries);
      setSelectedRemote(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [connection, remotePath]);

  useEffect(() => {
    loadLocal().catch(() => undefined);
  }, []);

  const connect = async () => {
    const next: TransferConnection = {
      protocol: 'sftp',
      host: host.trim(),
      port: Number(port) || 22,
      username: username.trim(),
      password,
    };
    setConnecting(true);
    setError('');
    try {
      const res = await fileTransferClient.connect(next);
      setConnection(next);
      setRemotePath(res.cwd || '.');
      const list = await fileTransferClient.list(next, res.cwd || '.');
      setRemoteEntries(list.entries);
      setRemotePath(list.path);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setConnecting(false);
    }
  };

  const disconnect = () => {
    setConnection(null);
    setRemoteEntries([]);
    setSelectedRemote(null);
  };

  const addTransfer = (row: Omit<TransferRow, 'id'>) => {
    setTransfers(prev => [{ id: `${Date.now()}-${Math.random()}`, ...row }, ...prev].slice(0, 20));
  };

  const upload = async () => {
    if (!connection || !selectedLocal || selectedLocal.is_dir) return;
    setBusy(true);
    setError('');
    const target = joinRemote(remotePath, selectedLocal.name);
    try {
      const res = await fileTransferClient.upload(connection, selectedLocal.path, target);
      addTransfer({ name: selectedLocal.name, direction: 'upload', status: 'completed', detail: `${formatSize(res.bytes)} -> ${target}` });
      await loadRemote(remotePath);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      addTransfer({ name: selectedLocal.name, direction: 'upload', status: 'failed', detail: message });
    } finally {
      setBusy(false);
    }
  };

  const download = async () => {
    if (!connection || !selectedRemote || selectedRemote.is_dir) return;
    setBusy(true);
    setError('');
    const target = `${localPath.replace(/\/$/, '')}/${selectedRemote.name}`;
    try {
      const res = await fileTransferClient.download(connection, selectedRemote.path, target);
      addTransfer({ name: selectedRemote.name, direction: 'download', status: 'completed', detail: `${formatSize(res.bytes)} -> ${target}` });
      await loadLocal(localPath);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      addTransfer({ name: selectedRemote.name, direction: 'download', status: 'failed', detail: message });
    } finally {
      setBusy(false);
    }
  };

  const mkdirRemote = async () => {
    if (!connection) return;
    const name = prompt('远程文件夹名称 (Remote folder name)');
    if (!name) return;
    await fileTransferClient.mkdir(connection, joinRemote(remotePath, name));
    await loadRemote(remotePath);
  };

  const deleteRemote = async () => {
    if (!connection || !selectedRemote) return;
    const recursive = selectedRemote.is_dir;
    await fileTransferClient.delete(connection, selectedRemote.path, recursive);
    await loadRemote(remotePath);
  };

  const localParent = useMemo(() => localPath.split('/').slice(0, -1).join('/') || '/', [localPath]);
  const remoteParent = useMemo(() => {
    if (remotePath === '.' || remotePath === '/') return remotePath;
    return remotePath.split('/').slice(0, -1).join('/') || '.';
  }, [remotePath]);

  return (
    <div className="w-full h-full flex flex-col" style={{ backgroundColor: 'var(--ink-50)' }}>
      <div className="flex items-center gap-2 px-4 py-2" style={{ backgroundColor: 'var(--ink-100)', borderBottom: '1px solid var(--ink-200)' }}>
        {connected ? (
          <>
            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: 'var(--success)' }} />
            <span className="text-caption" style={{ color: 'var(--success)' }}>SFTP connected</span>
            <span className="text-caption" style={{ color: 'var(--ink-500)' }}>{connection?.username}@{connection?.host}:{connection?.port}</span>
            <button onClick={disconnect} className="ml-auto flex items-center gap-1 px-3 py-1 rounded text-caption" style={{ backgroundColor: 'var(--cinnabar)', color: 'white' }}><Unlock size={12} /> 断开</button>
          </>
        ) : (
          <>
            <input value={host} onChange={e => setHost(e.target.value)} placeholder="Host" className="px-2 py-1 rounded text-caption outline-none w-36" style={{ backgroundColor: 'var(--ink-50)', border: '1px solid var(--ink-200)' }} />
            <input value={port} onChange={e => setPort(e.target.value)} placeholder="22" className="px-2 py-1 rounded text-caption outline-none w-16" style={{ backgroundColor: 'var(--ink-50)', border: '1px solid var(--ink-200)' }} />
            <input value={username} onChange={e => setUsername(e.target.value)} placeholder="User" className="px-2 py-1 rounded text-caption outline-none w-24" style={{ backgroundColor: 'var(--ink-50)', border: '1px solid var(--ink-200)' }} />
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Password" className="px-2 py-1 rounded text-caption outline-none w-32" style={{ backgroundColor: 'var(--ink-50)', border: '1px solid var(--ink-200)' }} />
            <button onClick={connect} disabled={connecting || !host.trim() || !username.trim()} className="flex items-center gap-1 px-3 py-1 rounded text-caption disabled:opacity-40" style={{ backgroundColor: 'var(--ink-800)', color: 'var(--ink-50)' }}>
              {connecting ? <RefreshCw size={12} className="animate-spin" /> : <Lock size={12} />} 连接
            </button>
            <span className="ml-auto text-caption" style={{ color: 'var(--ink-500)' }}>凭据仅用于当前浏览器会话，不写入后端存储。</span>
          </>
        )}
      </div>

      {error && <div className="flex items-center gap-2 px-4 py-2 text-caption" style={{ color: 'var(--cinnabar)', backgroundColor: 'rgba(179,57,47,0.08)' }}><AlertCircle size={13} /> {error}</div>}

      <div className="flex items-center gap-2 px-4 py-1.5" style={{ backgroundColor: 'var(--ink-100)', borderBottom: '1px solid var(--ink-200)' }}>
        <button onClick={upload} disabled={!connected || !selectedLocal || selectedLocal.is_dir || busy} className="flex items-center gap-1 px-2 py-1 rounded text-caption hover:bg-black/5 disabled:opacity-40"><Upload size={14} /> 上传</button>
        <button onClick={download} disabled={!connected || !selectedRemote || selectedRemote.is_dir || busy} className="flex items-center gap-1 px-2 py-1 rounded text-caption hover:bg-black/5 disabled:opacity-40"><Download size={14} /> 下载</button>
        <button onClick={mkdirRemote} disabled={!connected || busy} className="flex items-center gap-1 px-2 py-1 rounded text-caption hover:bg-black/5 disabled:opacity-40"><Plus size={14} /> 远程文件夹</button>
        <button onClick={deleteRemote} disabled={!connected || !selectedRemote || busy} className="flex items-center gap-1 px-2 py-1 rounded text-caption hover:bg-black/5 disabled:opacity-40" style={{ color: 'var(--cinnabar)' }}><Trash2 size={14} /> 删除远程</button>
        <button onClick={() => { loadLocal(localPath); loadRemote(remotePath); }} className="ml-auto flex items-center gap-1 px-2 py-1 rounded text-caption hover:bg-black/5"><RefreshCw size={14} className={busy ? 'animate-spin' : ''} /> 刷新</button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 flex flex-col overflow-hidden" style={{ borderRight: '1px solid var(--ink-200)' }}>
          <PaneHeader icon={<HardDrive size={14} />} label="本地 (Server FS)" path={localPath} parent={() => loadLocal(localParent)} />
          <EntryTable entries={localEntries} selected={selectedLocal?.path} onSelect={setSelectedLocal} onOpen={e => e.is_dir && loadLocal(e.path)} local />
        </div>
        <div className="flex-1 flex flex-col overflow-hidden">
          <PaneHeader icon={<Server size={14} />} label="远程 (SFTP)" path={remotePath} parent={() => loadRemote(remoteParent)} />
          {connected ? <RemoteTable entries={remoteEntries} selected={selectedRemote?.path} onSelect={setSelectedRemote} onOpen={e => e.is_dir && loadRemote(e.path)} /> : (
            <div className="flex flex-col items-center justify-center h-full gap-2"><Server size={32} style={{ color: 'var(--ink-300)' }} /><span className="text-body-sm" style={{ color: 'var(--ink-400)' }}>未连接</span></div>
          )}
        </div>
      </div>

      <div className="h-28 overflow-auto" style={{ backgroundColor: 'var(--ink-800)', borderTop: '1px solid var(--ink-700)' }}>
        {transfers.length === 0 ? <div className="p-3 text-caption" style={{ color: 'var(--ink-400)' }}>暂无传输记录</div> : transfers.map(t => (
          <div key={t.id} className="flex items-center gap-2 px-3 py-1.5 text-caption" style={{ color: t.status === 'failed' ? 'var(--cinnabar-light)' : 'var(--ink-100)' }}>
            {t.direction === 'upload' ? <Upload size={12} /> : <Download size={12} />}
            <span className="w-28 truncate">{t.name}</span>
            <span className="w-20">{t.status}</span>
            <span className="truncate">{t.detail}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PaneHeader({ icon, label, path, parent }: { icon: ReactNode; label: string; path: string; parent: () => void }) {
  return (
    <div className="flex items-center gap-2 px-3 py-1.5" style={{ backgroundColor: 'var(--ink-100)', borderBottom: '1px solid var(--ink-200)' }}>
      {icon}
      <span className="text-caption font-medium" style={{ color: 'var(--ink-700)' }}>{label}</span>
      <button onClick={parent} className="text-caption hover:underline" style={{ color: 'var(--ink-500)' }}>..</button>
      <span className="text-caption truncate" style={{ color: 'var(--ink-400)' }}>{path}</span>
    </div>
  );
}

function EntryTable({ entries, selected, onSelect, onOpen, local }: { entries: FsEntry[]; selected?: string; onSelect: (entry: FsEntry) => void; onOpen: (entry: FsEntry) => void; local: true }) {
  void local;
  return (
    <div className="flex-1 overflow-auto">
      <table className="w-full">
        <tbody>{entries.map(entry => (
          <tr key={entry.path} onClick={() => onSelect(entry)} onDoubleClick={() => onOpen(entry)} className="cursor-pointer" style={{ backgroundColor: selected === entry.path ? 'var(--wash-light)' : 'transparent' }}>
            <td className="px-3 py-1.5 flex items-center gap-2">{entry.is_dir ? <Folder size={14} style={{ color: '#b8860b' }} /> : <File size={14} style={{ color: 'var(--ink-500)' }} />}<span className="text-body-sm" style={{ color: 'var(--ink-700)' }}>{entry.name}</span></td>
            <td className="px-3 py-1.5 text-caption" style={{ color: 'var(--ink-500)' }}>{entry.is_dir ? '-' : formatSize(entry.size)}</td>
            <td className="px-3 py-1.5 text-caption" style={{ color: 'var(--ink-400)' }}>{formatMtime(entry.mtime)}</td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

function RemoteTable({ entries, selected, onSelect, onOpen }: { entries: RemoteEntry[]; selected?: string; onSelect: (entry: RemoteEntry) => void; onOpen: (entry: RemoteEntry) => void }) {
  return (
    <div className="flex-1 overflow-auto">
      <table className="w-full">
        <tbody>{entries.map(entry => (
          <tr key={entry.path} onClick={() => onSelect(entry)} onDoubleClick={() => onOpen(entry)} className="cursor-pointer" style={{ backgroundColor: selected === entry.path ? 'var(--wash-light)' : 'transparent' }}>
            <td className="px-3 py-1.5 flex items-center gap-2">{entry.is_dir ? <Folder size={14} style={{ color: '#b8860b' }} /> : <File size={14} style={{ color: 'var(--ink-500)' }} />}<span className="text-body-sm" style={{ color: 'var(--ink-700)' }}>{entry.name}</span></td>
            <td className="px-3 py-1.5 text-caption" style={{ color: 'var(--ink-500)' }}>{entry.is_dir ? '-' : formatSize(entry.size)}</td>
            <td className="px-3 py-1.5 text-caption" style={{ color: 'var(--ink-400)' }}>{entry.mtime ? formatMtime(entry.mtime) : '-'}</td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { Trash2, RotateCcw, AlertTriangle, Folder, File, Image, Music, Video, FileText, RefreshCw } from 'lucide-react';
import { ApiError } from '@/lib/api';
import { formatSize } from '@/lib/fs';
import { trashClient, type TrashItem } from '@/lib/trash';

type TrashIconType = 'folder' | 'file' | 'image' | 'music' | 'video' | 'text';

function getItemType(item: TrashItem): TrashIconType {
  if (item.is_dir) return 'folder';
  const ext = item.name.split('.').pop()?.toLowerCase() ?? '';
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'avif'].includes(ext)) return 'image';
  if (['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a'].includes(ext)) return 'music';
  if (['mp4', 'webm', 'mov', 'avi', 'mkv', 'm4v'].includes(ext)) return 'video';
  if (['txt', 'md', 'json', 'yaml', 'yml', 'csv', 'log', 'go', 'ts', 'tsx', 'js', 'jsx', 'css', 'html'].includes(ext)) return 'text';
  return 'file';
}

function getFileIcon(type: TrashIconType, size: number = 16) {
  switch (type) {
    case 'folder': return <Folder size={size} className="text-ink-400" />;
    case 'image': return <Image size={size} className="text-ink-400" />;
    case 'music': return <Music size={size} className="text-ink-400" />;
    case 'video': return <Video size={size} className="text-ink-400" />;
    case 'text': return <FileText size={size} className="text-ink-400" />;
    default: return <File size={size} className="text-ink-400" />;
  }
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString('zh-CN', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function daysSince(dateStr: string): number {
  const deleted = new Date(dateStr).getTime();
  const now = Date.now();
  return Math.max(0, Math.floor((now - deleted) / (1000 * 60 * 60 * 24)));
}

function parentPath(path: string): string {
  const normalized = path.replace(/\/+$/, '');
  const i = normalized.lastIndexOf('/');
  if (i <= 0) return '/';
  return normalized.slice(0, i);
}

export default function Trash() {
  const [items, setItems] = useState<TrashItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showEmptyConfirm, setShowEmptyConfirm] = useState(false);
  const [showRestoreConfirm, setShowRestoreConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      setItems(await trashClient.list());
    } catch (err) {
      setError(toMsg(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    const liveIds = new Set(items.map((item) => item.id));
    setSelectedIds((prev) => new Set([...prev].filter((id) => liveIds.has(id))));
  }, [items]);

  const totalSize = useMemo(() => items.reduce((sum, item) => sum + item.size, 0), [items]);

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selectedIds.size === items.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(items.map(i => i.id)));
  };

  async function restoreItems(ids: string[]) {
    await runAction(async () => {
      for (const id of ids) await trashClient.restore(id);
      setShowRestoreConfirm(false);
    });
  }

  async function permanentlyDelete(ids: string[]) {
    await runAction(async () => {
      await trashClient.delete(ids);
      setShowDeleteConfirm(false);
    });
  }

  async function emptyTrash() {
    await runAction(async () => {
      await trashClient.empty();
      setShowEmptyConfirm(false);
    });
  }

  async function runAction(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      setSelectedIds(new Set());
      await refresh();
    } catch (err) {
      setError(toMsg(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="w-full h-full flex flex-col bg-ink-50 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b border-ink-200 bg-ink-100">
        <div className="flex items-center gap-2">
          <Trash2 size={16} className="text-ink-600" />
          <span className="text-body-sm text-ink-700 font-medium">Trash (回收站)</span>
          <span className="text-caption text-ink-500">({items.length} items)</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => void refresh()}
            disabled={loading || busy}
            className="flex items-center gap-1 px-3 py-1.5 rounded bg-ink-200 text-ink-700 text-body-sm hover:bg-ink-300 disabled:opacity-30 transition-colors"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh (刷新)
          </button>
          <button
            onClick={() => setShowRestoreConfirm(true)}
            disabled={selectedIds.size === 0 || busy}
            className="flex items-center gap-1 px-3 py-1.5 rounded bg-ink-200 text-ink-700 text-body-sm hover:bg-ink-300 disabled:opacity-30 transition-colors"
          >
            <RotateCcw size={14} /> Restore (还原)
          </button>
          <button
            onClick={() => { if (selectedIds.size > 0) setShowDeleteConfirm(true); else setShowEmptyConfirm(true); }}
            disabled={items.length === 0 || busy}
            className="flex items-center gap-1 px-3 py-1.5 rounded bg-cinnabar text-white text-body-sm hover:bg-cinnabar-light disabled:opacity-30 transition-colors"
          >
            <Trash2 size={14} /> {selectedIds.size > 0 ? 'Delete (删除)' : 'Empty (清空)'}
          </button>
        </div>
      </div>

      {error && (
        <div className="m-3 rounded border border-red-300 bg-red-50 p-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {loading && items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full">
            <RefreshCw size={32} className="text-ink-300 mb-3 animate-spin" />
            <div className="text-body-sm text-ink-400">Loading trash (正在加载回收站)</div>
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full">
            <Trash2 size={48} className="text-ink-300 mb-3" />
            <div className="text-heading-sm text-ink-400">Trash is empty (回收站为空)</div>
            <div className="text-body-sm text-ink-400 mt-1">Deleted files will appear here (删除的文件将显示在这里)</div>
          </div>
        ) : (
          <table className="w-full text-left">
            <thead className="sticky top-0 bg-ink-100 text-body-sm text-ink-500">
              <tr>
                <th className="px-4 py-2 w-8">
                  <input
                    type="checkbox"
                    checked={selectedIds.size === items.length && items.length > 0}
                    onChange={selectAll}
                    className="accent-cinnabar"
                  />
                </th>
                <th className="px-4 py-2 font-medium">Name (名称)</th>
                <th className="px-4 py-2 font-medium w-64">Original (原位置)</th>
                <th className="px-4 py-2 font-medium w-36">Deleted (删除时间)</th>
                <th className="px-4 py-2 font-medium w-24">Size (大小)</th>
                <th className="px-4 py-2 font-medium w-20">Age (天数)</th>
              </tr>
            </thead>
            <tbody>
              {items.map(item => {
                const age = daysSince(item.deleted_at);
                const isOld = age > 30;
                const type = getItemType(item);
                return (
                  <tr
                    key={item.id}
                    onClick={() => toggleSelect(item.id)}
                    className={`cursor-pointer transition-colors border-b border-ink-200/50 ${
                      selectedIds.has(item.id)
                        ? 'bg-[rgba(26,26,26,0.05)]'
                        : 'hover:bg-[rgba(26,26,26,0.03)]'
                    }`}
                  >
                    <td className="px-4 py-2">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(item.id)}
                        onChange={() => toggleSelect(item.id)}
                        className="accent-cinnabar"
                        onClick={e => e.stopPropagation()}
                      />
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        {getFileIcon(type)}
                        <span className="text-body-sm text-ink-700 truncate" title={item.original_path}>{item.name}</span>
                        {isOld && (
                          <span className="text-caption px-1.5 py-0.5 rounded bg-warning/10 text-warning">Old (旧)</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2 text-body-sm text-ink-500 truncate" title={item.original_path}>{parentPath(item.original_path)}</td>
                    <td className="px-4 py-2 text-body-sm text-ink-500">{formatDate(item.deleted_at)}</td>
                    <td className="px-4 py-2 text-body-sm text-ink-500">{item.is_dir ? '--' : formatSize(item.size)}</td>
                    <td className="px-4 py-2 text-body-sm text-ink-500">{age} days</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="flex items-center justify-between px-4 py-1.5 border-t border-ink-200 bg-ink-100 text-caption text-ink-500">
        <span>{items.length} item(s) in trash (回收站中)</span>
        <span>{formatSize(totalSize)} total (总计)</span>
      </div>

      {showEmptyConfirm && (
        <>
          <div className="fixed inset-0 z-40" style={{ backgroundColor: 'rgba(26,26,26,0.35)' }} onClick={() => setShowEmptyConfirm(false)} />
          <div className="fixed z-50 bg-ink-100 rounded-lg shadow-xl p-6 w-80" style={{ top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}>
            <div className="flex items-center gap-2 mb-3 text-cinnabar">
              <AlertTriangle size={20} />
              <span className="text-heading-sm">Empty Trash (清空回收站)</span>
            </div>
            <p className="text-body-sm text-ink-600 mb-4">
              This will permanently delete all {items.length} items. This action cannot be undone. (将永久删除所有项目，此操作无法撤销。)
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowEmptyConfirm(false)} className="px-4 py-2 rounded border border-ink-300 text-ink-700 text-body-sm hover:bg-ink-200">Cancel (取消)</button>
              <button onClick={() => void emptyTrash()} disabled={busy} className="px-4 py-2 rounded bg-cinnabar text-white text-body-sm hover:bg-cinnabar-light disabled:opacity-30">Delete (删除)</button>
            </div>
          </div>
        </>
      )}

      {showRestoreConfirm && (
        <>
          <div className="fixed inset-0 z-40" style={{ backgroundColor: 'rgba(26,26,26,0.35)' }} onClick={() => setShowRestoreConfirm(false)} />
          <div className="fixed z-50 bg-ink-100 rounded-lg shadow-xl p-6 w-80" style={{ top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}>
            <div className="flex items-center gap-2 mb-3 text-success">
              <RotateCcw size={20} />
              <span className="text-heading-sm">Restore Items (还原项目)</span>
            </div>
            <p className="text-body-sm text-ink-600 mb-4">
              Restore {selectedIds.size} selected item(s) to their original location? (还原选中的项目到原位置？)
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowRestoreConfirm(false)} className="px-4 py-2 rounded border border-ink-300 text-ink-700 text-body-sm hover:bg-ink-200">Cancel (取消)</button>
              <button onClick={() => void restoreItems(Array.from(selectedIds))} disabled={busy} className="px-4 py-2 rounded bg-success text-white text-body-sm hover:bg-success/80 disabled:opacity-30">Restore (还原)</button>
            </div>
          </div>
        </>
      )}

      {showDeleteConfirm && (
        <>
          <div className="fixed inset-0 z-40" style={{ backgroundColor: 'rgba(26,26,26,0.35)' }} onClick={() => setShowDeleteConfirm(false)} />
          <div className="fixed z-50 bg-ink-100 rounded-lg shadow-xl p-6 w-80" style={{ top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}>
            <div className="flex items-center gap-2 mb-3 text-cinnabar">
              <AlertTriangle size={20} />
              <span className="text-heading-sm">Delete Permanently (永久删除)</span>
            </div>
            <p className="text-body-sm text-ink-600 mb-4">
              Permanently delete {selectedIds.size} selected item(s)? This cannot be undone. (永久删除选中的项目？无法撤销。)
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowDeleteConfirm(false)} className="px-4 py-2 rounded border border-ink-300 text-ink-700 text-body-sm hover:bg-ink-200">Cancel (取消)</button>
              <button onClick={() => void permanentlyDelete(Array.from(selectedIds))} disabled={busy} className="px-4 py-2 rounded bg-cinnabar text-white text-body-sm hover:bg-cinnabar-light disabled:opacity-30">Delete (删除)</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function toMsg(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.status === 403) return '权限不足';
    if (e.status === 404) return '回收站项目不存在';
    if (e.status === 409) return '原路径已经存在，未还原';
    return e.body || `错误 ${e.status}`;
  }
  if (e instanceof Error) return e.message;
  return String(e);
}

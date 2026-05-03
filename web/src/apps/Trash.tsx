import { useState, useEffect } from 'react';
import { Trash2, RotateCcw, AlertTriangle, Folder, File, Image, Music, Video, FileText } from 'lucide-react';

interface TrashedItem {
  id: string;
  name: string;
  type: 'folder' | 'file' | 'image' | 'music' | 'video' | 'text';
  size: number;
  deletedAt: string;
  originalLocation: string;
}

const TRASH_KEY = 'ink-os-trash';

function loadTrash(): TrashedItem[] {
  try {
    const saved = localStorage.getItem(TRASH_KEY);
    return saved ? JSON.parse(saved) : [
      { id: 'trash_1', name: 'old-document.txt', type: 'text', size: 2048, deletedAt: '2024-03-15T10:30:00', originalLocation: 'Documents (文档)' },
      { id: 'trash_2', name: 'temp-folder', type: 'folder', size: 0, deletedAt: '2024-04-01T14:22:00', originalLocation: 'Desktop (桌面)' },
      { id: 'trash_3', name: 'screenshot-old.png', type: 'image', size: 1536000, deletedAt: '2024-04-20T09:15:00', originalLocation: 'Pictures (图片)' },
    ];
  } catch { return []; }
}

function saveTrash(items: TrashedItem[]) {
  localStorage.setItem(TRASH_KEY, JSON.stringify(items));
}

function formatSize(bytes: number): string {
  if (bytes === 0) return '--';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function getFileIcon(type: string, size: number = 16) {
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
  return Math.floor((now - deleted) / (1000 * 60 * 60 * 24));
}

export default function Trash() {
  const [items, setItems] = useState<TrashedItem[]>(loadTrash);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showEmptyConfirm, setShowEmptyConfirm] = useState(false);
  const [showRestoreConfirm, setShowRestoreConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => { saveTrash(items); }, [items]);

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

  const restoreItems = (ids: string[]) => {
    const fsItems = JSON.parse(localStorage.getItem('ink-os-file-system') || '{"items":[]}');
    const toRestore = items.filter(i => ids.includes(i.id));
    toRestore.forEach(item => {
      fsItems.items.push({
        id: item.id.replace('trash_', ''),
        name: item.name,
        type: item.type,
        size: item.size,
        modified: new Date().toISOString().split('T')[0],
        parentId: 'root',
      });
    });
    localStorage.setItem('ink-os-file-system', JSON.stringify(fsItems));
    setItems(prev => prev.filter(i => !ids.includes(i.id)));
    setSelectedIds(prev => {
      const next = new Set(prev);
      ids.forEach(id => next.delete(id));
      return next;
    });
    setShowRestoreConfirm(false);
  };

  const permanentlyDelete = (ids: string[]) => {
    setItems(prev => prev.filter(i => !ids.includes(i.id)));
    setSelectedIds(prev => {
      const next = new Set(prev);
      ids.forEach(id => next.delete(id));
      return next;
    });
    setShowDeleteConfirm(false);
  };

  const totalSize = items.reduce((sum, i) => sum + i.size, 0);

  return (
    <div className="w-full h-full flex flex-col bg-ink-50 overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-ink-200 bg-ink-100">
        <div className="flex items-center gap-2">
          <Trash2 size={16} className="text-ink-600" />
          <span className="text-body-sm text-ink-700 font-medium">Trash (回收站)</span>
          <span className="text-caption text-ink-500">({items.length} items)</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowRestoreConfirm(true)}
            disabled={selectedIds.size === 0}
            className="flex items-center gap-1 px-3 py-1.5 rounded bg-ink-200 text-ink-700 text-body-sm hover:bg-ink-300 disabled:opacity-30 transition-colors"
          >
            <RotateCcw size={14} /> Restore (还原)
          </button>
          <button
            onClick={() => { if (selectedIds.size > 0) setShowDeleteConfirm(true); else setShowEmptyConfirm(true); }}
            className="flex items-center gap-1 px-3 py-1.5 rounded bg-cinnabar text-white text-body-sm hover:bg-cinnabar-light transition-colors"
          >
            <Trash2 size={14} /> {selectedIds.size > 0 ? 'Delete (删除)' : 'Empty (清空)'}
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {items.length === 0 ? (
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
                <th className="px-4 py-2 font-medium w-32">Original (原位置)</th>
                <th className="px-4 py-2 font-medium w-36">Deleted (删除时间)</th>
                <th className="px-4 py-2 font-medium w-24">Size (大小)</th>
                <th className="px-4 py-2 font-medium w-20">Age (天数)</th>
              </tr>
            </thead>
            <tbody>
              {items.map(item => {
                const age = daysSince(item.deletedAt);
                const isOld = age > 30;
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
                        {getFileIcon(item.type)}
                        <span className="text-body-sm text-ink-700">{item.name}</span>
                        {isOld && (
                          <span className="text-caption px-1.5 py-0.5 rounded bg-warning/10 text-warning">Old (旧)</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2 text-body-sm text-ink-500">{item.originalLocation}</td>
                    <td className="px-4 py-2 text-body-sm text-ink-500">{formatDate(item.deletedAt)}</td>
                    <td className="px-4 py-2 text-body-sm text-ink-500">{formatSize(item.size)}</td>
                    <td className="px-4 py-2 text-body-sm text-ink-500">{age} days</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Status Bar */}
      <div className="flex items-center justify-between px-4 py-1.5 border-t border-ink-200 bg-ink-100 text-caption text-ink-500">
        <span>{items.length} item(s) in trash (回收站中)</span>
        <span>{formatSize(totalSize)} total (总计)</span>
      </div>

      {/* Empty Trash Confirmation */}
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
              <button onClick={() => { permanentlyDelete(items.map(i => i.id)); setShowEmptyConfirm(false); }} className="px-4 py-2 rounded bg-cinnabar text-white text-body-sm hover:bg-cinnabar-light">Delete (删除)</button>
            </div>
          </div>
        </>
      )}

      {/* Restore Confirmation */}
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
              <button onClick={() => restoreItems(Array.from(selectedIds))} className="px-4 py-2 rounded bg-success text-white text-body-sm hover:bg-success/80">Restore (还原)</button>
            </div>
          </div>
        </>
      )}

      {/* Delete Confirmation */}
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
              <button onClick={() => permanentlyDelete(Array.from(selectedIds))} className="px-4 py-2 rounded bg-cinnabar text-white text-body-sm hover:bg-cinnabar-light">Delete (删除)</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

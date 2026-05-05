import { useEffect, useMemo, useState } from 'react';
import {
  Bookmark, BookOpen, Code, Download, Edit2, Folder, Globe, LayoutGrid,
  List, Newspaper, Palette, Plus, Search, Settings, ShoppingCart, Star,
  Trash2, Upload, Video, X
} from 'lucide-react';
import { bookmarksClient, type BookmarkFolder, type BookmarkItem } from '@/lib/bookmarks';

interface BookmarksProps {
  windowId?: string;
}

const FOLDER_ICONS: Record<string, typeof Folder> = {
  all: Bookmark,
  favorites: Star,
  reading: BookOpen,
  tech: Code,
  art: Palette,
  news: Newspaper,
  tools: Settings,
  media: Video,
  shopping: ShoppingCart,
};

function iconFor(folderID: string) {
  return FOLDER_ICONS[folderID] || Folder;
}

function shortError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export default function Bookmarks({ windowId: _windowId }: BookmarksProps) {
  const [bookmarks, setBookmarks] = useState<BookmarkItem[]>([]);
  const [folders, setFolders] = useState<BookmarkFolder[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingBookmark, setEditingBookmark] = useState<BookmarkItem | null>(null);
  const [showAddFolder, setShowAddFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [addTitle, setAddTitle] = useState('');
  const [addUrl, setAddUrl] = useState('');
  const [addDesc, setAddDesc] = useState('');
  const [addFolderId, setAddFolderId] = useState('favorites');
  const [error, setError] = useState('');

  const load = async () => {
    setError('');
    try {
      const data = await bookmarksClient.list();
      setBookmarks(data.bookmarks);
      setFolders(data.folders);
      if (!data.folders.some(f => f.id === addFolderId)) setAddFolderId('favorites');
    } catch (err) {
      setError(shortError(err));
    }
  };

  useEffect(() => {
    load().catch(err => setError(shortError(err)));
  }, []);

  const filteredBookmarks = useMemo(() => bookmarks.filter(b => {
    const matchesFolder = selectedFolderId === 'all' || b.folder_id === selectedFolderId;
    const q = searchQuery.toLowerCase();
    const matchesSearch = !q || b.title.toLowerCase().includes(q) || b.url.toLowerCase().includes(q) || (b.description || '').toLowerCase().includes(q);
    return matchesFolder && matchesSearch;
  }), [bookmarks, selectedFolderId, searchQuery]);

  const folderCounts = folders.map(folder => ({
    ...folder,
    count: bookmarks.filter(b => folder.id === 'all' ? true : b.folder_id === folder.id).length,
  }));

  const addBookmark = async () => {
    if (!addTitle.trim() || !addUrl.trim()) return;
    try {
      await bookmarksClient.addBookmark({ title: addTitle.trim(), url: addUrl.trim(), description: addDesc.trim(), folder_id: addFolderId });
      setAddTitle('');
      setAddUrl('');
      setAddDesc('');
      setShowAddDialog(false);
      await load();
    } catch (err) {
      setError(shortError(err));
    }
  };

  const updateBookmark = async () => {
    if (!editingBookmark) return;
    try {
      await bookmarksClient.updateBookmark(editingBookmark.id, editingBookmark);
      setEditingBookmark(null);
      await load();
    } catch (err) {
      setError(shortError(err));
    }
  };

  const deleteBookmark = async (id: string) => {
    await bookmarksClient.deleteBookmark(id);
    await load();
  };

  const createFolder = async () => {
    if (!newFolderName.trim()) return;
    await bookmarksClient.addFolder(newFolderName.trim());
    setNewFolderName('');
    setShowAddFolder(false);
    await load();
  };

  const deleteFolder = async (id: string) => {
    await bookmarksClient.deleteFolder(id);
    if (selectedFolderId === id) setSelectedFolderId('all');
    await load();
  };

  const exportBookmarks = () => {
    const blob = new Blob([JSON.stringify({ bookmarks, folders, exportDate: new Date().toISOString() }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'bookmarks-export.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const importBookmarks = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        const data = JSON.parse(await file.text());
        await bookmarksClient.importData({ bookmarks: data.bookmarks || [], folders: data.folders || [] });
        await load();
      } catch (err) {
        setError(shortError(err));
      }
    };
    input.click();
  };

  return (
    <div className="w-full h-full flex" style={{ backgroundColor: 'var(--ink-50)' }}>
      <div className="w-52 flex-shrink-0 flex flex-col" style={{ backgroundColor: 'var(--ink-100)', borderRight: '1px solid var(--ink-200)' }}>
        <div className="p-3" style={{ borderBottom: '1px solid var(--ink-200)' }}>
          <h2 className="text-heading-sm mb-2" style={{ color: 'var(--ink-900)' }}>书签 (Bookmarks)</h2>
          <button onClick={() => setShowAddDialog(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded text-caption hover:bg-black/5 w-full mb-1" style={{ color: 'var(--ink-600)' }}><Plus size={14} /> 添加书签</button>
          <button onClick={() => setShowAddFolder(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded text-caption hover:bg-black/5 w-full" style={{ color: 'var(--ink-600)' }}><Folder size={14} /> 新建文件夹</button>
        </div>

        {showAddFolder && (
          <div className="p-3" style={{ borderBottom: '1px solid var(--ink-200)' }}>
            <input value={newFolderName} onChange={e => setNewFolderName(e.target.value)} placeholder="文件夹名称..." className="w-full px-2 py-1 rounded text-caption outline-none mb-2" style={{ backgroundColor: 'var(--ink-50)', border: '1px solid var(--ink-200)' }} onKeyDown={e => e.key === 'Enter' && createFolder()} />
            <div className="flex gap-2">
              <button onClick={createFolder} className="px-3 py-1 rounded text-caption" style={{ backgroundColor: 'var(--ink-800)', color: 'var(--ink-50)' }}>创建</button>
              <button onClick={() => setShowAddFolder(false)} className="px-3 py-1 rounded text-caption" style={{ color: 'var(--ink-500)' }}>取消</button>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-auto">
          {folderCounts.map(folder => {
            const Icon = iconFor(folder.id);
            return (
              <button key={folder.id} onClick={() => setSelectedFolderId(folder.id)} className="w-full flex items-center gap-2.5 px-4 py-2 text-left text-body-sm group" style={{ backgroundColor: selectedFolderId === folder.id ? 'var(--wash-light)' : 'transparent', borderLeft: selectedFolderId === folder.id ? '3px solid var(--cinnabar)' : '3px solid transparent', color: selectedFolderId === folder.id ? 'var(--ink-900)' : 'var(--ink-600)' }}>
                <Icon size={16} />
                <span className="flex-1 truncate">{folder.name}</span>
                <span className="text-caption" style={{ color: 'var(--ink-400)' }}>{folder.count}</span>
                {folder.id !== 'all' && folder.id !== 'favorites' && <span onClick={(e) => { e.stopPropagation(); deleteFolder(folder.id).catch(err => setError(shortError(err))); }} className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-black/5"><Trash2 size={10} /></span>}
              </button>
            );
          })}
        </div>
        <div className="p-2" style={{ borderTop: '1px solid var(--ink-200)' }}>
          <button onClick={importBookmarks} className="flex items-center gap-1.5 px-3 py-1.5 rounded text-caption hover:bg-black/5 w-full" style={{ color: 'var(--ink-600)' }}><Upload size={14} /> 导入</button>
          <button onClick={exportBookmarks} className="flex items-center gap-1.5 px-3 py-1.5 rounded text-caption hover:bg-black/5 w-full" style={{ color: 'var(--ink-600)' }}><Download size={14} /> 导出</button>
        </div>
      </div>

      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-2" style={{ backgroundColor: 'var(--ink-100)', borderBottom: '1px solid var(--ink-200)' }}>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full flex-1 max-w-xs" style={{ backgroundColor: 'var(--ink-50)', border: '1px solid var(--ink-200)' }}>
            <Search size={14} style={{ color: 'var(--ink-400)' }} />
            <input placeholder="搜索书签..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="flex-1 text-body-sm bg-transparent outline-none" style={{ color: 'var(--ink-700)' }} />
          </div>
          {error && <span className="text-caption truncate" style={{ color: 'var(--cinnabar)' }}>{error}</span>}
          <span className="text-caption ml-auto" style={{ color: 'var(--ink-500)' }}>{filteredBookmarks.length} 个书签</span>
          <button onClick={() => setViewMode('list')} className="p-1.5 rounded" style={{ backgroundColor: viewMode === 'list' ? 'var(--ink-200)' : 'transparent' }}><List size={14} /></button>
          <button onClick={() => setViewMode('grid')} className="p-1.5 rounded" style={{ backgroundColor: viewMode === 'grid' ? 'var(--ink-200)' : 'transparent' }}><LayoutGrid size={14} /></button>
        </div>

        <div className="flex-1 overflow-auto p-3">
          {filteredBookmarks.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-2"><Bookmark size={48} style={{ color: 'var(--ink-300)' }} /><span className="text-body-md" style={{ color: 'var(--ink-400)' }}>暂无书签</span></div>
          ) : (
            <div className={viewMode === 'grid' ? 'grid grid-cols-2 gap-3' : 'space-y-1'}>
              {filteredBookmarks.map(bm => <BookmarkCard key={bm.id} bookmark={bm} grid={viewMode === 'grid'} folders={folders} onEdit={setEditingBookmark} onDelete={deleteBookmark} />)}
            </div>
          )}
        </div>
      </div>

      {showAddDialog && (
        <BookmarkDialog title="添加书签" folders={folders} bookmark={{ title: addTitle, url: addUrl, description: addDesc, folder_id: addFolderId }} onChange={patch => {
          if ('title' in patch) setAddTitle(patch.title || '');
          if ('url' in patch) setAddUrl(patch.url || '');
          if ('description' in patch) setAddDesc(patch.description || '');
          if ('folder_id' in patch) setAddFolderId(patch.folder_id || 'favorites');
        }} onClose={() => setShowAddDialog(false)} onSave={addBookmark} />
      )}
      {editingBookmark && (
        <BookmarkDialog title="编辑书签" folders={folders} bookmark={editingBookmark} onChange={patch => setEditingBookmark({ ...editingBookmark, ...patch })} onClose={() => setEditingBookmark(null)} onSave={updateBookmark} />
      )}
    </div>
  );
}

function BookmarkCard({ bookmark, grid, folders, onEdit, onDelete }: { bookmark: BookmarkItem; grid: boolean; folders: BookmarkFolder[]; onEdit: (bookmark: BookmarkItem) => void; onDelete: (id: string) => void }) {
  const folderName = folders.find(f => f.id === bookmark.folder_id)?.name || bookmark.folder_id;
  return (
    <div className={`${grid ? 'p-3' : 'flex items-center gap-3 px-3 py-2.5'} rounded-md group`} style={{ backgroundColor: 'var(--ink-100)', border: '1px solid var(--ink-200)' }}>
      <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'var(--ink-200)' }}><Globe size={16} style={{ color: 'var(--ink-600)' }} /></div>
      <div className="flex-1 min-w-0">
        <div className="text-body-sm font-medium truncate" style={{ color: 'var(--ink-800)' }}>{bookmark.title}</div>
        <div className="text-caption font-mono truncate" style={{ color: 'var(--ink-400)' }}>{bookmark.url}</div>
        {bookmark.description && <div className="text-caption truncate" style={{ color: 'var(--ink-500)' }}>{bookmark.description}</div>}
        <div className="text-caption" style={{ color: 'var(--ink-400)' }}>{folderName}</div>
      </div>
      <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100">
        <button onClick={() => onEdit(bookmark)} className="p-1.5 rounded hover:bg-black/5"><Edit2 size={14} style={{ color: 'var(--ink-500)' }} /></button>
        <button onClick={() => onDelete(bookmark.id)} className="p-1.5 rounded hover:bg-black/5"><Trash2 size={14} style={{ color: 'var(--cinnabar-light)' }} /></button>
      </div>
    </div>
  );
}

function BookmarkDialog({ title, folders, bookmark, onChange, onClose, onSave }: { title: string; folders: BookmarkFolder[]; bookmark: Partial<BookmarkItem>; onChange: (patch: Partial<BookmarkItem>) => void; onClose: () => void; onSave: () => void }) {
  return (
    <div className="fixed inset-0 flex items-center justify-center z-50" style={{ backgroundColor: 'rgba(26,26,26,0.35)', backdropFilter: 'blur(4px)' }}>
      <div className="w-96 p-6 rounded-lg" style={{ backgroundColor: 'var(--ink-100)', boxShadow: 'var(--shadow-xl)' }}>
        <div className="flex items-center justify-between mb-4"><h3 className="text-heading-sm" style={{ color: 'var(--ink-900)' }}>{title}</h3><button onClick={onClose} className="p-1 rounded hover:bg-black/5"><X size={16} /></button></div>
        <div className="space-y-3">
          <Input label="标题" value={bookmark.title || ''} onChange={value => onChange({ title: value })} />
          <Input label="链接" value={bookmark.url || ''} onChange={value => onChange({ url: value })} />
          <Input label="描述" value={bookmark.description || ''} onChange={value => onChange({ description: value })} />
          <div><label className="text-caption block mb-1" style={{ color: 'var(--ink-500)' }}>文件夹</label><select value={bookmark.folder_id || 'favorites'} onChange={e => onChange({ folder_id: e.target.value })} className="w-full px-3 py-2 rounded text-body-sm outline-none" style={{ backgroundColor: 'var(--ink-50)', border: '1px solid var(--ink-200)' }}>{folders.filter(f => f.id !== 'all').map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</select></div>
          <div className="flex gap-3 pt-2"><button onClick={onSave} className="flex-1 py-2 rounded text-body-sm" style={{ backgroundColor: 'var(--ink-800)', color: 'var(--ink-50)' }}>保存</button><button onClick={onClose} className="flex-1 py-2 rounded text-body-sm" style={{ backgroundColor: 'var(--ink-200)', color: 'var(--ink-700)' }}>取消</button></div>
        </div>
      </div>
    </div>
  );
}

function Input({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <div><label className="text-caption block mb-1" style={{ color: 'var(--ink-500)' }}>{label}</label><input value={value} onChange={e => onChange(e.target.value)} className="w-full px-3 py-2 rounded text-body-sm outline-none" style={{ backgroundColor: 'var(--ink-50)', border: '1px solid var(--ink-200)' }} /></div>;
}

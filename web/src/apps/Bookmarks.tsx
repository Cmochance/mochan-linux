import { useState } from 'react';
import {
  Bookmark, Folder, Plus, X, Search, Edit2, Trash2,
  Star, Globe, FileText, Music, Video, Code, ShoppingCart,
  Newspaper, Palette, BookOpen, Download, Upload,
  Settings, LayoutGrid, List, Home,
  MapPin, Sun, Coffee, Type, Square, Clock, Sparkles, PenTool, Mountain
} from 'lucide-react';

interface BookmarkItem {
  id: string;
  title: string;
  url: string;
  description: string;
  folderId: string;
  dateAdded: string;
  favicon: string;
  visitCount: number;
}

const FAVICON_MAP: Record<string, React.ComponentType<{ size?: number; style?: React.CSSProperties }>> = {
  '🏠': Home, '🔍': Search, '📰': Newspaper, '🎨': Palette, '📜': BookOpen,
  '💻': Code, '🎵': Music, '📚': BookOpen, '🖌️': Palette, '✒️': PenTool,
  '⚡': Sparkles, '📖': FileText, '🎬': Video, '🛒': ShoppingCart, '🌐': Globe,
  '🌤️': Sun, '🕐': Clock, '🗺️': MapPin, '🎶': Music, '🏔️': Mountain,
  '🔤': Type, '🍵': Coffee, '🔲': Square, '🔖': Bookmark,
};

function FaviconIcon({ icon, size = 14, style }: { icon: string; size?: number; style?: React.CSSProperties }) {
  const IconComponent = FAVICON_MAP[icon] || Globe;
  return <IconComponent size={size} style={style} />;
}

interface BookmarkFolder {
  id: string;
  name: string;
  parentId: string | null;
  icon: typeof Folder;
}

interface BookmarksProps {
  windowId?: string;
}

const FOLDERS: BookmarkFolder[] = [
  { id: 'all', name: '全部书签 (All)', parentId: null, icon: Bookmark },
  { id: 'favorites', name: '收藏夹 (Favorites)', parentId: null, icon: Star },
  { id: 'reading', name: '稍后阅读 (Reading List)', parentId: null, icon: BookOpen },
  { id: 'tech', name: '技术 (Tech)', parentId: null, icon: Code },
  { id: 'art', name: '艺术 (Art)', parentId: null, icon: Palette },
  { id: 'news', name: '新闻 (News)', parentId: null, icon: Newspaper },
  { id: 'tools', name: '工具 (Tools)', parentId: null, icon: Settings },
  { id: 'media', name: '媒体 (Media)', parentId: null, icon: Video },
  { id: 'shopping', name: '购物 (Shopping)', parentId: null, icon: ShoppingCart },
];

const INITIAL_BOOKMARKS: BookmarkItem[] = [
  { id: 'b1', title: '墨 OS 门户 (Ink OS Portal)', url: 'https://ink-os.local', description: '墨操作系统官方网站', folderId: 'favorites', dateAdded: '2024-01-15', favicon: '🏠', visitCount: 42 },
  { id: 'b2', title: '搜索引擎 (Search)', url: 'https://search.ink', description: 'Ink 搜索', folderId: 'favorites', dateAdded: '2024-01-15', favicon: '🔍', visitCount: 128 },
  { id: 'b3', title: '新闻门户 (News)', url: 'https://news.ink', description: '每日新闻聚合', folderId: 'news', dateAdded: '2024-01-14', favicon: '📰', visitCount: 56 },
  { id: 'b4', title: '中国艺术馆 (Chinese Art Gallery)', url: 'https://art.ink', description: '传统与现代艺术展览', folderId: 'art', dateAdded: '2024-01-14', favicon: '🎨', visitCount: 23 },
  { id: 'b5', title: '诗词集 (Poetry Collection)', url: 'https://poetry.ink', description: '古今诗词大全', folderId: 'art', dateAdded: '2024-01-13', favicon: '📜', visitCount: 67 },
  { id: 'b6', title: '代码仓库 (Code Repository)', url: 'https://code.ink', description: '代码分享与学习', folderId: 'tech', dateAdded: '2024-01-13', favicon: '💻', visitCount: 89 },
  { id: 'b7', title: '音乐流 (Music Stream)', url: 'https://music.ink', description: '在线音乐平台', folderId: 'media', dateAdded: '2024-01-12', favicon: '🎵', visitCount: 112 },
  { id: 'b8', title: '知识库 (Knowledge Base)', url: 'https://wiki.ink', description: '在线百科全书', folderId: 'favorites', dateAdded: '2024-01-12', favicon: '📚', visitCount: 34 },
  { id: 'b9', title: '水墨画教程 (Ink Painting Tutorial)', url: 'https://tutorial.ink/painting', description: '从入门到精通的水墨画教程', folderId: 'art', dateAdded: '2024-01-11', favicon: '🖌️', visitCount: 45 },
  { id: 'b10', title: '书法练习 (Calligraphy Practice)', url: 'https://calligraphy.ink/practice', description: '在线书法练习工具', folderId: 'art', dateAdded: '2024-01-11', favicon: '✒️', visitCount: 38 },
  { id: 'b11', title: '技术博客 (Tech Blog)', url: 'https://techblog.ink', description: '前沿技术文章', folderId: 'tech', dateAdded: '2024-01-10', favicon: '⚡', visitCount: 72 },
  { id: 'b12', title: '开发文档 (Dev Docs)', url: 'https://docs.ink', description: '墨 OS 开发文档', folderId: 'tech', dateAdded: '2024-01-10', favicon: '📖', visitCount: 91 },
  { id: 'b13', title: '视频平台 (Video Platform)', url: 'https://video.ink', description: '视频分享与观看', folderId: 'media', dateAdded: '2024-01-09', favicon: '🎬', visitCount: 65 },
  { id: 'b14', title: '文房四宝商城 (Stationery Shop)', url: 'https://shop.ink/stationery', description: '传统文房用品', folderId: 'shopping', dateAdded: '2024-01-09', favicon: '🛒', visitCount: 18 },
  { id: 'b15', title: '在线翻译 (Translator)', url: 'https://translate.ink', description: '多语言翻译服务', folderId: 'tools', dateAdded: '2024-01-08', favicon: '🌐', visitCount: 54 },
  { id: 'b16', title: '天气预报 (Weather)', url: 'https://weather.ink', description: '精准天气预报', folderId: 'tools', dateAdded: '2024-01-08', favicon: '🌤️', visitCount: 33 },
  { id: 'b17', title: '世界时钟 (World Clock)', url: 'https://clock.ink/world', description: '全球时间查询', folderId: 'tools', dateAdded: '2024-01-07', favicon: '🕐', visitCount: 12 },
  { id: 'b18', title: '论坛 (Forum)', url: 'https://forum.ink', description: '社区讨论', folderId: 'favorites', dateAdded: '2024-01-07', favicon: '💬', visitCount: 76 },
  { id: 'b19', title: '地图服务 (Maps)', url: 'https://map.ink', description: '在线地图与导航', folderId: 'tools', dateAdded: '2024-01-06', favicon: '🗺️', visitCount: 29 },
  { id: 'b20', title: '古琴曲库 (Guqin Music)', url: 'https://music.ink/guqin', description: '传统古琴音乐收藏', folderId: 'media', dateAdded: '2024-01-06', favicon: '🎶', visitCount: 41 },
  { id: 'b21', title: '山水画鉴赏 (Landscape Appreciation)', url: 'https://art.ink/landscape', description: '历代山水画名作赏析', folderId: 'reading', dateAdded: '2024-01-05', favicon: '🏔️', visitCount: 27 },
  { id: 'b22', title: '每日一字 (Daily Character)', url: 'https://calligraphy.ink/daily', description: '每日学习一个汉字的书写', folderId: 'reading', dateAdded: '2024-01-05', favicon: '🔤', visitCount: 19 },
  { id: 'b23', title: '茶道文化 (Tea Culture)', url: 'https://tea.ink/culture', description: '中国茶文化介绍', folderId: 'art', dateAdded: '2024-01-04', favicon: '🍵', visitCount: 15 },
  { id: 'b24', title: '篆刻艺术 (Seal Carving)', url: 'https://seal.ink/art', description: '篆刻入门与欣赏', folderId: 'art', dateAdded: '2024-01-03', favicon: '🔲', visitCount: 8 },
];

export default function Bookmarks({ windowId: _windowId }: BookmarksProps) {
  const [bookmarks, setBookmarks] = useState<BookmarkItem[]>(INITIAL_BOOKMARKS);
  const [folders, setFolders] = useState<BookmarkFolder[]>(FOLDERS);
  const [selectedFolderId, setSelectedFolderId] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingBookmark, setEditingBookmark] = useState<BookmarkItem | null>(null);
  const [showAddFolder, setShowAddFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');

  // Add bookmark form
  const [addTitle, setAddTitle] = useState('');
  const [addUrl, setAddUrl] = useState('');
  const [addDesc, setAddDesc] = useState('');
  const [addFolder, setAddFolder] = useState('favorites');

  const filteredBookmarks = bookmarks.filter(b => {
    const matchesFolder = selectedFolderId === 'all' || b.folderId === selectedFolderId;
    const matchesSearch = !searchQuery ||
      b.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      b.url.toLowerCase().includes(searchQuery.toLowerCase()) ||
      b.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesFolder && matchesSearch;
  });

  const addBookmark = () => {
    if (!addTitle.trim() || !addUrl.trim()) return;
    const newBookmark: BookmarkItem = {
      id: `b-${Date.now()}`,
      title: addTitle.trim(),
      url: addUrl.trim(),
      description: addDesc.trim(),
      folderId: addFolder,
      dateAdded: new Date().toISOString().split('T')[0],
      favicon: '🔖',
      visitCount: 0,
    };
    setBookmarks(prev => [newBookmark, ...prev]);
    setAddTitle('');
    setAddUrl('');
    setAddDesc('');
    setShowAddDialog(false);
  };

  const updateBookmark = () => {
    if (!editingBookmark || !editingBookmark.title.trim() || !editingBookmark.url.trim()) return;
    setBookmarks(prev => prev.map(b => b.id === editingBookmark.id ? editingBookmark : b));
    setEditingBookmark(null);
  };

  const deleteBookmark = (id: string) => {
    setBookmarks(prev => prev.filter(b => b.id !== id));
  };

  const addFolder_fn = () => {
    if (!newFolderName.trim()) return;
    const newFolder: BookmarkFolder = {
      id: `folder-${Date.now()}`,
      name: newFolderName.trim(),
      parentId: null,
      icon: Folder,
    };
    setFolders(prev => [...prev, newFolder]);
    setNewFolderName('');
    setShowAddFolder(false);
  };

  const deleteFolder = (folderId: string) => {
    if (folderId === 'all' || folderId === 'favorites') return;
    setFolders(prev => prev.filter(f => f.id !== folderId));
    setBookmarks(prev => prev.map(b => b.folderId === folderId ? { ...b, folderId: 'favorites' } : b));
    if (selectedFolderId === folderId) setSelectedFolderId('all');
  };

  const exportBookmarks = () => {
    const data = {
      bookmarks,
      folders: folders.filter(f => f.id !== 'all'),
      exportDate: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
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
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const data = JSON.parse(ev.target?.result as string);
          if (data.bookmarks) setBookmarks(prev => [...data.bookmarks, ...prev]);
          if (data.folders) setFolders(prev => [...prev, ...data.folders.filter((f: BookmarkFolder) => !prev.some(pf => pf.id === f.id))]);
        } catch {
          alert('导入失败：无效的JSON文件');
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  const getFolderName = (folderId: string) => {
    return folders.find(f => f.id === folderId)?.name || folderId;
  };

  const folderBookmarkCounts = folders.map(f => ({
    ...f,
    count: bookmarks.filter(b => f.id === 'all' ? true : b.folderId === f.id).length,
  }));

  return (
    <div className="w-full h-full flex" style={{ backgroundColor: 'var(--ink-50)' }}>
      {/* Folder sidebar */}
      <div className="w-52 flex-shrink-0 flex flex-col" style={{ backgroundColor: 'var(--ink-100)', borderRight: '1px solid var(--ink-200)' }}>
        <div className="p-3" style={{ borderBottom: '1px solid var(--ink-200)' }}>
          <h2 className="text-heading-sm mb-2" style={{ color: 'var(--ink-900)' }}>书签 (Bookmarks)</h2>
          <button
            onClick={() => setShowAddDialog(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-caption transition-all duration-150 hover:bg-black/5 w-full mb-1"
            style={{ color: 'var(--ink-600)' }}
          >
            <Plus size={14} /> 添加书签 (Add)
          </button>
          <button
            onClick={() => setShowAddFolder(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-caption transition-all duration-150 hover:bg-black/5 w-full"
            style={{ color: 'var(--ink-600)' }}
          >
            <Folder size={14} /> 新建文件夹 (New Folder)
          </button>
        </div>

        {showAddFolder && (
          <div className="p-3" style={{ borderBottom: '1px solid var(--ink-200)' }}>
            <input
              type="text"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="文件夹名称..."
              className="w-full px-2 py-1 rounded text-caption outline-none mb-2"
              style={{ backgroundColor: 'var(--ink-50)', border: '1px solid var(--ink-200)', color: 'var(--ink-700)' }}
              onKeyDown={(e) => e.key === 'Enter' && addFolder_fn()}
            />
            <div className="flex gap-2">
              <button onClick={addFolder_fn} className="px-3 py-1 rounded text-caption" style={{ backgroundColor: 'var(--ink-800)', color: 'var(--ink-50)' }}>创建</button>
              <button onClick={() => setShowAddFolder(false)} className="px-3 py-1 rounded text-caption" style={{ color: 'var(--ink-500)' }}>取消</button>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-auto">
          {folderBookmarkCounts.map(folder => {
            const FolderIcon = folder.icon;
            return (
              <button
                key={folder.id}
                onClick={() => setSelectedFolderId(folder.id)}
                className="w-full flex items-center gap-2.5 px-4 py-2 text-left text-body-sm transition-all duration-150 group"
                style={{
                  backgroundColor: selectedFolderId === folder.id ? 'var(--wash-light)' : 'transparent',
                  borderLeft: selectedFolderId === folder.id ? '3px solid var(--cinnabar)' : '3px solid transparent',
                  color: selectedFolderId === folder.id ? 'var(--ink-900)' : 'var(--ink-600)',
                }}
              >
                <FolderIcon size={16} />
                <span className="flex-1 truncate">{folder.name}</span>
                <span className="text-caption" style={{ color: 'var(--ink-400)' }}>{folder.count}</span>
                {folder.id !== 'all' && folder.id !== 'favorites' && (
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteFolder(folder.id); }}
                    className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-black/5"
                  >
                    <Trash2 size={10} style={{ color: 'var(--ink-400)' }} />
                  </button>
                )}
              </button>
            );
          })}
        </div>

        {/* Import/Export */}
        <div className="p-2" style={{ borderTop: '1px solid var(--ink-200)' }}>
          <button
            onClick={importBookmarks}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-caption transition-all duration-150 hover:bg-black/5 w-full"
            style={{ color: 'var(--ink-600)' }}
          >
            <Upload size={14} /> 导入 (Import)
          </button>
          <button
            onClick={exportBookmarks}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-caption transition-all duration-150 hover:bg-black/5 w-full"
            style={{ color: 'var(--ink-600)' }}
          >
            <Download size={14} /> 导出 (Export)
          </button>
        </div>
      </div>

      {/* Main area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center gap-3 px-4 py-2 flex-shrink-0" style={{ backgroundColor: 'var(--ink-100)', borderBottom: '1px solid var(--ink-200)' }}>
          <div className="flex items-center gap-2 flex-1">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full flex-1 max-w-xs" style={{ backgroundColor: 'var(--ink-50)', border: '1px solid var(--ink-200)' }}>
              <Search size={14} style={{ color: 'var(--ink-400)' }} />
              <input
                type="text"
                placeholder="搜索书签 (Search)..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="flex-1 text-body-sm bg-transparent outline-none"
                style={{ color: 'var(--ink-700)' }}
              />
            </div>
          </div>
          <span className="text-caption" style={{ color: 'var(--ink-500)' }}>
            {filteredBookmarks.length} 个书签
          </span>
          <div className="flex items-center gap-1" style={{ border: '1px solid var(--ink-200)', borderRadius: '4px' }}>
            <button
              onClick={() => setViewMode('list')}
              className="p-1.5 transition-all duration-150"
              style={{ backgroundColor: viewMode === 'list' ? 'var(--ink-200)' : 'transparent' }}
            >
              <List size={14} style={{ color: viewMode === 'list' ? 'var(--ink-800)' : 'var(--ink-400)' }} />
            </button>
            <button
              onClick={() => setViewMode('grid')}
              className="p-1.5 transition-all duration-150"
              style={{ backgroundColor: viewMode === 'grid' ? 'var(--ink-200)' : 'transparent' }}
            >
              <LayoutGrid size={14} style={{ color: viewMode === 'grid' ? 'var(--ink-800)' : 'var(--ink-400)' }} />
            </button>
          </div>
        </div>

        {/* Bookmark list */}
        <div className="flex-1 overflow-auto p-3">
          {filteredBookmarks.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-2">
              <Bookmark size={48} style={{ color: 'var(--ink-300)' }} />
              <span className="text-body-md" style={{ color: 'var(--ink-400)' }}>暂无书签 (No bookmarks)</span>
            </div>
          ) : viewMode === 'list' ? (
            <div className="space-y-1">
              {filteredBookmarks.map(bm => (
                <div
                  key={bm.id}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-150 group"
                  style={{ backgroundColor: 'var(--ink-100)', borderBottom: '1px solid var(--ink-200)' }}
                >
                  <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'var(--ink-200)' }}>
                    <FaviconIcon icon={bm.favicon} size={16} style={{ color: 'var(--ink-600)' }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-body-sm font-medium truncate" style={{ color: 'var(--ink-800)' }}>{bm.title}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-caption font-mono truncate" style={{ color: 'var(--ink-400)' }}>{bm.url}</span>
                      <span className="text-caption flex-shrink-0" style={{ color: 'var(--ink-300)' }}>|</span>
                      <span className="text-caption flex-shrink-0" style={{ color: 'var(--ink-500)' }}>{getFolderName(bm.folderId)}</span>
                    </div>
                    {bm.description && (
                      <div className="text-caption truncate" style={{ color: 'var(--ink-500)' }}>{bm.description}</div>
                    )}
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => setEditingBookmark(bm)}
                      className="p-1.5 rounded transition-all duration-150 hover:bg-black/5"
                      title="编辑 (Edit)"
                    >
                      <Edit2 size={14} style={{ color: 'var(--ink-500)' }} />
                    </button>
                    <button
                      onClick={() => deleteBookmark(bm.id)}
                      className="p-1.5 rounded transition-all duration-150 hover:bg-black/5"
                      title="删除 (Delete)"
                    >
                      <Trash2 size={14} style={{ color: 'var(--cinnabar-light)' }} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {filteredBookmarks.map(bm => (
                <div
                  key={bm.id}
                  className="p-3 rounded-lg transition-all duration-150 group"
                  style={{ backgroundColor: 'var(--ink-100)', border: '1px solid var(--ink-200)' }}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'var(--ink-200)' }}>
                      <FaviconIcon icon={bm.favicon} size={14} style={{ color: 'var(--ink-600)' }} />
                    </div>
                    <span className="text-body-sm font-medium truncate" style={{ color: 'var(--ink-800)' }}>{bm.title}</span>
                  </div>
                  <div className="text-caption font-mono truncate mb-1" style={{ color: 'var(--ink-400)' }}>{bm.url}</div>
                  {bm.description && (
                    <div className="text-caption truncate mb-2" style={{ color: 'var(--ink-500)' }}>{bm.description}</div>
                  )}
                  <div className="flex items-center justify-between">
                    <span className="text-caption" style={{ color: 'var(--ink-400)' }}>{bm.dateAdded}</span>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => setEditingBookmark(bm)}
                        className="p-1 rounded transition-all duration-150 hover:bg-black/5"
                      >
                        <Edit2 size={12} style={{ color: 'var(--ink-500)' }} />
                      </button>
                      <button
                        onClick={() => deleteBookmark(bm.id)}
                        className="p-1 rounded transition-all duration-150 hover:bg-black/5"
                      >
                        <Trash2 size={12} style={{ color: 'var(--cinnabar-light)' }} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Add bookmark dialog */}
      {showAddDialog && (
        <div className="fixed inset-0 flex items-center justify-center z-50" style={{ backgroundColor: 'rgba(26,26,26,0.35)', backdropFilter: 'blur(4px)' }}>
          <div className="w-96 p-6 rounded-lg" style={{ backgroundColor: 'var(--ink-100)', boxShadow: 'var(--shadow-xl)' }}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-heading-sm" style={{ color: 'var(--ink-900)' }}>添加书签 (Add Bookmark)</h3>
              <button onClick={() => setShowAddDialog(false)} className="p-1 rounded hover:bg-black/5">
                <X size={16} style={{ color: 'var(--ink-400)' }} />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-caption block mb-1" style={{ color: 'var(--ink-500)' }}>标题 (Title)</label>
                <input
                  type="text"
                  value={addTitle}
                  onChange={(e) => setAddTitle(e.target.value)}
                  className="w-full px-3 py-2 rounded text-body-sm outline-none"
                  style={{ backgroundColor: 'var(--ink-50)', border: '1px solid var(--ink-200)', color: 'var(--ink-900)' }}
                />
              </div>
              <div>
                <label className="text-caption block mb-1" style={{ color: 'var(--ink-500)' }}>链接 (URL)</label>
                <input
                  type="text"
                  value={addUrl}
                  onChange={(e) => setAddUrl(e.target.value)}
                  className="w-full px-3 py-2 rounded text-body-sm outline-none"
                  style={{ backgroundColor: 'var(--ink-50)', border: '1px solid var(--ink-200)', color: 'var(--ink-900)' }}
                  placeholder="https://"
                />
              </div>
              <div>
                <label className="text-caption block mb-1" style={{ color: 'var(--ink-500)' }}>描述 (Description)</label>
                <input
                  type="text"
                  value={addDesc}
                  onChange={(e) => setAddDesc(e.target.value)}
                  className="w-full px-3 py-2 rounded text-body-sm outline-none"
                  style={{ backgroundColor: 'var(--ink-50)', border: '1px solid var(--ink-200)', color: 'var(--ink-900)' }}
                />
              </div>
              <div>
                <label className="text-caption block mb-1" style={{ color: 'var(--ink-500)' }}>文件夹 (Folder)</label>
                <select
                  value={addFolder}
                  onChange={(e) => setAddFolder(e.target.value)}
                  className="w-full px-3 py-2 rounded text-body-sm outline-none"
                  style={{ backgroundColor: 'var(--ink-50)', border: '1px solid var(--ink-200)', color: 'var(--ink-900)' }}
                >
                  {folders.filter(f => f.id !== 'all').map(f => (
                    <option key={f.id} value={f.id}>{f.name}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-3 pt-2">
                <button
                  onClick={addBookmark}
                  className="flex-1 py-2 rounded text-body-sm transition-all duration-150 hover:scale-[1.02]"
                  style={{ backgroundColor: 'var(--ink-800)', color: 'var(--ink-50)' }}
                >
                  添加 (Add)
                </button>
                <button
                  onClick={() => setShowAddDialog(false)}
                  className="flex-1 py-2 rounded text-body-sm transition-all duration-150"
                  style={{ backgroundColor: 'var(--ink-200)', color: 'var(--ink-700)' }}
                >
                  取消 (Cancel)
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit bookmark dialog */}
      {editingBookmark && (
        <div className="fixed inset-0 flex items-center justify-center z-50" style={{ backgroundColor: 'rgba(26,26,26,0.35)', backdropFilter: 'blur(4px)' }}>
          <div className="w-96 p-6 rounded-lg" style={{ backgroundColor: 'var(--ink-100)', boxShadow: 'var(--shadow-xl)' }}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-heading-sm" style={{ color: 'var(--ink-900)' }}>编辑书签 (Edit Bookmark)</h3>
              <button onClick={() => setEditingBookmark(null)} className="p-1 rounded hover:bg-black/5">
                <X size={16} style={{ color: 'var(--ink-400)' }} />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-caption block mb-1" style={{ color: 'var(--ink-500)' }}>标题 (Title)</label>
                <input
                  type="text"
                  value={editingBookmark.title}
                  onChange={(e) => setEditingBookmark({ ...editingBookmark, title: e.target.value })}
                  className="w-full px-3 py-2 rounded text-body-sm outline-none"
                  style={{ backgroundColor: 'var(--ink-50)', border: '1px solid var(--ink-200)', color: 'var(--ink-900)' }}
                />
              </div>
              <div>
                <label className="text-caption block mb-1" style={{ color: 'var(--ink-500)' }}>链接 (URL)</label>
                <input
                  type="text"
                  value={editingBookmark.url}
                  onChange={(e) => setEditingBookmark({ ...editingBookmark, url: e.target.value })}
                  className="w-full px-3 py-2 rounded text-body-sm outline-none"
                  style={{ backgroundColor: 'var(--ink-50)', border: '1px solid var(--ink-200)', color: 'var(--ink-900)' }}
                />
              </div>
              <div>
                <label className="text-caption block mb-1" style={{ color: 'var(--ink-500)' }}>描述 (Description)</label>
                <input
                  type="text"
                  value={editingBookmark.description}
                  onChange={(e) => setEditingBookmark({ ...editingBookmark, description: e.target.value })}
                  className="w-full px-3 py-2 rounded text-body-sm outline-none"
                  style={{ backgroundColor: 'var(--ink-50)', border: '1px solid var(--ink-200)', color: 'var(--ink-900)' }}
                />
              </div>
              <div>
                <label className="text-caption block mb-1" style={{ color: 'var(--ink-500)' }}>文件夹 (Folder)</label>
                <select
                  value={editingBookmark.folderId}
                  onChange={(e) => setEditingBookmark({ ...editingBookmark, folderId: e.target.value })}
                  className="w-full px-3 py-2 rounded text-body-sm outline-none"
                  style={{ backgroundColor: 'var(--ink-50)', border: '1px solid var(--ink-200)', color: 'var(--ink-900)' }}
                >
                  {folders.filter(f => f.id !== 'all').map(f => (
                    <option key={f.id} value={f.id}>{f.name}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-3 pt-2">
                <button
                  onClick={updateBookmark}
                  className="flex-1 py-2 rounded text-body-sm transition-all duration-150 hover:scale-[1.02]"
                  style={{ backgroundColor: 'var(--ink-800)', color: 'var(--ink-50)' }}
                >
                  保存 (Save)
                </button>
                <button
                  onClick={() => setEditingBookmark(null)}
                  className="flex-1 py-2 rounded text-body-sm transition-all duration-150"
                  style={{ backgroundColor: 'var(--ink-200)', color: 'var(--ink-700)' }}
                >
                  取消 (Cancel)
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

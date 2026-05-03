import { useState, useEffect, useRef } from 'react';
import {
  Download, Plus, X, Play, Pause, RotateCw, Trash2, CheckCircle,
  AlertCircle, Clock, File, FileText, Image, Music,
  Video, Archive, Code, Search
} from 'lucide-react';

type DownloadStatus = 'downloading' | 'paused' | 'completed' | 'failed' | 'queued';

interface DownloadItem {
  id: string;
  fileName: string;
  url: string;
  size: string;
  sizeBytes: number;
  downloaded: number;
  progress: number;
  status: DownloadStatus;
  speed: string;
  eta: string;
  date: string;
  fileType: string;
}

interface DownloadManagerProps {
  windowId?: string;
}

const STATUS_CONFIG: Record<DownloadStatus, { label: string; color: string; bgColor: string; icon: typeof CheckCircle }> = {
  downloading: { label: '下载中 (Downloading)', color: 'var(--cinnabar)', bgColor: 'rgba(179,57,47,0.1)', icon: Download },
  paused: { label: '已暂停 (Paused)', color: 'var(--warning)', bgColor: 'rgba(184,134,11,0.1)', icon: Pause },
  completed: { label: '已完成 (Completed)', color: 'var(--success)', bgColor: 'rgba(74,124,89,0.1)', icon: CheckCircle },
  failed: { label: '失败 (Failed)', color: 'var(--cinnabar-light)', bgColor: 'rgba(201,74,63,0.1)', icon: AlertCircle },
  queued: { label: '排队中 (Queued)', color: 'var(--ink-500)', bgColor: 'var(--wash-faint)', icon: Clock },
};

const FILE_TYPE_ICONS: Record<string, typeof File> = {
  pdf: FileText,
  jpg: Image,
  png: Image,
  mp3: Music,
  mp4: Video,
  zip: Archive,
  js: Code,
  ts: Code,
  default: File,
};

function getFileIcon(fileName: string) {
  const ext = fileName.split('.').pop()?.toLowerCase() || 'default';
  return FILE_TYPE_ICONS[ext] || FILE_TYPE_ICONS.default;
}

const INITIAL_DOWNLOADS: DownloadItem[] = [
  { id: 'd1', fileName: 'ink-os-wallpaper-pack.zip', url: 'https://download.ink/os/wallpapers.zip', size: '45 MB', sizeBytes: 47185920, downloaded: 47185920, progress: 100, status: 'completed', speed: '0 KB/s', eta: '0s', date: '2024-01-15', fileType: 'zip' },
  { id: 'd2', fileName: 'guqin-classical.mp3', url: 'https://music.ink/downloads/guqin.mp3', size: '12 MB', sizeBytes: 12582912, downloaded: 12582912, progress: 100, status: 'completed', speed: '0 KB/s', eta: '0s', date: '2024-01-14', fileType: 'mp3' },
  { id: 'd3', fileName: 'calligraphy-fonts.ttf', url: 'https://fonts.ink/download/calligraphy.ttf', size: '8 MB', sizeBytes: 8388608, downloaded: 5452595, progress: 65, status: 'downloading', speed: '2.4 MB/s', eta: '1s', date: '2024-01-15', fileType: 'ttf' },
  { id: 'd4', fileName: 'ink-painting-tutorial.pdf', url: 'https://docs.ink/painting-tutorial.pdf', size: '24 MB', sizeBytes: 25165824, downloaded: 7549747, progress: 30, status: 'downloading', speed: '1.8 MB/s', eta: '10s', date: '2024-01-15', fileType: 'pdf' },
  { id: 'd5', fileName: 'zen-garden-video.mp4', url: 'https://video.ink/zen-garden.mp4', size: '156 MB', sizeBytes: 163577856, downloaded: 73610035, progress: 45, status: 'paused', speed: '0 KB/s', eta: '--', date: '2024-01-13', fileType: 'mp4' },
  { id: 'd6', fileName: 'landscape-collection.jpg', url: 'https://images.ink/landscape.jpg', size: '6.5 MB', sizeBytes: 6815744, downloaded: 0, progress: 0, status: 'queued', speed: '0 KB/s', eta: '--', date: '2024-01-15', fileType: 'jpg' },
  { id: 'd7', fileName: 'poetry-anthology.epub', url: 'https://books.ink/poetry.epub', size: '3.2 MB', sizeBytes: 3355443, downloaded: 3355443, progress: 100, status: 'completed', speed: '0 KB/s', eta: '0s', date: '2024-01-12', fileType: 'epub' },
  { id: 'd8', fileName: 'brush-stroke-pack.zip', url: 'https://assets.ink/brush-strokes.zip', size: '18 MB', sizeBytes: 18874368, downloaded: 0, progress: 0, status: 'failed', speed: '0 KB/s', eta: '--', date: '2024-01-11', fileType: 'zip' },
  { id: 'd9', fileName: 'ink-os-source.tar.gz', url: 'https://github.ink/ink-os/source.tar.gz', size: '32 MB', sizeBytes: 33554432, downloaded: 16777216, progress: 50, status: 'downloading', speed: '3.1 MB/s', eta: '5s', date: '2024-01-15', fileType: 'tar.gz' },
  { id: 'd10', fileName: 'traditional-colors.png', url: 'https://design.ink/colors.png', size: '2.1 MB', sizeBytes: 2202009, downloaded: 0, progress: 0, status: 'queued', speed: '0 KB/s', eta: '--', date: '2024-01-15', fileType: 'png' },
  { id: 'd11', fileName: 'meditation-guide.pdf', url: 'https://docs.ink/meditation.pdf', size: '5.8 MB', sizeBytes: 6081740, downloaded: 6081740, progress: 100, status: 'completed', speed: '0 KB/s', eta: '0s', date: '2024-01-10', fileType: 'pdf' },
  { id: 'd12', fileName: 'bamboo-garden.mp4', url: 'https://video.ink/bamboo.mp4', size: '89 MB', sizeBytes: 93323264, downloaded: 0, progress: 0, status: 'failed', speed: '0 KB/s', eta: '--', date: '2024-01-09', fileType: 'mp4' },
];

let downloadIdCounter = 12;

export default function DownloadManager({ windowId: _windowId }: DownloadManagerProps) {
  const [downloads, setDownloads] = useState<DownloadItem[]>(INITIAL_DOWNLOADS);
  const [filter, setFilter] = useState<'all' | 'downloading' | 'completed' | 'failed'>('all');
  const [newUrl, setNewUrl] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Simulate progress for downloading items
  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setDownloads(prev => prev.map(d => {
        if (d.status !== 'downloading') return d;
        const increment = Math.random() * 2 + 0.5;
        const newProgress = Math.min(d.progress + increment, 99);
        const newDownloaded = Math.floor(d.sizeBytes * (newProgress / 100));
        const speed = `${(Math.random() * 4 + 0.5).toFixed(1)} MB/s`;
        const remainingBytes = d.sizeBytes - newDownloaded;
        const speedBytes = 2 * 1024 * 1024;
        const remainingSeconds = Math.ceil(remainingBytes / speedBytes);
        const eta = remainingSeconds < 60 ? `${remainingSeconds}s` : `${Math.ceil(remainingSeconds / 60)}m`;

        if (newProgress >= 99) {
          return { ...d, progress: 100, downloaded: d.sizeBytes, status: 'completed' as const, speed: '0 KB/s', eta: '0s' };
        }
        return { ...d, progress: newProgress, downloaded: newDownloaded, speed, eta };
      }));
    }, 1000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const filteredDownloads = downloads.filter(d => {
    const matchesFilter = filter === 'all' ||
      (filter === 'downloading' && (d.status === 'downloading' || d.status === 'paused' || d.status === 'queued')) ||
      (filter === 'completed' && d.status === 'completed') ||
      (filter === 'failed' && (d.status === 'failed'));
    const matchesSearch = !searchQuery ||
      d.fileName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      d.url.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  const addDownload = () => {
    if (!newUrl.trim()) return;
    const url = newUrl.trim();
    const fileName = url.split('/').pop() || 'unknown.file';
    const sizeBytes = Math.floor(Math.random() * 50 * 1024 * 1024) + 1024 * 1024;
    const newDownload: DownloadItem = {
      id: `d-${++downloadIdCounter}`,
      fileName,
      url,
      size: `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`,
      sizeBytes,
      downloaded: 0,
      progress: 0,
      status: 'queued',
      speed: '0 KB/s',
      eta: '--',
      date: new Date().toISOString().split('T')[0],
      fileType: fileName.split('.').pop() || 'unknown',
    };
    setDownloads(prev => [newDownload, ...prev]);
    setNewUrl('');
    setShowAddForm(false);

    // Start after 1 second
    setTimeout(() => {
      setDownloads(prev => prev.map(d => d.id === newDownload.id ? { ...d, status: 'downloading' as const } : d));
    }, 1000);
  };

  const pauseDownload = (id: string) => {
    setDownloads(prev => prev.map(d => d.id === id ? { ...d, status: 'paused' as const, speed: '0 KB/s', eta: '--' } : d));
  };

  const resumeDownload = (id: string) => {
    setDownloads(prev => prev.map(d => d.id === id ? { ...d, status: 'downloading' as const } : d));
  };

  const cancelDownload = (id: string) => {
    setDownloads(prev => prev.map(d => d.id === id ? { ...d, status: 'failed' as const, speed: '0 KB/s', eta: '--' } : d));
  };

  const retryDownload = (id: string) => {
    setDownloads(prev => prev.map(d => {
      if (d.id !== id) return d;
      return { ...d, status: 'downloading' as const, progress: 0, downloaded: 0 };
    }));
  };

  const removeDownload = (id: string) => {
    setDownloads(prev => prev.filter(d => d.id !== id));
  };

  const clearCompleted = () => {
    setDownloads(prev => prev.filter(d => d.status !== 'completed'));
  };

  const filters = [
    { id: 'all' as const, label: '全部 (All)', count: downloads.length },
    { id: 'downloading' as const, label: '下载中 (Downloading)', count: downloads.filter(d => d.status === 'downloading' || d.status === 'paused' || d.status === 'queued').length },
    { id: 'completed' as const, label: '已完成 (Completed)', count: downloads.filter(d => d.status === 'completed').length },
    { id: 'failed' as const, label: '失败 (Failed)', count: downloads.filter(d => d.status === 'failed').length },
  ];

  return (
    <div className="w-full h-full flex flex-col" style={{ backgroundColor: 'var(--ink-50)' }}>
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2 flex-shrink-0" style={{ backgroundColor: 'var(--ink-100)', borderBottom: '1px solid var(--ink-200)' }}>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded text-body-sm transition-all duration-150 hover:scale-[1.02]"
          style={{ backgroundColor: 'var(--ink-800)', color: 'var(--ink-50)' }}
        >
          <Plus size={14} />
          新建 (Add)
        </button>
        <button
          onClick={clearCompleted}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded text-body-sm transition-all duration-150 hover:bg-black/5"
          style={{ color: 'var(--ink-600)' }}
        >
          <Trash2 size={14} />
          清除已完成 (Clear)
        </button>
        <div className="ml-auto flex items-center gap-2 px-3 py-1.5 rounded-full" style={{ backgroundColor: 'var(--ink-50)', border: '1px solid var(--ink-200)' }}>
          <Search size={14} style={{ color: 'var(--ink-400)' }} />
          <input
            type="text"
            placeholder="搜索 (Search)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1 text-body-sm bg-transparent outline-none w-32"
            style={{ color: 'var(--ink-700)' }}
          />
        </div>
      </div>

      {/* Add form */}
      {showAddForm && (
        <div className="flex items-center gap-2 px-4 py-2 flex-shrink-0" style={{ backgroundColor: 'var(--ink-100)', borderBottom: '1px solid var(--ink-200)' }}>
          <input
            type="text"
            value={newUrl}
            onChange={(e) => setNewUrl(e.target.value)}
            placeholder="输入下载链接 (Enter download URL)..."
            className="flex-1 px-3 py-1.5 rounded text-body-sm outline-none"
            style={{ backgroundColor: 'var(--ink-50)', border: '1px solid var(--ink-200)', color: 'var(--ink-900)' }}
            onKeyDown={(e) => e.key === 'Enter' && addDownload()}
          />
          <button
            onClick={addDownload}
            className="px-4 py-1.5 rounded text-body-sm transition-all duration-150 hover:scale-[1.02]"
            style={{ backgroundColor: 'var(--ink-800)', color: 'var(--ink-50)' }}
          >
            开始 (Start)
          </button>
          <button onClick={() => setShowAddForm(false)} className="p-1.5 rounded hover:bg-black/5">
            <X size={16} style={{ color: 'var(--ink-400)' }} />
          </button>
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex items-center gap-1 px-4 py-1.5 flex-shrink-0" style={{ backgroundColor: 'var(--ink-100)', borderBottom: '1px solid var(--ink-200)' }}>
        {filters.map(f => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className="flex items-center gap-1.5 px-3 py-1 rounded text-caption transition-all duration-150"
            style={{
              backgroundColor: filter === f.id ? 'var(--wash-light)' : 'transparent',
              color: filter === f.id ? 'var(--ink-900)' : 'var(--ink-500)',
              border: filter === f.id ? '1px solid var(--ink-300)' : '1px solid transparent',
            }}
          >
            {f.label}
            <span className="text-caption px-1.5 py-0.5 rounded-full" style={{ backgroundColor: 'var(--ink-200)', color: 'var(--ink-600)', fontSize: '10px' }}>
              {f.count}
            </span>
          </button>
        ))}
      </div>

      {/* Download list */}
      <div className="flex-1 overflow-auto p-3 space-y-2">
        {filteredDownloads.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2">
            <Download size={48} style={{ color: 'var(--ink-300)' }} />
            <span className="text-body-md" style={{ color: 'var(--ink-400)' }}>
              {filter === 'all' ? '暂无下载任务 (No downloads)' : '该分类下暂无任务 (No items in this category)'}
            </span>
          </div>
        ) : (
          filteredDownloads.map(d => {
            const Icon = getFileIcon(d.fileName);
            const statusConfig = STATUS_CONFIG[d.status];
            return (
              <div
                key={d.id}
                className="rounded-lg p-3 transition-all duration-150"
                style={{ backgroundColor: 'var(--ink-100)', borderLeft: `3px solid ${statusConfig.color}` }}
              >
                <div className="flex items-center gap-3">
                  <Icon size={20} style={{ color: 'var(--ink-500)', flexShrink: 0 }} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-body-sm font-medium truncate" style={{ color: 'var(--ink-800)' }}>{d.fileName}</span>
                      <span
                        className="text-caption px-2 py-0.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: statusConfig.bgColor, color: statusConfig.color }}
                      >
                        {statusConfig.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-caption" style={{ color: 'var(--ink-500)' }}>{d.size}</span>
                      <span className="text-caption" style={{ color: 'var(--ink-400)' }}>{d.date}</span>
                      {d.status === 'downloading' && (
                        <>
                          <span className="text-caption font-mono" style={{ color: 'var(--ink-600)' }}>{d.speed}</span>
                          <span className="text-caption font-mono" style={{ color: 'var(--ink-600)' }}>剩余 {d.eta}</span>
                        </>
                      )}
                    </div>
                    {/* Progress bar */}
                    <div className="mt-2 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--ink-200)' }}>
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${d.progress}%`,
                          backgroundColor: d.status === 'completed' ? 'var(--success)' : d.status === 'failed' ? 'var(--cinnabar-light)' : 'var(--cinnabar)',
                        }}
                      />
                    </div>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-caption font-mono" style={{ color: 'var(--ink-500)' }}>
                        {d.progress.toFixed(0)}%
                      </span>
                      <span className="text-caption font-mono" style={{ color: 'var(--ink-400)' }}>
                        {(d.downloaded / (1024 * 1024)).toFixed(1)} / {(d.sizeBytes / (1024 * 1024)).toFixed(1)} MB
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {d.status === 'downloading' && (
                      <button
                        onClick={() => pauseDownload(d.id)}
                        className="p-1.5 rounded transition-all duration-150 hover:bg-black/5"
                        title="暂停 (Pause)"
                      >
                        <Pause size={14} style={{ color: 'var(--warning)' }} />
                      </button>
                    )}
                    {d.status === 'paused' && (
                      <button
                        onClick={() => resumeDownload(d.id)}
                        className="p-1.5 rounded transition-all duration-150 hover:bg-black/5"
                        title="继续 (Resume)"
                      >
                        <Play size={14} style={{ color: 'var(--success)' }} />
                      </button>
                    )}
                    {(d.status === 'downloading' || d.status === 'paused' || d.status === 'queued') && (
                      <button
                        onClick={() => cancelDownload(d.id)}
                        className="p-1.5 rounded transition-all duration-150 hover:bg-black/5"
                        title="取消 (Cancel)"
                      >
                        <X size={14} style={{ color: 'var(--ink-500)' }} />
                      </button>
                    )}
                    {d.status === 'failed' && (
                      <button
                        onClick={() => retryDownload(d.id)}
                        className="p-1.5 rounded transition-all duration-150 hover:bg-black/5"
                        title="重试 (Retry)"
                      >
                        <RotateCw size={14} style={{ color: 'var(--success)' }} />
                      </button>
                    )}
                    {d.status === 'completed' && (
                      <button
                        onClick={() => removeDownload(d.id)}
                        className="p-1.5 rounded transition-all duration-150 hover:bg-black/5"
                        title="删除 (Remove)"
                      >
                        <Trash2 size={14} style={{ color: 'var(--ink-400)' }} />
                      </button>
                    )}
                    {d.status === 'failed' && (
                      <button
                        onClick={() => removeDownload(d.id)}
                        className="p-1.5 rounded transition-all duration-150 hover:bg-black/5"
                        title="删除 (Remove)"
                      >
                        <Trash2 size={14} style={{ color: 'var(--ink-400)' }} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Status bar */}
      <div className="flex items-center justify-between px-4 py-1.5 flex-shrink-0" style={{ backgroundColor: 'var(--ink-100)', borderTop: '1px solid var(--ink-200)' }}>
        <div className="flex items-center gap-4">
          <span className="text-caption" style={{ color: 'var(--ink-500)' }}>
            总计: {downloads.length} 个文件
          </span>
          <span className="text-caption" style={{ color: 'var(--cinnabar)' }}>
            下载中: {downloads.filter(d => d.status === 'downloading').length}
          </span>
          <span className="text-caption" style={{ color: 'var(--success)' }}>
            已完成: {downloads.filter(d => d.status === 'completed').length}
          </span>
        </div>
        <span className="text-caption font-mono" style={{ color: 'var(--ink-500)' }}>
          总大小: {(downloads.reduce((sum, d) => sum + d.sizeBytes, 0) / (1024 * 1024 * 1024)).toFixed(2)} GB
        </span>
      </div>
    </div>
  );
}

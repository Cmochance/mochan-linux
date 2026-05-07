import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Download, Plus, X, RotateCw, Trash2, CheckCircle, AlertCircle, Clock,
  File, FileText, Image, Music, Video, Archive, Code, Search, FolderOpen,
  Package
} from 'lucide-react';
import { downloadsClient, type DownloadJob, type DownloadStatus, type InstallVerdict } from '../lib/downloads';
import { fsClient, formatSize } from '../lib/fs';
import { openInFileManager } from '../lib/openFile';
import { ApiError } from '../lib/api';

interface DownloadManagerProps {
  windowId?: string;
}

type Filter = 'all' | 'downloading' | 'completed' | 'failed';

const STATUS_CONFIG: Record<DownloadStatus, { label: string; color: string; bgColor: string; icon: typeof CheckCircle }> = {
  queued: { label: '排队中 (Queued)', color: 'var(--ink-500)', bgColor: 'var(--wash-faint)', icon: Clock },
  downloading: { label: '下载中 (Downloading)', color: 'var(--cinnabar)', bgColor: 'rgba(179,57,47,0.1)', icon: Download },
  completed: { label: '已完成 (Completed)', color: 'var(--success)', bgColor: 'rgba(74,124,89,0.1)', icon: CheckCircle },
  failed: { label: '失败 (Failed)', color: 'var(--cinnabar-light)', bgColor: 'rgba(201,74,63,0.1)', icon: AlertCircle },
  canceled: { label: '已取消 (Canceled)', color: 'var(--ink-500)', bgColor: 'var(--wash-faint)', icon: X },
};

const FILE_TYPE_ICONS: Record<string, typeof File> = {
  pdf: FileText,
  jpg: Image,
  jpeg: Image,
  png: Image,
  gif: Image,
  webp: Image,
  mp3: Music,
  wav: Music,
  flac: Music,
  mp4: Video,
  mov: Video,
  webm: Video,
  zip: Archive,
  gz: Archive,
  tgz: Archive,
  rar: Archive,
  js: Code,
  ts: Code,
  json: Code,
  default: File,
};

function getFileIcon(fileName: string) {
  const ext = fileName.split('.').pop()?.toLowerCase() || 'default';
  return FILE_TYPE_ICONS[ext] || FILE_TYPE_ICONS.default;
}

function isActive(status: DownloadStatus): boolean {
  return status === 'queued' || status === 'downloading';
}

function isFailedBucket(status: DownloadStatus): boolean {
  return status === 'failed' || status === 'canceled';
}

function progressOf(job: DownloadJob): number {
  if (job.status === 'completed') return 100;
  if (job.size_bytes <= 0) return 0;
  return Math.max(0, Math.min(100, (job.downloaded / job.size_bytes) * 100));
}

function formatBytesPerSecond(bytes: number): string {
  if (bytes <= 0) return '0 KB/s';
  return `${formatSize(bytes)}/s`;
}

function formatDownloaded(job: DownloadJob): string {
  if (job.size_bytes <= 0) return `${formatSize(Math.max(0, job.downloaded))} / --`;
  return `${formatSize(Math.max(0, job.downloaded))} / ${formatSize(job.size_bytes)}`;
}

function formatEta(job: DownloadJob): string {
  if (job.status !== 'downloading' || job.size_bytes <= 0 || job.speed_bytes <= 0) return '--';
  const remaining = Math.max(0, job.size_bytes - job.downloaded);
  const seconds = Math.ceil(remaining / job.speed_bytes);
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.ceil(seconds / 60)}m`;
  return `${Math.ceil(seconds / 3600)}h`;
}

function formatDate(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '--';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

interface InstallState {
  jobId: string;
  fileName: string;
  lines: string[];
  done: boolean;
  exitCode: number | null;
  verdict: InstallVerdict;
  verdictDetail: string;
  error: string | null;
}

export default function DownloadManager({ windowId: _windowId }: DownloadManagerProps) {
  const [downloads, setDownloads] = useState<DownloadJob[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [newUrl, setNewUrl] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [busyId, setBusyId] = useState('');
  const [install, setInstall] = useState<InstallState | null>(null);
  const installAbortRef = useRef<AbortController | null>(null);
  const installLogRef = useRef<HTMLDivElement | null>(null);

  const refresh = useCallback(async () => {
    try {
      const next = await downloadsClient.list();
      setDownloads(next);
      setError('');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => {
      void refresh();
    }, 1000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const filteredDownloads = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return downloads.filter((d) => {
      const matchesFilter = filter === 'all' ||
        (filter === 'downloading' && isActive(d.status)) ||
        (filter === 'completed' && d.status === 'completed') ||
        (filter === 'failed' && isFailedBucket(d.status));
      const matchesSearch = !q ||
        d.file_name.toLowerCase().includes(q) ||
        d.url.toLowerCase().includes(q);
      return matchesFilter && matchesSearch;
    });
  }, [downloads, filter, searchQuery]);

  const runJobAction = async (id: string, action: () => Promise<DownloadJob>) => {
    setBusyId(id);
    try {
      await action();
      await refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusyId('');
    }
  };

  const addDownload = async () => {
    const url = newUrl.trim();
    if (!url || submitting) return;
    setSubmitting(true);
    try {
      const created = await downloadsClient.create(url);
      setDownloads((prev) => [created, ...prev.filter((d) => d.id !== created.id)]);
      setNewUrl('');
      setShowAddForm(false);
      setError('');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const cancelDownload = (id: string) => {
    void runJobAction(id, () => downloadsClient.cancel(id));
  };

  const retryDownload = (id: string) => {
    void runJobAction(id, () => downloadsClient.retry(id));
  };

  const removeDownload = (id: string) => {
    void runJobAction(id, () => downloadsClient.remove(id));
  };

  const installDeb = async (job: DownloadJob) => {
    if (install && !install.done) return; // another install in progress in this window
    const ctrl = new AbortController();
    installAbortRef.current = ctrl;
    setInstall({
      jobId: job.id, fileName: job.file_name, lines: [], done: false,
      exitCode: null, verdict: 'unknown', verdictDetail: '', error: null,
    });
    try {
      const result = await downloadsClient.installDeb(
        job.id,
        (line) => {
          setInstall((s) => (s && s.jobId === job.id ? { ...s, lines: [...s.lines, line] } : s));
        },
        ctrl.signal,
        (verdict, detail) => {
          setInstall((s) => (s && s.jobId === job.id ? { ...s, verdict, verdictDetail: detail } : s));
        },
      );
      setInstall((s) => (s && s.jobId === job.id ? {
        ...s, done: true, exitCode: result.exitCode,
        verdict: result.verdict, verdictDetail: result.detail,
      } : s));
    } catch (err) {
      if (ctrl.signal.aborted) {
        setInstall((s) => (s && s.jobId === job.id ? { ...s, done: true, exitCode: -1, verdict: 'failed', error: '已取消' } : s));
      } else {
        const msg = err instanceof ApiError ? (err.body || `HTTP ${err.status}`) : errorMessage(err);
        setInstall((s) => (s && s.jobId === job.id ? { ...s, done: true, exitCode: -1, verdict: 'failed', error: msg } : s));
      }
    } finally {
      installAbortRef.current = null;
    }
  };

  const closeInstall = () => {
    if (install && !install.done) {
      installAbortRef.current?.abort();
    }
    setInstall(null);
  };

  // Auto-scroll the install log to the bottom as new lines stream in.
  useEffect(() => {
    if (!install) return;
    const el = installLogRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [install]);

  const clearCompleted = async () => {
    const completed = downloads.filter((d) => d.status === 'completed');
    if (completed.length === 0) return;
    setSubmitting(true);
    try {
      for (const item of completed) {
        await downloadsClient.remove(item.id);
      }
      await refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const filters = [
    { id: 'all' as const, label: '全部 (All)', count: downloads.length },
    { id: 'downloading' as const, label: '下载中 (Downloading)', count: downloads.filter((d) => isActive(d.status)).length },
    { id: 'completed' as const, label: '已完成 (Completed)', count: downloads.filter((d) => d.status === 'completed').length },
    { id: 'failed' as const, label: '失败/取消 (Failed)', count: downloads.filter((d) => isFailedBucket(d.status)).length },
  ];

  const activeCount = downloads.filter((d) => d.status === 'downloading').length;
  const completedCount = downloads.filter((d) => d.status === 'completed').length;
  const totalKnownSize = downloads.reduce((sum, d) => sum + Math.max(0, d.size_bytes), 0);

  return (
    <div className="w-full h-full flex flex-col relative" style={{ backgroundColor: 'var(--ink-50)' }}>
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
          onClick={() => { void clearCompleted(); }}
          disabled={submitting}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded text-body-sm transition-all duration-150 hover:bg-black/5 disabled:opacity-50"
          style={{ color: 'var(--ink-600)' }}
        >
          <Trash2 size={14} />
          清除已完成 (Clear)
        </button>
        <button
          onClick={() => { void refresh(); }}
          className="p-1.5 rounded transition-all duration-150 hover:bg-black/5"
          title="刷新 (Refresh)"
        >
          <RotateCw size={14} style={{ color: 'var(--ink-500)' }} />
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

      {showAddForm && (
        <div className="flex items-center gap-2 px-4 py-2 flex-shrink-0" style={{ backgroundColor: 'var(--ink-100)', borderBottom: '1px solid var(--ink-200)' }}>
          <input
            type="text"
            value={newUrl}
            onChange={(e) => setNewUrl(e.target.value)}
            placeholder="输入下载链接 (Enter download URL)..."
            className="flex-1 px-3 py-1.5 rounded text-body-sm outline-none"
            style={{ backgroundColor: 'var(--ink-50)', border: '1px solid var(--ink-200)', color: 'var(--ink-900)' }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void addDownload();
            }}
          />
          <button
            onClick={() => { void addDownload(); }}
            disabled={submitting || !newUrl.trim()}
            className="px-4 py-1.5 rounded text-body-sm transition-all duration-150 hover:scale-[1.02] disabled:opacity-50"
            style={{ backgroundColor: 'var(--ink-800)', color: 'var(--ink-50)' }}
          >
            {submitting ? '创建中...' : '开始 (Start)'}
          </button>
          <button onClick={() => setShowAddForm(false)} className="p-1.5 rounded hover:bg-black/5">
            <X size={16} style={{ color: 'var(--ink-400)' }} />
          </button>
        </div>
      )}

      {error && (
        <div className="px-4 py-2 text-body-sm flex-shrink-0" style={{ color: 'var(--cinnabar-light)', backgroundColor: 'rgba(201,74,63,0.08)', borderBottom: '1px solid rgba(201,74,63,0.16)' }}>
          {error}
        </div>
      )}

      <div className="flex items-center gap-1 px-4 py-1.5 flex-shrink-0" style={{ backgroundColor: 'var(--ink-100)', borderBottom: '1px solid var(--ink-200)' }}>
        {filters.map((f) => (
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

      <div className="flex-1 overflow-auto p-3 space-y-2">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-full gap-2">
            <Download size={48} style={{ color: 'var(--ink-300)' }} />
            <span className="text-body-md" style={{ color: 'var(--ink-400)' }}>加载下载任务...</span>
          </div>
        ) : filteredDownloads.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2">
            <Download size={48} style={{ color: 'var(--ink-300)' }} />
            <span className="text-body-md" style={{ color: 'var(--ink-400)' }}>
              {filter === 'all' ? '暂无下载任务 (No downloads)' : '该分类下暂无任务 (No items in this category)'}
            </span>
          </div>
        ) : (
          filteredDownloads.map((d) => {
            const Icon = getFileIcon(d.file_name);
            const statusConfig = STATUS_CONFIG[d.status];
            const StatusIcon = statusConfig.icon;
            const progress = progressOf(d);
            const canDelete = d.status === 'completed' || d.status === 'failed' || d.status === 'canceled';
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
                      <span className="text-body-sm font-medium truncate" style={{ color: 'var(--ink-800)' }}>{d.file_name}</span>
                      <span
                        className="text-caption px-2 py-0.5 rounded-full inline-flex items-center gap-1 flex-shrink-0"
                        style={{ backgroundColor: statusConfig.bgColor, color: statusConfig.color }}
                      >
                        <StatusIcon size={12} />
                        {statusConfig.label}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="text-caption" style={{ color: 'var(--ink-500)' }}>{d.size_bytes <= 0 ? '未知大小' : formatSize(d.size_bytes)}</span>
                      <span className="text-caption" style={{ color: 'var(--ink-400)' }}>{formatDate(d.created_at)}</span>
                      {d.status === 'downloading' && (
                        <>
                          <span className="text-caption font-mono" style={{ color: 'var(--ink-600)' }}>{formatBytesPerSecond(d.speed_bytes)}</span>
                          <span className="text-caption font-mono" style={{ color: 'var(--ink-600)' }}>剩余 {formatEta(d)}</span>
                        </>
                      )}
                      {d.output_path && d.status === 'completed' && (
                        <span className="text-caption truncate" style={{ color: 'var(--ink-400)' }}>{d.output_path}</span>
                      )}
                    </div>
                    {(d.status === 'failed' || d.status === 'canceled') && d.error && (
                      <div className="mt-1 text-caption truncate" style={{ color: 'var(--cinnabar-light)' }}>
                        {d.error}
                      </div>
                    )}
                    <div className="mt-2 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--ink-200)' }}>
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${progress}%`,
                          backgroundColor: d.status === 'completed' ? 'var(--success)' : isFailedBucket(d.status) ? 'var(--cinnabar-light)' : 'var(--cinnabar)',
                        }}
                      />
                    </div>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-caption font-mono" style={{ color: 'var(--ink-500)' }}>
                        {progress.toFixed(0)}%
                      </span>
                      <span className="text-caption font-mono" style={{ color: 'var(--ink-400)' }}>
                        {formatDownloaded(d)}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {d.status === 'completed' && d.output_path && (
                      <>
                        {d.file_name.toLowerCase().endsWith('.deb') && (
                          <button
                            onClick={() => void installDeb(d)}
                            disabled={!!install && !install.done}
                            className="p-1.5 rounded transition-all duration-150 hover:bg-black/5 disabled:opacity-40"
                            title="用 apt 安装 (Install with apt)"
                          >
                            <Package size={14} style={{ color: 'var(--cinnabar)' }} />
                          </button>
                        )}
                        <button
                          onClick={() => openInFileManager(d.output_path!)}
                          className="p-1.5 rounded transition-all duration-150 hover:bg-black/5"
                          title="在文件管理器中打开 (Show in File Manager)"
                        >
                          <FolderOpen size={14} style={{ color: 'var(--ink-600)' }} />
                        </button>
                        <a
                          href={fsClient.downloadURL(d.output_path)}
                          target="_blank"
                          rel="noreferrer"
                          className="p-1.5 rounded transition-all duration-150 hover:bg-black/5"
                          title="下载到本机 (Download to your device)"
                        >
                          <Download size={14} style={{ color: 'var(--success)' }} />
                        </a>
                      </>
                    )}
                    {isActive(d.status) && (
                      <button
                        onClick={() => cancelDownload(d.id)}
                        disabled={busyId === d.id}
                        className="p-1.5 rounded transition-all duration-150 hover:bg-black/5 disabled:opacity-40"
                        title="取消 (Cancel)"
                      >
                        <X size={14} style={{ color: 'var(--ink-500)' }} />
                      </button>
                    )}
                    {isFailedBucket(d.status) && (
                      <button
                        onClick={() => retryDownload(d.id)}
                        disabled={busyId === d.id}
                        className="p-1.5 rounded transition-all duration-150 hover:bg-black/5 disabled:opacity-40"
                        title="重试 (Retry)"
                      >
                        <RotateCw size={14} style={{ color: 'var(--success)' }} />
                      </button>
                    )}
                    {canDelete && (
                      <button
                        onClick={() => removeDownload(d.id)}
                        disabled={busyId === d.id}
                        className="p-1.5 rounded transition-all duration-150 hover:bg-black/5 disabled:opacity-40"
                        title="删除记录 (Remove)"
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

      <div className="flex items-center justify-between px-4 py-1.5 flex-shrink-0" style={{ backgroundColor: 'var(--ink-100)', borderTop: '1px solid var(--ink-200)' }}>
        <div className="flex items-center gap-4">
          <span className="text-caption" style={{ color: 'var(--ink-500)' }}>
            总计: {downloads.length} 个任务
          </span>
          <span className="text-caption" style={{ color: 'var(--cinnabar)' }}>
            下载中: {activeCount}
          </span>
          <span className="text-caption" style={{ color: 'var(--success)' }}>
            已完成: {completedCount}
          </span>
        </div>
        <span className="text-caption font-mono" style={{ color: 'var(--ink-500)' }}>
          已知总大小: {formatSize(totalKnownSize)}
        </span>
      </div>

      {install && (
        <div
          className="absolute inset-0 z-50 flex items-center justify-center"
          style={{ backgroundColor: 'rgba(26,26,26,0.45)' }}
          onClick={(e) => {
            // backdrop click only closes once the install is finished;
            // mid-install clicks could lose the only copy of the log.
            if (e.target === e.currentTarget && install.done) closeInstall();
          }}
        >
          <div
            className="flex w-[680px] max-w-[92%] flex-col rounded-lg shadow-lg"
            style={{ backgroundColor: 'var(--ink-50)', border: '1px solid var(--ink-300)', maxHeight: '80%' }}
          >
            <div
              className="flex items-center justify-between px-4 py-2"
              style={{ borderBottom: '1px solid var(--ink-200)', backgroundColor: 'var(--ink-100)' }}
            >
              <div className="flex items-center gap-2">
                <Package size={16} style={{ color: 'var(--cinnabar)' }} />
                <span className="text-body-sm font-medium" style={{ color: 'var(--ink-800)' }}>
                  apt 安装 · {install.fileName}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {!install.done && (
                  <span className="text-caption" style={{ color: 'var(--cinnabar)' }}>运行中…</span>
                )}
                {install.done && install.verdict === 'success' && install.exitCode === 0 && (
                  <span className="text-caption inline-flex items-center gap-1" style={{ color: 'var(--success)' }}>
                    <CheckCircle size={12} /> 安装成功
                  </span>
                )}
                {install.done && install.verdict === 'partial' && (
                  <span className="text-caption inline-flex items-center gap-1" style={{ color: '#c97a2e' }}>
                    <AlertCircle size={12} /> 半装/已清理 ({install.verdictDetail || `exit ${install.exitCode}`})
                  </span>
                )}
                {install.done && install.verdict === 'failed' && (
                  <span className="text-caption inline-flex items-center gap-1" style={{ color: 'var(--cinnabar-light)' }}>
                    <AlertCircle size={12} /> 失败 (exit {install.exitCode}{install.error ? ` · ${install.error}` : install.verdictDetail ? ` · ${install.verdictDetail}` : ''})
                  </span>
                )}
                {install.done && install.verdict === 'unknown' && (
                  <span className="text-caption inline-flex items-center gap-1" style={{ color: 'var(--ink-500)' }}>
                    <AlertCircle size={12} /> 状态未知 (exit {install.exitCode})
                  </span>
                )}
                <button
                  onClick={closeInstall}
                  className="p-1 rounded hover:bg-black/5"
                  title={install.done ? '关闭' : '取消'}
                >
                  <X size={14} style={{ color: 'var(--ink-500)' }} />
                </button>
              </div>
            </div>
            <div
              ref={installLogRef}
              className="flex-1 overflow-auto px-4 py-3 font-mono text-xs"
              style={{ backgroundColor: '#1a1a1a', color: '#e5e5e5', minHeight: '240px' }}
            >
              {install.lines.length === 0 && !install.done && (
                <div style={{ color: '#888' }}>等待 apt 输出…</div>
              )}
              {install.lines.map((l, i) => (
                <div key={i} style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{l}</div>
              ))}
            </div>
            <div
              className="flex items-center justify-between px-4 py-2"
              style={{ borderTop: '1px solid var(--ink-200)', backgroundColor: 'var(--ink-100)' }}
            >
              <span className="text-caption" style={{ color: 'var(--ink-500)' }}>
                {install.lines.length} 行 · {install.done ? `${install.verdict} (exit ${install.exitCode})` : '安装进行中'}
              </span>
              <button
                onClick={closeInstall}
                disabled={!install.done && installAbortRef.current === null}
                className="px-3 py-1 rounded text-body-sm"
                style={{
                  backgroundColor: install.done ? 'var(--ink-800)' : 'transparent',
                  color: install.done ? 'var(--ink-50)' : 'var(--ink-700)',
                  border: install.done ? 'none' : '1px solid var(--ink-300)',
                }}
              >
                {install.done ? '关闭' : '取消并关闭'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

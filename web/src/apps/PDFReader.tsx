import { useState, useRef, useCallback, useEffect } from 'react';
import {
  FolderOpen, ChevronLeft, ChevronRight, ZoomIn, ZoomOut,
  Maximize, RotateCw, Trash2, Clock, Server
} from 'lucide-react';
import { appStateClient } from '@/lib/app-state';
import { saveMediaBlob, serverMediaURL } from '@/lib/media-library';
import { basename, usePayloadPath } from '@/lib/openFile';

const STORAGE_KEY_RECENT = 'pdfreader-recent';
const APP_ID = 'pdfreader';

interface RecentFile {
  id: string;
  name: string;
  url: string;
  path?: string;
  timestamp: number;
  page?: number;
  zoom?: number;
  rotation?: number;
  size?: number;
}

interface PDFReaderState {
  recentFiles: RecentFile[];
  currentFile?: RecentFile;
  currentPage: number;
  zoom: number;
  rotation: number;
}

function normalizeRecent(files: RecentFile[] | undefined): RecentFile[] {
  if (!Array.isArray(files)) return [];
  return files
    .filter(file => file && (file.path || file.url))
    .map(file => ({
      ...file,
      id: file.path || file.id,
      url: serverMediaURL(file.path, file.url),
      page: Math.max(1, Number(file.page) || 1),
      zoom: Math.max(25, Number(file.zoom) || 100),
      rotation: Number(file.rotation) || 0,
    }))
    .slice(0, 10);
}

function serializeRecent(files: RecentFile[]): RecentFile[] {
  return files
    .filter(file => file.path)
    .map(file => ({
      ...file,
      url: '',
    }));
}

function isPDFPath(path: string): boolean {
  return path.toLowerCase().endsWith('.pdf');
}

export default function PDFReader({ windowId }: { windowId?: string }) {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [currentPath, setCurrentPath] = useState<string | undefined>();
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [zoom, setZoom] = useState(100);
  const [rotation, setRotation] = useState(0);
  const [showSidebar, setShowSidebar] = useState(true);
  const [recentFiles, setRecentFiles] = useState<RecentFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [statusText, setStatusText] = useState('正在加载最近文件...');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const loadedRef = useRef(false);
  const payloadPath = usePayloadPath(windowId);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        let localFallback: RecentFile[] = [];
        try { localFallback = JSON.parse(localStorage.getItem(STORAGE_KEY_RECENT) || '[]'); } catch { localFallback = []; }
        const saved = await appStateClient.getOrDefault<PDFReaderState>(APP_ID, {
          recentFiles: localFallback,
          currentPage: 1,
          zoom: 100,
          rotation: 0,
        });
        if (!alive) return;
        const recents = normalizeRecent(saved.recentFiles);
        setRecentFiles(recents);
        if (saved.currentFile?.path) {
          const current = normalizeRecent([saved.currentFile])[0];
          if (current) {
            setPdfUrl(current.url);
            setFileName(current.name);
            setCurrentPath(current.path);
            setCurrentPage(saved.currentPage || current.page || 1);
            setZoom(saved.zoom || current.zoom || 100);
            setRotation(saved.rotation || current.rotation || 0);
          }
        }
        setStatusText(recents.length > 0 ? `已载入 ${recents.length} 个最近 PDF` : '最近文件为空');
      } catch (err) {
        if (!alive) return;
        console.error('Failed to load PDF reader state:', err);
        setStatusText('最近文件加载失败，请确认后端状态接口可用');
      } finally {
        if (alive) loadedRef.current = true;
      }
    })();
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!loadedRef.current) return;
    const timer = window.setTimeout(() => {
      const currentFile = currentPath
        ? recentFiles.find(file => file.path === currentPath)
        : undefined;
      appStateClient.put<PDFReaderState>(APP_ID, {
        recentFiles: serializeRecent(recentFiles),
        currentFile: currentFile ? { ...currentFile, url: '' } : undefined,
        currentPage,
        zoom,
        rotation,
      }).catch(err => console.error('Failed to save PDF reader state:', err));
    }, 300);
    return () => window.clearTimeout(timer);
  }, [recentFiles, currentPath, currentPage, zoom, rotation]);

  const openRecentFile = useCallback((recent: RecentFile) => {
    setPdfUrl(serverMediaURL(recent.path, recent.url));
    setFileName(recent.name);
    setCurrentPath(recent.path);
    setCurrentPage(recent.page || 1);
    setZoom(recent.zoom || 100);
    setRotation(recent.rotation || 0);
    setTotalPages(1);
  }, []);

  const addRecent = useCallback((file: RecentFile) => {
    const newRecent: RecentFile = {
      ...file,
      id: file.path || file.id || String(Date.now()),
      timestamp: Date.now(),
      page: file.page || 1,
      zoom: file.zoom || 100,
      rotation: file.rotation || 0,
    };
    setRecentFiles(prev => [newRecent, ...prev.filter(f => f.path !== newRecent.path && f.name !== newRecent.name)].slice(0, 10));
  }, []);

  const openServerPDF = useCallback((path: string) => {
    if (!path || !isPDFPath(path)) {
      setStatusText('请输入服务器上的 PDF 绝对路径');
      return;
    }
    const recent: RecentFile = {
      id: path,
      name: basename(path),
      path,
      url: serverMediaURL(path),
      timestamp: Date.now(),
      page: 1,
      zoom: 100,
      rotation: 0,
    };
    openRecentFile(recent);
    addRecent(recent);
    setStatusText(`已打开服务器 PDF: ${recent.name}`);
  }, [addRecent, openRecentFile]);

  useEffect(() => {
    if (!loadedRef.current || !payloadPath) return;
    openServerPDF(payloadPath);
  }, [payloadPath, openServerPDF]);

  useEffect(() => {
    if (!currentPath) return;
    setRecentFiles(prev => prev.map(file => {
      if (file.path !== currentPath) return file;
      if (file.page === currentPage && file.zoom === zoom && file.rotation === rotation) return file;
      return { ...file, page: currentPage, zoom, rotation };
    }));
  }, [currentPath, currentPage, zoom, rotation]);

  const loadPdf = useCallback(async (file: File) => {
    setStatusText('正在上传 PDF 到服务器...');
    try {
      const saved = await saveMediaBlob('documents', file.name, file, 'application/pdf');
      const recent: RecentFile = {
        id: saved.path,
        name: file.name,
        path: saved.path,
        url: saved.url,
        timestamp: Date.now(),
        page: 1,
        zoom: 100,
        rotation: 0,
        size: saved.size,
      };
      openRecentFile(recent);
      addRecent(recent);
      setStatusText(`已保存并打开 ${file.name}`);
    } catch (err) {
      console.error('Failed to save PDF:', err);
      setStatusText('PDF 保存失败，请确认后端文件接口可用');
    }
  }, [addRecent, openRecentFile]);

  const handleOpenServerPath = () => {
    const path = window.prompt('输入服务器上的 PDF 绝对路径', currentPath || '');
    if (path) openServerPDF(path.trim());
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    loadPdf(file);
    e.target.value = '';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file && (file.type === 'application/pdf' || isPDFPath(file.name))) {
      loadPdf(file);
    }
  };

  const handleZoomIn = () => setZoom(z => Math.min(400, z + 25));
  const handleZoomOut = () => setZoom(z => Math.max(25, z - 25));
  const handleZoomFit = () => setZoom(100);
  const handleRotate = () => setRotation(r => (r + 90) % 360);

  const handlePageNav = (delta: number) => {
    setCurrentPage(p => Math.max(1, Math.min(totalPages, p + delta)));
  };

  const handlePageInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const page = parseInt(e.target.value) || 1;
    setCurrentPage(Math.max(1, Math.min(totalPages, page)));
  };

  const clearRecent = () => {
    setRecentFiles([]);
    setCurrentPath(undefined);
    setStatusText('最近文件已清空');
  };

  const loadRecent = (rf: RecentFile) => {
    openRecentFile(rf);
    setStatusText(`已打开 ${rf.name}`);
  };

  return (
    <div className="w-full h-full flex flex-col" style={{ backgroundColor: 'var(--ink-50)' }}>
      {/* Toolbar */}
      <div className="flex items-center gap-1 px-2 py-1 border-b flex-shrink-0" style={{ borderColor: 'var(--ink-200)', backgroundColor: 'var(--ink-100)' }}>
        <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-1 px-2 py-1 rounded text-body-sm hover:opacity-80" style={{ color: 'var(--ink-700)' }} title="打开 PDF (Open)">
          <FolderOpen size={14} /> 打开
        </button>
        <button onClick={handleOpenServerPath} className="flex items-center gap-1 px-2 py-1 rounded text-body-sm hover:opacity-80" style={{ color: 'var(--ink-700)' }} title="打开服务器 PDF 路径">
          <Server size={14} /> 服务器路径
        </button>
        <input ref={fileInputRef} type="file" accept=".pdf" className="hidden" onChange={handleFileSelect} />

        <div className="w-px h-5 mx-1" style={{ backgroundColor: 'var(--ink-300)' }} />

        <button onClick={() => handlePageNav(-1)} disabled={!pdfUrl} className="p-1 rounded hover:opacity-80 disabled:opacity-30" style={{ color: 'var(--ink-700)' }} title="上一页 (Previous)">
          <ChevronLeft size={14} />
        </button>
        <div className="flex items-center gap-1">
          <input
            type="number"
            value={currentPage}
            onChange={handlePageInput}
            disabled={!pdfUrl}
            className="w-10 text-center rounded text-body-sm outline-none"
            style={{ border: '1px solid var(--ink-300)', backgroundColor: 'var(--ink-50)', color: 'var(--ink-900)' }}
            min={1}
          />
          <span className="text-caption" style={{ color: 'var(--ink-500)' }}>/ {totalPages}</span>
        </div>
        <button onClick={() => handlePageNav(1)} disabled={!pdfUrl} className="p-1 rounded hover:opacity-80 disabled:opacity-30" style={{ color: 'var(--ink-700)' }} title="下一页 (Next)">
          <ChevronRight size={14} />
        </button>

        <div className="w-px h-5 mx-1" style={{ backgroundColor: 'var(--ink-300)' }} />

        <button onClick={handleZoomOut} disabled={!pdfUrl} className="p-1 rounded hover:opacity-80 disabled:opacity-30" style={{ color: 'var(--ink-700)' }} title="缩小 (Zoom Out)">
          <ZoomOut size={14} />
        </button>
        <span className="text-caption" style={{ color: 'var(--ink-500)', minWidth: 36, textAlign: 'center' }}>{zoom}%</span>
        <button onClick={handleZoomIn} disabled={!pdfUrl} className="p-1 rounded hover:opacity-80 disabled:opacity-30" style={{ color: 'var(--ink-700)' }} title="放大 (Zoom In)">
          <ZoomIn size={14} />
        </button>
        <button onClick={handleZoomFit} disabled={!pdfUrl} className="px-2 py-1 rounded text-body-sm hover:opacity-80 disabled:opacity-30" style={{ color: 'var(--ink-700)' }} title="适应 (Fit)">
          <Maximize size={14} />
        </button>

        <div className="w-px h-5 mx-1" style={{ backgroundColor: 'var(--ink-300)' }} />

        <button onClick={handleRotate} disabled={!pdfUrl} className="p-1 rounded hover:opacity-80 disabled:opacity-30" style={{ color: 'var(--ink-700)' }} title="旋转 (Rotate)">
          <RotateCw size={14} />
        </button>

        <div className="flex-1" />

        <span className="text-caption truncate max-w-[200px]" style={{ color: 'var(--ink-500)' }}>
          {fileName || '未选择文件 (No file)'}
        </span>
      </div>
      {statusText && (
        <div className="px-3 py-1 border-b text-caption truncate" style={{ borderColor: 'var(--ink-200)', color: 'var(--ink-500)', backgroundColor: 'var(--ink-50)' }}>
          {statusText}
        </div>
      )}

      {/* Main Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        {showSidebar && (
          <div className="w-48 flex-shrink-0 border-r overflow-auto" style={{ borderColor: 'var(--ink-200)', backgroundColor: 'var(--ink-100)' }}>
            <div className="flex items-center justify-between px-2 py-1 border-b" style={{ borderColor: 'var(--ink-200)' }}>
              <span className="text-caption flex items-center gap-1" style={{ color: 'var(--ink-600)' }}>
                <Clock size={12} /> 最近文件 (Recent)
              </span>
              <button onClick={clearRecent} className="p-0.5" style={{ color: 'var(--ink-400)' }}><Trash2 size={10} /></button>
            </div>
            {recentFiles.length === 0 ? (
              <div className="px-2 py-4 text-center text-caption" style={{ color: 'var(--ink-400)' }}>暂无文件</div>
            ) : (
              recentFiles.map(rf => (
                <button
                  key={rf.id}
                  onClick={() => loadRecent(rf)}
                  className="w-full text-left px-2 py-1.5 border-b text-body-sm hover:opacity-80 truncate"
                  style={{ borderColor: 'var(--ink-200)', color: 'var(--ink-700)' }}
                >
                  {rf.name}
                </button>
              ))
            )}
          </div>
        )}

        {/* PDF View */}
        <div
          className="flex-1 overflow-auto relative"
          style={{ backgroundColor: 'var(--ink-200)' }}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {isDragging && (
            <div className="absolute inset-0 z-50 flex items-center justify-center border-2 border-dashed m-4 rounded" style={{ borderColor: 'var(--cinnabar)', backgroundColor: 'rgba(179,57,47,0.1)' }}>
              <div className="text-center">
                <FolderOpen size={48} style={{ color: 'var(--cinnabar)' }} />
                <div className="text-body-md mt-2" style={{ color: 'var(--cinnabar)' }}>拖放 PDF 文件到此处 (Drop PDF here)</div>
              </div>
            </div>
          )}

          {pdfUrl ? (
            <div className="flex flex-col items-center py-4 gap-4">
              <iframe
                ref={iframeRef}
                src={`${pdfUrl}#page=${currentPage}&zoom=${zoom}`}
                className="border-none"
                style={{
                  width: `${zoom}%`,
                  maxWidth: rotation % 180 === 90 ? '90vh' : '800px',
                  height: 'calc(100vh - 200px)',
                  minHeight: 500,
                  transform: `rotate(${rotation}deg)`,
                  backgroundColor: 'white',
                  boxShadow: 'var(--shadow-lg)',
                }}
                title="PDF Viewer"
              />
            </div>
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center">
              <div
                className="border-2 border-dashed rounded-lg p-12 text-center cursor-pointer hover:opacity-80"
                style={{ borderColor: 'var(--ink-300)' }}
                onClick={() => fileInputRef.current?.click()}
              >
                <FolderOpen size={48} style={{ color: 'var(--ink-400)', margin: '0 auto' }} />
                <div className="text-heading-sm mt-4" style={{ color: 'var(--ink-600)' }}>
                  打开 PDF 文件 (Open PDF)
                </div>
                <div className="text-body-sm mt-2" style={{ color: 'var(--ink-500)' }}>
                  点击选择文件或拖放到此处<br />(Click to select or drag & drop)
                </div>
              </div>

              {recentFiles.length > 0 && (
                <div className="mt-6">
                  <div className="text-caption text-center mb-2" style={{ color: 'var(--ink-500)' }}>或从最近文件中选择 (Or select from recent)</div>
                  <div className="flex gap-2 flex-wrap justify-center max-w-md">
                    {recentFiles.slice(0, 3).map(rf => (
                      <button
                        key={rf.id}
                        onClick={() => loadRecent(rf)}
                        className="px-3 py-1.5 rounded text-body-sm border hover:opacity-80"
                        style={{ borderColor: 'var(--ink-300)', color: 'var(--ink-700)' }}
                      >
                        {rf.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

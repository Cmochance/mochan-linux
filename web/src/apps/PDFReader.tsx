import { useState, useRef, useCallback, useEffect } from 'react';
import {
  FolderOpen, ChevronLeft, ChevronRight, ZoomIn, ZoomOut,
  Maximize, RotateCw, Download, Trash2, Clock
} from 'lucide-react';

const STORAGE_KEY_RECENT = 'pdfreader-recent';

interface RecentFile {
  id: string;
  name: string;
  url: string;
  timestamp: number;
}

export default function PDFReader() {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [zoom, setZoom] = useState(100);
  const [rotation, setRotation] = useState(0);
  const [showSidebar, setShowSidebar] = useState(true);
  const [recentFiles, setRecentFiles] = useState<RecentFile[]>(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY_RECENT) || '[]'); } catch { return []; }
  });
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY_RECENT, JSON.stringify(recentFiles)); } catch { /* noop */ }
  }, [recentFiles]);

  const loadPdf = useCallback((file: File, url: string) => {
    setPdfUrl(url);
    setFileName(file.name);
    setCurrentPage(1);
    setTotalPages(1);
    setRotation(0);
    setZoom(100);

    const newRecent: RecentFile = {
      id: Date.now().toString(),
      name: file.name,
      url,
      timestamp: Date.now(),
    };
    setRecentFiles(prev => [newRecent, ...prev.filter(f => f.name !== file.name)].slice(0, 10));
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    loadPdf(file, url);
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
    if (file && file.type === 'application/pdf') {
      const url = URL.createObjectURL(file);
      loadPdf(file, url);
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
    recentFiles.forEach(f => URL.revokeObjectURL(f.url));
  };

  const loadRecent = (rf: RecentFile) => {
    setPdfUrl(rf.url);
    setFileName(rf.name);
    setCurrentPage(1);
  };

  return (
    <div className="w-full h-full flex flex-col" style={{ backgroundColor: 'var(--ink-50)' }}>
      {/* Toolbar */}
      <div className="flex items-center gap-1 px-2 py-1 border-b flex-shrink-0" style={{ borderColor: 'var(--ink-200)', backgroundColor: 'var(--ink-100)' }}>
        <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-1 px-2 py-1 rounded text-body-sm hover:opacity-80" style={{ color: 'var(--ink-700)' }} title="打开 PDF (Open)">
          <FolderOpen size={14} /> 打开
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

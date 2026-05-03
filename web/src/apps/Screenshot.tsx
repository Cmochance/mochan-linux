import { useState, useRef, useCallback, useEffect } from 'react';
import { Camera, Download, Image, Trash2, RefreshCw } from 'lucide-react';

interface ScreenshotItem {
  id: string;
  dataUrl: string;
  timestamp: number;
  size: number;
}

const SCREENSHOTS_KEY = 'ink-os-screenshots';

function loadScreenshots(): ScreenshotItem[] {
  try {
    const saved = localStorage.getItem(SCREENSHOTS_KEY);
    return saved ? JSON.parse(saved) : [];
  } catch { return []; }
}

function saveScreenshots(items: ScreenshotItem[]) {
  localStorage.setItem(SCREENSHOTS_KEY, JSON.stringify(items.slice(-20)));
}

export default function Screenshot() {
  const [screenshots, setScreenshots] = useState<ScreenshotItem[]>(loadScreenshots);
  const [currentCapture, setCurrentCapture] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => { saveScreenshots(screenshots); }, [screenshots]);

  const generateMockScreenshot = useCallback(() => {
    setCapturing(true);
    setTimeout(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 1280;
      canvas.height = 720;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Background - rice paper color
      ctx.fillStyle = '#f0ebe4';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Desktop grid pattern
      ctx.strokeStyle = 'rgba(158, 158, 158, 0.15)';
      ctx.lineWidth = 1;
      for (let x = 0; x < canvas.width; x += 40) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
      }
      for (let y = 0; y < canvas.height; y += 40) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
      }

      // Mountain silhouette
      ctx.fillStyle = 'rgba(45, 45, 45, 0.15)';
      ctx.beginPath();
      ctx.moveTo(0, canvas.height);
      for (let x = 0; x < canvas.width; x += 2) {
        const y = canvas.height - 150 - Math.sin(x * 0.005) * 80 - Math.sin(x * 0.015) * 40;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(canvas.width, canvas.height);
      ctx.closePath();
      ctx.fill();

      // Second mountain layer
      ctx.fillStyle = 'rgba(45, 45, 45, 0.1)';
      ctx.beginPath();
      ctx.moveTo(0, canvas.height);
      for (let x = 0; x < canvas.width; x += 2) {
        const y = canvas.height - 100 - Math.sin(x * 0.003 + 1) * 60 - Math.sin(x * 0.01) * 30;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(canvas.width, canvas.height);
      ctx.closePath();
      ctx.fill();

      // Sun / moon
      ctx.fillStyle = 'rgba(179, 57, 47, 0.2)';
      ctx.beginPath();
      ctx.arc(canvas.width * 0.75, 120, 50, 0, Math.PI * 2);
      ctx.fill();

      // Title
      ctx.fillStyle = 'rgba(26, 26, 26, 0.8)';
      ctx.font = '48px "ZCOOL XiaoWei", cursive, serif';
      ctx.textAlign = 'center';
      ctx.fillText('Ink OS Desktop', canvas.width / 2, 120);

      // Subtitle
      ctx.fillStyle = 'rgba(26, 26, 26, 0.5)';
      ctx.font = '20px "Noto Serif SC", serif';
      ctx.fillText('水墨桌面环境', canvas.width / 2, 160);

      // Dock bar at bottom
      ctx.fillStyle = 'rgba(240, 235, 228, 0.75)';
      const dockW = 600;
      const dockH = 50;
      const dockX = (canvas.width - dockW) / 2;
      const dockY = canvas.height - 70;
      ctx.beginPath();
      ctx.roundRect(dockX, dockY, dockW, dockH, 12);
      ctx.fill();
      ctx.strokeStyle = 'rgba(158, 158, 158, 0.25)';
      ctx.stroke();

      // Status bar at top
      ctx.fillStyle = 'rgba(240, 235, 228, 0.6)';
      ctx.fillRect(0, 0, canvas.width, 28);

      // Date/time in status bar
      ctx.fillStyle = 'rgba(26, 26, 26, 0.6)';
      ctx.font = '14px "Noto Sans SC", sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(new Date().toLocaleTimeString('zh-CN'), canvas.width - 20, 19);

      const dataUrl = canvas.toDataURL('image/png');
      setCurrentCapture(dataUrl);
      setScreenshots(prev => [...prev, {
        id: 'ss_' + Date.now(),
        dataUrl,
        timestamp: Date.now(),
        size: Math.round(dataUrl.length * 0.75),
      }]);
      setCapturing(false);
    }, 600);
  }, []);

  const downloadCapture = (format: 'png' | 'jpg') => {
    const url = currentCapture || screenshots[screenshots.length - 1]?.dataUrl;
    if (!url) return;
    const link = document.createElement('a');
    link.href = url;
    link.download = `screenshot_${Date.now()}.${format}`;
    link.click();
  };

  const deleteScreenshot = (id: string) => {
    setScreenshots(prev => prev.filter(s => s.id !== id));
    if (currentCapture && screenshots.find(s => s.id === id)?.dataUrl === currentCapture) {
      setCurrentCapture(null);
    }
  };

  const formatDate = (ts: number) => {
    return new Date(ts).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    return (bytes / 1024).toFixed(1) + ' KB';
  };

  return (
    <div className="w-full h-full flex flex-col bg-ink-50 overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-ink-200 bg-ink-100">
        <div className="flex items-center gap-2">
          <Camera size={16} className="text-ink-600" />
          <span className="text-body-sm text-ink-700">Screenshot (截图工具)</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={generateMockScreenshot}
            disabled={capturing}
            className="flex items-center gap-1 px-3 py-1.5 rounded bg-ink-800 text-ink-50 text-body-sm hover:bg-ink-900 disabled:opacity-50 transition-colors"
          >
            {capturing ? <RefreshCw size={14} className="animate-spin" /> : <Camera size={14} />}
            {capturing ? 'Capturing (截取中)...' : 'Capture (截图)'}
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Preview Area */}
        <div className="flex-1 flex flex-col p-4 overflow-hidden">
          <div className="flex-1 bg-ink-100 rounded-md border border-ink-200 border-dashed flex items-center justify-center overflow-hidden relative">
            {currentCapture ? (
              <img src={currentCapture} alt="Screenshot" className="max-w-full max-h-full object-contain" />
            ) : capturing ? (
              <div className="text-center">
                <RefreshCw size={32} className="animate-spin mx-auto mb-2 text-ink-400" />
                <div className="text-body-sm text-ink-500">Capturing screen (截取屏幕中)...</div>
              </div>
            ) : (
              <div className="text-center">
                <Image size={48} className="mx-auto mb-2 text-ink-300" />
                <div className="text-body-sm text-ink-500">Click Capture to take a screenshot (点击截图)</div>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 mt-3">
            <button
              onClick={() => downloadCapture('png')}
              disabled={!currentCapture && screenshots.length === 0}
              className="flex items-center gap-1 px-3 py-1.5 rounded bg-ink-200 text-ink-700 text-body-sm hover:bg-ink-300 disabled:opacity-30 transition-colors"
            >
              <Download size={14} /> Save PNG (保存PNG)
            </button>
            <button
              onClick={() => downloadCapture('jpg')}
              disabled={!currentCapture && screenshots.length === 0}
              className="flex items-center gap-1 px-3 py-1.5 rounded bg-ink-200 text-ink-700 text-body-sm hover:bg-ink-300 disabled:opacity-30 transition-colors"
            >
              <Download size={14} /> Save JPG (保存JPG)
            </button>
            <button
              onClick={() => setCurrentCapture(null)}
              disabled={!currentCapture}
              className="flex items-center gap-1 px-3 py-1.5 rounded bg-ink-200 text-ink-700 text-body-sm hover:bg-ink-300 disabled:opacity-30 transition-colors"
            >
              <RefreshCw size={14} /> Retake (重截)
            </button>
          </div>
        </div>

        {/* Gallery Sidebar */}
        <div className="w-56 bg-ink-100 border-l border-ink-200 flex flex-col overflow-hidden">
          <div className="px-3 py-2 border-b border-ink-200">
            <span className="text-body-sm text-ink-700">Gallery (图库)</span>
            <span className="text-caption text-ink-500 ml-1">({screenshots.length})</span>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-2">
            {screenshots.length === 0 && (
              <div className="text-center text-caption text-ink-400 mt-8">No screenshots (无截图)</div>
            )}
            {[...screenshots].reverse().map(ss => (
              <div key={ss.id} className="group relative rounded-md overflow-hidden border border-ink-200 bg-ink-50 cursor-pointer" onClick={() => setCurrentCapture(ss.dataUrl)}>
                <img src={ss.dataUrl} alt="Screenshot" className="w-full h-24 object-cover" />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
                <button
                  onClick={e => { e.stopPropagation(); deleteScreenshot(ss.id); }}
                  className="absolute top-1 right-1 p-1 rounded bg-ink-800/70 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <Trash2 size={10} />
                </button>
                <div className="px-2 py-1 text-caption text-ink-500 truncate">{formatDate(ss.timestamp)}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

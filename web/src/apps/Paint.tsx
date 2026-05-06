import { useState, useRef, useCallback, useEffect } from 'react';
import {
  Paintbrush, Pen, Eraser, Minus, Square, Circle, Grid3X3,
  Undo2, Redo2, Trash2, Download, Save, FolderOpen, Server
} from 'lucide-react';
import { appStateClient } from '@/lib/app-state';
import { saveMediaBlob, serverMediaURL } from '@/lib/media-library';
import { basename } from '@/lib/openFile';

type Tool = 'brush' | 'pencil' | 'eraser' | 'line' | 'rect' | 'circle';

interface Point { x: number; y: number }

interface DrawingRecord {
  id: string;
  name: string;
  path: string;
  url: string;
  timestamp: number;
  size: number;
}

interface PaintState {
  tool: Tool;
  color: string;
  brushSize: number;
  showGrid: boolean;
  recentDrawings: DrawingRecord[];
}

const COLORS = [
  '#1a1a1a', '#2d2d2d', '#5c5c5c', '#9e9e9e', '#d9d9d9', '#ffffff',
  '#b3392f', '#c94a3f', '#8a2a22', '#4a7c59', '#5a7a8a', '#b8860b',
];

const APP_ID = 'paint';

export default function Paint() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [tool, setTool] = useState<Tool>('brush');
  const [color, setColor] = useState('#1a1a1a');
  const [brushSize, setBrushSize] = useState(3);
  const [showGrid, setShowGrid] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [history, setHistory] = useState<ImageData[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [recentDrawings, setRecentDrawings] = useState<DrawingRecord[]>([]);
  const [statusText, setStatusText] = useState('正在加载绘图状态...');
  const startPos = useRef<Point | null>(null);
  const currentPos = useRef<Point | null>(null);
  const loadedRef = useRef(false);

  const CANVAS_W = 800;
  const CANVAS_H = 560;

  // Initialize canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    canvas.width = CANVAS_W;
    canvas.height = CANVAS_H;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    saveHistory();
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const saved = await appStateClient.getOrDefault<PaintState>(APP_ID, {
          tool: 'brush',
          color: '#1a1a1a',
          brushSize: 3,
          showGrid: false,
          recentDrawings: [],
        });
        if (!alive) return;
        if (saved.tool) setTool(saved.tool);
        if (saved.color) setColor(saved.color);
        if (typeof saved.brushSize === 'number') setBrushSize(saved.brushSize);
        setShowGrid(Boolean(saved.showGrid));
        setRecentDrawings(Array.isArray(saved.recentDrawings)
          ? saved.recentDrawings.map(record => ({ ...record, url: serverMediaURL(record.path, record.url) })).slice(0, 8)
          : []);
        setStatusText('绘图状态已载入');
      } catch (err) {
        if (!alive) return;
        console.error('Failed to load paint state:', err);
        setStatusText('绘图状态加载失败，请确认后端状态接口可用');
      } finally {
        if (alive) loadedRef.current = true;
      }
    })();
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!loadedRef.current) return;
    const timer = window.setTimeout(() => {
      appStateClient.put<PaintState>(APP_ID, {
        tool,
        color,
        brushSize,
        showGrid,
        recentDrawings: recentDrawings.map(record => ({ ...record, url: '' })),
      }).catch(err => console.error('Failed to save paint state:', err));
    }, 300);
    return () => window.clearTimeout(timer);
  }, [tool, color, brushSize, showGrid, recentDrawings]);

  const saveHistory = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    setHistory(prev => {
      const next = [...prev.slice(0, historyIndex + 1), imageData].slice(-50);
      return next;
    });
    setHistoryIndex(prev => Math.min(prev + 1, 49));
  }, [historyIndex]);

  const getCanvasPos = (e: React.MouseEvent<HTMLCanvasElement>): Point => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (canvas.width / rect.width),
      y: (e.clientY - rect.top) * (canvas.height / rect.height),
    };
  };

  const drawShape = (from: Point, to: Point, preview = false) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = brushSize;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (tool === 'line') {
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
    } else if (tool === 'rect') {
      ctx.strokeRect(from.x, from.y, to.x - from.x, to.y - from.y);
    } else if (tool === 'circle') {
      const radius = Math.sqrt((to.x - from.x) ** 2 + (to.y - from.y) ** 2);
      ctx.beginPath();
      ctx.arc(from.x, from.y, radius, 0, Math.PI * 2);
      ctx.stroke();
    }
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const pos = getCanvasPos(e);
    setIsDrawing(true);
    startPos.current = pos;
    currentPos.current = pos;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.strokeStyle = tool === 'eraser' ? '#ffffff' : color;
    ctx.fillStyle = tool === 'eraser' ? '#ffffff' : color;
    ctx.lineWidth = brushSize;
    ctx.lineCap = tool === 'pencil' ? 'square' : 'round';
    ctx.lineJoin = 'round';

    if (tool === 'brush' || tool === 'pencil' || tool === 'eraser') {
      ctx.beginPath();
      ctx.moveTo(pos.x, pos.y);
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const pos = getCanvasPos(e);
    currentPos.current = pos;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (tool === 'brush' || tool === 'pencil' || tool === 'eraser') {
      ctx.strokeStyle = tool === 'eraser' ? '#ffffff' : color;
      ctx.lineWidth = brushSize;
      ctx.lineCap = tool === 'pencil' ? 'square' : 'round';
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();
    }
  };

  const handleMouseUp = () => {
    if (!isDrawing) return;
    setIsDrawing(false);

    if (tool !== 'brush' && tool !== 'pencil' && tool !== 'eraser') {
      if (startPos.current && currentPos.current) {
        drawShape(startPos.current, currentPos.current);
      }
    }

    startPos.current = null;
    currentPos.current = null;
    saveHistory();
  };

  const handleUndo = () => {
    if (historyIndex <= 0) return;
    const newIndex = historyIndex - 1;
    setHistoryIndex(newIndex);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx || !history[newIndex]) return;
    ctx.putImageData(history[newIndex], 0, 0);
  };

  const handleRedo = () => {
    if (historyIndex >= history.length - 1) return;
    const newIndex = historyIndex + 1;
    setHistoryIndex(newIndex);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx || !history[newIndex]) return;
    ctx.putImageData(history[newIndex], 0, 0);
  };

  const handleClear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    saveHistory();
  };

  const drawImageToCanvas = useCallback((url: string, name: string) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const image = new Image();
    image.onload = () => {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      const scale = Math.min(canvas.width / image.width, canvas.height / image.height);
      const width = image.width * scale;
      const height = image.height * scale;
      const x = (canvas.width - width) / 2;
      const y = (canvas.height - height) / 2;
      ctx.drawImage(image, x, y, width, height);
      saveHistory();
      setStatusText(`已打开 ${name}`);
    };
    image.onerror = () => setStatusText(`无法打开图片: ${name}`);
    image.src = url;
  }, [saveHistory]);

  const handleOpenLocalImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    drawImageToCanvas(URL.createObjectURL(file), file.name);
    e.target.value = '';
  };

  const handleOpenServerImage = () => {
    const path = window.prompt('输入服务器上的图片绝对路径');
    if (!path) return;
    drawImageToCanvas(serverMediaURL(path.trim()), basename(path.trim()));
  };

  const handleSave = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setStatusText('正在保存绘图到服务器...');
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!blob) {
      setStatusText('无法生成 PNG 文件');
      return;
    }
    try {
      const saved = await saveMediaBlob('drawings', 'drawing.png', blob, 'image/png');
      const record: DrawingRecord = {
        id: saved.path,
        name: basename(saved.path),
        path: saved.path,
        url: saved.url,
        timestamp: Date.now(),
        size: saved.size,
      };
      setRecentDrawings(prev => [record, ...prev.filter(item => item.path !== record.path)].slice(0, 8));
      setStatusText(`已保存到服务器: ${record.path}`);
    } catch (err) {
      console.error('Failed to save drawing:', err);
      setStatusText('绘图保存失败，请确认后端文件接口可用');
    }
  };

  const handleDownloadCopy = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const url = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = 'drawing.png';
    a.click();
  };

  const tools: { id: Tool; icon: typeof Paintbrush; label: string }[] = [
    { id: 'brush', icon: Paintbrush, label: '画笔 (Brush)' },
    { id: 'pencil', icon: Pen, label: '铅笔 (Pencil)' },
    { id: 'eraser', icon: Eraser, label: '橡皮 (Eraser)' },
    { id: 'line', icon: Minus, label: '直线 (Line)' },
    { id: 'rect', icon: Square, label: '矩形 (Rect)' },
    { id: 'circle', icon: Circle, label: '圆形 (Circle)' },
  ];

  return (
    <div className="w-full h-full flex flex-col" style={{ backgroundColor: 'var(--ink-50)' }}>
      {/* Top Toolbar */}
      <div className="flex items-center gap-1 px-2 py-1 border-b flex-shrink-0" style={{ borderColor: 'var(--ink-200)', backgroundColor: 'var(--ink-100)' }}>
        {tools.map(t => (
          <button
            key={t.id}
            onClick={() => setTool(t.id)}
            className="flex items-center gap-1 px-2 py-1 rounded text-body-sm"
            style={{
              color: tool === t.id ? 'var(--cinnabar)' : 'var(--ink-700)',
              backgroundColor: tool === t.id ? 'rgba(179,57,47,0.08)' : 'transparent',
              borderLeft: tool === t.id ? '2px solid var(--cinnabar)' : '2px solid transparent',
            }}
            title={t.label}
          >
            <t.icon size={14} />
          </button>
        ))}

        <div className="w-px h-5 mx-1" style={{ backgroundColor: 'var(--ink-300)' }} />

        <span className="text-caption" style={{ color: 'var(--ink-500)' }}>粗细:</span>
        <input
          type="range"
          min={1}
          max={50}
          value={brushSize}
          onChange={e => setBrushSize(Number(e.target.value))}
          className="w-20"
        />
        <span className="text-caption" style={{ color: 'var(--ink-500)', minWidth: 20 }}>{brushSize}</span>

        <div className="w-px h-5 mx-1" style={{ backgroundColor: 'var(--ink-300)' }} />

        <button onClick={handleUndo} disabled={historyIndex <= 0} className="p-1 rounded hover:opacity-80 disabled:opacity-30" style={{ color: 'var(--ink-700)' }} title="撤销 (Undo)">
          <Undo2 size={14} />
        </button>
        <button onClick={handleRedo} disabled={historyIndex >= history.length - 1} className="p-1 rounded hover:opacity-80 disabled:opacity-30" style={{ color: 'var(--ink-700)' }} title="重做 (Redo)">
          <Redo2 size={14} />
        </button>
        <button onClick={handleClear} className="p-1 rounded hover:opacity-80" style={{ color: 'var(--cinnabar)' }} title="清空 (Clear)">
          <Trash2 size={14} />
        </button>
        <button onClick={handleSave} className="p-1 rounded hover:opacity-80" style={{ color: 'var(--ink-700)' }} title="保存到服务器 (Save to server)">
          <Save size={14} />
        </button>
        <button onClick={handleDownloadCopy} className="p-1 rounded hover:opacity-80" style={{ color: 'var(--ink-700)' }} title="下载本地副本 (Download copy)">
          <Download size={14} />
        </button>

        <div className="w-px h-5 mx-1" style={{ backgroundColor: 'var(--ink-300)' }} />

        <button onClick={() => fileInputRef.current?.click()} className="p-1 rounded hover:opacity-80" style={{ color: 'var(--ink-700)' }} title="打开本地图片 (Open local image)">
          <FolderOpen size={14} />
        </button>
        <button onClick={handleOpenServerImage} className="p-1 rounded hover:opacity-80" style={{ color: 'var(--ink-700)' }} title="打开服务器图片路径 (Open server image)">
          <Server size={14} />
        </button>
        <input ref={fileInputRef} type="file" accept="image/*,.png,.jpg,.jpeg,.webp,.gif,.bmp" className="hidden" onChange={handleOpenLocalImage} />

        <div className="w-px h-5 mx-1" style={{ backgroundColor: 'var(--ink-300)' }} />

        <button
          onClick={() => setShowGrid(v => !v)}
          className="p-1 rounded hover:opacity-80"
          style={{ color: showGrid ? 'var(--cinnabar)' : 'var(--ink-700)' }}
          title="网格 (Grid)"
        >
          <Grid3X3 size={14} />
        </button>

        <div className="flex-1" />
        <span className="text-caption truncate max-w-[260px]" style={{ color: 'var(--ink-500)' }}>{statusText}</span>
      </div>

      {/* Canvas Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Color Palette */}
        <div className="flex flex-col gap-1 p-2 border-r" style={{ borderColor: 'var(--ink-200)', backgroundColor: 'var(--ink-100)', width: 48 }}>
          {COLORS.map(c => (
            <button
              key={c}
              onClick={() => setColor(c)}
              className="w-6 h-6 rounded border-2"
              style={{
                backgroundColor: c,
                borderColor: color === c ? 'var(--cinnabar)' : 'var(--ink-300)',
              }}
              title={c}
            />
          ))}
          {recentDrawings.length > 0 && (
            <div className="mt-2 pt-2 border-t flex flex-col gap-1" style={{ borderColor: 'var(--ink-200)' }}>
              {recentDrawings.slice(0, 4).map(record => (
                <button
                  key={record.path}
                  onClick={() => drawImageToCanvas(record.url, record.name)}
                  className="w-6 h-6 rounded border overflow-hidden"
                  style={{ borderColor: 'var(--ink-300)', backgroundImage: `url(${record.url})`, backgroundSize: 'cover', backgroundPosition: 'center' }}
                  title={record.name}
                />
              ))}
            </div>
          )}
        </div>

        {/* Canvas */}
        <div className="flex-1 overflow-auto flex items-center justify-center p-4" style={{ backgroundColor: 'var(--ink-200)' }}>
          <div className="relative" style={{ boxShadow: 'var(--shadow-lg)' }}>
            <canvas
              ref={canvasRef}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              className="cursor-crosshair"
              style={{
                width: CANVAS_W,
                height: CANVAS_H,
                maxWidth: '100%',
                backgroundColor: '#ffffff',
              }}
            />
            {/* Grid Overlay */}
            {showGrid && (
              <svg
                className="absolute inset-0 pointer-events-none"
                style={{ width: CANVAS_W, height: CANVAS_H }}
              >
                {Array.from({ length: Math.floor(CANVAS_W / 20) + 1 }, (_, i) => (
                  <line key={`v${i}`} x1={i * 20} y1={0} x2={i * 20} y2={CANVAS_H} stroke="#d9d9d9" strokeWidth={0.5} />
                ))}
                {Array.from({ length: Math.floor(CANVAS_H / 20) + 1 }, (_, i) => (
                  <line key={`h${i}`} x1={0} y1={i * 20} x2={CANVAS_W} y2={i * 20} stroke="#d9d9d9" strokeWidth={0.5} />
                ))}
              </svg>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

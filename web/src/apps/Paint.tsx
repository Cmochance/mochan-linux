import { useState, useRef, useCallback, useEffect } from 'react';
import {
  Paintbrush, Pen, Eraser, Minus, Square, Circle, Grid3X3,
  Undo2, Redo2, Trash2, Download, Plus, MinusIcon
} from 'lucide-react';

type Tool = 'brush' | 'pencil' | 'eraser' | 'line' | 'rect' | 'circle';

interface Point { x: number; y: number }

const COLORS = [
  '#1a1a1a', '#2d2d2d', '#5c5c5c', '#9e9e9e', '#d9d9d9', '#ffffff',
  '#b3392f', '#c94a3f', '#8a2a22', '#4a7c59', '#5a7a8a', '#b8860b',
];

const STORAGE_KEY_HISTORY = 'paint-history';

export default function Paint() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [tool, setTool] = useState<Tool>('brush');
  const [color, setColor] = useState('#1a1a1a');
  const [brushSize, setBrushSize] = useState(3);
  const [showGrid, setShowGrid] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [history, setHistory] = useState<ImageData[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const startPos = useRef<Point | null>(null);
  const currentPos = useRef<Point | null>(null);

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

  const handleSave = () => {
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
        <button onClick={handleSave} className="p-1 rounded hover:opacity-80" style={{ color: 'var(--ink-700)' }} title="保存 PNG (Save)">
          <Download size={14} />
        </button>

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

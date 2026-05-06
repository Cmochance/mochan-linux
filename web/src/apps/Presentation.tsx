import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import {
  Plus, Trash2, Copy, Monitor, Type, Square, Circle, Minus,
  ChevronLeft, ChevronRight, X, Layout, Image, Move, Download, Upload
} from 'lucide-react';
import { appStateClient } from '../lib/app-state';

type ElementType = 'text' | 'rect' | 'circle' | 'line';

interface SlideElement {
  id: string;
  type: ElementType;
  x: number;
  y: number;
  width: number;
  height: number;
  content: string;
  fontSize?: number;
  color?: string;
  bgColor?: string;
  rotation?: number;
}

interface Slide {
  id: string;
  elements: SlideElement[];
  bgColor: string;
  template: string;
}

type Tool = 'select' | 'text' | 'rect' | 'circle' | 'line';

const STORAGE_KEY = 'presentation-data';
const PRESENTATION_APP_ID = 'presentation';

const SLIDE_W = 960;
const SLIDE_H = 540;

function genId() { return 'el_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7); }

function createDefaultSlides(): Slide[] {
  return [
    {
      id: genId(),
      template: 'title',
      bgColor: '#ffffff',
      elements: [
        { id: genId(), type: 'text', x: 80, y: 120, width: 800, height: 80, content: '演示文稿标题\n(Presentation Title)', fontSize: 42, color: '#1a1a1a' },
        { id: genId(), type: 'text', x: 80, y: 280, width: 800, height: 60, content: '副标题 (Subtitle)', fontSize: 22, color: '#5c5c5c' },
      ],
    },
    {
      id: genId(),
      template: 'content',
      bgColor: '#ffffff',
      elements: [
        { id: genId(), type: 'text', x: 60, y: 30, width: 840, height: 50, content: '目录 (Agenda)', fontSize: 28, color: '#1a1a1a' },
        { id: genId(), type: 'text', x: 80, y: 120, width: 400, height: 300, content: '1. 项目介绍\n2. 核心功能\n3. 技术架构\n4. 未来规划', fontSize: 18, color: '#3d3d3d' },
        { id: genId(), type: 'rect', x: 520, y: 120, width: 360, height: 300, content: '', bgColor: '#f0ebe4' },
      ],
    },
    {
      id: genId(),
      template: 'content',
      bgColor: '#ffffff',
      elements: [
        { id: genId(), type: 'text', x: 60, y: 30, width: 840, height: 50, content: '项目介绍 (Introduction)', fontSize: 28, color: '#1a1a1a' },
        { id: genId(), type: 'text', x: 60, y: 110, width: 420, height: 360, content: '这是一个使用 Ink OS 内置演示文稿工具创建的幻灯片。\n\n支持：\n- 文本框\n- 形状（矩形、圆形、线条）\n- 多种布局模板\n- 全屏演示模式', fontSize: 16, color: '#3d3d3d' },
        { id: genId(), type: 'rect', x: 520, y: 110, width: 380, height: 200, content: '', bgColor: '#e8e4df' },
        { id: genId(), type: 'circle', x: 620, y: 350, width: 180, height: 180, content: '', bgColor: 'rgba(179,57,47,0.1)' },
      ],
    },
    {
      id: genId(),
      template: 'two-column',
      bgColor: '#ffffff',
      elements: [
        { id: genId(), type: 'text', x: 60, y: 30, width: 840, height: 50, content: '对比分析 (Comparison)', fontSize: 28, color: '#1a1a1a' },
        { id: genId(), type: 'rect', x: 60, y: 110, width: 400, height: 380, content: '', bgColor: '#f0ebe4' },
        { id: genId(), type: 'rect', x: 500, y: 110, width: 400, height: 380, content: '', bgColor: '#e8e4df' },
        { id: genId(), type: 'text', x: 80, y: 130, width: 360, height: 40, content: '方案 A', fontSize: 20, color: '#b3392f' },
        { id: genId(), type: 'text', x: 520, y: 130, width: 360, height: 40, content: '方案 B', fontSize: 20, color: '#4a7c59' },
      ],
    },
    {
      id: genId(),
      template: 'title',
      bgColor: '#1a1a1a',
      elements: [
        { id: genId(), type: 'text', x: 80, y: 160, width: 800, height: 80, content: '感谢观看 (Thank You)', fontSize: 48, color: '#f0ebe4' },
        { id: genId(), type: 'text', x: 80, y: 300, width: 800, height: 50, content: 'Questions & Answers', fontSize: 22, color: '#9e9e9e' },
      ],
    },
  ];
}

interface PresentationState {
  slides: Slide[];
}

function loadLocalPresentation(): PresentationState {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return { slides: saved ? JSON.parse(saved) : createDefaultSlides() };
  } catch {
    return { slides: createDefaultSlides() };
  }
}

export default function Presentation() {
  const [slides, setSlides] = useState<Slide[]>(() => loadLocalPresentation().slides);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [tool, setTool] = useState<Tool>('select');
  const [selectedElement, setSelectedElement] = useState<string | null>(null);
  const [editingElement, setEditingElement] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [isPresenting, setIsPresenting] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawStart, setDrawStart] = useState({ x: 0, y: 0 });
  const [dragElement, setDragElement] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [loaded, setLoaded] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const editRef = useRef<HTMLTextAreaElement>(null);
  const importRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadState() {
      try {
        const fallback = loadLocalPresentation();
        const state = await appStateClient.getOrDefault<PresentationState>(PRESENTATION_APP_ID, fallback);
        if (cancelled) return;
        const nextSlides = Array.isArray(state.slides) && state.slides.length > 0 ? state.slides : fallback.slides;
        setSlides(nextSlides);
        setCurrentSlide(0);
        setSyncError(null);
      } catch (err) {
        if (!cancelled) setSyncError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoaded(true);
      }
    }
    loadState();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!loaded) return;
    const timer = setTimeout(() => {
      appStateClient.put<PresentationState>(PRESENTATION_APP_ID, { slides })
        .then(() => setSyncError(null))
        .catch(err => setSyncError(err instanceof Error ? err.message : String(err)));
    }, 500);
    return () => clearTimeout(timer);
  }, [slides, loaded]);

  const addSlide = useCallback((template = 'blank') => {
    const newSlide: Slide = {
      id: genId(),
      template,
      bgColor: '#ffffff',
      elements: template === 'title' ? [
        { id: genId(), type: 'text', x: 80, y: 140, width: 800, height: 80, content: '新标题 (New Title)', fontSize: 36, color: '#1a1a1a' },
      ] : template === 'content' ? [
        { id: genId(), type: 'text', x: 60, y: 30, width: 840, height: 50, content: '标题 (Title)', fontSize: 24, color: '#1a1a1a' },
        { id: genId(), type: 'text', x: 60, y: 110, width: 840, height: 360, content: '内容...\n(Content...)', fontSize: 16, color: '#3d3d3d' },
      ] : [],
    };
    setSlides(prev => {
      const next = [...prev];
      next.splice(currentSlide + 1, 0, newSlide);
      return next;
    });
    setCurrentSlide(s => s + 1);
  }, [currentSlide]);

  const deleteSlide = useCallback(() => {
    if (slides.length <= 1) return;
    setSlides(prev => prev.filter((_, i) => i !== currentSlide));
    setCurrentSlide(s => Math.min(s, slides.length - 2));
  }, [slides.length, currentSlide]);

  const duplicateSlide = useCallback(() => {
    const slide = slides[currentSlide];
    if (!slide) return;
    const newSlide: Slide = {
      ...slide,
      id: genId(),
      elements: slide.elements.map(e => ({ ...e, id: genId() })),
    };
    setSlides(prev => {
      const next = [...prev];
      next.splice(currentSlide + 1, 0, newSlide);
      return next;
    });
    setCurrentSlide(s => s + 1);
  }, [slides, currentSlide]);

  const addElement = useCallback((type: ElementType, x: number, y: number) => {
    const newEl: SlideElement = {
      id: genId(),
      type,
      x,
      y,
      width: type === 'line' ? 120 : type === 'text' ? 200 : 100,
      height: type === 'line' ? 2 : type === 'text' ? 60 : 100,
      content: type === 'text' ? '文本框 (Text)' : '',
      fontSize: 16,
      color: '#1a1a1a',
      bgColor: type === 'rect' ? '#e8e4df' : type === 'circle' ? '#f0ebe4' : undefined,
    };
    setSlides(prev => prev.map((slide, i) =>
      i === currentSlide ? { ...slide, elements: [...slide.elements, newEl] } : slide
    ));
    setSelectedElement(newEl.id);
    if (type === 'text') {
      setEditingElement(newEl.id);
      setEditContent(newEl.content);
      requestAnimationFrame(() => editRef.current?.focus());
    }
  }, [currentSlide]);

  const updateElement = useCallback((slideIdx: number, elId: string, updates: Partial<SlideElement>) => {
    setSlides(prev => prev.map((slide, i) =>
      i === slideIdx ? {
        ...slide,
        elements: slide.elements.map(el => el.id === elId ? { ...el, ...updates } : el),
      } : slide
    ));
  }, []);

  const deleteElement = useCallback(() => {
    if (!selectedElement) return;
    setSlides(prev => prev.map((slide, i) =>
      i === currentSlide ? {
        ...slide,
        elements: slide.elements.filter(el => el.id !== selectedElement),
      } : slide
    ));
    setSelectedElement(null);
  }, [selectedElement, currentSlide]);

  const exportJSON = () => {
    const blob = new Blob([JSON.stringify({ slides }, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'presentation.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const importJSON = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const parsed = JSON.parse(String(ev.target?.result || '{}'));
        const nextSlides = Array.isArray(parsed) ? parsed : parsed.slides;
        if (!Array.isArray(nextSlides) || nextSlides.length === 0) throw new Error('Invalid presentation JSON');
        setSlides(nextSlides);
        setCurrentSlide(0);
        setSelectedElement(null);
        setEditingElement(null);
        setSyncError(null);
      } catch (err) {
        setSyncError(err instanceof Error ? err.message : String(err));
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const scale = SLIDE_W / rect.width;
    const x = (e.clientX - rect.left) * scale;
    const y = (e.clientY - rect.top) * scale;

    if (tool === 'select') {
      // Check if clicking on an element
      const slide = slides[currentSlide];
      const clickedEl = [...slide.elements].reverse().find(el =>
        x >= el.x && x <= el.x + el.width && y >= el.y && y <= el.y + el.height
      );
      if (clickedEl) {
        setSelectedElement(clickedEl.id);
        setDragElement(clickedEl.id);
        setDragOffset({ x: x - clickedEl.x, y: y - clickedEl.y });
        if (clickedEl.type === 'text') {
          setEditingElement(clickedEl.id);
          setEditContent(clickedEl.content);
          requestAnimationFrame(() => editRef.current?.focus());
        }
      } else {
        setSelectedElement(null);
      }
      return;
    }

    setIsDrawing(true);
    setDrawStart({ x, y });
  };

  const handleCanvasMouseMove = (e: React.MouseEvent) => {
    if (isDrawing && tool !== 'select' && tool !== 'text') {
      // Drawing shape - create preview element
    }
    if (dragElement && tool === 'select') {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const scale = SLIDE_W / rect.width;
      const x = (e.clientX - rect.left) * scale - dragOffset.x;
      const y = (e.clientY - rect.top) * scale - dragOffset.y;
      updateElement(currentSlide, dragElement, { x: Math.max(0, x), y: Math.max(0, y) });
    }
  };

  const handleCanvasMouseUp = (e: React.MouseEvent) => {
    if (isDrawing && tool !== 'select') {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const scale = SLIDE_W / rect.width;
      const x = (e.clientX - rect.left) * scale;
      const y = (e.clientY - rect.top) * scale;

      if (tool === 'text') {
        addElement('text', x - 100, y - 20);
      } else if (tool === 'rect' || tool === 'circle' || tool === 'line') {
        const elType: ElementType = tool === 'rect' ? 'rect' : tool === 'circle' ? 'circle' : 'line';
        const width = Math.abs(x - drawStart.x);
        const height = Math.abs(y - drawStart.y);
        if (width > 10 || height > 10) {
          addElement(elType, Math.min(drawStart.x, x), Math.min(drawStart.y, y));
        }
      }
      setIsDrawing(false);
      setTool('select');
    }
    setDragElement(null);
  };

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (selectedElement && !editingElement) deleteElement();
    }
    if (isPresenting) {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === ' ') {
        setCurrentSlide(s => Math.min(slides.length - 1, s + 1));
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        setCurrentSlide(s => Math.max(0, s - 1));
      } else if (e.key === 'Escape') {
        setIsPresenting(false);
      }
    }
  }, [selectedElement, editingElement, deleteElement, isPresenting, slides.length]);

  const currentSlideData = slides[currentSlide];

  // Render element on canvas
  const renderElement = (el: SlideElement) => {
    const isSelected = selectedElement === el.id;
    const isEditing = editingElement === el.id && el.type === 'text';

    const baseStyle: React.CSSProperties = {
      position: 'absolute',
      left: el.x,
      top: el.y,
      width: el.width,
      height: el.height,
      cursor: tool === 'select' ? 'move' : 'crosshair',
      outline: isSelected ? '2px dashed var(--cinnabar)' : 'none',
    };

    if (el.type === 'text') {
      return (
        <div key={el.id} style={baseStyle} onMouseDown={e => { if (tool === 'select') { e.stopPropagation(); setSelectedElement(el.id); setDragElement(el.id); setDragOffset({ x: 0, y: 0 }); } }}>
          {isEditing ? (
            <textarea
              ref={editRef}
              value={editContent}
              onChange={e => setEditContent(e.target.value)}
              onBlur={() => {
                updateElement(currentSlide, el.id, { content: editContent });
                setEditingElement(null);
              }}
              onKeyDown={e => {
                if (e.key === 'Escape') { setEditingElement(null); }
                e.stopPropagation();
              }}
              className="w-full h-full resize-none outline-none border-none p-1"
              style={{ fontSize: el.fontSize, color: el.color, fontFamily: '"Noto Sans SC", sans-serif', background: 'rgba(255,255,255,0.9)' }}
            />
          ) : (
            <div
              className="w-full h-full overflow-hidden select-none whitespace-pre-wrap"
              style={{
                fontSize: el.fontSize,
                color: el.color,
                fontFamily: '"Noto Sans SC", sans-serif',
                lineHeight: 1.4,
              }}
            >
              {el.content}
            </div>
          )}
        </div>
      );
    }

    if (el.type === 'rect') {
      return (
        <div
          key={el.id}
          style={{
            ...baseStyle,
            backgroundColor: el.bgColor || '#e8e4df',
            border: '1px solid var(--ink-300)',
          }}
          onMouseDown={e => { if (tool === 'select') { e.stopPropagation(); setSelectedElement(el.id); setDragElement(el.id); setDragOffset({ x: 0, y: 0 }); } }}
        />
      );
    }

    if (el.type === 'circle') {
      return (
        <div
          key={el.id}
          style={{
            ...baseStyle,
            backgroundColor: el.bgColor || '#f0ebe4',
            borderRadius: '50%',
            border: '1px solid var(--ink-300)',
          }}
          onMouseDown={e => { if (tool === 'select') { e.stopPropagation(); setSelectedElement(el.id); setDragElement(el.id); setDragOffset({ x: 0, y: 0 }); } }}
        />
      );
    }

    if (el.type === 'line') {
      return (
        <div
          key={el.id}
          style={{
            ...baseStyle,
            height: el.height || 2,
            backgroundColor: el.color || '#1a1a1a',
          }}
          onMouseDown={e => { if (tool === 'select') { e.stopPropagation(); setSelectedElement(el.id); setDragElement(el.id); setDragOffset({ x: 0, y: 0 }); } }}
        />
      );
    }

    return null;
  };

  if (isPresenting) {
    return (
      <div
        className="fixed inset-0 z-[9999] flex items-center justify-center"
        style={{ backgroundColor: currentSlideData?.bgColor || '#1a1a1a' }}
        onClick={() => setCurrentSlide(s => Math.min(slides.length - 1, s + 1))}
        onKeyDown={handleKeyDown}
        tabIndex={0}
        autoFocus
      >
        <div
          className="relative"
          style={{
            width: '100vw',
            height: '56.25vw',
            maxHeight: '100vh',
            maxWidth: '177.78vh',
            backgroundColor: currentSlideData?.bgColor || '#ffffff',
          }}
        >
          {currentSlideData?.elements.map(el => (
            <div
              key={el.id}
              style={{
                position: 'absolute',
                left: `${(el.x / SLIDE_W) * 100}%`,
                top: `${(el.y / SLIDE_H) * 100}%`,
                width: `${(el.width / SLIDE_W) * 100}%`,
                height: `${(el.height / SLIDE_H) * 100}%`,
              }}
            >
              {el.type === 'text' && (
                <div className="w-full h-full whitespace-pre-wrap" style={{ fontSize: `calc(${(el.fontSize || 16) / SLIDE_W} * 100vw)`, color: el.color, fontFamily: '"Noto Sans SC", sans-serif', lineHeight: 1.4 }}>
                  {el.content}
                </div>
              )}
              {el.type === 'rect' && (
                <div className="w-full h-full" style={{ backgroundColor: el.bgColor, border: '1px solid var(--ink-300)' }} />
              )}
              {el.type === 'circle' && (
                <div className="w-full h-full" style={{ backgroundColor: el.bgColor, borderRadius: '50%', border: '1px solid var(--ink-300)' }} />
              )}
              {el.type === 'line' && (
                <div className="w-full" style={{ height: '100%', backgroundColor: el.color || '#1a1a1a' }} />
              )}
            </div>
          ))}
        </div>

        {/* Navigation */}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-4" style={{ color: '#fff' }}>
          <button onClick={e => { e.stopPropagation(); setCurrentSlide(s => Math.max(0, s - 1)); }} className="p-2 rounded-full" style={{ backgroundColor: 'rgba(26,26,26,0.5)' }}>
            <ChevronLeft size={20} />
          </button>
          <span className="text-body-sm">{currentSlide + 1} / {slides.length}</span>
          <button onClick={e => { e.stopPropagation(); setCurrentSlide(s => Math.min(slides.length - 1, s + 1)); }} className="p-2 rounded-full" style={{ backgroundColor: 'rgba(26,26,26,0.5)' }}>
            <ChevronRight size={20} />
          </button>
        </div>

        <button
          onClick={e => { e.stopPropagation(); setIsPresenting(false); }}
          className="absolute top-4 right-4 p-2 rounded-full"
          style={{ backgroundColor: 'rgba(26,26,26,0.5)', color: '#fff' }}
        >
          <X size={20} />
        </button>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col" style={{ backgroundColor: 'var(--ink-50)' }} onKeyDown={handleKeyDown} tabIndex={0}>
      {/* Toolbar */}
      <div className="flex items-center gap-1 px-2 py-1 border-b flex-shrink-0" style={{ borderColor: 'var(--ink-200)', backgroundColor: 'var(--ink-100)' }}>
        <button onClick={() => addSlide()} className="flex items-center gap-1 px-2 py-1 rounded text-body-sm hover:opacity-80" style={{ color: 'var(--ink-700)' }}>
          <Plus size={14} /> 新建
        </button>
        <button onClick={duplicateSlide} className="flex items-center gap-1 px-2 py-1 rounded text-body-sm hover:opacity-80" style={{ color: 'var(--ink-700)' }}>
          <Copy size={14} /> 复制
        </button>
        <button onClick={deleteSlide} disabled={slides.length <= 1} className="flex items-center gap-1 px-2 py-1 rounded text-body-sm hover:opacity-80 disabled:opacity-30" style={{ color: 'var(--cinnabar)' }}>
          <Trash2 size={14} /> 删除
        </button>
        <button onClick={() => importRef.current?.click()} className="flex items-center gap-1 px-2 py-1 rounded text-body-sm hover:opacity-80" style={{ color: 'var(--ink-700)' }}>
          <Upload size={14} /> 导入
        </button>
        <input ref={importRef} type="file" accept="application/json,.json" className="hidden" onChange={importJSON} />
        <button onClick={exportJSON} className="flex items-center gap-1 px-2 py-1 rounded text-body-sm hover:opacity-80" style={{ color: 'var(--ink-700)' }}>
          <Download size={14} /> 导出
        </button>

        <div className="w-px h-5 mx-1" style={{ backgroundColor: 'var(--ink-300)' }} />

        <button onClick={() => setTool('select')} className="p-1 rounded" style={{ color: tool === 'select' ? 'var(--cinnabar)' : 'var(--ink-700)', backgroundColor: tool === 'select' ? 'rgba(179,57,47,0.08)' : 'transparent' }} title="选择 (Select)">
          <Move size={14} />
        </button>
        <button onClick={() => setTool('text')} className="p-1 rounded" style={{ color: tool === 'text' ? 'var(--cinnabar)' : 'var(--ink-700)', backgroundColor: tool === 'text' ? 'rgba(179,57,47,0.08)' : 'transparent' }} title="文本 (Text)">
          <Type size={14} />
        </button>
        <button onClick={() => setTool('rect')} className="p-1 rounded" style={{ color: tool === 'rect' ? 'var(--cinnabar)' : 'var(--ink-700)', backgroundColor: tool === 'rect' ? 'rgba(179,57,47,0.08)' : 'transparent' }} title="矩形 (Rectangle)">
          <Square size={14} />
        </button>
        <button onClick={() => setTool('circle')} className="p-1 rounded" style={{ color: tool === 'circle' ? 'var(--cinnabar)' : 'var(--ink-700)', backgroundColor: tool === 'circle' ? 'rgba(179,57,47,0.08)' : 'transparent' }} title="圆形 (Circle)">
          <Circle size={14} />
        </button>
        <button onClick={() => setTool('line')} className="p-1 rounded" style={{ color: tool === 'line' ? 'var(--cinnabar)' : 'var(--ink-700)', backgroundColor: tool === 'line' ? 'rgba(179,57,47,0.08)' : 'transparent' }} title="线条 (Line)">
          <Minus size={14} />
        </button>

        <div className="w-px h-5 mx-1" style={{ backgroundColor: 'var(--ink-300)' }} />

        {selectedElement && (
          <>
            <button onClick={deleteElement} className="p-1 rounded hover:opacity-80" style={{ color: 'var(--cinnabar)' }} title="删除元素">
              <Trash2 size={14} />
            </button>
            <div className="w-px h-5 mx-1" style={{ backgroundColor: 'var(--ink-300)' }} />
          </>
        )}

        <div className="flex-1" />

        <span className="text-caption" style={{ color: 'var(--ink-500)' }}>
          {currentSlide + 1} / {slides.length}
        </span>
        {syncError && (
          <span className="text-caption px-2 py-1 rounded" style={{ color: 'var(--error)', backgroundColor: 'rgba(179,57,47,0.08)' }}>
            {syncError}
          </span>
        )}

        <div className="w-px h-5 mx-1" style={{ backgroundColor: 'var(--ink-300)' }} />

        <button onClick={() => setIsPresenting(true)} className="flex items-center gap-1 px-3 py-1 rounded text-body-sm font-medium" style={{ backgroundColor: 'var(--ink-800)', color: 'var(--ink-50)' }}>
          <Monitor size={14} /> 演示 (Present)
        </button>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Slide Thumbnails */}
        <div className="w-40 flex-shrink-0 border-r overflow-auto" style={{ borderColor: 'var(--ink-200)', backgroundColor: 'var(--ink-100)' }}>
          {slides.map((slide, i) => (
            <div
              key={slide.id}
              onClick={() => { setCurrentSlide(i); setSelectedElement(null); setEditingElement(null); }}
              className="m-2 rounded border-2 cursor-pointer overflow-hidden"
              style={{
                borderColor: i === currentSlide ? 'var(--cinnabar)' : 'transparent',
                aspectRatio: '16/9',
                backgroundColor: slide.bgColor,
              }}
            >
              <div className="w-full h-full relative" style={{ transform: 'scale(0.156)', transformOrigin: 'top left', width: SLIDE_W, height: SLIDE_H }}>
                {slide.elements.map(el => (
                  <div key={el.id} style={{ position: 'absolute', left: el.x, top: el.y, width: el.width, height: el.height }}>
                    {el.type === 'text' && (
                      <div className="w-full h-full whitespace-pre-wrap" style={{ fontSize: el.fontSize, color: el.color }}>{el.content}</div>
                    )}
                    {el.type === 'rect' && <div className="w-full h-full" style={{ backgroundColor: el.bgColor }} />}
                    {el.type === 'circle' && <div className="w-full h-full" style={{ backgroundColor: el.bgColor, borderRadius: '50%' }} />}
                    {el.type === 'line' && <div className="w-full" style={{ height: 2, backgroundColor: el.color }} />}
                  </div>
                ))}
              </div>
              <div className="text-caption text-center py-0.5" style={{ color: 'var(--ink-500)' }}>
                {i + 1}
              </div>
            </div>
          ))}
        </div>

        {/* Main Canvas */}
        <div className="flex-1 overflow-auto flex items-center justify-center p-4" style={{ backgroundColor: 'var(--ink-200)' }}>
          <div
            ref={canvasRef}
            className="relative"
            style={{
              width: SLIDE_W,
              height: SLIDE_H,
              maxWidth: '100%',
              backgroundColor: currentSlideData?.bgColor || '#ffffff',
              boxShadow: 'var(--shadow-lg)',
              cursor: tool === 'select' ? 'default' : 'crosshair',
            }}
            onMouseDown={handleCanvasMouseDown}
            onMouseMove={handleCanvasMouseMove}
            onMouseUp={handleCanvasMouseUp}
            onMouseLeave={handleCanvasMouseUp}
          >
            {currentSlideData?.elements.map(el => renderElement(el))}
          </div>
        </div>
      </div>
    </div>
  );
}

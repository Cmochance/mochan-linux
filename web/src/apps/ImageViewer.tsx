import { useState, useRef, useEffect, useCallback } from 'react';
import {
  ZoomIn, ZoomOut, RotateCcw, RotateCw, FlipHorizontal, FlipVertical,
  Upload, Download, Trash2, Play, Pause, ChevronLeft, ChevronRight, Image
} from 'lucide-react';

interface ImageFile {
  id: string;
  file: File;
  url: string;
  name: string;
  width: number;
  height: number;
  size: number;
  type: string;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function generateId() {
  return Math.random().toString(36).substring(2, 9);
}

export default function ImageViewer() {
  const [images, setImages] = useState<ImageFile[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [flipH, setFlipH] = useState(false);
  const [flipV, setFlipV] = useState(false);
  const [slideshow, setSlideshow] = useState(false);
  const [slideshowInterval, setSlideshowInterval] = useState(5);
  const [dragOver, setDragOver] = useState(false);
  const [showThumbnails, setShowThumbnails] = useState(true);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const slideshowTimerRef = useRef<ReturnType<typeof setInterval>>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const currentImage = images[currentIndex];

  const handleFileUpload = useCallback((files: FileList | null) => {
    if (!files) return;
    const imageFiles = Array.from(files).filter(f =>
      f.type.startsWith('image/') || f.name.endsWith('.jpg') || f.name.endsWith('.png') || f.name.endsWith('.gif') || f.name.endsWith('.webp') || f.name.endsWith('.svg')
    );

    imageFiles.forEach(file => {
      const url = URL.createObjectURL(file);
      const img = new window.Image();
      img.onload = () => {
        setImages(prev => [...prev, {
          id: generateId(),
          file,
          url,
          name: file.name,
          width: img.naturalWidth,
          height: img.naturalHeight,
          size: file.size,
          type: file.type || 'image/unknown',
        }]);
      };
      img.src = url;
    });
  }, []);

  // Slideshow
  useEffect(() => {
    if (slideshow && images.length > 1) {
      slideshowTimerRef.current = setInterval(() => {
        setCurrentIndex(prev => (prev + 1) % images.length);
        setZoom(1);
        setRotation(0);
      }, slideshowInterval * 1000);
    }
    return () => {
      if (slideshowTimerRef.current) clearInterval(slideshowTimerRef.current);
    };
  }, [slideshow, images.length, slideshowInterval]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      switch (e.code) {
        case 'ArrowLeft':
          goPrev();
          break;
        case 'ArrowRight':
          goNext();
          break;
        case 'Equal':
        case 'NumpadAdd':
          e.preventDefault();
          setZoom(z => Math.min(5, z + 0.25));
          break;
        case 'Minus':
        case 'NumpadSubtract':
          e.preventDefault();
          setZoom(z => Math.max(0.1, z - 0.25));
          break;
        case 'KeyR':
          setRotation(r => r + 90);
          break;
        case 'KeyF':
          setFlipH(f => !f);
          break;
        case 'Delete':
          handleDelete();
          break;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentIndex, images.length]);

  const goNext = useCallback(() => {
    if (images.length === 0) return;
    setCurrentIndex(prev => (prev + 1) % images.length);
    setZoom(1);
    setRotation(0);
  }, [images.length]);

  const goPrev = useCallback(() => {
    if (images.length === 0) return;
    setCurrentIndex(prev => (prev - 1 + images.length) % images.length);
    setZoom(1);
    setRotation(0);
  }, [images.length]);

  const handleDelete = () => {
    if (!currentImage) return;
    URL.revokeObjectURL(currentImage.url);
    setImages(prev => prev.filter((_, i) => i !== currentIndex));
    if (currentIndex >= images.length - 1) {
      setCurrentIndex(Math.max(0, images.length - 2));
    }
  };

  const handleDownload = () => {
    if (!currentImage) return;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const rad = (rotation * Math.PI) / 180;
      const sin = Math.abs(Math.sin(rad));
      const cos = Math.abs(Math.cos(rad));
      canvas.width = img.naturalWidth * cos + img.naturalHeight * sin;
      canvas.height = img.naturalWidth * sin + img.naturalHeight * cos;

      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate(rad);
      ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
      ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);

      const link = document.createElement('a');
      link.download = `edited_${currentImage.name}`;
      link.href = canvas.toDataURL(currentImage.type);
      link.click();
    };
    img.src = currentImage.url;
  };

  // Wheel zoom
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    setZoom(z => Math.max(0.1, Math.min(5, z + delta)));
  };

  if (images.length === 0) {
    return (
      <div
        className="w-full h-full flex flex-col items-center justify-center"
        style={{ backgroundColor: 'var(--ink-900)' }}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFileUpload(e.dataTransfer.files); }}
      >
        {dragOver && (
          <div className="absolute inset-0 z-50 flex items-center justify-center border-2 border-dashed"
            style={{ backgroundColor: 'rgba(179,57,47,0.15)', borderColor: 'var(--cinnabar)' }}>
            <p className="text-body-lg" style={{ color: 'var(--cinnabar)' }}>拖入图片 (Drop images)</p>
          </div>
        )}
        <Image size={48} style={{ color: 'var(--ink-400)' }} />
        <p className="mt-4 text-body-md" style={{ color: 'var(--ink-400)' }}>拖入图片文件或点击上传</p>
        <p className="text-body-sm" style={{ color: 'var(--ink-500)' }}>Drop images or click to upload</p>
        <button
          onClick={() => fileInputRef.current?.click()}
          className="mt-6 px-6 py-2 rounded text-body-md transition-all duration-75 hover:scale-[1.02]"
          style={{ backgroundColor: 'var(--ink-700)', color: 'var(--ink-50)' }}
        >
          选择图片 (Select Images)
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,.jpg,.png,.gif,.webp,.svg"
          multiple
          className="hidden"
          onChange={(e) => handleFileUpload(e.target.files)}
        />
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="w-full h-full flex flex-col overflow-hidden select-none"
      style={{ backgroundColor: 'var(--ink-900)' }}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFileUpload(e.dataTransfer.files); }}
    >
      {dragOver && (
        <div className="absolute inset-0 z-50 flex items-center justify-center border-2 border-dashed"
          style={{ backgroundColor: 'rgba(179,57,47,0.15)', borderColor: 'var(--cinnabar)' }}>
          <p className="text-body-lg" style={{ color: 'var(--cinnabar)' }}>拖入图片 (Drop images)</p>
        </div>
      )}

      {/* Toolbar */}
      <div
        className="flex items-center gap-1 px-3 py-1.5 flex-shrink-0"
        style={{
          backgroundColor: 'var(--glass-bg)',
          backdropFilter: 'blur(20px) saturate(180%)',
          borderBottom: '1px solid var(--glass-border)',
        }}
      >
        <button onClick={() => fileInputRef.current?.click()} className="p-1.5 rounded transition-all duration-75" style={{ color: 'var(--ink-400)' }} title="打开 (Open)">
          <Upload size={16} />
        </button>
        <div className="w-px h-4 mx-1" style={{ backgroundColor: 'var(--ink-600)' }} />
        <button onClick={() => setZoom(z => Math.min(5, z + 0.25))} className="p-1.5 rounded transition-all duration-75" style={{ color: 'var(--ink-400)' }} title="放大 (Zoom In)">
          <ZoomIn size={16} />
        </button>
        <button onClick={() => setZoom(z => Math.max(0.1, z - 0.25))} className="p-1.5 rounded transition-all duration-75" style={{ color: 'var(--ink-400)' }} title="缩小 (Zoom Out)">
          <ZoomOut size={16} />
        </button>
        <button onClick={() => setZoom(1)} className="px-2 py-1 rounded text-caption transition-all duration-75" style={{ color: 'var(--ink-400)' }} title="原始大小 (100%)">
          {Math.round(zoom * 100)}%
        </button>
        <button onClick={() => setRotation(r => r - 90)} className="p-1.5 rounded transition-all duration-75" style={{ color: 'var(--ink-400)' }} title="向左旋转 (Rotate Left)">
          <RotateCcw size={16} />
        </button>
        <button onClick={() => setRotation(r => r + 90)} className="p-1.5 rounded transition-all duration-75" style={{ color: 'var(--ink-400)' }} title="向右旋转 (Rotate Right)">
          <RotateCw size={16} />
        </button>
        <button onClick={() => setFlipH(f => !f)} className="p-1.5 rounded transition-all duration-75" style={{ color: flipH ? 'var(--cinnabar)' : 'var(--ink-400)' }} title="水平翻转 (Flip H)">
          <FlipHorizontal size={16} />
        </button>
        <button onClick={() => setFlipV(f => !f)} className="p-1.5 rounded transition-all duration-75" style={{ color: flipV ? 'var(--cinnabar)' : 'var(--ink-400)' }} title="垂直翻转 (Flip V)">
          <FlipVertical size={16} />
        </button>
        <div className="w-px h-4 mx-1" style={{ backgroundColor: 'var(--ink-600)' }} />
        <button
          onClick={() => setSlideshow(!slideshow)}
          className="p-1.5 rounded transition-all duration-75"
          style={{ color: slideshow ? 'var(--cinnabar)' : 'var(--ink-400)' }}
          title="幻灯片 (Slideshow)"
        >
          {slideshow ? <Pause size={16} /> : <Play size={16} />}
        </button>
        {slideshow && (
          <select
            value={slideshowInterval}
            onChange={(e) => setSlideshowInterval(Number(e.target.value))}
            className="text-caption rounded px-1 py-0.5"
            style={{ backgroundColor: 'var(--ink-800)', color: 'var(--ink-300)', border: '1px solid var(--ink-600)' }}
          >
            <option value={1}>1s</option>
            <option value={3}>3s</option>
            <option value={5}>5s</option>
            <option value={10}>10s</option>
            <option value={15}>15s</option>
            <option value={30}>30s</option>
          </select>
        )}
        <div className="flex-1" />
        <button onClick={handleDownload} className="p-1.5 rounded transition-all duration-75" style={{ color: 'var(--ink-400)' }} title="下载 (Download)">
          <Download size={16} />
        </button>
        <button onClick={handleDelete} className="p-1.5 rounded transition-all duration-75" style={{ color: 'var(--cinnabar)' }} title="删除 (Delete)">
          <Trash2 size={16} />
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => handleFileUpload(e.target.files)}
        />
      </div>

      {/* Main Image Area */}
      <div
        className="flex-1 relative flex items-center justify-center overflow-hidden cursor-grab active:cursor-grabbing"
        onWheel={handleWheel}
      >
        {currentImage && (
          <>
            {/* Navigation arrows */}
            {images.length > 1 && (
              <>
                <button
                  onClick={goPrev}
                  className="absolute left-3 z-10 p-2 rounded-full transition-all duration-75 opacity-0 hover:opacity-100"
                  style={{ backgroundColor: 'var(--glass-bg)', color: 'var(--ink-50)' }}
                >
                  <ChevronLeft size={20} />
                </button>
                <button
                  onClick={goNext}
                  className="absolute right-3 z-10 p-2 rounded-full transition-all duration-75 opacity-0 hover:opacity-100"
                  style={{ backgroundColor: 'var(--glass-bg)', color: 'var(--ink-50)' }}
                >
                  <ChevronRight size={20} />
                </button>
              </>
            )}

            {/* Image */}
            <img
              src={currentImage.url}
              alt={currentImage.name}
              className="max-w-full max-h-full transition-transform duration-150"
              style={{
                transform: `scale(${zoom}) rotate(${rotation}deg) scaleX(${flipH ? -1 : 1}) scaleY(${flipV ? -1 : 1})`,
                objectFit: 'contain',
                boxShadow: zoom > 1 ? 'var(--shadow-xl)' : 'none',
              }}
              draggable={false}
            />

            {/* Zoom level indicator */}
            <div
              className="absolute top-3 right-3 px-2 py-1 rounded text-caption"
              style={{ backgroundColor: 'rgba(0,0,0,0.6)', color: 'var(--ink-300)' }}
            >
              {Math.round(zoom * 100)}%
            </div>
          </>
        )}
      </div>

      {/* Bottom Info Bar */}
      <div
        className="flex items-center justify-between px-4 py-1.5 flex-shrink-0 text-caption"
        style={{ backgroundColor: 'var(--ink-800)', color: 'var(--ink-400)' }}
      >
        <span className="truncate max-w-[200px]">{currentImage?.name}</span>
        <span>{currentImage ? `${currentImage.width} x ${currentImage.height}` : ''}</span>
        <span>{currentImage ? formatFileSize(currentImage.size) : ''}</span>
        <span>{images.length > 0 ? `${currentIndex + 1} / ${images.length}` : ''}</span>
      </div>

      {/* Thumbnail Strip */}
      {showThumbnails && images.length > 1 && (
        <div
          className="flex-shrink-0 flex gap-2 px-4 py-2 overflow-x-auto"
          style={{ backgroundColor: 'var(--ink-800)', height: 80 }}
        >
          {images.map((img, idx) => (
            <button
              key={img.id}
              onClick={() => {
                setCurrentIndex(idx);
                setZoom(1);
                setRotation(0);
              }}
              className="flex-shrink-0 rounded overflow-hidden transition-all duration-75"
              style={{
                width: 60,
                height: 60,
                border: idx === currentIndex ? '2px solid var(--cinnabar)' : '2px solid transparent',
                opacity: idx === currentIndex ? 1 : 0.6,
              }}
            >
              <img src={img.url} alt={img.name} className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

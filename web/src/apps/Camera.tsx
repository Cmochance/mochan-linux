import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Camera as CameraIcon, FlipHorizontal, Grid3X3, Timer, Zap, Download, Trash2, X
} from 'lucide-react';

interface CapturedPhoto {
  id: string;
  url: string;
  timestamp: number;
}

type TimerOption = 0 | 3 | 5 | 10;

function generateId() {
  return Math.random().toString(36).substring(2, 9);
}

export default function Camera() {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isMirror, setIsMirror] = useState(true);
  const [showGrid, setShowGrid] = useState(false);
  const [timer, setTimer] = useState<TimerOption>(0);
  const [countdown, setCountdown] = useState(0);
  const [flashEffect, setFlashEffect] = useState(false);
  const [photos, setPhotos] = useState<CapturedPhoto[]>([]);
  const [lightboxPhoto, setLightboxPhoto] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [selectedFilter, setSelectedFilter] = useState('none');

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const FILTERS = [
    { id: 'none', name: '原图 (None)', style: 'none' },
    { id: 'grayscale', name: '黑白 (B&W)', style: 'grayscale(100%)' },
    { id: 'sepia', name: '怀旧 (Sepia)', style: 'sepia(100%)' },
    { id: 'contrast', name: '高对比 (High)', style: 'contrast(150%)' },
    { id: 'brightness', name: '明亮 (Bright)', style: 'brightness(120%)' },
  ];

  // Start webcam
  useEffect(() => {
    startCamera();
    return () => {
      stopCamera();
    };
  }, []);

  // Load saved photos from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('camera_photos_count');
    if (saved) {
      // Photos are stored as blob URLs which can't persist, so we just note the count
    }
  }, []);

  const startCamera = async () => {
    try {
      setError('');
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = mediaStream;
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch {
      setError('无法访问摄像头 (Cannot access camera)');
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setStream(null);
  };

  // Connect video to stream
  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  const capturePhoto = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current) return;

    let delay = timer;
    if (delay > 0) {
      setCountdown(delay);
      const interval = setInterval(() => {
        delay -= 1;
        setCountdown(delay);
        if (delay <= 0) {
          clearInterval(interval);
        }
      }, 1000);

      await new Promise(resolve => setTimeout(resolve, timer * 1000));
    }

    setCountdown(0);

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;

    // Apply mirror if needed
    if (isMirror) {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }

    // Apply filter
    ctx.filter = selectedFilter === 'none' ? 'none' :
                 selectedFilter === 'grayscale' ? 'grayscale(100%)' :
                 selectedFilter === 'sepia' ? 'sepia(100%)' :
                 selectedFilter === 'contrast' ? 'contrast(150%)' :
                 selectedFilter === 'brightness' ? 'brightness(120%)' : 'none';

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    ctx.filter = 'none';
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    const url = canvas.toDataURL('image/png');
    const newPhoto: CapturedPhoto = {
      id: generateId(),
      url,
      timestamp: Date.now(),
    };

    setPhotos(prev => [newPhoto, ...prev]);
    localStorage.setItem('camera_photos_count', String(photos.length + 1));

    // Flash effect
    setFlashEffect(true);
    setTimeout(() => setFlashEffect(false), 200);
  }, [timer, isMirror, selectedFilter, photos.length]);

  const deletePhoto = (id: string) => {
    setPhotos(prev => prev.filter(p => p.id !== id));
    if (lightboxPhoto === id) setLightboxPhoto(null);
  };

  const downloadPhoto = (photo: CapturedPhoto) => {
    const link = document.createElement('a');
    link.href = photo.url;
    link.download = `photo_${new Date(photo.timestamp).toISOString().replace(/[:.]/g, '-')}.png`;
    link.click();
  };

  return (
    <div
      className="w-full h-full flex flex-col overflow-hidden select-none relative"
      style={{ backgroundColor: '#000' }}
    >
      {/* Error */}
      {error && (
        <div
          className="absolute top-0 left-0 right-0 z-50 px-4 py-2 text-body-sm text-center"
          style={{ backgroundColor: 'rgba(179,57,47,0.9)', color: '#fff' }}
        >
          {error}
        </div>
      )}

      {/* Hidden canvas for capture */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Flash Effect */}
      {flashEffect && (
        <div
          className="absolute inset-0 z-40 pointer-events-none"
          style={{ backgroundColor: '#fff', animation: 'flash 200ms ease-out' }}
        />
      )}

      {/* Video Preview */}
      <div className="flex-1 relative flex items-center justify-center overflow-hidden">
        {stream ? (
          <>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full"
              style={{
                objectFit: 'cover',
                transform: isMirror ? 'scaleX(-1)' : 'scaleX(1)',
                filter: selectedFilter === 'none' ? 'none' :
                        selectedFilter === 'grayscale' ? 'grayscale(100%)' :
                        selectedFilter === 'sepia' ? 'sepia(100%)' :
                        selectedFilter === 'contrast' ? 'contrast(150%)' :
                        selectedFilter === 'brightness' ? 'brightness(120%)' : 'none',
                transition: 'filter 150ms ease',
              }}
            />

            {/* Grid overlay */}
            {showGrid && (
              <div className="absolute inset-0 pointer-events-none z-10">
                {/* Rule of thirds grid */}
                <div className="absolute inset-0" style={{
                  backgroundImage: `
                    linear-gradient(to right, rgba(255,255,255,0.3) 1px, transparent 1px),
                    linear-gradient(to bottom, rgba(255,255,255,0.3) 1px, transparent 1px)
                  `,
                  backgroundSize: '33.33% 33.33%',
                }} />
              </div>
            )}

            {/* Countdown overlay */}
            {countdown > 0 && (
              <div className="absolute inset-0 flex items-center justify-center z-20">
                <div
                  className="text-display-lg"
                  style={{
                    color: '#fff',
                    textShadow: '0 2px 10px rgba(0,0,0,0.5)',
                    fontFamily: "'ZCOOL XiaoWei', cursive, serif",
                    fontSize: 80,
                    animation: 'countdown-pop 1s ease-out',
                  }}
                >
                  {countdown}
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="flex flex-col items-center justify-center text-center p-8">
            <CameraIcon size={48} style={{ color: 'var(--ink-500)' }} />
            <p className="mt-4 text-body-md" style={{ color: 'var(--ink-400)' }}>
              {error ? '请检查摄像头权限 (Check camera permissions)' : '正在启动摄像头... (Starting camera...)'}
            </p>
            <button
              onClick={startCamera}
              className="mt-4 px-4 py-2 rounded text-body-sm transition-all duration-75"
              style={{ backgroundColor: 'var(--ink-700)', color: 'var(--ink-50)' }}
            >
              重试 (Retry)
            </button>
          </div>
        )}
      </div>

      {/* Toolbar */}
      <div
        className="flex-shrink-0 flex items-center justify-center gap-4 px-4 py-2"
        style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}
      >
        {/* Mirror toggle */}
        <button
          onClick={() => setIsMirror(!isMirror)}
          className="p-2 rounded-full transition-all duration-75"
          style={{ color: isMirror ? 'var(--cinnabar)' : 'rgba(255,255,255,0.7)' }}
          title="镜像 (Mirror)"
        >
          <FlipHorizontal size={20} />
        </button>

        {/* Grid toggle */}
        <button
          onClick={() => setShowGrid(!showGrid)}
          className="p-2 rounded-full transition-all duration-75"
          style={{ color: showGrid ? 'var(--cinnabar)' : 'rgba(255,255,255,0.7)' }}
          title="网格 (Grid)"
        >
          <Grid3X3 size={20} />
        </button>

        {/* Capture button */}
        <button
          onClick={capturePhoto}
          disabled={countdown > 0}
          className="flex items-center justify-center rounded-full transition-all duration-75 hover:scale-110 active:scale-95"
          style={{
            width: 56,
            height: 56,
            backgroundColor: 'var(--cinnabar)',
            color: '#fff',
            boxShadow: '0 4px 12px rgba(179,57,47,0.4)',
            opacity: countdown > 0 ? 0.6 : 1,
          }}
          title="拍照 (Capture)"
        >
          <CameraIcon size={24} />
        </button>

        {/* Timer */}
        <div className="relative">
          <button
            onClick={() => setTimer(t => t === 0 ? 3 : t === 3 ? 5 : t === 5 ? 10 : 0 as TimerOption)}
            className="p-2 rounded-full transition-all duration-75 flex flex-col items-center"
            style={{ color: timer > 0 ? 'var(--cinnabar)' : 'rgba(255,255,255,0.7)' }}
            title="定时器 (Timer)"
          >
            <Timer size={20} />
            {timer > 0 && <span className="text-[9px]">{timer}s</span>}
          </button>
        </div>

        {/* Flash button (visual only) */}
        <button
          onClick={() => setFlashEffect(true)}
          className="p-2 rounded-full transition-all duration-75"
          style={{ color: 'rgba(255,255,255,0.7)' }}
          title="闪光灯 (Flash)"
        >
          <Zap size={20} />
        </button>
      </div>

      {/* Filter selector */}
      <div
        className="flex-shrink-0 flex items-center gap-1 px-4 py-1.5 overflow-x-auto"
        style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}
      >
        {FILTERS.map(f => (
          <button
            key={f.id}
            onClick={() => setSelectedFilter(f.id)}
            className="px-3 py-1 rounded-full text-caption whitespace-nowrap transition-all duration-75"
            style={{
              color: selectedFilter === f.id ? '#fff' : 'rgba(255,255,255,0.6)',
              backgroundColor: selectedFilter === f.id ? 'rgba(179,57,47,0.6)' : 'rgba(255,255,255,0.1)',
              border: selectedFilter === f.id ? '1px solid var(--cinnabar)' : '1px solid transparent',
            }}
          >
            {f.name}
          </button>
        ))}
      </div>

      {/* Photos strip */}
      {photos.length > 0 && (
        <div
          className="flex-shrink-0 flex gap-1 px-3 py-2 overflow-x-auto"
          style={{ backgroundColor: 'rgba(0,0,0,0.7)', height: 72 }}
        >
          {photos.map(photo => (
            <div
              key={photo.id}
              className="flex-shrink-0 relative group cursor-pointer"
              style={{ width: 56, height: 56 }}
              onClick={() => setLightboxPhoto(photo.id)}
            >
              <img
                src={photo.url}
                alt="Captured"
                className="w-full h-full object-cover rounded"
              />
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all duration-75 rounded flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100">
                <button
                  onClick={(e) => { e.stopPropagation(); downloadPhoto(photo); }}
                  className="p-0.5 rounded"
                  style={{ color: '#fff' }}
                >
                  <Download size={10} />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); deletePhoto(photo.id); }}
                  className="p-0.5 rounded"
                  style={{ color: 'var(--cinnabar)' }}
                >
                  <Trash2 size={10} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Lightbox */}
      {lightboxPhoto && (
        <div className="fixed inset-0 z-[1000] flex flex-col" style={{ backgroundColor: 'rgba(0,0,0,0.95)' }}>
          <div className="flex items-center justify-between px-4 py-2 flex-shrink-0">
            <button
              onClick={() => setLightboxPhoto(null)}
              className="p-2 rounded transition-all duration-75"
              style={{ color: '#fff' }}
            >
              <X size={20} />
            </button>
            <div className="flex items-center gap-2">
              {photos.find(p => p.id === lightboxPhoto) && (
                <>
                  <button
                    onClick={() => downloadPhoto(photos.find(p => p.id === lightboxPhoto)!)}
                    className="p-2 rounded transition-all duration-75"
                    style={{ color: 'rgba(255,255,255,0.7)' }}
                  >
                    <Download size={16} />
                  </button>
                  <button
                    onClick={() => deletePhoto(lightboxPhoto)}
                    className="p-2 rounded transition-all duration-75"
                    style={{ color: 'var(--cinnabar)' }}
                  >
                    <Trash2 size={16} />
                  </button>
                </>
              )}
            </div>
          </div>
          <div className="flex-1 flex items-center justify-center p-4">
            {photos.find(p => p.id === lightboxPhoto) && (
              <img
                src={photos.find(p => p.id === lightboxPhoto)!.url}
                alt="Captured"
                className="max-w-full max-h-full object-contain rounded"
              />
            )}
          </div>
        </div>
      )}

      {/* CSS animations */}
      <style>{`
        @keyframes flash {
          0% { opacity: 0.8; }
          100% { opacity: 0; }
        }
        @keyframes countdown-pop {
          0% { transform: scale(0.5); opacity: 0; }
          50% { transform: scale(1.5); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

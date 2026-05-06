import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, Maximize,
  Minimize, Settings, Upload, ChevronDown
} from 'lucide-react';
import { appStateClient } from '@/lib/app-state';
import { listMediaFiles, saveMediaBlob, serverMediaURL, type MediaLibraryFile } from '@/lib/media-library';
import { basename, usePayloadPath } from '@/lib/openFile';

interface VideoFile {
  id: string;
  url: string;
  path?: string;
  name: string;
  size?: number;
  mtime?: number;
}

interface VideoPlayerState {
  videos: VideoFile[];
  currentIndex: number;
  volume: number;
  isMuted: boolean;
  playbackSpeed: number;
}

const PLAYBACK_SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];
const APP_ID = 'videoplayer';
const VIDEO_EXTENSIONS = ['mp4', 'webm', 'ogv', 'mov', 'mkv'] as const;

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '0:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function generateId() {
  return Math.random().toString(36).substring(2, 9);
}

function isVideoName(name: string): boolean {
  const ext = name.slice(name.lastIndexOf('.') + 1).toLowerCase();
  return VIDEO_EXTENSIONS.includes(ext as typeof VIDEO_EXTENSIONS[number]);
}

function fromLibraryFile(file: MediaLibraryFile): VideoFile {
  return {
    id: file.path,
    path: file.path,
    url: file.url,
    name: file.name,
    size: file.size,
    mtime: file.mtime,
  };
}

function normalizeVideos(videos: VideoFile[] | undefined): VideoFile[] {
  if (!Array.isArray(videos)) return [];
  return videos
    .filter(video => video && (video.path || video.url))
    .map(video => ({
      ...video,
      id: video.path || video.id || generateId(),
      url: serverMediaURL(video.path, video.url),
      name: video.name || (video.path ? basename(video.path) : 'Untitled video'),
    }));
}

function serializeVideos(videos: VideoFile[]): VideoFile[] {
  return videos
    .filter(video => video.path)
    .map(video => ({
      ...video,
      url: '',
    }));
}

function mergeVideos(primary: VideoFile[], secondary: VideoFile[]): VideoFile[] {
  const seen = new Set<string>();
  const merged: VideoFile[] = [];
  for (const video of [...primary, ...secondary]) {
    const key = video.path || video.id;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    merged.push(video);
  }
  return merged;
}

export default function VideoPlayer({ windowId }: { windowId?: string }) {
  const [videos, setVideos] = useState<VideoFile[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [buffered, setBuffered] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const [isLoadingLibrary, setIsLoadingLibrary] = useState(true);
  const [libraryMessage, setLibraryMessage] = useState('');
  const [isSavingFiles, setIsSavingFiles] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout>>(null);
  const loadedRef = useRef(false);
  const payloadPath = usePayloadPath(windowId);

  const currentVideo = videos[currentIndex];

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const fallback: VideoPlayerState = {
          videos: [],
          currentIndex: 0,
          volume: 0.8,
          isMuted: false,
          playbackSpeed: 1,
        };
        const [saved, files] = await Promise.all([
          appStateClient.getOrDefault<VideoPlayerState>(APP_ID, fallback),
          listMediaFiles('videos', VIDEO_EXTENSIONS),
        ]);
        if (!alive) return;
        const merged = mergeVideos(normalizeVideos(saved.videos), files.map(fromLibraryFile));
        setVideos(merged);
        setCurrentIndex(Math.min(Math.max(saved.currentIndex || 0, 0), Math.max(merged.length - 1, 0)));
        setVolume(typeof saved.volume === 'number' ? saved.volume : 0.8);
        setIsMuted(Boolean(saved.isMuted));
        setPlaybackSpeed(PLAYBACK_SPEEDS.includes(saved.playbackSpeed) ? saved.playbackSpeed : 1);
        setLibraryMessage(merged.length > 0 ? `已载入 ${merged.length} 个服务器视频` : '服务器视频库为空');
      } catch (err) {
        if (!alive) return;
        console.error('Failed to load video library:', err);
        setLibraryMessage('视频库加载失败，请确认后端文件接口可用');
      } finally {
        if (alive) {
          loadedRef.current = true;
          setIsLoadingLibrary(false);
        }
      }
    })();
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!loadedRef.current || !payloadPath || !isVideoName(payloadPath)) return;
    setVideos(prev => {
      if (prev.some(video => video.path === payloadPath)) return prev;
      return [
        {
          id: payloadPath,
          path: payloadPath,
          url: serverMediaURL(payloadPath),
          name: basename(payloadPath),
        },
        ...prev,
      ];
    });
    setCurrentIndex(0);
  }, [payloadPath]);

  useEffect(() => {
    if (!loadedRef.current) return;
    const timer = window.setTimeout(() => {
      appStateClient.put<VideoPlayerState>(APP_ID, {
        videos: serializeVideos(videos),
        currentIndex: Math.min(currentIndex, Math.max(videos.length - 1, 0)),
        volume,
        isMuted,
        playbackSpeed,
      }).catch(err => console.error('Failed to save video player state:', err));
    }, 300);
    return () => window.clearTimeout(timer);
  }, [videos, currentIndex, volume, isMuted, playbackSpeed]);

  // Auto-hide controls
  const resetControlsTimeout = useCallback(() => {
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    if (isPlaying) {
      controlsTimeoutRef.current = setTimeout(() => setShowControls(false), 3000);
    }
  }, [isPlaying]);

  useEffect(() => {
    return () => {
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    };
  }, []);

  // Video event listeners
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onTimeUpdate = () => setCurrentTime(video.currentTime);
    const onDurationChange = () => setDuration(video.duration || 0);
    const onProgress = () => {
      if (video.buffered.length > 0) {
        setBuffered(video.buffered.end(video.buffered.length - 1));
      }
    };
    const onEnded = () => {
      if (currentIndex < videos.length - 1) {
        setCurrentIndex(prev => prev + 1);
      } else {
        setIsPlaying(false);
      }
    };

    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('durationchange', onDurationChange);
    video.addEventListener('progress', onProgress);
    video.addEventListener('ended', onEnded);
    return () => {
      video.removeEventListener('timeupdate', onTimeUpdate);
      video.removeEventListener('durationchange', onDurationChange);
      video.removeEventListener('progress', onProgress);
      video.removeEventListener('ended', onEnded);
    };
  }, [currentIndex, videos.length]);

  // Volume
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.volume = isMuted ? 0 : volume;
    }
  }, [volume, isMuted]);

  // Playback speed
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.playbackRate = playbackSpeed;
    }
  }, [playbackSpeed]);

  const handleFileUpload = async (files: FileList | null) => {
    if (!files) return;
    const videoFiles = Array.from(files).filter(f =>
      f.type.startsWith('video/') || isVideoName(f.name)
    );
    if (videoFiles.length === 0) return;
    setIsSavingFiles(true);
    setLibraryMessage('正在保存视频到服务器...');
    try {
      const newVideos: VideoFile[] = [];
      for (const file of videoFiles) {
        const saved = await saveMediaBlob('videos', file.name, file, file.type);
        newVideos.push({
          id: saved.path,
          path: saved.path,
          url: saved.url,
          name: file.name,
          size: saved.size,
        });
      }
      setVideos(prev => mergeVideos([...prev, ...newVideos], []));
      setLibraryMessage(`已保存 ${newVideos.length} 个视频到服务器`);
    } catch (err) {
      console.error('Failed to save video files:', err);
      setLibraryMessage('视频保存失败，请确认后端文件接口可用');
    } finally {
      setIsSavingFiles(false);
    }
  };

  const togglePlay = () => {
    if (!videoRef.current || !currentVideo) return;
    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    } else {
      videoRef.current.play().catch(() => {});
      setIsPlaying(true);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    if (videoRef.current) {
      videoRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

  const toggleFullscreen = async () => {
    if (!containerRef.current) return;
    try {
      if (!document.fullscreenElement) {
        await containerRef.current.requestFullscreen();
        setIsFullscreen(true);
      } else {
        await document.exitFullscreen();
        setIsFullscreen(false);
      }
    } catch {
      // Fallback
    }
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!currentVideo) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      switch (e.code) {
        case 'Space':
          e.preventDefault();
          togglePlay();
          break;
        case 'KeyF':
          toggleFullscreen();
          break;
        case 'KeyM':
          setIsMuted(m => !m);
          break;
        case 'ArrowRight':
          if (videoRef.current) videoRef.current.currentTime += 10;
          break;
        case 'ArrowLeft':
          if (videoRef.current) videoRef.current.currentTime -= 10;
          break;
        case 'ArrowUp':
          setVolume(v => Math.min(1, v + 0.05));
          break;
        case 'ArrowDown':
          setVolume(v => Math.max(0, v - 0.05));
          break;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentVideo]);

  if (videos.length === 0) {
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
            <p className="text-body-lg" style={{ color: 'var(--cinnabar)' }}>拖入视频文件 (Drop video files)</p>
          </div>
        )}
        <Upload size={48} style={{ color: 'var(--ink-400)' }} />
        <p className="mt-4 text-body-md" style={{ color: 'var(--ink-400)' }}>
          {isLoadingLibrary ? '正在加载服务器视频库' : '拖入视频文件或点击上传'}
        </p>
        <p className="text-body-sm" style={{ color: 'var(--ink-500)' }}>Drop video files or click to upload</p>
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={isSavingFiles}
          className="mt-6 px-6 py-2 rounded text-body-md transition-all duration-75 hover:scale-[1.02]"
          style={{ backgroundColor: 'var(--ink-700)', color: 'var(--ink-50)', opacity: isSavingFiles ? 0.7 : 1 }}
        >
          {isSavingFiles ? '保存中...' : '选择视频 (Select Video)'}
        </button>
        {libraryMessage && (
          <p className="mt-4 text-caption" style={{ color: 'var(--ink-500)' }}>{libraryMessage}</p>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="video/*,.mp4,.webm,.ogg"
          multiple
          className="hidden"
          onChange={(e) => handleFileUpload(e.target.files)}
        />
      </div>
    );
  }

  const progressPercent = duration ? (currentTime / duration) * 100 : 0;
  const bufferedPercent = duration ? (buffered / duration) * 100 : 0;

  return (
    <div
      ref={containerRef}
      className="w-full h-full flex flex-col relative overflow-hidden select-none"
      style={{ backgroundColor: '#000000' }}
      onMouseMove={resetControlsTimeout}
      onMouseLeave={() => isPlaying && setShowControls(false)}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFileUpload(e.dataTransfer.files); }}
    >
      {dragOver && (
        <div className="absolute inset-0 z-50 flex items-center justify-center border-2 border-dashed"
          style={{ backgroundColor: 'rgba(179,57,47,0.15)', borderColor: 'var(--cinnabar)' }}>
          <p className="text-body-lg" style={{ color: 'var(--cinnabar)' }}>拖入视频文件 (Drop video files)</p>
        </div>
      )}
      {/* Video Element */}
      <div className="flex-1 relative flex items-center justify-center">
        <video
          ref={videoRef}
          src={currentVideo?.url || ''}
          className="w-full h-full"
          style={{ objectFit: 'contain' }}
          onClick={togglePlay}
          playsInline
        />

        {/* Center play button overlay */}
        {!isPlaying && (
          <button
            onClick={togglePlay}
            className="absolute inset-0 flex items-center justify-center"
            style={{ backgroundColor: 'rgba(0,0,0,0.3)' }}
          >
            <div
              className="flex items-center justify-center rounded-full transition-all duration-150"
              style={{
                width: 64,
                height: 64,
                backgroundColor: 'rgba(240,235,228,0.8)',
              }}
            >
              <Play size={32} style={{ color: 'var(--ink-800)', marginLeft: 4 }} />
            </div>
          </button>
        )}
      </div>

      {/* Controls Overlay */}
      <div
        className="absolute bottom-0 left-0 right-0 transition-opacity duration-150"
        style={{
          background: 'linear-gradient(to top, rgba(0,0,0,0.7), transparent)',
          opacity: showControls ? 1 : 0,
          pointerEvents: showControls ? 'auto' : 'none',
        }}
      >
        {/* Progress Bar */}
        <div className="px-4 pt-3 pb-1">
          <div className="relative w-full h-1 group cursor-pointer"
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const pct = (e.clientX - rect.left) / rect.width;
              if (videoRef.current && duration) {
                videoRef.current.currentTime = pct * duration;
              }
            }}
          >
            {/* Background */}
            <div className="absolute inset-0 rounded-full" style={{ backgroundColor: 'rgba(255,255,255,0.2)' }} />
            {/* Buffered */}
            <div
              className="absolute inset-y-0 left-0 rounded-full"
              style={{ width: `${bufferedPercent}%`, backgroundColor: 'rgba(255,255,255,0.3)' }}
            />
            {/* Played */}
            <div
              className="absolute inset-y-0 left-0 rounded-full"
              style={{ width: `${progressPercent}%`, backgroundColor: 'var(--cinnabar)' }}
            />
            {/* Thumb */}
            <div
              className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
              style={{
                left: `${progressPercent}%`,
                transform: `translate(-50%, -50%)`,
                backgroundColor: 'var(--cinnabar)',
              }}
            />
            {/* Range input for accessibility */}
            <input
              type="range"
              min={0}
              max={duration || 100}
              step={0.1}
              value={currentTime}
              onChange={handleSeek}
              className="absolute inset-0 w-full opacity-0 cursor-pointer"
              style={{ height: '100%' }}
            />
          </div>
        </div>

        {/* Controls Row */}
        <div className="flex items-center justify-between px-4 py-2">
          <div className="flex items-center gap-2">
            {/* Play/Pause */}
            <button onClick={togglePlay} className="p-1.5 transition-all duration-75" style={{ color: '#fff' }}>
              {isPlaying ? <Pause size={20} /> : <Play size={20} />}
            </button>

            {/* Previous/Next */}
            <button
              onClick={() => setCurrentIndex(prev => Math.max(0, prev - 1))}
              className="p-1.5 transition-all duration-75"
              style={{ color: '#fff', opacity: currentIndex > 0 ? 1 : 0.4 }}
              disabled={currentIndex === 0}
            >
              <SkipBack size={16} />
            </button>
            <button
              onClick={() => setCurrentIndex(prev => Math.min(videos.length - 1, prev + 1))}
              className="p-1.5 transition-all duration-75"
              style={{ color: '#fff', opacity: currentIndex < videos.length - 1 ? 1 : 0.4 }}
              disabled={currentIndex === videos.length - 1}
            >
              <SkipForward size={16} />
            </button>

            {/* Time */}
            <span className="text-caption ml-1" style={{ color: 'rgba(255,255,255,0.7)' }}>
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* Volume */}
            <button
              onClick={() => setIsMuted(!isMuted)}
              className="p-1.5 transition-all duration-75"
              style={{ color: '#fff' }}
            >
              {isMuted || volume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={isMuted ? 0 : volume}
              onChange={(e) => setVolume(parseFloat(e.target.value))}
              className="w-20 h-1 rounded-full appearance-none cursor-pointer"
              style={{
                accentColor: '#fff',
                background: `linear-gradient(to right, #fff ${(isMuted ? 0 : volume) * 100}%, rgba(255,255,255,0.2) ${(isMuted ? 0 : volume) * 100}%)`,
              }}
            />

            {/* Speed */}
            <div className="relative">
              <button
                onClick={() => setShowSpeedMenu(!showSpeedMenu)}
                className="flex items-center gap-1 p-1.5 rounded text-caption transition-all duration-75"
                style={{ color: '#fff' }}
              >
                <Settings size={14} />
                {playbackSpeed}x
                <ChevronDown size={10} />
              </button>
              {showSpeedMenu && (
                <div
                  className="absolute bottom-full right-0 mb-1 rounded-lg py-1 z-50"
                  style={{
                    backgroundColor: 'var(--ink-800)',
                    boxShadow: 'var(--shadow-lg)',
                    minWidth: 80,
                  }}
                >
                  {PLAYBACK_SPEEDS.map(speed => (
                    <button
                      key={speed}
                      onClick={() => { setPlaybackSpeed(speed); setShowSpeedMenu(false); }}
                      className="w-full px-3 py-1.5 text-left text-body-sm transition-all duration-75"
                      style={{
                        color: playbackSpeed === speed ? 'var(--cinnabar)' : '#fff',
                        backgroundColor: playbackSpeed === speed ? 'rgba(179,57,47,0.15)' : 'transparent',
                      }}
                    >
                      {speed}x
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Fullscreen */}
            <button
              onClick={toggleFullscreen}
              className="p-1.5 transition-all duration-75"
              style={{ color: '#fff' }}
            >
              {isFullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isSavingFiles}
              className="p-1.5 transition-all duration-75 disabled:opacity-50"
              style={{ color: '#fff' }}
              title="添加视频 (Add Video)"
            >
              <Upload size={16} />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="video/*,.mp4,.webm,.ogg,.ogv,.mov,.mkv"
              multiple
              className="hidden"
              onChange={(e) => handleFileUpload(e.target.files)}
            />
          </div>
        </div>
        {libraryMessage && (
          <div className="px-4 pb-2 text-caption truncate" style={{ color: 'rgba(255,255,255,0.65)' }}>
            {currentVideo.name} · {libraryMessage}
          </div>
        )}
      </div>
    </div>
  );
}

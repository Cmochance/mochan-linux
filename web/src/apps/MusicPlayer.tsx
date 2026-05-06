import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  Play, Pause, SkipBack, SkipForward, Shuffle, Repeat, Repeat1,
  Volume2, VolumeX, Music, ListMusic, X, Plus, GripVertical, Trash2
} from 'lucide-react';
import { appStateClient } from '@/lib/app-state';
import { listMediaFiles, saveMediaBlob, serverMediaURL, type MediaLibraryFile } from '@/lib/media-library';
import { basename, usePayloadPath } from '@/lib/openFile';

interface Track {
  id: string;
  url: string;
  path?: string;
  title: string;
  artist: string;
  duration: number;
  size?: number;
  mtime?: number;
}

interface MusicPlayerState {
  tracks: Track[];
  currentIndex: number;
  volume: number;
  isMuted: boolean;
  shuffle: boolean;
  repeat: 'off' | 'all' | 'one';
}

const APP_ID = 'musicplayer';
const AUDIO_EXTENSIONS = ['mp3', 'm4a', 'aac', 'wav', 'ogg', 'oga', 'flac', 'opus'] as const;

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function generateId() {
  return Math.random().toString(36).substring(2, 9);
}

function stripExtension(name: string): string {
  return name.replace(/\.[^/.]+$/, '');
}

function isAudioName(name: string): boolean {
  const ext = name.slice(name.lastIndexOf('.') + 1).toLowerCase();
  return AUDIO_EXTENSIONS.includes(ext as typeof AUDIO_EXTENSIONS[number]);
}

function fromLibraryFile(file: MediaLibraryFile): Track {
  return {
    id: file.path,
    path: file.path,
    url: file.url,
    title: stripExtension(file.name),
    artist: '服务器媒体库 (Server Library)',
    duration: 0,
    size: file.size,
    mtime: file.mtime,
  };
}

function normalizeTracks(tracks: Track[] | undefined): Track[] {
  if (!Array.isArray(tracks)) return [];
  return tracks
    .filter(track => track && (track.path || track.url))
    .map(track => ({
      ...track,
      id: track.path || track.id || generateId(),
      url: serverMediaURL(track.path, track.url),
      title: track.title || stripExtension(track.path ? basename(track.path) : 'Untitled'),
      artist: track.artist || '服务器媒体库 (Server Library)',
      duration: Number(track.duration) || 0,
    }));
}

function serializeTracks(tracks: Track[]): Track[] {
  return tracks
    .filter(track => track.path)
    .map(track => ({
      ...track,
      url: '',
    }));
}

function mergeTracks(primary: Track[], secondary: Track[]): Track[] {
  const seen = new Set<string>();
  const merged: Track[] = [];
  for (const track of [...primary, ...secondary]) {
    const key = track.path || track.id;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    merged.push(track);
  }
  return merged;
}

export default function MusicPlayer({ windowId }: { windowId?: string }) {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [isMuted, setIsMuted] = useState(false);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState<'off' | 'all' | 'one'>('off');
  const [showPlaylist, setShowPlaylist] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [isLoadingLibrary, setIsLoadingLibrary] = useState(true);
  const [libraryMessage, setLibraryMessage] = useState('');
  const [isSavingFiles, setIsSavingFiles] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const dataArrayRef = useRef<Uint8Array | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number>(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const loadedRef = useRef(false);
  const payloadPath = usePayloadPath(windowId);

  const currentTrack = tracks[currentIndex];

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const fallback: MusicPlayerState = {
          tracks: [],
          currentIndex: 0,
          volume: 0.8,
          isMuted: false,
          shuffle: false,
          repeat: 'off',
        };
        const [saved, files] = await Promise.all([
          appStateClient.getOrDefault<MusicPlayerState>(APP_ID, fallback),
          listMediaFiles('music', AUDIO_EXTENSIONS),
        ]);
        if (!alive) return;
        const merged = mergeTracks(normalizeTracks(saved.tracks), files.map(fromLibraryFile));
        setTracks(merged);
        setCurrentIndex(Math.min(Math.max(saved.currentIndex || 0, 0), Math.max(merged.length - 1, 0)));
        setVolume(typeof saved.volume === 'number' ? saved.volume : 0.8);
        setIsMuted(Boolean(saved.isMuted));
        setShuffle(Boolean(saved.shuffle));
        setRepeat(saved.repeat === 'all' || saved.repeat === 'one' ? saved.repeat : 'off');
        setLibraryMessage(merged.length > 0 ? `已载入 ${merged.length} 首服务器音乐` : '服务器音乐库为空');
      } catch (err) {
        if (!alive) return;
        console.error('Failed to load music library:', err);
        setLibraryMessage('音乐库加载失败，请确认后端文件接口可用');
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
    if (!loadedRef.current || !payloadPath || !isAudioName(payloadPath)) return;
    setTracks(prev => {
      if (prev.some(track => track.path === payloadPath)) return prev;
      return [
        {
          id: payloadPath,
          path: payloadPath,
          url: serverMediaURL(payloadPath),
          title: stripExtension(basename(payloadPath)),
          artist: '服务器文件 (Server File)',
          duration: 0,
        },
        ...prev,
      ];
    });
    setCurrentIndex(0);
  }, [payloadPath]);

  useEffect(() => {
    if (!loadedRef.current) return;
    const timer = window.setTimeout(() => {
      appStateClient.put<MusicPlayerState>(APP_ID, {
        tracks: serializeTracks(tracks),
        currentIndex: Math.min(currentIndex, Math.max(tracks.length - 1, 0)),
        volume,
        isMuted,
        shuffle,
        repeat,
      }).catch(err => console.error('Failed to save music player state:', err));
    }, 300);
    return () => window.clearTimeout(timer);
  }, [tracks, currentIndex, volume, isMuted, shuffle, repeat]);

  // Initialize audio context and analyser
  const initAudioContext = useCallback(() => {
    if (!audioRef.current) return;
    if (!audioCtxRef.current) {
      audioCtxRef.current = new AudioContext();
    }
    if (audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume();
    }
    if (!analyserRef.current) {
      analyserRef.current = audioCtxRef.current.createAnalyser();
      analyserRef.current.fftSize = 128;
      analyserRef.current.smoothingTimeConstant = 0.85;
    }
    if (!sourceRef.current) {
      sourceRef.current = audioCtxRef.current.createMediaElementSource(audioRef.current);
      sourceRef.current.connect(analyserRef.current);
      analyserRef.current.connect(audioCtxRef.current.destination);
    }
    const bufferLength = analyserRef.current.frequencyBinCount;
    dataArrayRef.current = new Uint8Array(bufferLength);
  }, []);

  // Canvas visualizer
  const drawVisualizer = useCallback(() => {
    const canvas = canvasRef.current;
    const analyser = analyserRef.current;
    const dataArray = dataArrayRef.current;
    if (!canvas || !analyser || !dataArray) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    analyser.getByteFrequencyData(dataArray as any);

    ctx.clearRect(0, 0, w, h);

    const barCount = 64;
    const barWidth = (w / barCount) * 0.6;
    const gap = (w / barCount) * 0.4;

    for (let i = 0; i < barCount; i++) {
      const dataIndex = Math.floor((i / barCount) * dataArray.length);
      const value = dataArray[dataIndex];
      const barHeight = (value / 255) * h * 0.9;
      const x = i * (barWidth + gap) + gap / 2;
      const y = h - barHeight;

      // Ink-style gradient
      const gradient = ctx.createLinearGradient(0, h, 0, y);
      gradient.addColorStop(0, '#2d2d2d');
      gradient.addColorStop(1, '#9e9e9e');

      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.roundRect(x, y, barWidth, barHeight, 2);
      ctx.fill();
    }

    rafRef.current = requestAnimationFrame(drawVisualizer);
  }, []);

  // Start/stop visualizer
  useEffect(() => {
    if (isPlaying) {
      initAudioContext();
      rafRef.current = requestAnimationFrame(drawVisualizer);
    } else {
      cancelAnimationFrame(rafRef.current);
    }
    return () => cancelAnimationFrame(rafRef.current);
  }, [isPlaying, initAudioContext, drawVisualizer]);

  // Audio event listeners
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onDurationChange = () => setDuration(audio.duration || 0);
    const onEnded = () => {
      if (repeat === 'one') {
        audio.currentTime = 0;
        audio.play();
      } else {
        handleNext();
      }
    };

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('durationchange', onDurationChange);
    audio.addEventListener('ended', onEnded);
    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('durationchange', onDurationChange);
      audio.removeEventListener('ended', onEnded);
    };
  });

  // Volume
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume;
    }
  }, [volume, isMuted]);

  const handleFileUpload = async (files: FileList | null) => {
    if (!files) return;
    const audioFiles = Array.from(files).filter(f =>
      f.type.startsWith('audio/') || isAudioName(f.name)
    );
    if (audioFiles.length === 0) return;
    setIsSavingFiles(true);
    setLibraryMessage('正在保存音乐到服务器...');
    try {
      const newTracks: Track[] = [];
      for (const file of audioFiles) {
        const saved = await saveMediaBlob('music', file.name, file, file.type);
        newTracks.push({
          id: saved.path,
          path: saved.path,
          url: saved.url,
          title: stripExtension(file.name),
          artist: '服务器媒体库 (Server Library)',
          duration: 0,
          size: saved.size,
        });
      }
      setTracks(prev => mergeTracks([...prev, ...newTracks], []));
      setLibraryMessage(`已保存 ${newTracks.length} 首音乐到服务器`);
    } catch (err) {
      console.error('Failed to save audio files:', err);
      setLibraryMessage('音乐保存失败，请确认后端文件接口可用');
    } finally {
      setIsSavingFiles(false);
    }
  };

  const handlePlay = () => {
    if (!currentTrack) return;
    initAudioContext();
    if (isPlaying) {
      audioRef.current?.pause();
      setIsPlaying(false);
    } else {
      audioRef.current?.play().catch(() => {});
      setIsPlaying(true);
    }
  };

  const handleNext = useCallback(() => {
    if (tracks.length === 0) return;
    if (shuffle) {
      let next = Math.floor(Math.random() * tracks.length);
      while (next === currentIndex && tracks.length > 1) {
        next = Math.floor(Math.random() * tracks.length);
      }
      setCurrentIndex(next);
    } else {
      setCurrentIndex(prev => (prev + 1) % tracks.length);
    }
    setCurrentTime(0);
  }, [tracks.length, shuffle, currentIndex]);

  const handlePrev = () => {
    if (tracks.length === 0) return;
    setCurrentIndex(prev => (prev - 1 + tracks.length) % tracks.length);
    setCurrentTime(0);
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    if (audioRef.current) {
      audioRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

  const handleRemoveTrack = (index: number) => {
    setTracks(prev => {
      const newTracks = prev.filter((_, i) => i !== index);
      if (index === currentIndex) {
        setCurrentTime(0);
        setIsPlaying(false);
        if (currentIndex >= newTracks.length) {
          setCurrentIndex(Math.max(0, newTracks.length - 1));
        }
      } else if (index < currentIndex) {
        setCurrentIndex(prev => prev - 1);
      }
      return newTracks;
    });
  };

  const handleReorder = (fromIndex: number, toIndex: number) => {
    setTracks(prev => {
      const newTracks = [...prev];
      const [moved] = newTracks.splice(fromIndex, 1);
      newTracks.splice(toIndex, 0, moved);
      if (currentIndex === fromIndex) setCurrentIndex(toIndex);
      else if (currentIndex > fromIndex && currentIndex <= toIndex) setCurrentIndex(currentIndex - 1);
      else if (currentIndex < fromIndex && currentIndex >= toIndex) setCurrentIndex(currentIndex + 1);
      return newTracks;
    });
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      switch (e.code) {
        case 'Space':
          e.preventDefault();
          handlePlay();
          break;
        case 'ArrowRight':
          if (audioRef.current) audioRef.current.currentTime += 5;
          break;
        case 'ArrowLeft':
          if (audioRef.current) audioRef.current.currentTime -= 5;
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
  });

  const shuffleTracks = useMemo(() => {
    const shuffled = [...Array.from({ length: tracks.length }, (_, i) => i)];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }, [tracks.length, shuffle]);

  return (
    <div
      className="w-full h-full flex flex-col overflow-hidden relative select-none"
      style={{ backgroundColor: 'var(--ink-50)' }}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        handleFileUpload(e.dataTransfer.files);
      }}
    >
      {/* Hidden audio element */}
      <audio
        ref={audioRef}
        src={currentTrack?.url || ''}
        crossOrigin="anonymous"
      />

      {/* Drag overlay */}
      {dragOver && (
        <div className="absolute inset-0 z-50 flex items-center justify-center border-2 border-dashed rounded-lg"
          style={{ backgroundColor: 'rgba(179,57,47,0.1)', borderColor: 'var(--cinnabar)' }}>
          <div className="text-center">
            <Music size={48} style={{ color: 'var(--cinnabar)' }} />
            <p className="mt-2 text-body-md" style={{ color: 'var(--cinnabar)' }}>拖入音频文件 (Drop audio files)</p>
          </div>
        </div>
      )}

      {/* Top section - Album Art */}
      <div className="flex-shrink-0 flex flex-col items-center pt-6 pb-2 px-4">
        {/* Album Art Area */}
        <div
          className="relative flex items-center justify-center mb-4 transition-transform duration-300"
          style={{
            width: 240,
            height: 240,
            borderRadius: 8,
            backgroundColor: 'var(--ink-200)',
            boxShadow: 'var(--shadow-md)',
            transform: isPlaying ? 'scale(1.02)' : 'scale(1)',
          }}
        >
          {currentTrack ? (
            <div className="flex flex-col items-center justify-center text-center p-4">
              <Music size={80} style={{ color: 'var(--ink-400)' }} />
              <div className="mt-4 text-body-sm" style={{ color: 'var(--ink-500)' }}>
                {currentTrack.title}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center text-center p-4">
              <Music size={80} style={{ color: 'var(--ink-400)' }} />
              <p className="mt-4 text-body-sm" style={{ color: 'var(--ink-500)' }}>
                {isLoadingLibrary ? '正在加载音乐库' : '点击添加音乐'}<br />{isLoadingLibrary ? 'Loading library' : 'Click to add music'}
              </p>
            </div>
          )}
          {/* Decorative rotating ring */}
          {isPlaying && (
            <div
              className="absolute inset-0 rounded-lg border-2"
              style={{
                borderColor: 'var(--ink-300)',
                opacity: 0.3,
                animation: 'spin 20s linear infinite',
              }}
            />
          )}
        </div>

        {/* Track Info */}
        <div className="text-center mb-3 w-full px-4">
          <div className="text-heading-sm truncate" style={{ color: 'var(--ink-800)' }}>
            {currentTrack?.title || '未选择 (No track)'}
          </div>
          <div className="text-body-md truncate mt-1" style={{ color: 'var(--ink-600)' }}>
            {currentTrack?.artist || '---'}
          </div>
        </div>
      </div>

      {/* Visualizer Canvas */}
      <div className="flex-shrink-0 px-4 mb-2">
        <canvas
          ref={canvasRef}
          width={440}
          height={80}
          className="w-full rounded"
          style={{ height: 80, backgroundColor: 'var(--ink-50)' }}
        />
      </div>

      {/* Progress Bar */}
      <div className="flex-shrink-0 px-5 mb-3">
        <input
          type="range"
          min={0}
          max={duration || 100}
          step={0.1}
          value={currentTime}
          onChange={handleSeek}
          className="w-full h-1 rounded-full appearance-none cursor-pointer"
          style={{
            accentColor: '#b3392f',
            background: `linear-gradient(to right, #b3392f ${(currentTime / (duration || 1)) * 100}%, #d9d9d9 ${(currentTime / (duration || 1)) * 100}%)`,
          }}
        />
        <div className="flex justify-between mt-1">
          <span className="text-caption" style={{ color: 'var(--ink-500)' }}>{formatTime(currentTime)}</span>
          <span className="text-caption" style={{ color: 'var(--ink-500)' }}>{formatTime(duration)}</span>
        </div>
      </div>

      {/* Controls Row */}
      <div className="flex-shrink-0 flex items-center justify-center gap-4 mb-3 px-4">
        <button
          onClick={() => setShuffle(!shuffle)}
          className="p-2 rounded-full transition-all duration-75"
          style={{ color: shuffle ? 'var(--cinnabar)' : 'var(--ink-700)' }}
          title="随机 (Shuffle)"
        >
          <Shuffle size={20} />
        </button>
        <button
          onClick={handlePrev}
          className="p-2 rounded-full transition-all duration-75 hover:scale-105"
          style={{ color: 'var(--ink-700)' }}
          title="上一首 (Previous)"
        >
          <SkipBack size={24} />
        </button>
        <button
          onClick={handlePlay}
          className="flex items-center justify-center rounded-full transition-all duration-75 hover:scale-105"
          style={{
            width: 56,
            height: 56,
            backgroundColor: 'var(--ink-800)',
            color: 'var(--ink-50)',
          }}
          title="播放/暂停 (Play/Pause)"
        >
          {isPlaying ? <Pause size={24} /> : <Play size={24} />}
        </button>
        <button
          onClick={handleNext}
          className="p-2 rounded-full transition-all duration-75 hover:scale-105"
          style={{ color: 'var(--ink-700)' }}
          title="下一首 (Next)"
        >
          <SkipForward size={24} />
        </button>
        <button
          onClick={() => setRepeat(r => r === 'off' ? 'all' : r === 'all' ? 'one' : 'off')}
          className="p-2 rounded-full transition-all duration-75"
          style={{ color: repeat !== 'off' ? 'var(--cinnabar)' : 'var(--ink-700)' }}
          title="循环 (Repeat)"
        >
          {repeat === 'one' ? <Repeat1 size={20} /> : <Repeat size={20} />}
        </button>
      </div>

      {/* Volume + Playlist toggle */}
      <div className="flex-shrink-0 flex items-center gap-3 px-5 mb-3">
        <button
          onClick={() => setIsMuted(!isMuted)}
          className="transition-all duration-75"
          style={{ color: 'var(--ink-600)' }}
        >
          {isMuted || volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}
        </button>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={isMuted ? 0 : volume}
          onChange={(e) => setVolume(parseFloat(e.target.value))}
          className="flex-1 h-1 rounded-full appearance-none cursor-pointer"
          style={{
            accentColor: '#b3392f',
            background: `linear-gradient(to right, #b3392f ${(isMuted ? 0 : volume) * 100}%, #d9d9d9 ${(isMuted ? 0 : volume) * 100}%)`,
          }}
        />
        <button
          onClick={() => setShowPlaylist(!showPlaylist)}
          className="p-1.5 rounded transition-all duration-75"
          style={{
            color: showPlaylist ? 'var(--cinnabar)' : 'var(--ink-600)',
            backgroundColor: showPlaylist ? 'rgba(179,57,47,0.1)' : 'transparent',
          }}
          title="播放列表 (Playlist)"
        >
          <ListMusic size={18} />
        </button>
      </div>

      {/* Add files button */}
      <div className="flex-shrink-0 flex items-center justify-center gap-3 px-4 mb-4">
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={isSavingFiles}
          className="flex items-center gap-2 px-4 py-2 rounded text-body-md transition-all duration-75 hover:scale-[1.02]"
          style={{ backgroundColor: 'var(--ink-800)', color: 'var(--ink-50)', opacity: isSavingFiles ? 0.7 : 1 }}
        >
          <Plus size={16} />
          {isSavingFiles ? '保存中...' : '添加音乐 (Add Music)'}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="audio/*,.mp3,.wav,.ogg"
          multiple
          className="hidden"
          onChange={(e) => handleFileUpload(e.target.files)}
        />
      </div>
      {libraryMessage && (
        <div className="flex-shrink-0 text-center text-caption px-4 mb-3" style={{ color: 'var(--ink-500)' }}>
          {libraryMessage}
        </div>
      )}

      {/* Playlist Panel */}
      {showPlaylist && (
        <div
          className="absolute right-0 top-0 bottom-0 z-40 flex flex-col overflow-hidden"
          style={{
            width: 280,
            backgroundColor: 'var(--ink-100)',
            boxShadow: 'var(--shadow-xl)',
          }}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'var(--ink-200)' }}>
            <span className="text-heading-sm" style={{ color: 'var(--ink-800)' }}>播放列表 (Playlist)</span>
            <button
              onClick={() => setShowPlaylist(false)}
              className="p-1 rounded transition-all duration-75"
              style={{ color: 'var(--ink-500)' }}
            >
              <X size={16} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {tracks.length === 0 ? (
              <div className="text-center py-8 text-body-sm" style={{ color: 'var(--ink-400)' }}>
                暂无歌曲 (Empty)
              </div>
            ) : (
              tracks.map((track, idx) => (
                <div
                  key={track.id}
                  className="flex items-center gap-2 px-3 py-2 cursor-pointer transition-all duration-75 group"
                  style={{
                    backgroundColor: idx === currentIndex ? 'var(--wash-light)' : 'transparent',
                    borderLeft: idx === currentIndex ? '3px solid var(--cinnabar)' : '3px solid transparent',
                  }}
                  onClick={() => {
                    setCurrentIndex(idx);
                    setCurrentTime(0);
                  }}
                >
                  <GripVertical
                    size={14}
                    className="cursor-grab opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{ color: 'var(--ink-400)' }}
                  />
                  <span className="text-caption w-5 text-center" style={{ color: 'var(--ink-400)' }}>
                    {idx + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-body-sm truncate" style={{ color: 'var(--ink-800)' }}>{track.title}</div>
                    <div className="text-caption truncate" style={{ color: 'var(--ink-500)' }}>{track.artist}</div>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleRemoveTrack(idx); }}
                    className="p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{ color: 'var(--ink-400)' }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))
            )}
          </div>
          <div className="px-4 py-2 border-t text-center text-caption" style={{ borderColor: 'var(--ink-200)', color: 'var(--ink-400)' }}>
            {tracks.length} 首歌曲 ({tracks.length} tracks)
          </div>
        </div>
      )}
    </div>
  );
}

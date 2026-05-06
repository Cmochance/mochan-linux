import { useState, useRef, useEffect, useCallback } from 'react';
import { Play, Square, Volume2, VolumeX, Star, StarOff, Radio as RadioIcon } from 'lucide-react';
import { appStateClient } from '@/lib/app-state';

interface Station {
  id: string;
  name: string;
  nameEn: string;
  genre: string;
  description: string;
  frequency: string;
  color: string;
  nowPlaying: string[];
}

interface RadioState {
  favorites: string[];
  currentStationId: string | null;
  volume: number;
  isMuted: boolean;
}

const APP_ID = 'radio';

const STATIONS: Station[] = [
  {
    id: 'classical', name: '古典 FM', nameEn: 'Classical FM',
    genre: '古典音乐 (Classical)',
    description: '古典名曲精选 — 莫扎特、贝多芬、巴赫',
    frequency: '88.5',
    color: '#5a7a8a',
    nowPlaying: ['莫扎特 - 第40号交响曲', '贝多芬 - 月光奏鸣曲', '巴赫 - G弦上的咏叹调', '维瓦尔第 - 四季', '肖邦 - 夜曲'],
  },
  {
    id: 'jazz', name: '爵士休闲', nameEn: 'Jazz Lounge',
    genre: '爵士 (Jazz)',
    description: 'Smooth jazz 和 lounge 音乐',
    frequency: '92.3',
    color: '#7a6a5a',
    nowPlaying: ['Take Five - Dave Brubeck', 'Blue Moon - Billie Holiday', 'Autumn Leaves - Chet Baker', 'Fly Me to the Moon - Frank', 'Misty - Erroll Garner'],
  },
  {
    id: 'rock', name: '摇滚电台', nameEn: 'Rock Station',
    genre: '摇滚 (Rock)',
    description: 'Alternative rock 和 indie 音乐',
    frequency: '96.7',
    color: '#6a5a4a',
    nowPlaying: ['Smells Like Teen Spirit', 'Bohemian Rhapsody', 'Hotel California', 'Stairway to Heaven', 'Creep - Radiohead'],
  },
  {
    id: 'news', name: '新闻广播', nameEn: 'News Radio',
    genre: '新闻 (News)',
    description: '24小时新闻和时事评论',
    frequency: '101.1',
    color: '#4a6a7a',
    nowPlaying: ['整点新闻播报', '财经早报', '国际新闻综述', '深度访谈节目', '今日要闻'],
  },
  {
    id: 'ambient', name: '氛围流淌', nameEn: 'Ambient Waves',
    genre: '氛围电子 (Ambient)',
    description: 'Ambient 和冥想音乐',
    frequency: '105.5',
    color: '#5a6a7a',
    nowPlaying: ['Ambient Dreamscape', 'Ocean Waves Meditation', 'Starlight Serenity', 'Forest Rain Sounds', 'Deep Space Drone'],
  },
  {
    id: 'chinese', name: '国风雅韵', nameEn: 'Chinese Traditional',
    genre: '国风 (Chinese)',
    description: '中国传统音乐 — 古琴、二胡、琵琶',
    frequency: '107.9',
    color: '#6a5a5a',
    nowPlaying: ['高山流水 - 古琴', '二泉映月 - 二胡', '十面埋伏 - 琵琶', '渔舟唱晚 - 古筝', '梅花三弄'],
  },
  {
    id: 'pop', name: '流行金曲', nameEn: 'Pop Hits',
    genre: '流行 (Pop)',
    description: '最新流行歌曲和经典金曲',
    frequency: '99.2',
    color: '#7a5a6a',
    nowPlaying: ['青花瓷 - 周杰伦', '红豆 - 王菲', '晴天 - 周杰伦', '十年 - 陈奕迅', '后来 - 刘若英'],
  },
  {
    id: 'folk', name: '民谣之声', nameEn: 'Folk & Acoustic',
    genre: '民谣 (Folk)',
    description: '民谣和原声吉他音乐',
    frequency: '89.8',
    color: '#5a7a6a',
    nowPlaying: ['成都 - 赵雷', '南山南 - 马頔', '理想 - 赵雷', '董小姐 - 宋冬野', '斑马斑马 - 宋冬野'],
  },
];

export default function Radio() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentStationId, setCurrentStationId] = useState<string | null>(null);
  const [volume, setVolume] = useState(0.7);
  const [isMuted, setIsMuted] = useState(false);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [nowPlayingIndex, setNowPlayingIndex] = useState(0);
  const [showStatic, setShowStatic] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number>(0);
  const nowPlayingTimerRef = useRef<ReturnType<typeof setInterval>>(null);
  const loadedRef = useRef(false);

  const currentStation = STATIONS.find(s => s.id === currentStationId);

  useEffect(() => {
    let alive = true;
    let localFavorites: string[] = [];
    try {
      const saved = localStorage.getItem('radio_favorites');
      localFavorites = saved ? JSON.parse(saved) : [];
    } catch { localFavorites = []; }
    appStateClient.getOrDefault<RadioState>(APP_ID, {
      favorites: localFavorites,
      currentStationId: null,
      volume: 0.7,
      isMuted: false,
    })
      .then(state => {
        if (!alive) return;
        setFavorites(new Set(Array.isArray(state.favorites) ? state.favorites : []));
        setCurrentStationId(state.currentStationId && STATIONS.some(station => station.id === state.currentStationId)
          ? state.currentStationId
          : null);
        setVolume(typeof state.volume === 'number' ? state.volume : 0.7);
        setIsMuted(Boolean(state.isMuted));
      })
      .catch(err => console.error('Failed to load radio state:', err))
      .finally(() => {
        if (alive) loadedRef.current = true;
      });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!loadedRef.current) return;
    const timer = window.setTimeout(() => {
      appStateClient.put<RadioState>(APP_ID, {
        favorites: Array.from(favorites),
        currentStationId,
        volume,
        isMuted,
      }).catch(err => console.error('Failed to save radio state:', err));
    }, 300);
    return () => window.clearTimeout(timer);
  }, [favorites, currentStationId, volume, isMuted]);

  // Now playing rotation
  useEffect(() => {
    if (isPlaying && currentStation) {
      nowPlayingTimerRef.current = setInterval(() => {
        setNowPlayingIndex(prev => (prev + 1) % currentStation.nowPlaying.length);
      }, 8000);
    }
    return () => {
      if (nowPlayingTimerRef.current) clearInterval(nowPlayingTimerRef.current);
    };
  }, [isPlaying, currentStation]);

  // Canvas visualizer
  const drawVisualizer = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    const centerX = w / 2;
    const centerY = h / 2;

    ctx.clearRect(0, 0, w, h);

    if (isPlaying && currentStation) {
      const time = Date.now() / 1000;
      const baseAmplitude = isMuted ? 2 : volume * 15;

      // Concentric animated rings
      for (let ring = 0; ring < 3; ring++) {
        const radius = 50 + ring * 20 + Math.sin(time * 2 + ring) * baseAmplitude;
        const opacity = (0.3 - ring * 0.08) * (isMuted ? 0.3 : 1);

        ctx.beginPath();
        ctx.arc(centerX, centerY, Math.max(0, radius), 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(179, 57, 47, ${opacity})`;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      // Waveform ring
      ctx.beginPath();
      const points = 64;
      for (let i = 0; i <= points; i++) {
        const angle = (i / points) * Math.PI * 2;
        const baseRadius = 60;
        const wave = Math.sin(angle * 8 + time * 4) * baseAmplitude * 0.5 +
                     Math.sin(angle * 12 - time * 3) * baseAmplitude * 0.3;
        const r = baseRadius + wave;
        const x = centerX + Math.cos(angle) * r;
        const y = centerY + Math.sin(angle) * r;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.strokeStyle = `rgba(45, 45, 45, ${isMuted ? 0.15 : 0.4})`;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Particles
      for (let i = 0; i < 12; i++) {
        const angle = (i / 12) * Math.PI * 2 + time * 0.5;
        const dist = 75 + Math.sin(time * 3 + i) * 10;
        const x = centerX + Math.cos(angle) * dist;
        const y = centerY + Math.sin(angle) * dist;
        const size = 1.5 + Math.sin(time * 4 + i) * 0.8;

        ctx.beginPath();
        ctx.arc(x, y, Math.max(0.5, size), 0, Math.PI * 2);
        ctx.fillStyle = `rgba(61, 61, 61, ${isMuted ? 0.1 : 0.3})`;
        ctx.fill();
      }
    } else {
      // Idle state - static circle
      ctx.beginPath();
      ctx.arc(centerX, centerY, 60, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(158, 158, 158, 0.3)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Center dot
      ctx.beginPath();
      ctx.arc(centerX, centerY, 3, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(158, 158, 158, 0.4)';
      ctx.fill();
    }

    // Static noise effect on station switch
    if (showStatic) {
      for (let i = 0; i < 50; i++) {
        const x = Math.random() * w;
        const y = Math.random() * h;
        ctx.fillStyle = `rgba(200, 200, 200, ${Math.random() * 0.1})`;
        ctx.fillRect(x, y, 2, 2);
      }
    }

    rafRef.current = requestAnimationFrame(drawVisualizer);
  }, [isPlaying, currentStation, volume, isMuted, showStatic]);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(drawVisualizer);
    return () => cancelAnimationFrame(rafRef.current);
  }, [drawVisualizer]);

  const selectStation = (stationId: string) => {
    if (stationId === currentStationId) return;
    setShowStatic(true);
    setTimeout(() => setShowStatic(false), 300);
    setCurrentStationId(stationId);
    setIsPlaying(true);
    setNowPlayingIndex(0);
  };

  const togglePlay = () => {
    if (!currentStationId) {
      selectStation(STATIONS[0].id);
      return;
    }
    setIsPlaying(!isPlaying);
  };

  const toggleFavorite = (stationId: string) => {
    setFavorites(prev => {
      const next = new Set(prev);
      if (next.has(stationId)) next.delete(stationId);
      else next.add(stationId);
      return next;
    });
  };

  return (
    <div
      className="w-full h-full flex flex-col overflow-hidden select-none"
      style={{ backgroundColor: 'var(--ink-50)' }}
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-5 pt-4 pb-2 flex-shrink-0">
        <RadioIcon size={24} style={{ color: 'var(--ink-700)' }} />
        <div>
          <div className="text-heading-sm" style={{ color: 'var(--ink-800)' }}>
            {currentStation?.name || '收音机 (Radio)'}
          </div>
          <div className="text-caption" style={{ color: 'var(--ink-500)' }}>
            {currentStation?.genre || '选择一个电台 (Select a station)'}
          </div>
        </div>
      </div>

      {/* Dial / Visualizer Area */}
      <div className="flex-shrink-0 flex items-center justify-center py-4">
        <div
          className="relative rounded-full flex items-center justify-center"
          style={{
            width: 180,
            height: 180,
            backgroundColor: 'var(--ink-100)',
            border: '2px solid var(--ink-300)',
          }}
        >
          <canvas
            ref={canvasRef}
            width={180}
            height={180}
            className="absolute inset-0 rounded-full"
          />
          {/* Frequency display */}
          <div className="relative z-10 text-center">
            <div
              className="text-heading-md"
              style={{ color: 'var(--cinnabar)', fontFamily: "'ZCOOL XiaoWei', cursive, serif" }}
            >
              {currentStation ? currentStation.frequency : '--.-'}
            </div>
            <div className="text-caption" style={{ color: 'var(--ink-500)' }}>
              FM
            </div>
          </div>
        </div>
      </div>

      {/* Now Playing */}
      {currentStation && isPlaying && (
        <div className="flex-shrink-0 text-center px-6 pb-3">
          <div className="text-body-sm truncate" style={{ color: 'var(--ink-600)' }}>
            {currentStation.nowPlaying[nowPlayingIndex]}
          </div>
          <div className="text-caption mt-1" style={{ color: 'var(--ink-400)' }}>
            {currentStation.description}
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="flex-shrink-0 flex items-center justify-center gap-4 pb-3">
        <button
          onClick={togglePlay}
          className="flex items-center justify-center rounded-full transition-all duration-75 hover:scale-105 active:scale-95"
          style={{
            width: 48,
            height: 48,
            backgroundColor: 'var(--ink-800)',
            color: '#fff',
          }}
          title={isPlaying ? '停止 (Stop)' : '播放 (Play)'}
        >
          {isPlaying ? <Square size={20} /> : <Play size={20} />}
        </button>
      </div>

      {/* Volume */}
      <div className="flex-shrink-0 flex items-center gap-2 px-6 pb-4">
        <button
          onClick={() => setIsMuted(!isMuted)}
          className="transition-all duration-75"
          style={{ color: 'var(--ink-600)' }}
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
          className="flex-1 h-1 rounded-full appearance-none cursor-pointer"
          style={{
            accentColor: '#b3392f',
            background: `linear-gradient(to right, #b3392f ${(isMuted ? 0 : volume) * 100}%, #d9d9d9 ${(isMuted ? 0 : volume) * 100}%)`,
          }}
        />
      </div>

      {/* Station List */}
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        <div className="text-caption px-2 mb-2" style={{ color: 'var(--ink-400)' }}>
          电台列表 ({STATIONS.length} stations)
        </div>
        {STATIONS.map(station => (
          <div
            key={station.id}
            onClick={() => selectStation(station.id)}
            className="flex items-center gap-3 px-3 py-2.5 mb-1 rounded cursor-pointer transition-all duration-75"
            style={{
              backgroundColor: currentStationId === station.id ? 'var(--wash-light)' : 'transparent',
              borderLeft: currentStationId === station.id ? '3px solid var(--cinnabar)' : '3px solid transparent',
              boxShadow: currentStationId === station.id ? 'var(--shadow-sm)' : 'none',
            }}
          >
            {/* Station indicator */}
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-caption"
              style={{ backgroundColor: station.color + '20', color: station.color }}
            >
              {station.frequency}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-body-sm font-medium truncate" style={{ color: 'var(--ink-800)' }}>
                  {station.name}
                </span>
                {currentStationId === station.id && isPlaying && (
                  <span className="flex-shrink-0 w-1.5 h-1.5 rounded-full" style={{ backgroundColor: 'var(--cinnabar)', animation: 'pulse-dot 1.5s infinite' }} />
                )}
              </div>
              <div className="text-caption truncate" style={{ color: 'var(--ink-400)' }}>
                {station.genre} — {station.description}
              </div>
            </div>

            <button
              onClick={(e) => { e.stopPropagation(); toggleFavorite(station.id); }}
              className="p-1.5 rounded transition-all duration-75 flex-shrink-0"
              style={{ color: favorites.has(station.id) ? 'var(--cinnabar)' : 'var(--ink-300)' }}
              title="收藏 (Favorite)"
            >
              {favorites.has(station.id) ? <Star size={14} /> : <StarOff size={14} />}
            </button>
          </div>
        ))}
      </div>

      {/* CSS animations */}
      <style>{`
        @keyframes pulse-dot {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
    </div>
  );
}

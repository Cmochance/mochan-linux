import { useState, useRef, useEffect, useCallback } from 'react';
import { Mic, Square, Play, Pause, Download, Trash2, Clock } from 'lucide-react';

interface Recording {
  id: string;
  name: string;
  blob: Blob;
  url: string;
  duration: number;
  timestamp: number;
}

type RecorderState = 'idle' | 'recording' | 'stopped' | 'playing';

function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const millis = Math.floor((ms % 1000) / 10);
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${millis.toString().padStart(2, '0')}`;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function generateId() {
  return Math.random().toString(36).substring(2, 9);
}

export default function VoiceRecorder() {
  const [recorderState, setRecorderState] = useState<RecorderState>('idle');
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [recordingTime, setRecordingTime] = useState(0);
  const [playbackTime, setPlaybackTime] = useState(0);
  const [currentRecordingId, setCurrentRecordingId] = useState<string | null>(null);
  const [volume, setVolume] = useState(0.8);
  const [error, setError] = useState('');

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | MediaElementAudioSourceNode | null>(null);
  const rafRef = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setInterval>>(null);
  const recordingStartTimeRef = useRef<number>(0);

  // Load recordings from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('voice_recordings_meta');
    if (saved) {
      try {
        const metaList = JSON.parse(saved) as Omit<Recording, 'blob' | 'url'>[];
        // We can't restore actual blobs from localStorage, so just show that recordings existed
        // The recordings are kept in memory state only
      } catch {
        // ignore
      }
    }
  }, []);

  // Save recordings metadata to localStorage
  useEffect(() => {
    const metaList = recordings.map(r => ({
      id: r.id,
      name: r.name,
      duration: r.duration,
      timestamp: r.timestamp,
    }));
    localStorage.setItem('voice_recordings_meta', JSON.stringify(metaList));
  }, [recordings]);

  // Initialize audio context for visualizer
  const initAudioContext = useCallback(async () => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new AudioContext();
    }
    if (audioCtxRef.current.state === 'suspended') {
      await audioCtxRef.current.resume();
    }
    if (!analyserRef.current) {
      analyserRef.current = audioCtxRef.current.createAnalyser();
      analyserRef.current.fftSize = 256;
      analyserRef.current.smoothingTimeConstant = 0.8;
    }
  }, []);

  // Canvas waveform visualizer - ink brush style
  const drawWaveform = useCallback(() => {
    const canvas = canvasRef.current;
    const analyser = analyserRef.current;
    if (!canvas || !analyser) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    if (recorderState === 'idle') {
      analyser.getByteTimeDomainData(dataArray);
    } else if (recorderState === 'playing' && audioRef.current) {
      analyser.getByteFrequencyData(dataArray);
    }

    ctx.clearRect(0, 0, w, h);

    if (recorderState === 'idle') {
      // Ink brush waveform
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#3d3d3d';
      ctx.beginPath();

      const sliceWidth = w / bufferLength;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const v = dataArray[i] / 128.0;
        const y = (v * h) / 2;

        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
        x += sliceWidth;
      }

      ctx.stroke();

      // Cinnabar peak highlights
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = 'rgba(179, 57, 47, 0.4)';
      ctx.beginPath();
      x = 0;
      for (let i = 0; i < bufferLength; i++) {
        const v = dataArray[i] / 128.0;
        const y = (v * h) / 2;
        if (v > 1.3 || v < 0.7) {
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        } else {
          ctx.stroke();
          ctx.beginPath();
        }
        x += sliceWidth;
      }
      ctx.stroke();
    } else if (recorderState === 'playing') {
      // Frequency bars for playback
      analyser.getByteFrequencyData(dataArray);
      const barCount = 64;
      const barWidth = (w / barCount) * 0.7;
      const gap = (w / barCount) * 0.3;

      for (let i = 0; i < barCount; i++) {
        const idx = Math.floor((i / barCount) * bufferLength);
        const value = dataArray[idx];
        const barHeight = (value / 255) * h * 0.9;
        const bx = i * (barWidth + gap) + gap / 2;
        const by = h - barHeight;

        const gradient = ctx.createLinearGradient(0, h, 0, by);
        gradient.addColorStop(0, '#2d2d2d');
        gradient.addColorStop(1, '#9e9e9e');
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.roundRect(bx, by, barWidth, barHeight, 2);
        ctx.fill();
      }
    } else {
      // Idle - subtle ink wash line
      ctx.strokeStyle = 'rgba(61, 61, 61, 0.15)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, h / 2);
      for (let x = 0; x < w; x += 2) {
        ctx.lineTo(x, h / 2 + Math.sin(x * 0.02) * 5);
      }
      ctx.stroke();
    }

    rafRef.current = requestAnimationFrame(drawWaveform);
  }, [recorderState]);

  // Start visualizer loop
  useEffect(() => {
    if (recorderState === 'idle' || recorderState === 'playing') {
      rafRef.current = requestAnimationFrame(drawWaveform);
    } else {
      drawWaveform(); // Draw idle state once
    }
    return () => cancelAnimationFrame(rafRef.current);
  }, [recorderState, drawWaveform]);

  // Recording timer
  useEffect(() => {
    if (recorderState === 'idle') {
      recordingStartTimeRef.current = Date.now();
      timerRef.current = setInterval(() => {
        setRecordingTime(Date.now() - recordingStartTimeRef.current);
      }, 30);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [recorderState]);

  // Playback timer
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTimeUpdate = () => setPlaybackTime(audio.currentTime * 1000);
    const onEnded = () => {
      setRecorderState('stopped');
      setPlaybackTime(0);
    };

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('ended', onEnded);
    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('ended', onEnded);
    };
  });

  const startRecording = async () => {
    try {
      setError('');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      await initAudioContext();

      // Connect stream to analyser for visualizer
      if (audioCtxRef.current && analyserRef.current) {
        sourceRef.current = audioCtxRef.current.createMediaStreamSource(stream);
        sourceRef.current.connect(analyserRef.current);
      }

      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
        const url = URL.createObjectURL(blob);
        const duration = recordingTime / 1000;
        const newRecording: Recording = {
          id: generateId(),
          name: `录音 ${new Date().toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }).replace(/\//g, '-')}`,
          blob,
          url,
          duration,
          timestamp: Date.now(),
        };
        setRecordings(prev => [newRecording, ...prev]);
        setRecordingTime(0);

        // Stop stream
        stream.getTracks().forEach(track => track.stop());
        if (sourceRef.current) {
          sourceRef.current.disconnect();
          sourceRef.current = null;
        }
      };

      mediaRecorder.start(100);
      setRecorderState('recording');
      setRecordingTime(0);
    } catch {
      setError('无法访问麦克风 (Cannot access microphone)');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && recorderState === 'idle') {
      mediaRecorderRef.current.stop();
      setRecorderState('stopped');
    }
  };

  const playRecording = async (recording: Recording) => {
    setError('');
    if (!audioRef.current) return;

    await initAudioContext();

    audioRef.current.src = recording.url;
    audioRef.current.volume = volume;

    // Connect to analyser
    try {
      if (audioCtxRef.current && analyserRef.current) {
        if (sourceRef.current) {
          sourceRef.current.disconnect();
        }
        sourceRef.current = audioCtxRef.current.createMediaElementSource(audioRef.current);
        sourceRef.current.connect(analyserRef.current);
        analyserRef.current.connect(audioCtxRef.current.destination);
      }
    } catch {
      // Already connected
    }

    setCurrentRecordingId(recording.id);
    setRecorderState('playing');
    audioRef.current.play().catch(() => {
      setError('播放失败 (Playback failed)');
    });
  };

  const pausePlayback = () => {
    audioRef.current?.pause();
    setRecorderState('stopped');
  };

  const deleteRecording = (id: string) => {
    setRecordings(prev => {
      const rec = prev.find(r => r.id === id);
      if (rec) URL.revokeObjectURL(rec.url);
      return prev.filter(r => r.id !== id);
    });
    if (currentRecordingId === id) {
      setCurrentRecordingId(null);
      setRecorderState('idle');
    }
  };

  const downloadRecording = (recording: Recording) => {
    const link = document.createElement('a');
    link.href = recording.url;
    link.download = `${recording.name}.wav`;
    link.click();
  };

  const getTotalDuration = () => {
    return recordings.reduce((sum, r) => sum + r.duration, 0);
  };

  return (
    <div
      className="w-full h-full flex flex-col overflow-hidden select-none"
      style={{ backgroundColor: 'var(--ink-50)' }}
    >
      {/* Hidden audio element */}
      <audio ref={audioRef} />

      {/* Error message */}
      {error && (
        <div
          className="px-4 py-2 text-body-sm text-center"
          style={{ backgroundColor: 'rgba(179,57,47,0.1)', color: 'var(--cinnabar)' }}
        >
          {error}
        </div>
      )}

      {/* Visualizer Area */}
      <div className="flex-shrink-0 px-4 pt-4">
        <canvas
          ref={canvasRef}
          width={440}
          height={160}
          className="w-full rounded-lg"
          style={{
            height: 160,
            backgroundColor: 'var(--ink-50)',
            border: '1px solid var(--ink-200)',
          }}
        />
      </div>

      {/* Timer Display */}
      <div className="flex-shrink-0 text-center py-4">
        <div
          className="text-heading-lg font-mono"
          style={{
            color: recorderState === 'idle' ? 'var(--cinnabar)' : 'var(--ink-700)',
            fontFamily: "'Maple Mono CN', 'Courier New', monospace",
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {recorderState === 'idle'
            ? formatTime(recordingTime)
            : recorderState === 'playing'
              ? formatTime(playbackTime)
              : '00:00.00'
          }
        </div>
        <div className="text-caption mt-1" style={{ color: 'var(--ink-400)' }}>
          {recorderState === 'idle' ? '录音中 (Recording...)' :
           recorderState === 'playing' ? '播放中 (Playing...)' :
           recorderState === 'stopped' ? '就绪 (Ready)' : '等待开始 (Idle)'}
        </div>
      </div>

      {/* Control Buttons */}
      <div className="flex-shrink-0 flex items-center justify-center gap-4 pb-4">
        {/* Record Button */}
        {recorderState !== 'recording' && (
          <button
            onClick={startRecording}
            className="flex items-center justify-center rounded-full transition-all duration-75 hover:scale-105"
            style={{
              width: 56,
              height: 56,
              backgroundColor: 'var(--cinnabar)',
              color: '#fff',
              animation: recorderState === 'idle' ? 'pulse-record 1.5s infinite' : 'none',
            }}
            title="开始录音 (Record)"
          >
            <Mic size={24} />
          </button>
        )}

        {/* Stop Button */}
        {recorderState === 'idle' && (
          <button
            onClick={stopRecording}
            className="flex items-center justify-center rounded-full transition-all duration-75 hover:scale-105 animate-pulse"
            style={{
              width: 56,
              height: 56,
              backgroundColor: 'var(--cinnabar)',
              color: '#fff',
              animation: 'pulse-record 1.5s infinite',
            }}
            title="停止 (Stop)"
          >
            <Square size={24} />
          </button>
        )}

        {/* Play/Pause for current */}
        {recorderState !== 'recording' && currentRecordingId && (
          <button
            onClick={recorderState === 'playing' ? pausePlayback : () => {
              const rec = recordings.find(r => r.id === currentRecordingId);
              if (rec) playRecording(rec);
            }}
            className="flex items-center justify-center rounded-full transition-all duration-75 hover:scale-105"
            style={{
              width: 48,
              height: 48,
              backgroundColor: 'var(--ink-700)',
              color: '#fff',
            }}
            title={recorderState === 'playing' ? '暂停 (Pause)' : '播放 (Play)'}
          >
            {recorderState === 'playing' ? <Pause size={20} /> : <Play size={20} />}
          </button>
        )}
      </div>

      {/* Volume Control */}
      <div className="flex-shrink-0 flex items-center gap-2 px-6 pb-3">
        <span className="text-caption" style={{ color: 'var(--ink-400)' }}>音量 (Volume)</span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={volume}
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            setVolume(v);
            if (audioRef.current) audioRef.current.volume = v;
          }}
          className="flex-1 h-1 rounded-full appearance-none cursor-pointer"
          style={{
            accentColor: '#b3392f',
            background: `linear-gradient(to right, #b3392f ${volume * 100}%, #d9d9d9 ${volume * 100}%)`,
          }}
        />
      </div>

      {/* Recording List Header */}
      <div
        className="flex items-center justify-between px-4 py-2 flex-shrink-0 border-t"
        style={{ borderColor: 'var(--ink-200)' }}
      >
        <span className="text-heading-sm" style={{ color: 'var(--ink-800)' }}>
          录音列表 (Recordings)
        </span>
        <span className="text-caption" style={{ color: 'var(--ink-400)' }}>
          {recordings.length} 个录音 | 总时长: {formatDuration(getTotalDuration())}
        </span>
      </div>

      {/* Recording List */}
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {recordings.length === 0 ? (
          <div className="text-center py-8 text-body-sm" style={{ color: 'var(--ink-400)' }}>
            暂无录音 (No recordings yet)
          </div>
        ) : (
          recordings.map(rec => (
            <div
              key={rec.id}
              className="flex items-center gap-3 px-3 py-2 mb-1 rounded transition-all duration-75"
              style={{
                backgroundColor: currentRecordingId === rec.id ? 'var(--wash-light)' : 'var(--ink-100)',
                borderLeft: currentRecordingId === rec.id && recorderState === 'playing' ? '3px solid var(--cinnabar)' : '3px solid transparent',
              }}
            >
              <div className="flex-1 min-w-0">
                <div className="text-body-sm truncate" style={{ color: 'var(--ink-800)' }}>{rec.name}</div>
                <div className="flex items-center gap-3 text-caption" style={{ color: 'var(--ink-400)' }}>
                  <span className="flex items-center gap-1">
                    <Clock size={10} />
                    {formatDuration(rec.duration)}
                  </span>
                  <span>
                    {new Date(rec.timestamp).toLocaleString('zh-CN')}
                  </span>
                </div>
              </div>
              <button
                onClick={() => recorderState === 'playing' && currentRecordingId === rec.id ? pausePlayback() : playRecording(rec)}
                className="p-1.5 rounded transition-all duration-75"
                style={{ color: currentRecordingId === rec.id && recorderState === 'playing' ? 'var(--cinnabar)' : 'var(--ink-600)' }}
                title="播放 (Play)"
              >
                {currentRecordingId === rec.id && recorderState === 'playing' ? <Pause size={16} /> : <Play size={16} />}
              </button>
              <button
                onClick={() => downloadRecording(rec)}
                className="p-1.5 rounded transition-all duration-75"
                style={{ color: 'var(--ink-600)' }}
                title="下载 (Download)"
              >
                <Download size={16} />
              </button>
              <button
                onClick={() => deleteRecording(rec.id)}
                className="p-1.5 rounded transition-all duration-75"
                style={{ color: 'var(--cinnabar)' }}
                title="删除 (Delete)"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))
        )}
      </div>

      {/* CSS for record pulse */}
      <style>{`
        @keyframes pulse-record {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.08); }
        }
      `}</style>
    </div>
  );
}

import { useState, useRef, useEffect, useCallback } from 'react';
import { Play, Pause, Volume2, VolumeX, Timer } from 'lucide-react';

interface TimeSignature {
  beats: number;
  note: number;
  label: string;
}

const TIME_SIGNATURES: TimeSignature[] = [
  { beats: 2, note: 4, label: '2/4' },
  { beats: 3, note: 4, label: '3/4' },
  { beats: 4, note: 4, label: '4/4' },
  { beats: 6, note: 8, label: '6/8' },
];

const MIN_BPM = 40;
const MAX_BPM = 208;

export default function Metronome() {
  const [bpm, setBpm] = useState(120);
  const [isPlaying, setIsPlaying] = useState(false);
  const [timeSig, setTimeSig] = useState<TimeSignature>(TIME_SIGNATURES[2]);
  const [volume, setVolume] = useState(0.5);
  const [isMuted, setIsMuted] = useState(false);
  const [accentFirst, setAccentFirst] = useState(true);
  const [currentBeat, setCurrentBeat] = useState(0);
  const [tapTimes, setTapTimes] = useState<number[]>([]);
  const [showVisualOnly, setShowVisualOnly] = useState(false);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const nextNoteTimeRef = useRef(0);
  const beatRef = useRef(0);
  const rafRef = useRef<number>(0);
  const pendulumAngleRef = useRef(0);
  const pendulumDirectionRef = useRef(1);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Initialize audio context
  const initAudio = useCallback(async () => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new AudioContext();
    }
    if (audioCtxRef.current.state === 'suspended') {
      await audioCtxRef.current.resume();
    }
  }, []);

  // Play click sound
  const playClick = useCallback((beat: number) => {
    if (!audioCtxRef.current || isMuted || showVisualOnly) return;
    const ctx = audioCtxRef.current;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    const isAccent = accentFirst && beat === 0;
    osc.frequency.value = isAccent ? 1000 : 600;
    osc.type = 'sine';

    gain.gain.value = volume;
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.05);
  }, [volume, isMuted, accentFirst, showVisualOnly]);

  // Scheduler
  const schedule = useCallback(() => {
    const ctx = audioCtxRef.current;
    if (!ctx || !isPlaying) return;

    const secondsPerBeat = 60 / bpm;
    const lookahead = 0.1;

    while (nextNoteTimeRef.current < ctx.currentTime + lookahead) {
      playClick(beatRef.current);
      setCurrentBeat(beatRef.current);

      beatRef.current = (beatRef.current + 1) % timeSig.beats;
      nextNoteTimeRef.current += secondsPerBeat;
    }
  }, [isPlaying, bpm, timeSig.beats, playClick]);

  // Pendulum animation
  const drawPendulum = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    const centerX = w / 2;
    const pivotY = 20;

    ctx.clearRect(0, 0, w, h);

    if (isPlaying) {
      // Calculate swing angle based on BPM
      const period = 60 / bpm;
      const elapsed = (audioCtxRef.current?.currentTime || 0);
      const phase = (elapsed % period) / period;
      const maxAngle = Math.PI * 0.45;
      pendulumAngleRef.current = Math.sin(phase * Math.PI * 2 - Math.PI / 2) * maxAngle;
    }

    const armLength = h - 50;
    const endX = centerX + Math.sin(pendulumAngleRef.current) * (armLength * 0.7);
    const endY = pivotY + Math.cos(pendulumAngleRef.current) * (armLength * 0.7);

    // Draw beat indicators
    const dotCount = timeSig.beats;
    const dotY = h - 15;
    const dotSpacing = 20;
    const startX = centerX - ((dotCount - 1) * dotSpacing) / 2;

    for (let i = 0; i < dotCount; i++) {
      const dotX = startX + i * dotSpacing;
      const isActive = isPlaying && currentBeat === i;
      const isFirst = i === 0;

      ctx.beginPath();
      ctx.arc(dotX, dotY, isFirst ? 6 : 5, 0, Math.PI * 2);

      if (isActive) {
        ctx.fillStyle = 'var(--cinnabar)';
        ctx.fill();
      } else {
        ctx.strokeStyle = 'var(--ink-300)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      // Beat number
      ctx.fillStyle = isActive ? '#fff' : 'var(--ink-400)';
      ctx.font = 'bold 8px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      if (isActive) {
        ctx.fillText(String(i + 1), dotX, dotY);
      }
    }

    // Draw pivot
    ctx.beginPath();
    ctx.arc(centerX, pivotY, 6, 0, Math.PI * 2);
    ctx.fillStyle = 'var(--ink-600)';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(centerX, pivotY, 3, 0, Math.PI * 2);
    ctx.fillStyle = 'var(--ink-300)';
    ctx.fill();

    // Draw arm (ink brush style)
    ctx.beginPath();
    ctx.moveTo(centerX, pivotY);
    ctx.lineTo(endX, endY);
    ctx.strokeStyle = 'var(--ink-800)';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.stroke();

    // Draw pendulum weight (cinnabar)
    ctx.beginPath();
    ctx.arc(endX, endY, 10, 0, Math.PI * 2);
    ctx.fillStyle = 'var(--cinnabar)';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(endX, endY, 10, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(179,57,47,0.3)';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Glow effect on active beat
    if (isPlaying) {
      ctx.beginPath();
      ctx.arc(endX, endY, 14 + Math.sin(Date.now() / 100) * 2, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(179,57,47,0.2)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Arc guide
    ctx.beginPath();
    ctx.arc(centerX, pivotY, armLength * 0.7, Math.PI * 0.55, Math.PI * 0.45);
    ctx.strokeStyle = 'rgba(158,158,158,0.15)';
    ctx.lineWidth = 1;
    ctx.stroke();

    rafRef.current = requestAnimationFrame(drawPendulum);
  }, [isPlaying, bpm, timeSig.beats, currentBeat]);

  // Start/stop animation loop
  useEffect(() => {
    rafRef.current = requestAnimationFrame(drawPendulum);
    return () => cancelAnimationFrame(rafRef.current);
  }, [drawPendulum]);

  // Metronome scheduler loop
  useEffect(() => {
    if (isPlaying) {
      initAudio();
      if (audioCtxRef.current) {
        nextNoteTimeRef.current = audioCtxRef.current.currentTime;
        beatRef.current = 0;
      }

      const interval = setInterval(() => {
        schedule();
      }, 25);

      return () => clearInterval(interval);
    }
  }, [isPlaying, schedule, initAudio]);

  // Tap tempo
  const handleTapTempo = () => {
    const now = Date.now();
    setTapTimes(prev => {
      const newTimes = [...prev.filter(t => now - t < 2000), now];
      if (newTimes.length >= 3) {
        const intervals = [];
        for (let i = 1; i < newTimes.length; i++) {
          intervals.push(newTimes[i] - newTimes[i - 1]);
        }
        const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
        const newBpm = Math.round(60000 / avgInterval);
        setBpm(Math.max(MIN_BPM, Math.min(MAX_BPM, newBpm)));
      }
      return newTimes;
    });
  };

  // Adjust BPM
  const adjustBpm = (delta: number) => {
    setBpm(prev => Math.max(MIN_BPM, Math.min(MAX_BPM, prev + delta)));
  };

  return (
    <div
      className="w-full h-full flex flex-col items-center overflow-hidden select-none"
      style={{ backgroundColor: 'var(--ink-50)' }}
    >
      {/* Pendulum Canvas */}
      <div className="w-full flex-shrink-0 px-4 pt-4">
        <canvas
          ref={canvasRef}
          width={360}
          height={180}
          className="w-full rounded-lg"
          style={{
            height: 180,
            backgroundColor: 'var(--ink-50)',
            border: '1px solid var(--ink-200)',
          }}
        />
      </div>

      {/* BPM Display */}
      <div className="flex-shrink-0 text-center py-3">
        <div
          className="text-display-lg"
          style={{
            color: isPlaying ? 'var(--cinnabar)' : 'var(--ink-700)',
            fontFamily: "'ZCOOL XiaoWei', cursive, serif",
            fontSize: 56,
            letterSpacing: '0.05em',
          }}
        >
          {bpm}
        </div>
        <div className="text-caption" style={{ color: 'var(--ink-400)' }}>
          BPM / 拍每分钟 (beats/min)
        </div>
      </div>

      {/* BPM Controls */}
      <div className="flex-shrink-0 flex items-center gap-2 mb-3">
        {[-5, -1, 1, 5].map(delta => (
          <button
            key={delta}
            onClick={() => adjustBpm(delta)}
            className="px-3 py-1.5 rounded text-body-sm font-medium transition-all duration-75 hover:scale-105 active:scale-95"
            style={{
              backgroundColor: 'var(--ink-200)',
              color: 'var(--ink-700)',
              minWidth: 40,
            }}
          >
            {delta > 0 ? `+${delta}` : delta}
          </button>
        ))}
      </div>

      {/* BPM Slider */}
      <div className="flex-shrink-0 w-full px-6 mb-3">
        <input
          type="range"
          min={MIN_BPM}
          max={MAX_BPM}
          step={1}
          value={bpm}
          onChange={(e) => setBpm(Number(e.target.value))}
          className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
          style={{
            accentColor: '#b3392f',
            background: `linear-gradient(to right, #b3392f ${((bpm - MIN_BPM) / (MAX_BPM - MIN_BPM)) * 100}%, #d9d9d9 ${((bpm - MIN_BPM) / (MAX_BPM - MIN_BPM)) * 100}%)`,
          }}
        />
        <div className="flex justify-between text-caption mt-1" style={{ color: 'var(--ink-400)' }}>
          <span>{MIN_BPM}</span>
          <span>{MAX_BPM}</span>
        </div>
      </div>

      {/* Tap Tempo */}
      <button
        onClick={handleTapTempo}
        className="flex-shrink-0 px-8 py-2.5 rounded-lg text-body-md font-medium mb-3 transition-all duration-75 active:scale-95"
        style={{
          backgroundColor: 'var(--ink-200)',
          color: 'var(--ink-700)',
        }}
      >
        TAP 节拍 (Tap Tempo)
      </button>
      {tapTimes.length >= 2 && (
        <div className="text-caption mb-2" style={{ color: 'var(--ink-400)' }}>
          {tapTimes.length} 次点击 ({tapTimes.length} taps)
        </div>
      )}

      {/* Time Signature */}
      <div className="flex-shrink-0 flex items-center gap-2 mb-3">
        <span className="text-body-sm" style={{ color: 'var(--ink-600)' }}>拍号 (Time Sig):</span>
        <div className="flex gap-1">
          {TIME_SIGNATURES.map(ts => (
            <button
              key={ts.label}
              onClick={() => setTimeSig(ts)}
              className="px-3 py-1 rounded text-body-sm transition-all duration-75"
              style={{
                backgroundColor: timeSig.label === ts.label ? 'var(--ink-800)' : 'var(--ink-200)',
                color: timeSig.label === ts.label ? 'var(--ink-50)' : 'var(--ink-600)',
              }}
            >
              {ts.label}
            </button>
          ))}
        </div>
      </div>

      {/* Options */}
      <div className="flex-shrink-0 flex items-center gap-3 mb-4">
        <button
          onClick={() => setAccentFirst(!accentFirst)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded text-body-sm transition-all duration-75"
          style={{
            backgroundColor: accentFirst ? 'rgba(179,57,47,0.1)' : 'transparent',
            color: accentFirst ? 'var(--cinnabar)' : 'var(--ink-500)',
            border: accentFirst ? '1px solid var(--cinnabar)' : '1px solid var(--ink-300)',
          }}
        >
          重音首拍 (Accent)
        </button>
        <button
          onClick={() => setShowVisualOnly(!showVisualOnly)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded text-body-sm transition-all duration-75"
          style={{
            backgroundColor: showVisualOnly ? 'rgba(179,57,47,0.1)' : 'transparent',
            color: showVisualOnly ? 'var(--cinnabar)' : 'var(--ink-500)',
            border: showVisualOnly ? '1px solid var(--cinnabar)' : '1px solid var(--ink-300)',
          }}
        >
          仅视觉 (Visual Only)
        </button>
      </div>

      {/* Volume */}
      <div className="flex-shrink-0 flex items-center gap-2 px-6 pb-3 w-full">
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

      {/* Play/Stop */}
      <button
        onClick={() => { initAudio(); setIsPlaying(!isPlaying); }}
        className="flex-shrink-0 flex items-center justify-center gap-2 px-8 py-3 rounded-full text-body-md font-medium mb-4 transition-all duration-75 hover:scale-105 active:scale-95"
        style={{
          backgroundColor: isPlaying ? 'var(--cinnabar)' : 'var(--ink-700)',
          color: '#fff',
          boxShadow: isPlaying ? '0 4px 16px rgba(179,57,47,0.3)' : 'none',
        }}
      >
        {isPlaying ? <Pause size={18} /> : <Play size={18} />}
        {isPlaying ? '停止 (Stop)' : '开始 (Start)'}
      </button>
    </div>
  );
}

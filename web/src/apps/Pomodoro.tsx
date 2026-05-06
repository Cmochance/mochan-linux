import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  Play, Pause, RotateCcw, SkipForward, Timer, Flame,
  Settings2, TrendingUp, CheckCircle2, X
} from 'lucide-react';
import { appStateClient } from '../lib/app-state';

/* ─────────────── types ─────────────── */

type TimerMode = "work" | "shortBreak" | "longBreak";

interface PomodoroSession {
  date: string; // YYYY-MM-DD
  completed: number;
  totalMinutes: number;
}

interface PomodoroSettings {
  workDuration: number;
  shortBreakDuration: number;
  longBreakDuration: number;
  autoStartBreaks: boolean;
  autoStartWork: boolean;
  soundEnabled: boolean;
}

interface PomodoroState {
  settings: PomodoroSettings;
  history: PomodoroSession[];
  taskName: string;
  todayDate: string;
  todayCompleted: number;
}

/* ─────────────── constants ─────────────── */

const LS_SETTINGS = "inkos_pomo_settings";
const LS_HISTORY = "inkos_pomo_history";
const LS_TASK = "inkos_pomo_task";
const LS_TODAY_COUNT = "inkos_pomo_today";
const LS_LAST_DATE = "inkos_pomo_last_date";
const POMODORO_APP_ID = "pomodoro";

const DEFAULT_SETTINGS: PomodoroSettings = {
  workDuration: 25,
  shortBreakDuration: 5,
  longBreakDuration: 15,
  autoStartBreaks: false,
  autoStartWork: false,
  soundEnabled: true,
};

/* ─────────────── sound with Web Audio API ─────────────── */

function playBeep(frequency = 880, duration = 0.2) {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = frequency;
    osc.type = "sine";
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration);
  } catch {
    // Audio not available
  }
}

function playCompleteSound() {
  // Play a pleasant chime sequence
  playBeep(523.25, 0.15);
  setTimeout(() => playBeep(659.25, 0.15), 150);
  setTimeout(() => playBeep(783.99, 0.3), 300);
}

/* ─────────────── helper functions ─────────────── */

function getTodayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function getWeekData(): { day: string; date: string; count: number }[] {
  const result = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    const dayNames = ["日", "一", "二", "三", "四", "五", "六"];
    result.push({ day: dayNames[d.getDay()], date: dateStr, count: 0 });
  }
  return result;
}

function loadLocalPomodoroState(): PomodoroState {
  const today = getTodayKey();
  let settings = DEFAULT_SETTINGS;
  let history: PomodoroSession[] = [];
  let taskName = "";
  let todayCompleted = 0;
  try { settings = { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(LS_SETTINGS) || "{}") }; } catch { /* noop */ }
  try { history = JSON.parse(localStorage.getItem(LS_HISTORY) || "[]"); } catch { /* noop */ }
  try { taskName = localStorage.getItem(LS_TASK) || ""; } catch { /* noop */ }
  try {
    const lastDate = localStorage.getItem(LS_LAST_DATE);
    todayCompleted = lastDate === today ? parseInt(localStorage.getItem(LS_TODAY_COUNT) || "0", 10) : 0;
  } catch { /* noop */ }
  return { settings, history, taskName, todayDate: today, todayCompleted };
}

/* ─────────────── main component ─────────────── */

export default function Pomodoro() {
  const [settings, setSettings] = useState<PomodoroSettings>(() => loadLocalPomodoroState().settings);
  const [history, setHistory] = useState<PomodoroSession[]>(() => loadLocalPomodoroState().history);

  const [mode, setMode] = useState<TimerMode>("work");
  const [timeLeft, setTimeLeft] = useState(settings.workDuration * 60);
  const [isRunning, setIsRunning] = useState(false);
  const [completedPomodoros, setCompletedPomodoros] = useState(() => loadLocalPomodoroState().todayCompleted);
  const [sessionCount, setSessionCount] = useState(0); // since app opened
  const [taskName, setTaskName] = useState(() => loadLocalPomodoroState().taskName);
  const [showSettings, setShowSettings] = useState(false);
  const [tempSettings, setTempSettings] = useState(settings);
  const [showCompletionPulse, setShowCompletionPulse] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  const intervalRef = useRef<ReturnType<typeof setInterval>>(undefined);

  useEffect(() => {
    let cancelled = false;
    async function loadState() {
      try {
        const fallback = loadLocalPomodoroState();
        const state = await appStateClient.getOrDefault<PomodoroState>(POMODORO_APP_ID, fallback);
        if (cancelled) return;
        const today = getTodayKey();
        setSettings({ ...DEFAULT_SETTINGS, ...(state.settings || fallback.settings) });
        setHistory(Array.isArray(state.history) ? state.history : fallback.history);
        setTaskName(typeof state.taskName === "string" ? state.taskName : fallback.taskName);
        setCompletedPomodoros(state.todayDate === today && Number.isFinite(state.todayCompleted) ? state.todayCompleted : 0);
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
      appStateClient.put<PomodoroState>(POMODORO_APP_ID, {
        settings,
        history,
        taskName,
        todayDate: getTodayKey(),
        todayCompleted: completedPomodoros,
      })
        .then(() => setSyncError(null))
        .catch(err => setSyncError(err instanceof Error ? err.message : String(err)));
    }, 500);
    return () => clearTimeout(timer);
  }, [settings, history, taskName, completedPomodoros, loaded]);

  const duration = useMemo(() => {
    switch (mode) {
      case "work": return settings.workDuration;
      case "shortBreak": return settings.shortBreakDuration;
      case "longBreak": return settings.longBreakDuration;
    }
  }, [mode, settings]);

  // Reset timer when mode changes
  useEffect(() => {
    setTimeLeft(duration * 60);
    setIsRunning(false);
  }, [mode, duration]);

  // Timer tick
  useEffect(() => {
    if (isRunning) {
      intervalRef.current = setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) {
            // Timer complete
            setIsRunning(false);
            if (settings.soundEnabled) playCompleteSound();
            setShowCompletionPulse(true);
            setTimeout(() => setShowCompletionPulse(false), 1000);

            if (mode === "work") {
              const newCount = completedPomodoros + 1;
              setCompletedPomodoros(newCount);
              setSessionCount(s => s + 1);

              // Update history
              const today = getTodayKey();
              setHistory(prev => {
                const existing = prev.find(h => h.date === today);
                if (existing) {
                  return prev.map(h => h.date === today ? { ...h, completed: h.completed + 1, totalMinutes: h.totalMinutes + settings.workDuration } : h);
                }
                return [...prev, { date: today, completed: 1, totalMinutes: settings.workDuration }];
              });

              // Switch to break
              const isLongBreak = newCount % 4 === 0;
              if (settings.autoStartBreaks) {
                setMode(isLongBreak ? "longBreak" : "shortBreak");
                setTimeout(() => setIsRunning(true), 100);
              } else {
                setMode(isLongBreak ? "longBreak" : "shortBreak");
              }
            } else {
              // Break complete, switch to work
              if (settings.autoStartWork) {
                setMode("work");
                setTimeout(() => setIsRunning(true), 100);
              } else {
                setMode("work");
              }
            }
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [isRunning, mode, settings, completedPomodoros]);

  const progress = ((duration * 60 - timeLeft) / (duration * 60)) * 100;
  const circumference = 2 * Math.PI * 90;
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const resetTimer = useCallback(() => {
    setIsRunning(false);
    setTimeLeft(duration * 60);
  }, [duration]);

  const skipTimer = useCallback(() => {
    setIsRunning(false);
    if (mode === "work") {
      setMode("shortBreak");
    } else {
      setMode("work");
    }
  }, [mode]);

  const saveSettings = useCallback(() => {
    setSettings(tempSettings);
    setShowSettings(false);
  }, [tempSettings]);

  // Weekly data
  const weekData = useMemo(() => {
    const data = getWeekData();
    return data.map(d => {
      const h = history.find(h => h.date === d.date);
      return { ...d, count: h?.completed || 0 };
    });
  }, [history]);

  const totalFocusMinutes = useMemo(() => {
    const today = getTodayKey();
    return history.filter(h => h.date === today).reduce((sum, h) => sum + h.totalMinutes, 0);
  }, [history]);

  const ringColor = mode === "work" ? "var(--cinnabar)" : "var(--success)";
  const ringBgColor = "var(--ink-200)";

  return (
    <div className="w-full h-full flex flex-col" style={{ backgroundColor: "var(--ink-50)" }}>
      {/* Mode Tabs */}
      <div className="flex justify-center gap-2 pt-3 pb-2">
        {([
          { key: "work" as TimerMode, label: "专注 (Work)", min: settings.workDuration },
          { key: "shortBreak" as TimerMode, label: "短休 (Short)", min: settings.shortBreakDuration },
          { key: "longBreak" as TimerMode, label: "长休 (Long)", min: settings.longBreakDuration },
        ]).map(tab => (
          <button
            key={tab.key}
            onClick={() => setMode(tab.key)}
            className="px-4 py-1.5 rounded-full text-[12px] font-medium transition-all duration-150"
            style={{
              backgroundColor: mode === tab.key ? (tab.key === "work" ? "var(--cinnabar)" : "var(--success)") : "var(--ink-100)",
              color: mode === tab.key ? "white" : "var(--ink-600)",
            }}
          >
            {tab.label} · {tab.min}min
          </button>
        ))}
      </div>

      {/* Circular Timer */}
      <div className="flex-1 flex flex-col items-center justify-center px-4">
        <div className="relative" style={{ width: 220, height: 220 }}>
          {/* Pulse animation ring */}
          {showCompletionPulse && (
            <svg
              className="absolute inset-0"
              style={{ animation: "pomoPulse 1s ease-out" }}
              width={220}
              height={220}
              viewBox="0 0 220 220"
            >
              <circle
                cx={110}
                cy={110}
                r={90}
                fill="none"
                stroke={ringColor}
                strokeWidth={12}
                opacity={0.3}
              />
            </svg>
          )}

          <svg width={220} height={220} viewBox="0 0 220 220">
            {/* Background ring */}
            <circle
              cx={110}
              cy={110}
              r={90}
              fill="none"
              stroke={ringBgColor}
              strokeWidth={8}
            />
            {/* Progress ring */}
            <circle
              cx={110}
              cy={110}
              r={90}
              fill="none"
              stroke={ringColor}
              strokeWidth={8}
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              transform="rotate(-90 110 110)"
              style={{ transition: "stroke-dashoffset 1s linear" }}
            />
          </svg>

          {/* Center content */}
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <div className="text-heading-lg font-semibold" style={{ color: "var(--ink-900)", fontVariantNumeric: "tabular-nums" }}>
              {formatTime(timeLeft)}
            </div>
            <div className="text-[11px] mt-1" style={{ color: "var(--ink-500)" }}>
              {mode === "work" ? "专注时间 (Focus)" : mode === "shortBreak" ? "短休息 (Short Break)" : "长休息 (Long Break)"}
            </div>
          </div>
        </div>

        {/* Task Input */}
        <div className="w-full max-w-xs mt-4">
          <input
            value={taskName}
            onChange={e => setTaskName(e.target.value)}
            placeholder="输入当前任务... (What are you working on?)"
            className="w-full text-center px-4 py-2 rounded-lg text-body-sm outline-none"
            style={{
              backgroundColor: "var(--ink-100)",
              color: "var(--ink-800)",
              border: "1px solid var(--ink-200)",
            }}
          />
        </div>

        {/* Controls */}
        <div className="flex items-center gap-4 mt-5">
          <button
            onClick={resetTimer}
            className="w-10 h-10 rounded-full flex items-center justify-center transition-all"
            style={{ backgroundColor: "var(--ink-100)", color: "var(--ink-600)" }}
            title="重置 (Reset)"
          >
            <RotateCcw size={16} />
          </button>

          <button
            onClick={() => setIsRunning(!isRunning)}
            className="w-14 h-14 rounded-full flex items-center justify-center text-white transition-all duration-150"
            style={{
              backgroundColor: mode === "work" ? "var(--cinnabar)" : "var(--success)",
              boxShadow: `0 4px 12px ${mode === "work" ? "rgba(179,57,47,0.3)" : "rgba(74,124,89,0.3)"}`,
            }}
          >
            {isRunning ? <Pause size={22} /> : <Play size={22} className="ml-1" />}
          </button>

          <button
            onClick={skipTimer}
            className="w-10 h-10 rounded-full flex items-center justify-center transition-all"
            style={{ backgroundColor: "var(--ink-100)", color: "var(--ink-600)" }}
            title="跳过 (Skip)"
          >
            <SkipForward size={16} />
          </button>
        </div>
      </div>

      {/* Bottom Stats Panel */}
      <div
        className="mx-4 mb-3 rounded-lg p-3"
        style={{ backgroundColor: "var(--ink-100)", border: "1px solid var(--ink-200)" }}
      >
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <TrendingUp size={13} style={{ color: "var(--ink-600)" }} />
            <span className="text-body-sm font-semibold" style={{ color: "var(--ink-700)" }}>统计 (Statistics)</span>
          </div>
          <button onClick={() => { setTempSettings(settings); setShowSettings(true); }} className="p-1">
            <Settings2 size={13} style={{ color: "var(--ink-500)" }} />
          </button>
        </div>
        {syncError && (
          <div className="text-caption mb-2 px-2 py-1 rounded" style={{ color: "var(--error)", backgroundColor: "rgba(179,57,47,0.08)" }}>
            {syncError}
          </div>
        )}

        {/* Today's stats */}
        <div className="flex items-center gap-4 mb-2">
          <div className="flex items-center gap-1.5">
            <CheckCircle2 size={13} style={{ color: "var(--success)" }} />
            <span className="text-[11px]" style={{ color: "var(--ink-600)" }}>
              今日 (Today): <b style={{ color: "var(--ink-800)" }}>{completedPomodoros}</b>
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <Timer size={13} style={{ color: "var(--info)" }} />
            <span className="text-[11px]" style={{ color: "var(--ink-600)" }}>
              专注 (Focus): <b style={{ color: "var(--ink-800)" }}>{Math.floor(totalFocusMinutes / 60)}h {totalFocusMinutes % 60}m</b>
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <Flame size={13} style={{ color: "var(--warning)" }} />
            <span className="text-[11px]" style={{ color: "var(--ink-600)" }}>
              本次 (Session): <b style={{ color: "var(--ink-800)" }}>{sessionCount}</b>
            </span>
          </div>
        </div>

        {/* Weekly chart */}
        <div className="flex items-end gap-2 justify-center" style={{ height: 50 }}>
          {weekData.map(d => {
            const maxCount = Math.max(...weekData.map(w => w.count), 1);
            const height = d.count > 0 ? Math.max(8, (d.count / maxCount) * 40) : 4;
            const isToday = d.date === getTodayKey();
            return (
              <div key={d.date} className="flex flex-col items-center gap-0.5" style={{ width: 28 }}>
                <div
                  className="w-full rounded-t transition-all duration-300"
                  style={{
                    height: `${height}px`,
                    backgroundColor: d.count > 0 ? (isToday ? "var(--cinnabar)" : "var(--ink-500)") : "var(--ink-200)",
                    minHeight: 4,
                  }}
                />
                <span className="text-[9px]" style={{ color: isToday ? "var(--cinnabar)" : "var(--ink-400)" }}>
                  {d.day}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Settings Modal */}
      {showSettings && (
        <div className="absolute inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: "rgba(26,26,26,0.35)", backdropFilter: "blur(4px)" }}>
          <div className="rounded-lg p-5 w-72" style={{ backgroundColor: "var(--ink-100)", boxShadow: "0 12px 40px rgba(26,26,26,0.14)" }}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-body-md font-semibold" style={{ color: "var(--ink-900)" }}>设置 (Settings)</h3>
              <button onClick={() => setShowSettings(false)} className="p-0.5"><X size={14} style={{ color: "var(--ink-500)" }} /></button>
            </div>

            <div className="space-y-3">
              <SettingSlider
                label="专注时长 (Work)"
                value={tempSettings.workDuration}
                min={15}
                max={60}
                onChange={v => setTempSettings(s => ({ ...s, workDuration: v }))}
                unit="min"
              />
              <SettingSlider
                label="短休息 (Short Break)"
                value={tempSettings.shortBreakDuration}
                min={3}
                max={15}
                onChange={v => setTempSettings(s => ({ ...s, shortBreakDuration: v }))}
                unit="min"
              />
              <SettingSlider
                label="长休息 (Long Break)"
                value={tempSettings.longBreakDuration}
                min={10}
                max={30}
                onChange={v => setTempSettings(s => ({ ...s, longBreakDuration: v }))}
                unit="min"
              />

              <ToggleSetting
                label="自动开始休息 (Auto-start breaks)"
                value={tempSettings.autoStartBreaks}
                onChange={v => setTempSettings(s => ({ ...s, autoStartBreaks: v }))}
              />
              <ToggleSetting
                label="自动开始专注 (Auto-start work)"
                value={tempSettings.autoStartWork}
                onChange={v => setTempSettings(s => ({ ...s, autoStartWork: v }))}
              />
              <ToggleSetting
                label="提示音 (Sound)"
                value={tempSettings.soundEnabled}
                onChange={v => setTempSettings(s => ({ ...s, soundEnabled: v }))}
              />
            </div>

            <button
              onClick={saveSettings}
              className="w-full mt-4 py-2 rounded text-[13px] font-medium text-white"
              style={{ backgroundColor: "var(--ink-800)" }}
            >
              保存 (Save)
            </button>
          </div>
        </div>
      )}

      {/* CSS animation for pulse */}
      <style>{`
        @keyframes pomoPulse {
          0% { transform: scale(1); opacity: 0.6; }
          100% { transform: scale(1.15); opacity: 0; }
        }
      `}</style>
    </div>
  );
}

/* ─────────────── sub-components ─────────────── */

function SettingSlider({ label, value, min, max, onChange, unit }: {
  label: string; value: number; min: number; max: number; onChange: (v: number) => void; unit: string;
}) {
  return (
    <div>
      <div className="flex justify-between mb-1">
        <span className="text-[12px]" style={{ color: "var(--ink-700)" }}>{label}</span>
        <span className="text-[12px] font-medium" style={{ color: "var(--ink-900)" }}>{value} {unit}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full"
        style={{ accentColor: "var(--cinnabar)" }}
      />
    </div>
  );
}

function ToggleSetting({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[12px]" style={{ color: "var(--ink-700)" }}>{label}</span>
      <button
        onClick={() => onChange(!value)}
        className="w-9 h-5 rounded-full relative transition-all duration-200"
        style={{ backgroundColor: value ? "var(--cinnabar)" : "var(--ink-300)" }}
      >
        <div
          className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all duration-200"
          style={{ left: value ? 18 : 2 }}
        />
      </button>
    </div>
  );
}

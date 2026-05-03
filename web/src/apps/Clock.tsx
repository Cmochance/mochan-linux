import { useState, useEffect, useRef, useCallback } from 'react';
import { Clock as ClockIcon, Globe, Bell, Timer, Watch, Plus, X, Play, Pause, RotateCcw, Square } from 'lucide-react';

type Tab = 'clock' | 'world' | 'alarm' | 'stopwatch' | 'timer';

interface WorldClock {
  id: string;
  city: string;
  timezone: string;
  offset: number;
}

interface Alarm {
  id: string;
  hour: number;
  minute: number;
  label: string;
  enabled: boolean;
  repeat: boolean[];
}

interface StopwatchLap {
  id: number;
  time: number;
  split: number;
}

const CHINESE_NUMERALS = ['十二', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一'];

const DEFAULT_CITIES: WorldClock[] = [
  { id: 'wc1', city: 'Beijing (北京)', timezone: 'Asia/Shanghai', offset: 8 },
  { id: 'wc2', city: 'New York (纽约)', timezone: 'America/New_York', offset: -5 },
  { id: 'wc3', city: 'London (伦敦)', timezone: 'Europe/London', offset: 0 },
  { id: 'wc4', city: 'Tokyo (东京)', timezone: 'Asia/Tokyo', offset: 9 },
  { id: 'wc5', city: 'Sydney (悉尼)', timezone: 'Australia/Sydney', offset: 11 },
];

const PRESET_CITIES = [
  { city: 'Beijing (北京)', timezone: 'Asia/Shanghai', offset: 8 },
  { city: 'New York (纽约)', timezone: 'America/New_York', offset: -5 },
  { city: 'London (伦敦)', timezone: 'Europe/London', offset: 0 },
  { city: 'Tokyo (东京)', timezone: 'Asia/Tokyo', offset: 9 },
  { city: 'Sydney (悉尼)', timezone: 'Australia/Sydney', offset: 11 },
  { city: 'Paris (巴黎)', timezone: 'Europe/Paris', offset: 1 },
  { city: 'Moscow (莫斯科)', timezone: 'Europe/Moscow', offset: 3 },
  { city: 'Dubai (迪拜)', timezone: 'Asia/Dubai', offset: 4 },
  { city: 'Singapore (新加坡)', timezone: 'Asia/Singapore', offset: 8 },
  { city: 'Seoul (首尔)', timezone: 'Asia/Seoul', offset: 9 },
  { city: 'Bangkok (曼谷)', timezone: 'Asia/Bangkok', offset: 7 },
  { city: 'Cairo (开罗)', timezone: 'Africa/Cairo', offset: 2 },
  { city: 'Berlin (柏林)', timezone: 'Europe/Berlin', offset: 1 },
  { city: 'Toronto (多伦多)', timezone: 'America/Toronto', offset: -5 },
  { city: 'Mumbai (孟买)', timezone: 'Asia/Kolkata', offset: 5.5 },
];

const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function Clock() {
  const [activeTab, setActiveTab] = useState<Tab>('clock');
  const [now, setNow] = useState(new Date());
  const [worldClocks, setWorldClocks] = useState<WorldClock[]>(DEFAULT_CITIES);
  const [alarms, setAlarms] = useState<Alarm[]>([]);
  const [showAddAlarm, setShowAddAlarm] = useState(false);
  const [alarmHour, setAlarmHour] = useState(7);
  const [alarmMinute, setAlarmMinute] = useState(0);
  const [alarmLabel, setAlarmLabel] = useState('');
  const [showAddCity, setShowAddCity] = useState(false);

  // Stopwatch
  const [swRunning, setSwRunning] = useState(false);
  const [swTime, setSwTime] = useState(0);
  const [swLaps, setSwLaps] = useState<StopwatchLap[]>([]);
  const swRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const swStartRef = useRef(0);
  const swElapsedRef = useRef(0);

  // Timer
  const [timerMinutes, setTimerMinutes] = useState(5);
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerLeft, setTimerLeft] = useState(300);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  // Stopwatch logic
  useEffect(() => {
    if (swRunning) {
      swStartRef.current = Date.now() - swElapsedRef.current;
      swRef.current = setInterval(() => {
        swElapsedRef.current = Date.now() - swStartRef.current;
        setSwTime(swElapsedRef.current);
      }, 10);
    } else {
      if (swRef.current) clearInterval(swRef.current);
    }
    return () => { if (swRef.current) clearInterval(swRef.current); };
  }, [swRunning]);

  const swStart = () => setSwRunning(true);
  const swStop = () => setSwRunning(false);
  const swReset = () => {
    setSwRunning(false);
    swElapsedRef.current = 0;
    setSwTime(0);
    setSwLaps([]);
  };
  const swLap = () => {
    setSwLaps(prev => [...prev, { id: prev.length + 1, time: swTime, split: swTime - (prev[prev.length - 1]?.time || 0) }]);
  };

  // Timer logic
  useEffect(() => {
    if (timerRunning && timerLeft > 0) {
      timerRef.current = setInterval(() => {
        setTimerLeft(prev => {
          if (prev <= 1) { setTimerRunning(false); return 0; }
          return prev - 1;
        });
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [timerRunning, timerLeft]);

  const startTimer = () => { if (!timerRunning && timerLeft === 0) setTimerLeft(timerMinutes * 60 + timerSeconds); setTimerRunning(true); };
  const pauseTimer = () => setTimerRunning(false);
  const resetTimer = () => { setTimerRunning(false); setTimerLeft(timerMinutes * 60 + timerSeconds); };

  const formatSwTime = (ms: number) => {
    const m = Math.floor(ms / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    const cs = Math.floor((ms % 1000) / 10);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
  };

  const formatTimer = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  };

  const addAlarm = () => {
    setAlarms(prev => [...prev, {
      id: 'al_' + Date.now(),
      hour: alarmHour,
      minute: alarmMinute,
      label: alarmLabel || 'Alarm (闹钟)',
      enabled: true,
      repeat: [false, false, false, false, false, false, false],
    }]);
    setShowAddAlarm(false);
    setAlarmLabel('');
  };

  const toggleAlarm = (id: string) => {
    setAlarms(prev => prev.map(a => a.id === id ? { ...a, enabled: !a.enabled } : a));
  };

  const removeAlarm = (id: string) => {
    setAlarms(prev => prev.filter(a => a.id !== id));
  };

  const addCity = (city: typeof PRESET_CITIES[0]) => {
    if (!worldClocks.find(w => w.city === city.city)) {
      setWorldClocks(prev => [...prev, { ...city, id: 'wc_' + Date.now() }]);
    }
    setShowAddCity(false);
  };

  const removeCity = (id: string) => {
    setWorldClocks(prev => prev.filter(w => w.id !== id));
  };

  const AnalogClock = ({ size = 280, timezone }: { size?: number; timezone?: string }) => {
    const date = timezone ? new Date(now.toLocaleString('en-US', { timeZone: timezone })) : now;
    const hours = date.getHours() % 12;
    const minutes = date.getMinutes();
    const seconds = date.getSeconds();
    const cx = size / 2;
    const cy = size / 2;
    const r = size / 2 - 10;

    const secondAngle = (seconds * 6 - 90) * Math.PI / 180;
    const minuteAngle = (minutes * 6 + seconds * 0.1 - 90) * Math.PI / 180;
    const hourAngle = (hours * 30 + minutes * 0.5 - 90) * Math.PI / 180;

    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* Face */}
        <circle cx={cx} cy={cy} r={r} fill="var(--ink-100)" stroke="var(--ink-300)" strokeWidth="1" />
        {/* Hour markers */}
        {CHINESE_NUMERALS.map((num, i) => {
          const angle = (i * 30 - 90) * Math.PI / 180;
          const mr = r - 20;
          const isQuarter = i % 3 === 0;
          return (
            <g key={i}>
              <line
                x1={cx + Math.cos(angle) * (r - 5)}
                y1={cy + Math.sin(angle) * (r - 5)}
                x2={cx + Math.cos(angle) * (r - (isQuarter ? 15 : 8))}
                y2={cy + Math.sin(angle) * (r - (isQuarter ? 15 : 8))}
                stroke="var(--ink-600)"
                strokeWidth={isQuarter ? 2 : 1}
              />
              <text
                x={cx + Math.cos(angle) * mr}
                y={cy + Math.sin(angle) * mr}
                textAnchor="middle"
                dominantBaseline="central"
                fill="var(--ink-600)"
                fontSize={isQuarter ? 13 : 11}
                fontFamily="Noto Serif SC, serif"
              >
                {num}
              </text>
            </g>
          );
        })}
        {/* Hour hand */}
        <line
          x1={cx} y1={cy}
          x2={cx + Math.cos(hourAngle) * (r * 0.5)}
          y2={cy + Math.sin(hourAngle) * (r * 0.5)}
          stroke="var(--ink-800)" strokeWidth="4" strokeLinecap="round"
        />
        {/* Minute hand */}
        <line
          x1={cx} y1={cy}
          x2={cx + Math.cos(minuteAngle) * (r * 0.7)}
          y2={cy + Math.sin(minuteAngle) * (r * 0.7)}
          stroke="var(--ink-700)" strokeWidth="2" strokeLinecap="round"
        />
        {/* Second hand */}
        <line
          x1={cx} y1={cy}
          x2={cx + Math.cos(secondAngle) * (r * 0.8)}
          y2={cy + Math.sin(secondAngle) * (r * 0.8)}
          stroke="var(--cinnabar)" strokeWidth="1" strokeLinecap="round"
        />
        {/* Center dot */}
        <circle cx={cx} cy={cy} r="4" fill="var(--cinnabar)" />
      </svg>
    );
  };

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'clock', label: 'Clock (时钟)', icon: <ClockIcon size={14} /> },
    { id: 'world', label: 'World (世界)', icon: <Globe size={14} /> },
    { id: 'alarm', label: 'Alarm (闹钟)', icon: <Bell size={14} /> },
    { id: 'stopwatch', label: 'Stopwatch (秒表)', icon: <Watch size={14} /> },
    { id: 'timer', label: 'Timer (计时)', icon: <Timer size={14} /> },
  ];

  return (
    <div className="w-full h-full flex flex-col bg-ink-50 overflow-hidden">
      {/* Tab Bar */}
      <div className="flex items-center gap-1 px-3 py-2 border-b border-ink-200 bg-ink-100 overflow-x-auto">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1 px-3 py-1.5 rounded text-body-sm whitespace-nowrap transition-colors ${
              activeTab === tab.id ? 'bg-ink-800 text-ink-50' : 'text-ink-600 hover:bg-ink-200'
            }`}
          >
            {tab.icon}
            <span className="text-caption">{tab.label}</span>
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === 'clock' && (
          <div className="flex flex-col items-center">
            <AnalogClock size={260} />
            <div className="mt-4 text-heading-lg text-ink-800 font-heading">
              {now.toLocaleTimeString('zh-CN', { hour12: false })}
            </div>
            <div className="mt-1 text-body-md text-ink-600">
              {now.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })}
            </div>
          </div>
        )}

        {activeTab === 'world' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-body-sm text-ink-500">{worldClocks.length} cities (城市)</span>
              <button onClick={() => setShowAddCity(!showAddCity)} className="flex items-center gap-1 px-2 py-1 rounded bg-ink-800 text-ink-50 text-caption hover:bg-ink-900">
                <Plus size={12} /> Add (添加)
              </button>
            </div>
            {showAddCity && (
              <div className="bg-ink-100 rounded-md p-3 border border-ink-200">
                <div className="grid grid-cols-2 gap-2">
                  {PRESET_CITIES.filter(c => !worldClocks.find(w => w.city === c.city)).map(city => (
                    <button
                      key={city.city}
                      onClick={() => addCity(city)}
                      className="text-left p-2 rounded hover:bg-ink-200 transition-colors text-body-sm text-ink-700"
                    >
                      {city.city}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              {worldClocks.map(wc => {
                const cityDate = new Date(now.toLocaleString('en-US', { timeZone: wc.timezone }));
                const localOffset = now.getTimezoneOffset() / -60;
                const diff = wc.offset - localOffset;
                return (
                  <div key={wc.id} className="bg-ink-100 rounded-md p-3 shadow-sm border border-ink-200 relative">
                    <button onClick={() => removeCity(wc.id)} className="absolute top-2 right-2 text-ink-400 hover:text-cinnabar">
                      <X size={14} />
                    </button>
                    <div className="text-body-sm text-ink-700 font-medium">{wc.city}</div>
                    <div className="text-heading-sm text-ink-800">{cityDate.toLocaleTimeString('zh-CN', { hour12: false, hour: '2-digit', minute: '2-digit' })}</div>
                    <div className="text-caption text-ink-500">
                      {diff >= 0 ? `+${diff}` : diff}h | {cityDate.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {activeTab === 'alarm' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-body-sm text-ink-500">{alarms.length} alarms (闹钟)</span>
              <button onClick={() => setShowAddAlarm(!showAddAlarm)} className="flex items-center gap-1 px-2 py-1 rounded bg-ink-800 text-ink-50 text-caption hover:bg-ink-900">
                <Plus size={12} /> Add (添加)
              </button>
            </div>
            {showAddAlarm && (
              <div className="bg-ink-100 rounded-md p-3 border border-ink-200 space-y-2">
                <div className="flex items-center gap-2">
                  <input
                    type="number" min={0} max={23}
                    value={alarmHour}
                    onChange={e => setAlarmHour(parseInt(e.target.value) || 0)}
                    className="w-16 bg-ink-50 border border-ink-300 rounded px-2 py-1 text-body-sm text-center outline-none"
                  />
                  <span className="text-ink-600">:</span>
                  <input
                    type="number" min={0} max={59}
                    value={alarmMinute}
                    onChange={e => setAlarmMinute(parseInt(e.target.value) || 0)}
                    className="w-16 bg-ink-50 border border-ink-300 rounded px-2 py-1 text-body-sm text-center outline-none"
                  />
                </div>
                <input
                  value={alarmLabel}
                  onChange={e => setAlarmLabel(e.target.value)}
                  placeholder="Label (标签)..."
                  className="w-full bg-ink-50 border border-ink-300 rounded px-2 py-1 text-body-sm outline-none"
                />
                <button onClick={addAlarm} className="px-3 py-1 rounded bg-ink-800 text-ink-50 text-caption hover:bg-ink-900">Save (保存)</button>
              </div>
            )}
            {alarms.length === 0 && <div className="text-center text-caption text-ink-400 py-8">No alarms (无闹钟)</div>}
            <div className="space-y-2">
              {alarms.map(alarm => (
                <div key={alarm.id} className="flex items-center justify-between bg-ink-100 rounded-md p-3 border border-ink-200">
                  <div>
                    <div className="text-heading-sm text-ink-800">{String(alarm.hour).padStart(2, '0')}:{String(alarm.minute).padStart(2, '0')}</div>
                    <div className="text-caption text-ink-500">{alarm.label}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => toggleAlarm(alarm.id)}
                      className={`w-10 h-5 rounded-full transition-colors ${alarm.enabled ? 'bg-cinnabar' : 'bg-ink-300'}`}
                    >
                      <div className={`w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${alarm.enabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
                    </button>
                    <button onClick={() => removeAlarm(alarm.id)} className="text-ink-400 hover:text-cinnabar">
                      <X size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'stopwatch' && (
          <div className="flex flex-col items-center">
            <div className="text-display-lg text-ink-800 font-code my-6">{formatSwTime(swTime)}</div>
            <div className="flex gap-3 mb-6">
              {!swRunning ? (
                <button onClick={swStart} className="flex items-center gap-1 px-4 py-2 rounded bg-success text-white hover:bg-success/80 transition-colors text-body-sm">
                  <Play size={16} /> Start (开始)
                </button>
              ) : (
                <button onClick={swStop} className="flex items-center gap-1 px-4 py-2 rounded bg-warning text-white hover:bg-warning/80 transition-colors text-body-sm">
                  <Pause size={16} /> Pause (暂停)
                </button>
              )}
              <button onClick={swLap} disabled={!swRunning || swTime === 0} className="flex items-center gap-1 px-4 py-2 rounded bg-ink-200 text-ink-700 hover:bg-ink-300 disabled:opacity-30 transition-colors text-body-sm">
                <Square size={14} /> Lap (计次)
              </button>
              <button onClick={swReset} className="flex items-center gap-1 px-4 py-2 rounded bg-ink-800 text-ink-50 hover:bg-ink-900 transition-colors text-body-sm">
                <RotateCcw size={16} /> Reset (重置)
              </button>
            </div>
            {swLaps.length > 0 && (
              <div className="w-full max-w-xs space-y-1">
                {[...swLaps].reverse().map(lap => (
                  <div key={lap.id} className="flex justify-between px-3 py-1.5 bg-ink-100 rounded text-body-sm">
                    <span className="text-ink-500">Lap {lap.id}</span>
                    <span className="text-ink-700 font-code">{formatSwTime(lap.split)}</span>
                    <span className="text-ink-700 font-code">{formatSwTime(lap.time)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'timer' && (
          <div className="flex flex-col items-center">
            {!timerRunning && timerLeft === (timerMinutes * 60 + timerSeconds) ? (
              <div className="flex items-center gap-2 my-6">
                <input
                  type="number" min={0} max={999}
                  value={timerMinutes}
                  onChange={e => { setTimerMinutes(parseInt(e.target.value) || 0); setTimerLeft((parseInt(e.target.value) || 0) * 60 + timerSeconds); }}
                  className="w-20 bg-ink-100 border border-ink-300 rounded px-3 py-2 text-heading-sm text-center outline-none"
                />
                <span className="text-ink-600">min</span>
                <input
                  type="number" min={0} max={59}
                  value={timerSeconds}
                  onChange={e => { setTimerSeconds(parseInt(e.target.value) || 0); setTimerLeft(timerMinutes * 60 + (parseInt(e.target.value) || 0)); }}
                  className="w-20 bg-ink-100 border border-ink-300 rounded px-3 py-2 text-heading-sm text-center outline-none"
                />
                <span className="text-ink-600">sec</span>
              </div>
            ) : (
              <div className={`text-display-lg font-code my-6 ${timerLeft === 0 ? 'text-cinnabar' : 'text-ink-800'}`}>
                {formatTimer(timerLeft)}
              </div>
            )}
            <div className="flex gap-3 mb-4">
              {!timerRunning ? (
                <button onClick={startTimer} className="flex items-center gap-1 px-4 py-2 rounded bg-success text-white hover:bg-success/80 transition-colors text-body-sm">
                  <Play size={16} /> Start (开始)
                </button>
              ) : (
                <button onClick={pauseTimer} className="flex items-center gap-1 px-4 py-2 rounded bg-warning text-white hover:bg-warning/80 transition-colors text-body-sm">
                  <Pause size={16} /> Pause (暂停)
                </button>
              )}
              <button onClick={resetTimer} className="flex items-center gap-1 px-4 py-2 rounded bg-ink-800 text-ink-50 hover:bg-ink-900 transition-colors text-body-sm">
                <RotateCcw size={16} /> Reset (重置)
              </button>
            </div>
            <div className="flex gap-2">
              {[1, 5, 10, 25].map(m => (
                <button
                  key={m}
                  onClick={() => { setTimerMinutes(m); setTimerSeconds(0); setTimerLeft(m * 60); setTimerRunning(false); }}
                  className="px-3 py-1 rounded border border-ink-300 text-ink-600 text-caption hover:border-cinnabar transition-colors"
                >
                  {m} min
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

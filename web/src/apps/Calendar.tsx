import { useState, useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight, CalendarDays, Plus, Trash2, X, Download, Upload } from 'lucide-react';
import { appStateClient } from '../lib/app-state';

interface CalendarEvent {
  id: string;
  date: string; // YYYY-MM-DD
  title: string;
  description: string;
  type: 'work' | 'personal' | 'holiday';
  time?: string;
}

const EVENTS_KEY = 'ink-os-calendar-events';
const CALENDAR_APP_ID = 'calendar';

interface CalendarState {
  events: CalendarEvent[];
}

const LUNAR_DAYS = ['初一', '初二', '初三', '初四', '初五', '初六', '初七', '初八', '初九', '初十',
  '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九', '二十',
  '廿一', '廿二', '廿三', '廿四', '廿五', '廿六', '廿七', '廿八', '廿九', '三十'];

const WEEKDAYS = ['Mon (一)', 'Tue (二)', 'Wed (三)', 'Thu (四)', 'Fri (五)', 'Sat (六)', 'Sun (日)'];

const TYPE_COLORS = {
  work: { bg: 'bg-ink-800', dot: 'bg-ink-800', text: 'text-ink-800' },
  personal: { bg: 'bg-cinnabar', dot: 'bg-cinnabar', text: 'text-cinnabar' },
  holiday: { bg: 'bg-success', dot: 'bg-success', text: 'text-success' },
};

const TYPE_LABELS = {
  work: 'Work (工作)',
  personal: 'Personal (个人)',
  holiday: 'Holiday (节日)',
};

function loadEvents(): CalendarEvent[] {
  try {
    const saved = localStorage.getItem(EVENTS_KEY);
    if (saved) return JSON.parse(saved);
  } catch { /* ignore */ }
  return [
    { id: 'evt_1', date: new Date().toISOString().split('T')[0], title: 'Ink OS Launch', description: 'System launch day', type: 'holiday', time: '00:00' },
  ];
}

function escapeICS(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,');
}

function unescapeICS(value: string): string {
  return value
    .replace(/\\n/gi, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\');
}

function formatICSDate(date: string, time?: string): string {
  const compactDate = date.replace(/-/g, '');
  if (!time) return compactDate;
  return `${compactDate}T${time.replace(':', '')}00`;
}

function parseICSDate(value: string): { date: string; time?: string } | null {
  const compact = value.trim();
  if (compact.length < 8) return null;
  const date = `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}`;
  if (compact.includes('T') && compact.length >= 13) {
    return { date, time: `${compact.slice(9, 11)}:${compact.slice(11, 13)}` };
  }
  return { date };
}

function eventsToICS(events: CalendarEvent[]): string {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//mochan-linux//Calendar//EN'];
  events.forEach(evt => {
    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${escapeICS(evt.id)}@mochan-linux`);
    lines.push(`DTSTAMP:${stamp}`);
    lines.push(`DTSTART:${formatICSDate(evt.date, evt.time)}`);
    lines.push(`SUMMARY:${escapeICS(evt.title)}`);
    if (evt.description) lines.push(`DESCRIPTION:${escapeICS(evt.description)}`);
    lines.push(`CATEGORIES:${evt.type}`);
    lines.push('END:VEVENT');
  });
  lines.push('END:VCALENDAR');
  return `${lines.join('\r\n')}\r\n`;
}

function parseICSEvents(text: string): CalendarEvent[] {
  const unfolded = text.replace(/\r?\n[ \t]/g, '');
  const chunks = unfolded.match(/BEGIN:VEVENT[\s\S]*?END:VEVENT/g) ?? [];
  const events: CalendarEvent[] = [];
  chunks.forEach((chunk, index) => {
    const data: Record<string, string> = {};
    chunk.split(/\r?\n/).forEach(line => {
      const colon = line.indexOf(':');
      if (colon < 0) return;
      const key = line.slice(0, colon).split(';')[0].toUpperCase();
      data[key] = line.slice(colon + 1);
    });
    const parsedDate = parseICSDate(data.DTSTART || '');
    if (!parsedDate || !data.SUMMARY) return;
    const category = (data.CATEGORIES || '').toLowerCase();
    const type: CalendarEvent['type'] = category.includes('work')
      ? 'work'
      : category.includes('holiday')
        ? 'holiday'
        : 'personal';
    const event: CalendarEvent = {
      id: `evt_ics_${Date.now()}_${index}`,
      date: parsedDate.date,
      title: unescapeICS(data.SUMMARY),
      description: unescapeICS(data.DESCRIPTION || ''),
      type,
    };
    if (parsedDate.time) event.time = parsedDate.time;
    events.push(event);
  });
  return events;
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number): number {
  const day = new Date(year, month, 1).getDay();
  return day === 0 ? 6 : day - 1;
}

function getApproximateLunarDay(year: number, month: number, day: number): string {
  const baseDate = new Date(2024, 0, 11);
  const currentDate = new Date(year, month, day);
  const diffDays = Math.floor((currentDate.getTime() - baseDate.getTime()) / 86400000);
  const lunarCycle = 29.53;
  const dayInCycle = ((diffDays % Math.round(lunarCycle * 12) + Math.round(lunarCycle * 12)) % Math.round(lunarCycle * 12));
  const monthLen = 29;
  const lunarDay = (dayInCycle % monthLen + monthLen) % monthLen;
  return LUNAR_DAYS[Math.min(lunarDay, LUNAR_DAYS.length - 1)];
}

export default function Calendar() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [events, setEvents] = useState<CalendarEvent[]>(loadEvents);
  const [showDialog, setShowDialog] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [eventTitle, setEventTitle] = useState('');
  const [eventDesc, setEventDesc] = useState('');
  const [eventType, setEventType] = useState<'work' | 'personal' | 'holiday'>('personal');
  const [eventTime, setEventTime] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const importRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadState() {
      try {
        const fallback = { events: loadEvents() };
        const state = await appStateClient.getOrDefault<CalendarState>(CALENDAR_APP_ID, fallback);
        if (cancelled) return;
        setEvents(Array.isArray(state.events) ? state.events : fallback.events);
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
      appStateClient.put<CalendarState>(CALENDAR_APP_ID, { events })
        .then(() => setSyncError(null))
        .catch(err => setSyncError(err instanceof Error ? err.message : String(err)));
    }, 500);
    return () => clearTimeout(timer);
  }, [events, loaded]);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);
  const today = new Date().toISOString().split('T')[0];

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));
  const goToday = () => {
    const now = new Date();
    setCurrentDate(now);
    setSelectedDate(now.toISOString().split('T')[0]);
  };

  const getEventsForDate = (dateStr: string) => events.filter(e => e.date === dateStr);

  const openAddDialog = () => {
    setEditingEvent(null);
    setEventTitle('');
    setEventDesc('');
    setEventType('personal');
    setEventTime('');
    setShowDialog(true);
  };

  const openEditDialog = (evt: CalendarEvent) => {
    setEditingEvent(evt);
    setEventTitle(evt.title);
    setEventDesc(evt.description);
    setEventType(evt.type);
    setEventTime(evt.time || '');
    setShowDialog(true);
  };

  const saveEvent = () => {
    if (!eventTitle.trim()) return;
    if (editingEvent) {
      setEvents(prev => prev.map(e => e.id === editingEvent.id
        ? { ...e, title: eventTitle.trim(), description: eventDesc.trim(), type: eventType, time: eventTime }
        : e));
    } else {
      setEvents(prev => [...prev, {
        id: 'evt_' + Date.now(),
        date: selectedDate,
        title: eventTitle.trim(),
        description: eventDesc.trim(),
        type: eventType,
        time: eventTime,
      }]);
    }
    setShowDialog(false);
  };

  const deleteEvent = (id: string) => {
    setEvents(prev => prev.filter(e => e.id !== id));
    if (editingEvent?.id === id) setShowDialog(false);
  };

  const exportICS = () => {
    const blob = new Blob([eventsToICS(events)], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'mochan-calendar.ics';
    a.click();
    URL.revokeObjectURL(url);
  };

  const importICS = async (file: File | null) => {
    if (!file) return;
    const text = await file.text();
    const imported = parseICSEvents(text);
    if (imported.length > 0) {
      setEvents(prev => [...prev, ...imported]);
      setSelectedDate(imported[0].date);
      setCurrentDate(new Date(imported[0].date + 'T00:00:00'));
    }
    if (importRef.current) importRef.current.value = '';
  };

  const monthNames = [
    'January (一月)', 'February (二月)', 'March (三月)', 'April (四月)', 'May (五月)', 'June (六月)',
    'July (七月)', 'August (八月)', 'September (九月)', 'October (十月)', 'November (十一月)', 'December (十二月)',
  ];

  const selectedEvents = getEventsForDate(selectedDate);

  return (
    <div className="w-full h-full flex flex-col bg-ink-50 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-ink-200 bg-ink-100">
        <div className="flex items-center gap-2">
          <button onClick={prevMonth} className="p-1 rounded hover:bg-ink-200 transition-colors">
            <ChevronLeft size={18} className="text-ink-600" />
          </button>
          <span className="text-heading-sm text-ink-800 min-w-[200px] text-center">
            {monthNames[month]} {year}
          </span>
          <button onClick={nextMonth} className="p-1 rounded hover:bg-ink-200 transition-colors">
            <ChevronRight size={18} className="text-ink-600" />
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={goToday}
            className="px-3 py-1 rounded bg-ink-200 text-ink-700 text-body-sm hover:bg-ink-300 transition-colors"
          >
            Today (今天)
          </button>
          <button
            onClick={() => importRef.current?.click()}
            className="flex items-center gap-1 px-3 py-1 rounded bg-ink-200 text-ink-700 text-body-sm hover:bg-ink-300 transition-colors"
          >
            <Upload size={14} /> Import
          </button>
          <button
            onClick={exportICS}
            className="flex items-center gap-1 px-3 py-1 rounded bg-ink-200 text-ink-700 text-body-sm hover:bg-ink-300 transition-colors"
          >
            <Download size={14} /> Export
          </button>
          <input
            ref={importRef}
            type="file"
            accept=".ics,text/calendar"
            className="hidden"
            onChange={e => importICS(e.target.files?.[0] ?? null)}
          />
          <button
            onClick={openAddDialog}
            className="flex items-center gap-1 px-3 py-1 rounded bg-ink-800 text-ink-50 text-body-sm hover:bg-ink-900 transition-colors"
          >
            <Plus size={14} /> Add (添加)
          </button>
        </div>
      </div>
      {syncError && (
        <div className="px-4 py-1 text-caption" style={{ color: 'var(--error)', backgroundColor: 'rgba(179,57,47,0.08)' }}>
          {syncError}
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* Calendar Grid */}
        <div className="flex-1 flex flex-col p-4">
          {/* Weekday headers */}
          <div className="grid grid-cols-7 gap-1 mb-1">
            {WEEKDAYS.map((wd, i) => (
              <div key={i} className={`text-center text-caption py-1 font-medium ${i >= 5 ? 'text-cinnabar-light' : 'text-ink-600'}`}>
                {wd}
              </div>
            ))}
          </div>

          {/* Days */}
          <div className="grid grid-cols-7 gap-1 flex-1">
            {Array.from({ length: firstDay }).map((_, i) => (
              <div key={`empty-${i}`} className="bg-transparent" />
            ))}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              const isToday = dateStr === today;
              const isSelected = dateStr === selectedDate;
              const dayEvents = getEventsForDate(dateStr);
              const lunarDay = getApproximateLunarDay(year, month, day);

              return (
                <button
                  key={day}
                  onClick={() => setSelectedDate(dateStr)}
                  className={`relative rounded-md p-1 flex flex-col items-center justify-start transition-colors min-h-[60px] ${
                    isSelected
                      ? 'bg-[rgba(26,26,26,0.05)] ring-1 ring-cinnabar'
                      : 'hover:bg-[rgba(26,26,26,0.03)]'
                  }`}
                >
                  <div className={`w-7 h-7 flex items-center justify-center rounded-full text-body-sm font-medium ${
                    isToday ? 'bg-cinnabar text-white' : 'text-ink-700'
                  }`}>
                    {day}
                  </div>
                  <span className="text-caption mt-0.5" style={{ color: 'var(--ink-400)', fontSize: '10px' }}>
                    {lunarDay}
                  </span>
                  {dayEvents.length > 0 && (
                    <div className="flex gap-0.5 mt-0.5">
                      {dayEvents.slice(0, 3).map(e => (
                        <div key={e.id} className={`w-1.5 h-1.5 rounded-full ${TYPE_COLORS[e.type].dot}`} />
                      ))}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Sidebar */}
        <div className="w-64 bg-ink-100 border-l border-ink-200 flex flex-col overflow-hidden">
          <div className="px-4 py-3 border-b border-ink-200">
            <div className="text-heading-sm text-ink-800">{selectedDate}</div>
            <div className="text-body-sm text-ink-500">
              {new Date(selectedDate + 'T00:00:00').toLocaleDateString('zh-CN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-3">
            {selectedEvents.length === 0 ? (
              <div className="text-center text-caption text-ink-400 mt-8">
                <CalendarDays size={32} className="mx-auto mb-2 text-ink-300" />
                No events (无事件)
              </div>
            ) : (
              <div className="space-y-2">
                {selectedEvents.map(evt => (
                  <button
                    key={evt.id}
                    onClick={() => openEditDialog(evt)}
                    className="w-full text-left p-3 rounded-md bg-ink-50 border border-ink-200 hover:border-cinnabar transition-colors"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <div className={`w-2 h-2 rounded-full ${TYPE_COLORS[evt.type].dot}`} />
                      <span className="text-body-sm font-medium text-ink-800 truncate">{evt.title}</span>
                    </div>
                    {evt.time && <div className="text-caption text-ink-500">{evt.time}</div>}
                    {evt.description && <div className="text-caption text-ink-500 truncate">{evt.description}</div>}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Event Dialog */}
      {showDialog && (
        <>
          <div className="fixed inset-0 z-40" style={{ backgroundColor: 'rgba(26,26,26,0.35)' }} onClick={() => setShowDialog(false)} />
          <div className="fixed z-50 bg-ink-100 rounded-lg shadow-xl p-6 w-96" style={{ top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-heading-sm text-ink-800">
                {editingEvent ? 'Edit Event (编辑事件)' : 'Add Event (添加事件)'}
              </h3>
              <button onClick={() => setShowDialog(false)} className="text-ink-500 hover:text-ink-700">
                <X size={18} />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-body-sm text-ink-600 block mb-1">Title (标题)</label>
                <input
                  value={eventTitle}
                  onChange={e => setEventTitle(e.target.value)}
                  className="w-full bg-ink-50 border border-ink-300 rounded px-3 py-2 text-body-sm text-ink-700 outline-none focus:border-cinnabar"
                  placeholder="Event title..."
                />
              </div>
              <div>
                <label className="text-body-sm text-ink-600 block mb-1">Time (时间)</label>
                <input
                  type="time"
                  value={eventTime}
                  onChange={e => setEventTime(e.target.value)}
                  className="w-full bg-ink-50 border border-ink-300 rounded px-3 py-2 text-body-sm text-ink-700 outline-none focus:border-cinnabar"
                />
              </div>
              <div>
                <label className="text-body-sm text-ink-600 block mb-1">Type (类型)</label>
                <div className="flex gap-2">
                  {(['personal', 'work', 'holiday'] as const).map(t => (
                    <button
                      key={t}
                      onClick={() => setEventType(t)}
                      className={`flex-1 px-2 py-1 rounded text-caption border transition-colors ${
                        eventType === t ? 'border-cinnabar bg-[rgba(179,57,47,0.08)] text-cinnabar' : 'border-ink-300 text-ink-600'
                      }`}
                    >
                      {TYPE_LABELS[t]}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-body-sm text-ink-600 block mb-1">Description (描述)</label>
                <textarea
                  value={eventDesc}
                  onChange={e => setEventDesc(e.target.value)}
                  className="w-full bg-ink-50 border border-ink-300 rounded px-3 py-2 text-body-sm text-ink-700 outline-none focus:border-cinnabar resize-none"
                  rows={3}
                  placeholder="Description..."
                />
              </div>
            </div>
            <div className="flex items-center justify-between mt-4">
              {editingEvent && (
                <button
                  onClick={() => deleteEvent(editingEvent.id)}
                  className="flex items-center gap-1 px-3 py-2 rounded text-cinnabar hover:bg-[rgba(179,57,47,0.08)] transition-colors text-body-sm"
                >
                  <Trash2 size={14} /> Delete (删除)
                </button>
              )}
              <div className="flex gap-2 ml-auto">
                <button onClick={() => setShowDialog(false)} className="px-4 py-2 rounded border border-ink-300 text-ink-700 text-body-sm hover:bg-ink-200 transition-colors">
                  Cancel (取消)
                </button>
                <button onClick={saveEvent} className="px-4 py-2 rounded bg-ink-800 text-ink-50 text-body-sm hover:bg-ink-900 transition-colors">
                  Save (保存)
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

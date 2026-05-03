import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Plus, Check, Flame, TrendingUp, X, Trash2, Edit3,
  BarChart3, ChevronLeft, ChevronRight
} from 'lucide-react';

/* ─────────────── types ─────────────── */

type HabitCategory = "Health" | "Learning" | "Productivity" | "Creative" | "Social" | "Other";
type ViewMode = "weekly" | "monthly";

interface Habit {
  id: string;
  name: string;
  category: HabitCategory;
  color: string;
  icon: string;
  completions: string[]; // YYYY-MM-DD strings
  createdAt: string;
  targetDays?: number; // per week
}



/* ─────────────── constants ─────────────── */

const LS_HABITS = "inkos_habit_habits";

const CATEGORIES: HabitCategory[] = ["Health", "Learning", "Productivity", "Creative", "Social", "Other"];

const CATEGORY_COLORS: Record<HabitCategory, string> = {
  Health: "#4a7c59",
  Learning: "#5a7a8a",
  Productivity: "#7a5a3a",
  Creative: "#6a5a7a",
  Social: "#8a7a4a",
  Other: "#5a5a5a",
};

const CATEGORY_LABELS: Record<HabitCategory, string> = {
  Health: "健康 (Health)",
  Learning: "学习 (Learning)",
  Productivity: "效率 (Productivity)",
  Creative: "创作 (Creative)",
  Social: "社交 (Social)",
  Other: "其他 (Other)",
};

const HABIT_COLORS = ["#2d2d2d", "#b3392f", "#4a7c59", "#5a7a8a", "#7a5a3a", "#6a5a7a", "#8a7a4a", "#4a6a8a"];

const MOTIVATIONAL_QUOTES = [
  "千里之行，始于足下。 (A journey of a thousand miles begins with a single step.)",
  "坚持不懈，金石可镂。 (Persistence can carve through metal and stone.)",
  "每天进步一点点。 (Improve a little every day.)",
  "习惯决定命运。 (Habits determine destiny.)",
  "积少成多，聚沙成塔。 (Many grains of sand become a tower.)",
  "行百里者半九十。 (The last part of the journey is the hardest.)",
  "水滴石穿，绳锯木断。 (Constant dripping wears away the stone.)",
  "不积跬步，无以至千里。 (Without accumulating small steps, one cannot reach a thousand miles.)",
];

const DEFAULT_HABITS: Habit[] = [
  {
    id: "h-1", name: "每日阅读 (Daily Reading)", category: "Learning",
    color: "#5a7a8a", icon: "book", targetDays: 7,
    completions: generatePastDates(12), createdAt: "2024-01-01",
  },
  {
    id: "h-2", name: "冥想 (Meditation)", category: "Health",
    color: "#4a7c59", icon: "heart", targetDays: 7,
    completions: generatePastDates(8), createdAt: "2024-01-01",
  },
  {
    id: "h-3", name: "练字 (Calligraphy Practice)", category: "Creative",
    color: "#6a5a7a", icon: "pen", targetDays: 5,
    completions: generatePastDates(5), createdAt: "2024-01-01",
  },
  {
    id: "h-4", name: "喝水 8杯 (Drink 8 Cups Water)", category: "Health",
    color: "#4a7c59", icon: "droplet", targetDays: 7,
    completions: generatePastDates(15), createdAt: "2024-01-01",
  },
  {
    id: "h-5", name: "早睡 (Early Sleep)", category: "Health",
    color: "#4a6a8a", icon: "moon", targetDays: 7,
    completions: generatePastDates(7), createdAt: "2024-01-01",
  },
];

function generatePastDates(count: number): string[] {
  const dates: string[] = [];
  const today = new Date();
  for (let i = 0; i < count; i++) {
    if (Math.random() > 0.2) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      dates.push(d.toISOString().slice(0, 10));
    }
  }
  return dates;
}

/* ─────────────── helpers ─────────────── */

function getTodayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function getStreak(completions: string[]): { current: number; best: number } {
  if (completions.length === 0) return { current: 0, best: 0 };
  const sorted = [...completions].sort();
  let best = 0;
  let current = 0;
  let tempStreak = 1;

  // Best streak
  for (let i = 1; i < sorted.length; i++) {
    const prev = new Date(sorted[i - 1]);
    const curr = new Date(sorted[i]);
    const diff = (curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24);
    if (diff === 1) {
      tempStreak++;
    } else {
      best = Math.max(best, tempStreak);
      tempStreak = 1;
    }
  }
  best = Math.max(best, tempStreak);

  // Current streak
  const today = getTodayKey();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = yesterday.toISOString().slice(0, 10);

  if (completions.includes(today)) {
    current = 1;
    let checkDate = new Date();
    checkDate.setDate(checkDate.getDate() - 1);
    while (completions.includes(checkDate.toISOString().slice(0, 10))) {
      current++;
      checkDate.setDate(checkDate.getDate() - 1);
    }
  } else if (completions.includes(yesterdayKey)) {
    current = 1;
    let checkDate = new Date();
    checkDate.setDate(checkDate.getDate() - 2);
    while (completions.includes(checkDate.toISOString().slice(0, 10))) {
      current++;
      checkDate.setDate(checkDate.getDate() - 1);
    }
  }

  return { current, best };
}

function getWeekDates(): string[] {
  const dates: string[] = [];
  const today = new Date();
  const dayOfWeek = today.getDay(); // 0 = Sunday
  const monday = new Date(today);
  monday.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

function getMonthDates(year: number, month: number): Date[] {
  const dates: Date[] = [];
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  for (let d = new Date(firstDay); d <= lastDay; d.setDate(d.getDate() + 1)) {
    dates.push(new Date(d));
  }
  return dates;
}

/* ─────────────── main component ─────────────── */

export default function HabitTracker() {
  const [habits, setHabits] = useState<Habit[]>(() => {
    try {
      const saved = localStorage.getItem(LS_HABITS);
      return saved ? JSON.parse(saved) : DEFAULT_HABITS;
    } catch { return DEFAULT_HABITS; }
  });
  const [viewMode, setViewMode] = useState<ViewMode>("weekly");
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [editingHabit, setEditingHabit] = useState<Habit | null>(null);
  const [selectedMonth] = useState(new Date());

  // Form state
  const [formName, setFormName] = useState("");
  const [formCategory, setFormCategory] = useState<HabitCategory>("Health");
  const [formColor, setFormColor] = useState(HABIT_COLORS[0]);

  // Quote
  const quote = useMemo(() => {
    const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);
    return MOTIVATIONAL_QUOTES[dayOfYear % MOTIVATIONAL_QUOTES.length];
  }, []);

  // Persist
  useEffect(() => { localStorage.setItem(LS_HABITS, JSON.stringify(habits)); }, [habits]);

  const toggleHabit = useCallback((habitId: string, date: string) => {
    setHabits(prev => prev.map(h => {
      if (h.id !== habitId) return h;
      const hasDate = h.completions.includes(date);
      return {
        ...h,
        completions: hasDate ? h.completions.filter(d => d !== date) : [...h.completions, date],
      };
    }));
  }, []);

  const addHabit = useCallback(() => {
    if (!formName.trim()) return;
    const newHabit: Habit = {
      id: `h-${Date.now()}`,
      name: formName.trim(),
      category: formCategory,
      color: formColor,
      icon: "star",
      completions: [],
      createdAt: getTodayKey(),
      targetDays: 7,
    };
    setHabits(prev => [...prev, newHabit]);
    setFormName("");
    setShowAddDialog(false);
  }, [formName, formCategory, formColor]);

  const updateHabit = useCallback(() => {
    if (!editingHabit || !formName.trim()) return;
    setHabits(prev => prev.map(h =>
      h.id === editingHabit.id ? { ...h, name: formName.trim(), category: formCategory, color: formColor } : h
    ));
    setEditingHabit(null);
    setFormName("");
    setShowAddDialog(false);
  }, [editingHabit, formName, formCategory, formColor]);

  const deleteHabit = useCallback((habitId: string) => {
    setHabits(prev => prev.filter(h => h.id !== habitId));
  }, []);

  const openEditDialog = useCallback((habit: Habit) => {
    setEditingHabit(habit);
    setFormName(habit.name);
    setFormCategory(habit.category);
    setFormColor(habit.color);
    setShowAddDialog(true);
  }, []);

  const openAddDialog = useCallback(() => {
    setEditingHabit(null);
    setFormName("");
    setFormCategory("Health");
    setFormColor(HABIT_COLORS[0]);
    setShowAddDialog(true);
  }, []);

  // Stats
  const stats = useMemo(() => {
    const today = getTodayKey();
    const todayCompleted = habits.filter(h => h.completions.includes(today)).length;
    const totalHabits = habits.length;
    const rate = totalHabits > 0 ? Math.round((todayCompleted / totalHabits) * 100) : 0;

    let bestStreakAll = 0;
    let currentStreakAll = 0;
    habits.forEach(h => {
      const s = getStreak(h.completions);
      bestStreakAll = Math.max(bestStreakAll, s.best);
      currentStreakAll = Math.max(currentStreakAll, s.current);
    });

    return { todayCompleted, totalHabits, rate, bestStreakAll, currentStreakAll };
  }, [habits]);

  // Weekly view dates
  const weekDates = useMemo(() => getWeekDates(), []);
  const weekDayLabels = ["一", "二", "三", "四", "五", "六", "日"];

  // Heatmap data
  const heatmapData = useMemo(() => {
    const today = new Date();
    const days: { date: string; count: number }[] = [];
    for (let i = 90; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().slice(0, 10);
      const count = habits.filter(h => h.completions.includes(dateStr)).length;
      days.push({ date: dateStr, count });
    }
    return days;
  }, [habits]);

  // Heatmap color
  const getHeatColor = (count: number, maxCount: number): string => {
    if (count === 0) return "var(--ink-200)";
    const ratio = count / maxCount;
    if (ratio <= 0.25) return "var(--ink-400)";
    if (ratio <= 0.5) return "var(--ink-600)";
    if (ratio <= 0.75) return "var(--ink-800)";
    return "var(--cinnabar)";
  };

  const maxHeatCount = useMemo(() => Math.max(...heatmapData.map(d => d.count), 1), [heatmapData]);

  return (
    <div className="w-full h-full flex flex-col" style={{ backgroundColor: "var(--ink-50)" }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-3 pb-2">
        <div>
          <h2 className="text-body-md font-semibold" style={{ color: "var(--ink-800)" }}>习惯追踪 (Habit Tracker)</h2>
          <p className="text-[10px] mt-0.5 italic" style={{ color: "var(--ink-500)" }}>{quote}</p>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setShowHeatmap(!showHeatmap)}
            className="p-1.5 rounded-lg transition-colors"
            style={{ color: showHeatmap ? "var(--cinnabar)" : "var(--ink-500)", backgroundColor: showHeatmap ? "var(--ink-100)" : "transparent" }}
            title="热力图 (Heatmap)"
          >
            <BarChart3 size={16} />
          </button>
          <button
            onClick={openAddDialog}
            className="p-1.5 rounded-lg text-white"
            style={{ backgroundColor: "var(--ink-800)" }}
            title="添加习惯 (Add Habit)"
          >
            <Plus size={16} />
          </button>
        </div>
      </div>

      {/* Stats Bar */}
      <div className="flex items-center gap-3 px-4 pb-2">
        <div className="flex items-center gap-1 px-2 py-1 rounded" style={{ backgroundColor: "var(--ink-100)" }}>
          <Check size={12} style={{ color: "var(--success)" }} />
          <span className="text-[11px]" style={{ color: "var(--ink-700)" }}>
            {stats.todayCompleted}/{stats.totalHabits} 今日完成
          </span>
        </div>
        <div className="flex items-center gap-1 px-2 py-1 rounded" style={{ backgroundColor: "var(--ink-100)" }}>
          <TrendingUp size={12} style={{ color: "var(--info)" }} />
          <span className="text-[11px]" style={{ color: "var(--ink-700)" }}>
            {stats.rate}% 完成率
          </span>
        </div>
        <div className="flex items-center gap-1 px-2 py-1 rounded" style={{ backgroundColor: "var(--ink-100)" }}>
          <Flame size={12} style={{ color: "var(--warning)" }} />
          <span className="text-[11px]" style={{ color: "var(--ink-700)" }}>
            最高连续 {stats.bestStreakAll} 天
          </span>
        </div>
      </div>

      {/* View Toggle */}
      <div className="flex gap-1 px-4 pb-2">
        <button
          onClick={() => setViewMode("weekly")}
          className="text-[11px] px-3 py-0.5 rounded-full transition-all"
          style={{ backgroundColor: viewMode === "weekly" ? "var(--ink-800)" : "var(--ink-200)", color: viewMode === "weekly" ? "white" : "var(--ink-600)" }}
        >
          周视图 (Weekly)
        </button>
        <button
          onClick={() => setViewMode("monthly")}
          className="text-[11px] px-3 py-0.5 rounded-full transition-all"
          style={{ backgroundColor: viewMode === "monthly" ? "var(--ink-800)" : "var(--ink-200)", color: viewMode === "monthly" ? "white" : "var(--ink-600)" }}
        >
          月视图 (Monthly)
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 pb-3">
        {showHeatmap ? (
          /* Heatmap View */
          <div className="mt-2">
            <h3 className="text-body-sm font-semibold mb-2" style={{ color: "var(--ink-700)" }}>
              近90天热力图 (90-Day Heatmap)
            </h3>
            <div className="flex flex-wrap gap-[2px]">
              {heatmapData.map(d => (
                <div
                  key={d.date}
                  className="w-3 h-3 rounded-[2px]"
                  style={{ backgroundColor: getHeatColor(d.count, maxHeatCount) }}
                  title={`${d.date}: ${d.count} 习惯完成`}
                />
              ))}
            </div>
            <div className="flex items-center gap-2 mt-2">
              <span className="text-[9px]" style={{ color: "var(--ink-400)" }}>少</span>
              {[0, 1, 2, 3, 4].map(n => (
                <div
                  key={n}
                  className="w-3 h-3 rounded-[2px]"
                  style={{ backgroundColor: getHeatColor(n, 4) }}
                />
              ))}
              <span className="text-[9px]" style={{ color: "var(--ink-400)" }}>多</span>
            </div>
          </div>
        ) : viewMode === "weekly" ? (
          /* Weekly View */
          <div className="space-y-2 mt-2">
            {/* Day headers */}
            <div className="flex items-center gap-1 ml-[140px]">
              {weekDates.map((date, i) => {
                const isToday = date === getTodayKey();
                return (
                  <div key={date} className="flex-1 text-center">
                    <div className="text-[10px]" style={{ color: isToday ? "var(--cinnabar)" : "var(--ink-500)" }}>
                      {weekDayLabels[i]}
                    </div>
                    <div
                      className="text-[11px] font-medium mx-auto w-5 h-5 rounded-full flex items-center justify-center"
                      style={{
                        color: isToday ? "white" : "var(--ink-700)",
                        backgroundColor: isToday ? "var(--cinnabar)" : "transparent",
                      }}
                    >
                      {new Date(date).getDate()}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Habit rows */}
            {habits.map(habit => {
              const streak = getStreak(habit.completions);
              return (
                <div
                  key={habit.id}
                  className="flex items-center gap-2 py-2 rounded-lg px-2"
                  style={{ backgroundColor: "var(--ink-50)", borderBottom: "1px solid var(--ink-200)" }}
                >
                  {/* Habit info */}
                  <div className="w-[128px] shrink-0">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: habit.color }} />
                      <span className="text-body-sm font-medium truncate" style={{ color: "var(--ink-800)" }}>{habit.name}</span>
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5 ml-3.5">
                      <span
                        className="text-[9px] px-1 py-0.5 rounded"
                        style={{ backgroundColor: `${CATEGORY_COLORS[habit.category]}22`, color: CATEGORY_COLORS[habit.category] }}
                      >
                        {CATEGORY_LABELS[habit.category]}
                      </span>
                      {streak.current > 0 && (
                        <span className="flex items-center gap-0.5 text-[9px]" style={{ color: "var(--warning)" }}>
                          <Flame size={9} /> {streak.current}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Check-in cells */}
                  {weekDates.map(date => {
                    const isCompleted = habit.completions.includes(date);
                    const isToday = date === getTodayKey();
                    return (
                      <div key={date} className="flex-1 flex justify-center">
                        <button
                          onClick={() => toggleHabit(habit.id, date)}
                          className="w-8 h-8 rounded-md flex items-center justify-center transition-all duration-150"
                          style={{
                            backgroundColor: isCompleted ? habit.color : "var(--ink-200)",
                            border: isToday ? "2px solid var(--cinnabar)" : "2px solid transparent",
                            transform: isCompleted ? "scale(1)" : "scale(1)",
                          }}
                          title={date}
                        >
                          {isCompleted && <Check size={14} color="white" strokeWidth={3} />}
                        </button>
                      </div>
                    );
                  })}

                  {/* Actions */}
                  <div className="flex items-center gap-0.5">
                    <button onClick={() => openEditDialog(habit)} className="p-1">
                      <Edit3 size={11} style={{ color: "var(--ink-400)" }} />
                    </button>
                    <button onClick={() => deleteHabit(habit.id)} className="p-1">
                      <Trash2 size={11} style={{ color: "var(--ink-400)" }} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* Monthly View */
          <MonthlyView
            habits={habits}
            selectedMonth={selectedMonth}
          />
        )}
      </div>

      {/* Add/Edit Dialog */}
      {showAddDialog && (
        <div className="absolute inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: "rgba(26,26,26,0.35)", backdropFilter: "blur(4px)" }}>
          <div className="rounded-lg p-5 w-72" style={{ backgroundColor: "var(--ink-100)", boxShadow: "0 12px 40px rgba(26,26,26,0.14)" }}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-body-md font-semibold" style={{ color: "var(--ink-900)" }}>
                {editingHabit ? "编辑习惯 (Edit)" : "添加习惯 (Add Habit)"}
              </h3>
              <button onClick={() => { setShowAddDialog(false); setEditingHabit(null); }} className="p-0.5">
                <X size={14} style={{ color: "var(--ink-500)" }} />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-[11px] block mb-1" style={{ color: "var(--ink-600)" }}>习惯名称 (Name)</label>
                <input
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                  placeholder="例如：每日阅读"
                  className="w-full px-3 py-2 rounded text-body-sm outline-none"
                  style={{ backgroundColor: "var(--ink-50)", border: "1px solid var(--ink-300)", color: "var(--ink-900)" }}
                  onKeyDown={e => e.key === "Enter" && (editingHabit ? updateHabit() : addHabit())}
                />
              </div>

              <div>
                <label className="text-[11px] block mb-1" style={{ color: "var(--ink-600)" }}>分类 (Category)</label>
                <div className="flex flex-wrap gap-1">
                  {CATEGORIES.map(cat => (
                    <button
                      key={cat}
                      onClick={() => setFormCategory(cat)}
                      className="text-[10px] px-2 py-0.5 rounded-full transition-all"
                      style={{
                        backgroundColor: formCategory === cat ? CATEGORY_COLORS[cat] : "var(--ink-200)",
                        color: formCategory === cat ? "white" : "var(--ink-600)",
                      }}
                    >
                      {CATEGORY_LABELS[cat]}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-[11px] block mb-1" style={{ color: "var(--ink-600)" }}>颜色 (Color)</label>
                <div className="flex gap-1.5 flex-wrap">
                  {HABIT_COLORS.map(c => (
                    <button
                      key={c}
                      onClick={() => setFormColor(c)}
                      className="w-5 h-5 rounded-full border-2 transition-all"
                      style={{
                        backgroundColor: c,
                        borderColor: formColor === c ? "var(--ink-900)" : "transparent",
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>

            <button
              onClick={editingHabit ? updateHabit : addHabit}
              className="w-full mt-4 py-2 rounded text-[13px] font-medium text-white"
              style={{ backgroundColor: "var(--ink-800)" }}
            >
              {editingHabit ? "保存 (Save)" : "创建 (Create)"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─────────────── Monthly View ─────────────── */

function MonthlyView({ habits, selectedMonth }: {
  habits: Habit[];
  selectedMonth: Date;
}) {
  const monthDates = useMemo(() => {
    return getMonthDates(selectedMonth.getFullYear(), selectedMonth.getMonth());
  }, [selectedMonth]);

  const todayKey = getTodayKey();
  const dayNames = ["日", "一", "二", "三", "四", "五", "六"];

  return (
    <div className="mt-2 space-y-4">
      {/* Month Header */}
      <div className="flex items-center justify-center gap-3">
        <button className="p-1"><ChevronLeft size={14} style={{ color: "var(--ink-400)" }} /></button>
        <span className="text-body-sm font-semibold" style={{ color: "var(--ink-800)" }}>
          {selectedMonth.getFullYear()}年 {selectedMonth.getMonth() + 1}月
        </span>
        <button className="p-1"><ChevronRight size={14} style={{ color: "var(--ink-400)" }} /></button>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 gap-1 mb-1">
        {dayNames.map(d => (
          <div key={d} className="text-center text-[10px]" style={{ color: "var(--ink-500)" }}>{d}</div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-1">
        {/* Empty cells for offset */}
        {Array.from({ length: monthDates[0]?.getDay() || 0 }).map((_, i) => (
          <div key={`empty-${i}`} />
        ))}
        {monthDates.map(date => {
          const dateStr = date.toISOString().slice(0, 10);
          const isToday = dateStr === todayKey;
          const completedCount = habits.filter(h => h.completions.includes(dateStr)).length;
          const totalHabits = habits.length;

          return (
            <div key={dateStr} className="relative">
              <div
                className="aspect-square rounded-md flex flex-col items-center justify-center text-[10px] transition-all"
                style={{
                  backgroundColor: completedCount > 0 ? `rgba(179, 57, 47, ${Math.min(0.1 + (completedCount / totalHabits) * 0.8, 0.9)})` : "var(--ink-50)",
                  border: isToday ? "2px solid var(--cinnabar)" : "1px solid var(--ink-200)",
                  color: isToday ? "var(--cinnabar)" : "var(--ink-700)",
                }}
              >
                <span className="font-medium">{date.getDate()}</span>
                {completedCount > 0 && (
                  <span className="text-[8px]" style={{ color: "var(--cinnabar)" }}>{completedCount}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Habit detail for month */}
      <div className="space-y-2 mt-3">
        {habits.map(habit => {
          const monthCompletions = habit.completions.filter(d => {
            const date = new Date(d);
            return date.getFullYear() === selectedMonth.getFullYear() && date.getMonth() === selectedMonth.getMonth();
          }).length;
          const monthDays = monthDates.length;
          const streak = getStreak(habit.completions);

          return (
            <div key={habit.id} className="flex items-center justify-between py-2 px-2 rounded" style={{ backgroundColor: "var(--ink-50)", borderBottom: "1px solid var(--ink-200)" }}>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: habit.color }} />
                <span className="text-body-sm" style={{ color: "var(--ink-800)" }}>{habit.name}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[10px]" style={{ color: "var(--ink-500)" }}>
                  本月 {monthCompletions}/{monthDays} 天
                </span>
                <span className="flex items-center gap-0.5 text-[10px]" style={{ color: "var(--warning)" }}>
                  <Flame size={10} /> {streak.current}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

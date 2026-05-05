import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  BookOpen, Plus, Search, Star, Archive, Trash2, Tag, Download,
  Bold, Italic, Underline, Heading1, Heading2, List, ListOrdered,
  Quote, Code, Strikethrough, Clock, ChevronLeft, X, Check
} from 'lucide-react';
import { appStateClient } from '../lib/app-state';

/* ─────────────── types ─────────────── */

interface Note {
  id: string;
  notebookId: string;
  title: string;
  content: string;
  tags: string[];
  starred: boolean;
  archived: boolean;
  createdAt: number;
  updatedAt: number;
}

interface Notebook {
  id: string;
  name: string;
  color: string;
}

/* ─────────────── colors ─────────────── */

const NOTEBOOK_COLORS = [
  "#2d2d2d", "#b3392f", "#4a7c59", "#5a7a8a",
  "#7a5a3a", "#6a5a7a", "#8a7a4a", "#4a6a8a"
];

/* ─────────────── persistence keys ─────────────── */

const LS_NOTEBOOKS = "inkos_nb_notebooks";
const LS_NOTES = "inkos_nb_notes";
const NOTEBOOK_APP_ID = "notebook";

interface NotebookState {
  notebooks: Notebook[];
  notes: Note[];
}

const DEFAULT_NOTEBOOKS: Notebook[] = [
  { id: "nb-1", name: "学习笔记 (Study)", color: "#2d2d2d" },
  { id: "nb-2", name: "工作计划 (Work)", color: "#5a7a8a" },
  { id: "nb-3", name: "灵感收集 (Ideas)", color: "#4a7c59" },
];

const DEFAULT_NOTES: Note[] = [
  {
    id: "n-1", notebookId: "nb-1", title: "唐诗三百首 — 李白",
    content: "<h2>静夜思</h2><blockquote>床前明月光，疑是地上霜。<br>举头望明月，低头思故乡。</blockquote><p>这首诗是唐代诗人李白的代表作之一，表达了游子的思乡之情。</p><ul><li>创作年代：唐代</li><li>诗人：李白</li><li>体裁：五言绝句</li></ul>",
    tags: ["诗歌", "唐代"], starred: true, archived: false,
    createdAt: Date.now() - 86400000 * 3, updatedAt: Date.now() - 86400000 * 2,
  },
  {
    id: "n-2", notebookId: "nb-1", title: "《论语》学而篇",
    content: "<h2>学而时习之</h2><blockquote>子曰：\"学而时习之，不亦说乎？有朋自远方来，不亦乐乎？人不知而不愠，不亦君子乎？\"</blockquote><p>这是《论语》开篇第一句，强调了学习、友谊和修养的重要性。</p><ol><li>学习并时常复习</li><li>朋友从远方来访</li><li>别人不了解自己也不恼怒</li></ol>",
    tags: ["儒家", "经典"], starred: false, archived: false,
    createdAt: Date.now() - 86400000 * 5, updatedAt: Date.now() - 86400000 * 4,
  },
  {
    id: "n-3", notebookId: "nb-1", title: "React 学习笔记",
    content: "<h2>React Hooks</h2><ul><li><b>useState</b> — 管理组件状态</li><li><b>useEffect</b> — 处理副作用</li><li><b>useContext</b> — 跨组件共享数据</li><li><b>useRef</b> — 引用 DOM 或持久值</li></ul><h3>useState 示例</h3><pre><code>const [count, setCount] = useState(0);</code></pre><p>Hooks 让函数组件拥有了状态管理能力，大大简化了代码。</p>",
    tags: ["编程", "React"], starred: true, archived: false,
    createdAt: Date.now() - 86400000 * 2, updatedAt: Date.now() - 86400000,
  },
  {
    id: "n-4", notebookId: "nb-2", title: "本周工作计划",
    content: "<h2>优先级任务</h2><ol><li>完成项目文档编写</li><li>团队代码审查</li><li>客户演示准备</li></ol><h3>会议安排</h3><ul><li>周一 9:00 — 周例会</li><li>周三 14:00 — 产品评审</li><li>周五 16:00 — 回顾总结</li></ul><p>注意：<b>周三下午</b>的演示非常重要，需要提前准备 PPT。</p>",
    tags: ["待办"], starred: false, archived: false,
    createdAt: Date.now() - 86400000, updatedAt: Date.now() - 3600000,
  },
  {
    id: "n-5", notebookId: "nb-2", title: "项目管理心得",
    content: "<h2>Scrum 敏捷开发</h2><p>敏捷开发强调<b>快速迭代</b>和<i>持续反馈</i>。以下是一些关键要点：</p><ul><li>短周期冲刺（Sprint）</li><li>每日站会同步进度</li><li>回顾会议持续改进</li></ul><blockquote>好的计划是成功的一半，但过度计划则是浪费。</blockquote><p>实践中发现，<b>沟通</b>比工具更重要，团队氛围直接影响 productivity。</p>",
    tags: ["管理", "敏捷"], starred: false, archived: false,
    createdAt: Date.now() - 86400000 * 7, updatedAt: Date.now() - 86400000 * 6,
  },
  {
    id: "n-6", notebookId: "nb-3", title: "水墨画创意灵感",
    content: "<h2>山水构图想法</h2><p>尝试将传统山水元素与现代几何图形结合：</p><ul><li>远山用渐变色块表现</li><li>水流用动态线条</li><li>留白区域加入现代纹理</li></ul><h3>配色方案</h3><p>主色调：墨色（#1a1a1a）+ 宣纸底色（#f0ebe4）</p><p>点缀色：朱砂红（#b3392f）用于印章元素</p><blockquote>传统与现代的碰撞，往往能产生意想不到的效果。</blockquote>",
    tags: ["设计", "水墨"], starred: true, archived: false,
    createdAt: Date.now() - 86400000 * 4, updatedAt: Date.now() - 86400000 * 3,
  },
  {
    id: "n-7", notebookId: "nb-3", title: "App 设计草图",
    content: "<h2>记账 App 界面</h2><p>核心功能设计：</p><ol><li>首页仪表盘 — 收支总览</li><li>记一笔 — 快速记账</li><li>报表 — 按月/年统计</li><li>分类管理 — 自定义标签</li></ol><h3>交互细节</h3><p>使用<b>手势操作</b>：左滑删除，右滑编辑，长按多选。</p><pre><code>// 核心数据结构\ninterface Transaction {\n  id: string;\n  amount: number;\n  category: string;\n  date: Date;\n  note?: string;\n}</code></pre>",
    tags: ["设计", "App"], starred: false, archived: false,
    createdAt: Date.now() - 86400000 * 2, updatedAt: Date.now() - 86400000,
  },
  {
    id: "n-8", notebookId: "nb-1", title: "TypeScript 高级类型",
    content: "<h2>泛型工具类型</h2><ul><li><b>Partial&lt;T&gt;</b> — 所有属性变为可选</li><li><b>Required&lt;T&gt;</b> — 所有属性变为必选</li><li><b>Pick&lt;T, K&gt;</b> — 选取部分属性</li><li><b>Omit&lt;T, K&gt;</b> — 排除部分属性</li></ul><h3>实用示例</h3><pre><code>type UserPreview = Pick&lt;User, 'name' | 'avatar'&gt;;\n// 只选取 name 和 avatar 两个属性</code></pre><p>善用工具类型可以让代码更加灵活和可复用。</p>",
    tags: ["编程", "TypeScript"], starred: false, archived: false,
    createdAt: Date.now() - 86400000 * 1, updatedAt: Date.now() - 3600000,
  },
];

/* ─────────────── toolbar helpers ─────────────── */

function execFormat(cmd: string, val?: string) {
  document.execCommand(cmd, false, val);
}

function loadLocalNotebooks(): Notebook[] {
  try {
    const saved = localStorage.getItem(LS_NOTEBOOKS);
    return saved ? JSON.parse(saved) : DEFAULT_NOTEBOOKS;
  } catch {
    return DEFAULT_NOTEBOOKS;
  }
}

function loadLocalNotes(): Note[] {
  try {
    const saved = localStorage.getItem(LS_NOTES);
    return saved ? JSON.parse(saved) : DEFAULT_NOTES;
  } catch {
    return DEFAULT_NOTES;
  }
}

/* ─────────────── main component ─────────────── */

export default function Notebook() {
  const [notebooks, setNotebooks] = useState<Notebook[]>(loadLocalNotebooks);
  const [notes, setNotes] = useState<Note[]>(loadLocalNotes);

  const [selectedNotebookId, setSelectedNotebookId] = useState<string>(notebooks[0]?.id || "");
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTagFilter, setActiveTagFilter] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [showMobileList, setShowMobileList] = useState(true);

  // Editor state
  const editorRef = useRef<HTMLDivElement>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editTags, setEditTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [savedIndicator, setSavedIndicator] = useState(false);
  const [editorRevision, setEditorRevision] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  // New notebook dialog
  const [showNewNb, setShowNewNb] = useState(false);
  const [newNbName, setNewNbName] = useState("");
  const [newNbColor, setNewNbColor] = useState(NOTEBOOK_COLORS[0]);

  // Server-backed persistence with a one-time localStorage migration fallback.
  useEffect(() => {
    let cancelled = false;
    async function loadState() {
      try {
        const fallback = { notebooks: loadLocalNotebooks(), notes: loadLocalNotes() };
        const state = await appStateClient.getOrDefault<NotebookState>(NOTEBOOK_APP_ID, fallback);
        const nextNotebooks = Array.isArray(state.notebooks) && state.notebooks.length > 0 ? state.notebooks : fallback.notebooks;
        const nextNotes = Array.isArray(state.notes) ? state.notes : fallback.notes;
        if (cancelled) return;
        setNotebooks(nextNotebooks);
        setNotes(nextNotes);
        setSelectedNotebookId(nextNotebooks[0]?.id || "");
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
      appStateClient.put<NotebookState>(NOTEBOOK_APP_ID, { notebooks, notes })
        .then(() => setSyncError(null))
        .catch(err => setSyncError(err instanceof Error ? err.message : String(err)));
    }, 600);
    return () => clearTimeout(timer);
  }, [notebooks, notes, loaded]);

  // Auto-save
  useEffect(() => {
    const timer = setTimeout(() => {
      if (selectedNoteId && editorRef.current) {
        const content = editorRef.current.innerHTML;
        setNotes(prev => prev.map(n => n.id === selectedNoteId ? { ...n, content, title: editTitle || n.title, tags: editTags, updatedAt: Date.now() } : n));
        setSavedIndicator(true);
        setTimeout(() => setSavedIndicator(false), 1500);
      }
    }, 3000);
    return () => clearTimeout(timer);
  }, [editTitle, editTags, selectedNoteId, editorRevision]);

  const selectedNote = useMemo(() => notes.find(n => n.id === selectedNoteId) || null, [notes, selectedNoteId]);

  useEffect(() => {
    if (editorRef.current && selectedNote) {
      editorRef.current.innerHTML = selectedNote.content;
    }
  }, [selectedNoteId]);

  const filteredNotes = useMemo(() => {
    return notes
      .filter(n => n.notebookId === selectedNotebookId)
      .filter(n => showArchived ? n.archived : !n.archived)
      .filter(n => {
        if (!searchQuery) return true;
        const q = searchQuery.toLowerCase();
        return n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q) || n.tags.some(t => t.toLowerCase().includes(q));
      })
      .filter(n => activeTagFilter ? n.tags.includes(activeTagFilter) : true)
      .sort((a, b) => {
        if (a.starred !== b.starred) return a.starred ? -1 : 1;
        return b.updatedAt - a.updatedAt;
      });
  }, [notes, selectedNotebookId, searchQuery, activeTagFilter, showArchived]);

  const allTags = useMemo(() => {
    const set = new Set<string>();
    notes.forEach(n => n.tags.forEach(t => set.add(t)));
    return Array.from(set).sort();
  }, [notes]);

  const selectNote = useCallback((noteId: string) => {
    const note = notes.find(n => n.id === noteId);
    if (note) {
      setSelectedNoteId(noteId);
      setEditTitle(note.title);
      setEditTags(note.tags);
      setEditorRevision(0);
      setShowMobileList(false);
      // Focus editor after a tick
      setTimeout(() => {
        if (editorRef.current) {
          editorRef.current.innerHTML = note.content;
        }
      }, 0);
    }
  }, [notes]);

  const createNote = useCallback(() => {
    const newNote: Note = {
      id: `n-${Date.now()}`,
      notebookId: selectedNotebookId,
      title: "无标题笔记 (Untitled)",
      content: "",
      tags: [],
      starred: false,
      archived: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    setNotes(prev => [newNote, ...prev]);
    setSelectedNoteId(newNote.id);
    setEditTitle(newNote.title);
    setEditTags([]);
    setEditorRevision(0);
    setShowMobileList(false);
    setTimeout(() => {
      if (editorRef.current) {
        editorRef.current.innerHTML = "";
      }
    }, 0);
  }, [selectedNotebookId]);

  const createNotebook = useCallback(() => {
    if (!newNbName.trim()) return;
    const nb: Notebook = { id: `nb-${Date.now()}`, name: newNbName, color: newNbColor };
    setNotebooks(prev => [...prev, nb]);
    setNewNbName("");
    setShowNewNb(false);
    setSelectedNotebookId(nb.id);
  }, [newNbName, newNbColor]);

  const deleteNote = useCallback((noteId: string) => {
    setNotes(prev => prev.filter(n => n.id !== noteId));
    if (selectedNoteId === noteId) {
      setSelectedNoteId(null);
      setShowMobileList(true);
    }
  }, [selectedNoteId]);

  const toggleStarNote = useCallback((noteId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setNotes(prev => prev.map(n => n.id === noteId ? { ...n, starred: !n.starred, updatedAt: Date.now() } : n));
  }, []);

  const toggleArchiveNote = useCallback((noteId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setNotes(prev => prev.map(n => n.id === noteId ? { ...n, archived: !n.archived, updatedAt: Date.now() } : n));
  }, []);

  const deleteNotebook = useCallback((nbId: string) => {
    if (notebooks.length <= 1) return;
    setNotes(prev => prev.filter(n => n.notebookId !== nbId));
    setNotebooks(prev => prev.filter(nb => nb.id !== nbId));
    if (selectedNotebookId === nbId) {
      const remaining = notebooks.filter(nb => nb.id !== nbId);
      setSelectedNotebookId(remaining[0]?.id || "");
    }
  }, [notebooks, selectedNotebookId]);

  const exportNote = useCallback((note: Note) => {
    // Convert HTML to markdown-ish text
    const content = note.content
      .replace(/<h1>/gi, "# ").replace(/<\/h1>/gi, "\n\n")
      .replace(/<h2>/gi, "## ").replace(/<\/h2>/gi, "\n\n")
      .replace(/<h3>/gi, "### ").replace(/<\/h3>/gi, "\n\n")
      .replace(/<b>|<strong>/gi, "**").replace(/<\/b>|<\/strong>/gi, "**")
      .replace(/<i>|<em>/gi, "*").replace(/<\/i>|<\/em>/gi, "*")
      .replace(/<code>/gi, "`").replace(/<\/code>/gi, "`")
      .replace(/<pre>/gi, "```\n").replace(/<\/pre>/gi, "\n```\n")
      .replace(/<blockquote>/gi, "> ").replace(/<\/blockquote>/gi, "\n\n")
      .replace(/<ul>|<ol>/gi, "").replace(/<\/ul>|<\/ol>/gi, "\n")
      .replace(/<li>/gi, "- ").replace(/<\/li>/gi, "\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, "");

    const text = `# ${note.title}\n\nTags: ${note.tags.join(", ")}\nDate: ${new Date(note.createdAt).toLocaleString("zh-CN")}\n\n${content}`;
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${note.title.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, "_")}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const addTag = useCallback(() => {
    if (tagInput.trim() && !editTags.includes(tagInput.trim())) {
      setEditTags(prev => [...prev, tagInput.trim()]);
      setTagInput("");
    }
  }, [tagInput, editTags]);

  const removeTag = useCallback((tag: string) => {
    setEditTags(prev => prev.filter(t => t !== tag));
  }, []);

  return (
    <div className="w-full h-full flex" style={{ backgroundColor: "var(--ink-50)" }}>
      {/* LEFT SIDEBAR — Notebooks */}
      <div
        className="w-52 shrink-0 flex flex-col border-r"
        style={{ backgroundColor: "var(--ink-100)", borderColor: "var(--ink-200)" }}
      >
        <div className="flex items-center justify-between px-3 py-2.5 border-b" style={{ borderColor: "var(--ink-200)" }}>
          <span className="text-body-sm font-semibold" style={{ color: "var(--ink-800)" }}>笔记本 (Notebooks)</span>
          <button
            onClick={() => setShowNewNb(true)}
            className="p-1 rounded hover:bg-[rgba(26,26,26,0.08)] transition-colors"
          >
            <Plus size={14} style={{ color: "var(--ink-600)" }} />
          </button>
        </div>
        {syncError && (
          <div className="mx-3 mt-2 px-2 py-1 rounded text-caption" style={{ color: "var(--error)", backgroundColor: "rgba(179,57,47,0.08)" }}>
            {syncError}
          </div>
        )}

        <div className="flex-1 overflow-y-auto py-1">
          {notebooks.map(nb => {
            const noteCount = notes.filter(n => n.notebookId === nb.id && !n.archived).length;
            const isActive = nb.id === selectedNotebookId;
            return (
              <button
                key={nb.id}
                onClick={() => { setSelectedNotebookId(nb.id); setActiveTagFilter(null); setShowArchived(false); }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-left transition-all duration-75 group relative"
                style={{
                  backgroundColor: isActive ? "var(--ink-50)" : "transparent",
                  borderLeft: isActive ? "3px solid var(--cinnabar)" : "3px solid transparent",
                }}
              >
                <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: nb.color }} />
                <div className="flex-1 min-w-0">
                  <div className="text-body-sm font-medium truncate" style={{ color: isActive ? "var(--ink-900)" : "var(--ink-700)" }}>
                    {nb.name}
                  </div>
                  <div className="text-[10px]" style={{ color: "var(--ink-400)" }}>{noteCount} 笔记</div>
                </div>
                {notebooks.length > 1 && (
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteNotebook(nb.id); }}
                    className="opacity-0 group-hover:opacity-100 p-0.5 rounded transition-opacity"
                  >
                    <X size={10} style={{ color: "var(--ink-400)" }} />
                  </button>
                )}
              </button>
            );
          })}
        </div>

        {/* Tags Section */}
        {allTags.length > 0 && (
          <div className="border-t px-3 py-2" style={{ borderColor: "var(--ink-200)" }}>
            <div className="flex items-center gap-1.5 mb-1.5">
              <Tag size={11} style={{ color: "var(--ink-500)" }} />
              <span className="text-[10px] font-medium uppercase tracking-wider" style={{ color: "var(--ink-500)" }}>标签 (Tags)</span>
            </div>
            <div className="flex flex-wrap gap-1">
              {allTags.map(tag => (
                <button
                  key={tag}
                  onClick={() => setActiveTagFilter(activeTagFilter === tag ? null : tag)}
                  className="px-1.5 py-0.5 rounded-full text-[10px] transition-all"
                  style={{
                    backgroundColor: activeTagFilter === tag ? "var(--ink-800)" : "var(--ink-200)",
                    color: activeTagFilter === tag ? "white" : "var(--ink-600)",
                  }}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* New Notebook Dialog */}
        {showNewNb && (
          <div className="absolute inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: "rgba(26,26,26,0.35)", backdropFilter: "blur(4px)" }}>
            <div className="rounded-lg p-4 w-64" style={{ backgroundColor: "var(--ink-100)", boxShadow: "0 12px 40px rgba(26,26,26,0.14)" }}>
              <h3 className="text-body-md font-semibold mb-3" style={{ color: "var(--ink-900)" }}>新建笔记本 (New Notebook)</h3>
              <input
                value={newNbName}
                onChange={e => setNewNbName(e.target.value)}
                placeholder="名称 (Name)..."
                className="w-full px-3 py-2 rounded text-body-sm outline-none mb-3"
                style={{ backgroundColor: "var(--ink-50)", border: "1px solid var(--ink-300)", color: "var(--ink-900)" }}
                onKeyDown={e => e.key === "Enter" && createNotebook()}
              />
              <div className="flex gap-1.5 mb-3 flex-wrap">
                {NOTEBOOK_COLORS.map(c => (
                  <button
                    key={c}
                    onClick={() => setNewNbColor(c)}
                    className="w-5 h-5 rounded-full border-2 transition-all"
                    style={{
                      backgroundColor: c,
                      borderColor: newNbColor === c ? "var(--ink-900)" : "transparent",
                    }}
                  />
                ))}
              </div>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setShowNewNb(false)}
                  className="px-3 py-1 rounded text-[12px]"
                  style={{ color: "var(--ink-600)", border: "1px solid var(--ink-300)" }}
                >取消</button>
                <button
                  onClick={createNotebook}
                  className="px-3 py-1 rounded text-[12px] text-white"
                  style={{ backgroundColor: "var(--ink-800)" }}
                >创建</button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* CENTER PANEL — Note List */}
      {showMobileList && (
        <div
          className="w-64 shrink-0 flex flex-col border-r"
          style={{ backgroundColor: "var(--ink-50)", borderColor: "var(--ink-200)" }}
        >
          {/* Search */}
          <div className="px-3 py-2 border-b" style={{ borderColor: "var(--ink-200)" }}>
            <div
              className="flex items-center gap-2 px-3 py-1.5 rounded-full"
              style={{ backgroundColor: "var(--ink-100)", border: "1px solid var(--ink-200)" }}
            >
              <Search size={12} style={{ color: "var(--ink-400)" }} />
              <input
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="搜索笔记 (Search)..."
                className="flex-1 bg-transparent outline-none text-[12px]"
                style={{ color: "var(--ink-900)" }}
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery("")}>
                  <X size={10} style={{ color: "var(--ink-400)" }} />
                </button>
              )}
            </div>
            <div className="flex gap-2 mt-1.5">
              <button
                onClick={() => setShowArchived(false)}
                className="text-[10px] px-2 py-0.5 rounded-full"
                style={{ backgroundColor: !showArchived ? "var(--ink-800)" : "var(--ink-200)", color: !showArchived ? "white" : "var(--ink-600)" }}
              >活跃</button>
              <button
                onClick={() => setShowArchived(true)}
                className="text-[10px] px-2 py-0.5 rounded-full"
                style={{ backgroundColor: showArchived ? "var(--ink-800)" : "var(--ink-200)", color: showArchived ? "white" : "var(--ink-600)" }}
              >归档</button>
            </div>
          </div>

          {/* Note List */}
          <div className="flex-1 overflow-y-auto">
            <div className="p-2">
              <button
                onClick={createNote}
                className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg mb-2 text-[12px] font-medium transition-all"
                style={{ backgroundColor: "var(--ink-800)", color: "white" }}
              >
                <Plus size={14} /> 新建笔记 (New Note)
              </button>
            </div>
            {filteredNotes.map(note => (
              <button
                key={note.id}
                onClick={() => selectNote(note.id)}
                className="w-full text-left px-3 py-2.5 transition-all duration-75 border-b"
                style={{
                  backgroundColor: selectedNoteId === note.id ? "var(--wash-light)" : "transparent",
                  borderColor: "var(--ink-200)",
                }}
              >
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1">
                      {note.starred && <Star size={10} fill="var(--warning)" style={{ color: "var(--warning)" }} />}
                      <span className="text-body-sm font-medium truncate" style={{ color: "var(--ink-900)" }}>
                        {note.title || "无标题 (Untitled)"}
                      </span>
                    </div>
                    <div
                      className="text-[11px] mt-0.5 line-clamp-1"
                      style={{ color: "var(--ink-500)" }}
                      dangerouslySetInnerHTML={{ __html: note.content.replace(/<[^>]*>/g, "").slice(0, 60) || "无内容" }}
                    />
                    <div className="flex items-center gap-1.5 mt-1">
                      {note.tags.map(tag => (
                        <span key={tag} className="text-[9px] px-1 py-0.5 rounded" style={{ backgroundColor: "var(--ink-200)", color: "var(--ink-600)" }}>
                          {tag}
                        </span>
                      ))}
                      <span className="text-[9px] ml-auto" style={{ color: "var(--ink-400)" }}>
                        {new Date(note.updatedAt).toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" })}
                      </span>
                    </div>
                  </div>
                </div>
              </button>
            ))}
            {filteredNotes.length === 0 && (
              <div className="text-center py-8">
                <BookOpen size={28} style={{ color: "var(--ink-300)" }} className="mx-auto mb-2" />
                <p className="text-[11px]" style={{ color: "var(--ink-400)" }}>
                  {showArchived ? "无归档笔记 (No archived notes)" : "暂无笔记 (No notes yet)"}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* RIGHT PANEL — Editor */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {selectedNote ? (
          <>
            {/* Toolbar */}
            <div
              className="flex items-center gap-1 px-3 py-1.5 border-b shrink-0 flex-wrap"
              style={{ backgroundColor: "var(--ink-100)", borderColor: "var(--ink-200)" }}
            >
              {!showMobileList && (
                <button onClick={() => setShowMobileList(true)} className="p-1 mr-1">
                  <ChevronLeft size={16} style={{ color: "var(--ink-600)" }} />
                </button>
              )}
              <ToolbarButton icon={<Bold size={14} />} onClick={() => execFormat("bold")} />
              <ToolbarButton icon={<Italic size={14} />} onClick={() => execFormat("italic")} />
              <ToolbarButton icon={<Underline size={14} />} onClick={() => execFormat("underline")} />
              <ToolbarButton icon={<Strikethrough size={14} />} onClick={() => execFormat("strikeThrough")} />
              <div className="w-px h-4 mx-1" style={{ backgroundColor: "var(--ink-300)" }} />
              <ToolbarButton icon={<Heading1 size={14} />} onClick={() => execFormat("formatBlock", "H1")} />
              <ToolbarButton icon={<Heading2 size={14} />} onClick={() => execFormat("formatBlock", "H2")} />
              <div className="w-px h-4 mx-1" style={{ backgroundColor: "var(--ink-300)" }} />
              <ToolbarButton icon={<List size={14} />} onClick={() => execFormat("insertUnorderedList")} />
              <ToolbarButton icon={<ListOrdered size={14} />} onClick={() => execFormat("insertOrderedList")} />
              <ToolbarButton icon={<Quote size={14} />} onClick={() => execFormat("formatBlock", "BLOCKQUOTE")} />
              <ToolbarButton icon={<Code size={14} />} onClick={() => execFormat("formatBlock", "PRE")} />
              <div className="w-px h-4 mx-1" style={{ backgroundColor: "var(--ink-300)" }} />
              <div className="flex items-center gap-1 ml-auto">
                <button onClick={(e) => toggleStarNote(selectedNote.id, e)} className="p-1 rounded transition-colors">
                  <Star size={14} fill={selectedNote.starred ? "var(--warning)" : "none"} style={{ color: selectedNote.starred ? "var(--warning)" : "var(--ink-500)" }} />
                </button>
                <button onClick={(e) => toggleArchiveNote(selectedNote.id, e)} className="p-1 rounded transition-colors">
                  <Archive size={14} style={{ color: selectedNote.archived ? "var(--success)" : "var(--ink-500)" }} />
                </button>
                <button onClick={() => exportNote(selectedNote)} className="p-1 rounded transition-colors">
                  <Download size={14} style={{ color: "var(--ink-500)" }} />
                </button>
                <button onClick={() => deleteNote(selectedNote.id)} className="p-1 rounded transition-colors">
                  <Trash2 size={14} style={{ color: "var(--ink-500)" }} />
                </button>
              </div>
            </div>

            {/* Title & Meta */}
            <div className="px-4 pt-3 pb-1 shrink-0">
              <input
                value={editTitle}
                onChange={e => setEditTitle(e.target.value)}
                placeholder="笔记标题 (Note title)..."
                className="w-full bg-transparent outline-none text-heading-md font-semibold"
                style={{ color: "var(--ink-900)", fontFamily: "'Noto Serif SC', serif" }}
              />
              <div className="flex items-center gap-3 mt-1">
                <div className="flex items-center gap-1">
                  <Clock size={10} style={{ color: "var(--ink-400)" }} />
                  <span className="text-[10px]" style={{ color: "var(--ink-400)" }}>
                    {new Date(selectedNote.updatedAt).toLocaleString("zh-CN")}
                  </span>
                </div>
                {savedIndicator && (
                  <span className="text-[10px] flex items-center gap-1" style={{ color: "var(--success)" }}>
                    <Check size={10} /> 已保存 (Saved)
                  </span>
                )}
              </div>
            </div>

            {/* Tags Editor */}
            <div className="px-4 py-1.5 shrink-0 flex items-center gap-1.5 flex-wrap">
              <Tag size={12} style={{ color: "var(--ink-400)" }} />
              {editTags.map(tag => (
                <span key={tag} className="flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full" style={{ backgroundColor: "var(--ink-200)", color: "var(--ink-700)" }}>
                  {tag}
                  <button onClick={() => removeTag(tag)}><X size={8} /></button>
                </span>
              ))}
              <div className="flex items-center">
                <input
                  value={tagInput}
                  onChange={e => setTagInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }}
                  placeholder="+ 标签"
                  className="w-16 bg-transparent outline-none text-[10px]"
                  style={{ color: "var(--ink-700)" }}
                />
              </div>
            </div>

            {/* Rich Text Editor */}
            <div className="flex-1 overflow-y-auto px-4 py-2">
              <div
                ref={editorRef}
                contentEditable
                suppressContentEditableWarning
                className="w-full min-h-full outline-none text-body-lg leading-relaxed"
                style={{
                  color: "var(--ink-800)",
                  fontSize: "15px",
                  lineHeight: "1.8",
                  fontFamily: "'Noto Sans SC', sans-serif",
                }}
                onInput={() => setEditorRevision(v => v + 1)}
                onBlur={() => {
                  if (editorRef.current && selectedNoteId) {
                    const content = editorRef.current.innerHTML;
                    setNotes(prev => prev.map(n => n.id === selectedNoteId ? { ...n, content, title: editTitle || n.title, tags: editTags, updatedAt: Date.now() } : n));
                  }
                }}
              />
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center">
            <BookOpen size={40} style={{ color: "var(--ink-300)" }} />
            <p className="text-body-sm mt-3" style={{ color: "var(--ink-400)" }}>
              选择一个笔记开始编辑 (Select a note to edit)
            </p>
            <button
              onClick={createNote}
              className="mt-3 px-4 py-2 rounded text-[12px] text-white"
              style={{ backgroundColor: "var(--ink-800)" }}
            >
              新建笔记 (Create Note)
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─────────────── sub-components ─────────────── */

function ToolbarButton({ icon, onClick }: { icon: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="p-1 rounded hover:bg-[rgba(26,26,26,0.08)] transition-colors"
      style={{ color: "var(--ink-600)" }}
    >
      {icon}
    </button>
  );
}

import { useState, useEffect } from 'react';
import { Plus, Search, Pin, Trash2, X } from 'lucide-react';
import { appStateClient } from '../lib/app-state';

interface Note {
  id: string;
  title: string;
  content: string;
  color: string;
  pinned: boolean;
  createdAt: number;
  updatedAt: number;
}

const NOTES_KEY = 'ink-os-sticky-notes';
const NOTES_APP_ID = 'notes';

interface NotesState {
  notes: Note[];
}

const NOTE_COLORS = [
  { id: 'parchment', name: 'Parchment (宣纸)', bg: '#f0ebe4', header: '#e8e4df' },
  { id: 'lightgray', name: 'Light Gray (浅灰)', bg: '#e8e8e8', header: '#d9d9d9' },
  { id: 'beige', name: 'Beige (米色)', bg: '#f5f0e0', header: '#ebe5d0' },
  { id: 'sand', name: 'Sand (沙色)', bg: '#ede8dc', header: '#e0dac8' },
  { id: 'stone', name: 'Stone (石色)', bg: '#e0ddd8', header: '#d4d0ca' },
];

function loadNotes(): Note[] {
  try {
    const saved = localStorage.getItem(NOTES_KEY);
    return saved ? JSON.parse(saved) : [
      { id: 'note_1', title: 'Welcome (欢迎)', content: 'Welcome to Ink OS Notes! (欢迎使用墨韵便签！)\n\nClick the + button to create new notes.', color: 'parchment', pinned: true, createdAt: Date.now(), updatedAt: Date.now() },
    ];
  } catch { return []; }
}

export default function Notes() {
  const [notes, setNotes] = useState<Note[]>(loadNotes);
  const [searchQuery, setSearchQuery] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [editColor, setEditColor] = useState('parchment');
  const [loaded, setLoaded] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadState() {
      try {
        const fallback = { notes: loadNotes() };
        const state = await appStateClient.getOrDefault<NotesState>(NOTES_APP_ID, fallback);
        if (cancelled) return;
        setNotes(Array.isArray(state.notes) ? state.notes : fallback.notes);
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
      appStateClient.put<NotesState>(NOTES_APP_ID, { notes })
        .then(() => setSyncError(null))
        .catch(err => setSyncError(err instanceof Error ? err.message : String(err)));
    }, 500);
    return () => clearTimeout(timer);
  }, [notes, loaded]);

  const createNote = () => {
    const newNote: Note = {
      id: 'note_' + Date.now(),
      title: 'New Note (新便签)',
      content: '',
      color: 'parchment',
      pinned: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    setNotes(prev => [newNote, ...prev]);
    setEditingId(newNote.id);
    setEditTitle(newNote.title);
    setEditContent(newNote.content);
    setEditColor(newNote.color);
  };

  const updateNote = (id: string, updates: Partial<Note>) => {
    setNotes(prev => prev.map(n => n.id === id ? { ...n, ...updates, updatedAt: Date.now() } : n));
  };

  const deleteNote = (id: string) => {
    setNotes(prev => prev.filter(n => n.id !== id));
    if (editingId === id) setEditingId(null);
  };

  const togglePin = (id: string) => {
    const note = notes.find(n => n.id === id);
    if (note) updateNote(id, { pinned: !note.pinned });
  };

  const openEdit = (note: Note) => {
    setEditingId(note.id);
    setEditTitle(note.title);
    setEditContent(note.content);
    setEditColor(note.color);
  };

  const closeEdit = () => {
    if (editingId) {
      updateNote(editingId, { title: editTitle, content: editContent, color: editColor });
    }
    setEditingId(null);
  };

  const getColor = (colorId: string) => NOTE_COLORS.find(c => c.id === colorId) || NOTE_COLORS[0];

  const filteredNotes = notes.filter(n =>
    n.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    n.content.toLowerCase().includes(searchQuery.toLowerCase())
  ).sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    return b.updatedAt - a.updatedAt;
  });

  return (
    <div className="w-full h-full flex flex-col bg-ink-50 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-ink-200 bg-ink-100">
        <div className="flex items-center gap-2 flex-1">
          <span className="text-body-sm text-ink-700 font-medium">Sticky Notes (便签)</span>
          <div className="flex items-center gap-1 bg-ink-50 rounded-full px-3 py-1 border border-ink-200 ml-2 flex-1 max-w-xs">
            <Search size={12} className="text-ink-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search (搜索)..."
              className="bg-transparent border-none outline-none text-body-sm text-ink-700 w-full placeholder:text-ink-400"
            />
          </div>
          {syncError && (
            <span className="text-caption px-2 py-1 rounded" style={{ color: 'var(--error)', backgroundColor: 'rgba(179,57,47,0.08)' }}>
              {syncError}
            </span>
          )}
        </div>
        <button
          onClick={createNote}
          className="flex items-center gap-1 px-3 py-1.5 rounded bg-ink-800 text-ink-50 text-body-sm hover:bg-ink-900 transition-colors"
        >
          <Plus size={14} /> New (新建)
        </button>
      </div>

      {/* Notes Grid */}
      <div className="flex-1 overflow-y-auto p-4">
        {filteredNotes.length === 0 ? (
          <div className="text-center mt-20">
            <div className="text-heading-md text-ink-300 mb-2">No notes (无便签)</div>
            <div className="text-body-sm text-ink-400">Click "New" to create a note (点击"新建"创建便签)</div>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-4">
            {filteredNotes.map(note => {
              const color = getColor(note.color);
              return (
                <div
                  key={note.id}
                  className="rounded-md shadow-md overflow-hidden flex flex-col transition-transform hover:scale-[1.01] cursor-pointer"
                  style={{ backgroundColor: color.bg, minHeight: '160px' }}
                  onClick={() => openEdit(note)}
                >
                  {/* Header */}
                  <div
                    className="flex items-center justify-between px-3 py-1.5"
                    style={{ backgroundColor: color.header }}
                  >
                    <div className="flex items-center gap-1">
                      {note.pinned && <Pin size={10} className="text-cinnabar" />}
                      <span className="text-body-sm font-medium text-ink-800 truncate max-w-[120px]">{note.title}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={e => { e.stopPropagation(); togglePin(note.id); }}
                        className="p-0.5 rounded hover:bg-black/10 transition-colors"
                      >
                        <Pin size={12} className={note.pinned ? 'text-cinnabar' : 'text-ink-500'} />
                      </button>
                      <button
                        onClick={e => { e.stopPropagation(); deleteNote(note.id); }}
                        className="p-0.5 rounded hover:bg-black/10 transition-colors"
                      >
                        <Trash2 size={12} className="text-ink-500" />
                      </button>
                    </div>
                  </div>
                  {/* Content */}
                  <div className="flex-1 px-3 py-2 font-handwritten text-ink-800 whitespace-pre-wrap text-body-md overflow-hidden" style={{ fontSize: '15px', lineHeight: '1.7' }}>
                    {note.content || <span className="text-ink-400 italic">Empty (空)</span>}
                  </div>
                  {/* Color dots */}
                  <div className="flex items-center gap-1 px-3 py-1.5">
                    {NOTE_COLORS.map(c => (
                      <button
                        key={c.id}
                        onClick={e => { e.stopPropagation(); updateNote(note.id, { color: c.id }); }}
                        className="w-3 h-3 rounded-full border border-ink-300 transition-transform hover:scale-125"
                        style={{ backgroundColor: c.bg }}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Edit Dialog */}
      {editingId && (
        <>
          <div className="fixed inset-0 z-40" style={{ backgroundColor: 'rgba(26,26,26,0.35)' }} onClick={closeEdit} />
          <div
            className="fixed z-50 rounded-lg shadow-xl flex flex-col overflow-hidden"
            style={{ top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: '360px', height: '420px', backgroundColor: getColor(editColor).bg }}
          >
            {/* Dialog header */}
            <div className="flex items-center justify-between px-4 py-2 border-b" style={{ backgroundColor: getColor(editColor).header, borderColor: 'rgba(158,158,158,0.3)' }}>
              <input
                value={editTitle}
                onChange={e => setEditTitle(e.target.value)}
                className="bg-transparent border-none outline-none text-body-sm font-medium text-ink-800 flex-1"
                style={{ backgroundColor: 'transparent' }}
              />
              <button onClick={closeEdit} className="text-ink-500 hover:text-ink-700 ml-2">
                <X size={16} />
              </button>
            </div>
            {/* Content area */}
            <textarea
              value={editContent}
              onChange={e => setEditContent(e.target.value)}
              className="flex-1 p-4 bg-transparent border-none outline-none resize-none font-handwritten text-ink-800"
              style={{ fontSize: '16px', lineHeight: '1.8', backgroundColor: 'transparent' }}
              placeholder="Write something... (写点什么...)"
              autoFocus
            />
            {/* Color selector */}
            <div className="flex items-center gap-2 px-4 py-2 border-t" style={{ borderColor: 'rgba(158,158,158,0.3)' }}>
              <span className="text-caption text-ink-500">Color (颜色):</span>
              {NOTE_COLORS.map(c => (
                <button
                  key={c.id}
                  onClick={() => setEditColor(c.id)}
                  className={`w-5 h-5 rounded-full border-2 transition-transform hover:scale-110 ${editColor === c.id ? 'border-cinnabar scale-110' : 'border-ink-300'}`}
                  style={{ backgroundColor: c.bg }}
                />
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  FileText, FolderOpen, Save, Search, RotateCcw, RotateCw,
  Type, Hash, Settings, X, ChevronDown, ChevronUp, Replace
} from 'lucide-react';
import { fsClient } from '@/lib/fs';
import { usePayloadPath } from '@/lib/openFile';

const STORAGE_KEY = 'texteditor-content';

const CODE_KEYWORDS = [
  'const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while',
  'import', 'export', 'from', 'class', 'interface', 'type', 'extends', 'implements',
  'async', 'await', 'try', 'catch', 'throw', 'new', 'this', 'true', 'false', 'null',
  'undefined', 'void', 'number', 'string', 'boolean', 'any', 'public', 'private',
  'static', 'get', 'set', 'default', 'switch', 'case', 'break', 'continue', 'yield',
  'def', 'print', 'len', 'range', 'in', 'not', 'and', 'or', 'is', 'None', 'self',
  'import', 'as', 'except', 'finally', 'with', 'lambda', 'pass', 'del', 'global',
  'nonlocal', 'assert', 'raise', 'from', 'elif', 'yield', 'True', 'False'
];

export default function TextEditor({ windowId }: { windowId?: string }) {
  const remotePath = usePayloadPath(windowId);
  const [remoteSavePath, setRemoteSavePath] = useState<string | null>(null);
  const [remoteStatus, setRemoteStatus] = useState<'idle' | 'loading' | 'saving' | 'error'>('idle');
  const [remoteError, setRemoteError] = useState<string | null>(null);

  const [text, setText] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY) || ''; } catch { return ''; }
  });

  // If launched from FileManager, override local-storage state and load
  // the file from /api/fs.
  useEffect(() => {
    if (!remotePath) return;
    let alive = true;
    setRemoteStatus('loading');
    setRemoteSavePath(remotePath);
    void fsClient
      .read(remotePath)
      .then((r) => {
        if (!alive) return;
        setText(r.content);
        setRemoteStatus('idle');
        setRemoteError(null);
      })
      .catch((err) => {
        if (!alive) return;
        setRemoteStatus('error');
        setRemoteError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      alive = false;
    };
  }, [remotePath]);

  const saveRemote = useCallback(async () => {
    if (!remoteSavePath) return;
    setRemoteStatus('saving');
    try {
      await fsClient.write(remoteSavePath, text);
      setRemoteStatus('idle');
      setRemoteError(null);
    } catch (err) {
      setRemoteStatus('error');
      setRemoteError(err instanceof Error ? err.message : String(err));
    }
  }, [remoteSavePath, text]);
  const [showFind, setShowFind] = useState(false);
  const [showReplace, setShowReplace] = useState(false);
  const [findText, setFindText] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [findIndex, setFindIndex] = useState(0);
  const [fontSize, setFontSize] = useState(14);
  const [tabSize, setTabSize] = useState(2);
  const [syntaxHighlight, setSyntaxHighlight] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [cursorPos, setCursorPos] = useState({ line: 1, col: 1 });
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lineNumbersRef = useRef<HTMLDivElement>(null);
  const findInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, text); } catch { /* noop */ }
  }, [text]);

  const lines = useMemo(() => text.split('\n'), [text]);

  const wordCount = useMemo(() => {
    const trimmed = text.trim();
    if (!trimmed) return { words: 0, chars: 0, charsNoSpace: 0, lines: lines.length };
    const words = trimmed.split(/\s+/).length;
    return { words, chars: text.length, charsNoSpace: text.replace(/\s/g, '').length, lines: lines.length };
  }, [text, lines]);

  const findMatches = useMemo(() => {
    if (!findText) return [] as number[];
    const matches: number[] = [];
    let idx = 0;
    while ((idx = text.toLowerCase().indexOf(findText.toLowerCase(), idx)) !== -1) {
      matches.push(idx);
      idx += findText.length;
    }
    return matches;
  }, [text, findText]);

  useEffect(() => {
    setFindIndex(0);
  }, [findText, findMatches.length]);

  const handleScroll = useCallback(() => {
    if (textareaRef.current && lineNumbersRef.current) {
      lineNumbersRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    const ta = textareaRef.current;
    if (!ta) return;

    if (e.key === 'Tab') {
      e.preventDefault();
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const spaces = ' '.repeat(tabSize);
      setText(prev => prev.substring(0, start) + spaces + prev.substring(end));
      requestAnimationFrame(() => {
        ta.selectionStart = ta.selectionEnd = start + spaces.length;
      });
      return;
    }

    if (e.ctrlKey || e.metaKey) {
      if (e.key === 'f') { e.preventDefault(); setShowFind(v => !v); setShowReplace(false); }
      else if (e.key === 'h') { e.preventDefault(); setShowFind(true); setShowReplace(true); }
      else if (e.key === 's') { e.preventDefault(); handleSave(); }
      else if (e.key === 'o') { e.preventDefault(); fileInputRef.current?.click(); }
      else if (e.key === 'n') { e.preventDefault(); handleNew(); }
    }
  }, [tabSize]);

  const updateCursorPos = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    const val = ta.value.substring(0, ta.selectionStart);
    const line = val.split('\n').length;
    const col = val.length - val.lastIndexOf('\n');
    setCursorPos({ line, col });
  }, []);

  const handleNew = () => {
    if (text && !window.confirm('确定要新建文件吗？未保存的内容将丢失。(New file - unsaved changes will be lost)')) return;
    setText('');
  };

  const handleOpen = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => { setText(String(ev.target?.result || '')); };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleSave = () => {
    if (remoteSavePath) {
      void saveRemote();
      return;
    }
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'untitled.txt';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleFindNext = () => {
    if (!findMatches.length) return;
    const next = (findIndex + 1) % findMatches.length;
    setFindIndex(next);
    scrollToMatch(findMatches[next]);
  };

  const handleFindPrev = () => {
    if (!findMatches.length) return;
    const prev = (findIndex - 1 + findMatches.length) % findMatches.length;
    setFindIndex(prev);
    scrollToMatch(findMatches[prev]);
  };

  const scrollToMatch = (pos: number) => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.focus();
    ta.selectionStart = ta.selectionEnd = pos;
    const val = ta.value.substring(0, pos);
    const line = val.split('\n').length;
    const lineHeight = 20;
    ta.scrollTop = Math.max(0, (line - 5) * lineHeight);
  };

  const handleReplace = () => {
    if (!findMatches.length) return;
    const pos = findMatches[findIndex];
    const newText = text.substring(0, pos) + replaceText + text.substring(pos + findText.length);
    setText(newText);
  };

  const handleReplaceAll = () => {
    if (!findText) return;
    setText(text.split(new RegExp(escapeRegex(findText), 'gi')).join(replaceText));
  };

  const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  const renderHighlighted = () => {
    if (!syntaxHighlight) return null;
    const content = text;
    const parts: React.ReactNode[] = [];
    let i = 0;

    const pushString = (str: string, color: string) => {
      if (str) parts.push(<span key={`${i++}-${str.length}`} style={{ color }}>{str}</span>);
    };

    const rest = content;
    const tokenRegex = new RegExp(
      `\\b(${CODE_KEYWORDS.join('|')})\\b|` +
      `("(?:[^"\\\\]|\\\\.)*"|'(?:[^'\\\\]|\\\\.)*')|` +
      `(//[^\\n]*|/\\*[\\s\\S]*?\\*/|#[^\\n]*)|` +
      `(\\b\\d+(?:\\.\\d+)?\\b)|` +
      `([(){}[\]])`,
      'g'
    );

    let lastIndex = 0;
    let m;
    const regex = new RegExp(tokenRegex.source, 'g');
    // eslint-disable-next-line no-cond-assign
    while ((m = regex.exec(rest)) !== null) {
      if (m.index > lastIndex) {
        parts.push(<span key={i++}>{rest.substring(lastIndex, m.index)}</span>);
      }
      if (m[1]) pushString(m[1], '#b3392f');
      else if (m[2]) pushString(m[2], '#4a7c59');
      else if (m[3]) pushString(m[3], '#9e9e9e');
      else if (m[4]) pushString(m[4], '#5a7a8a');
      else if (m[5]) pushString(m[5], '#7a7a7a');
      lastIndex = regex.lastIndex;
    }
    if (lastIndex < rest.length) parts.push(<span key={i++}>{rest.substring(lastIndex)}</span>);
    return parts.length > 0 ? parts : content;
  };

  return (
    <div className="w-full h-full flex flex-col" style={{ backgroundColor: 'var(--ink-50)' }}>
      {/* Toolbar */}
      <div className="flex items-center gap-1 px-2 py-1 border-b" style={{ borderColor: 'var(--ink-200)', backgroundColor: 'var(--ink-100)' }}>
        <button onClick={handleNew} className="flex items-center gap-1 px-2 py-1 rounded text-body-sm hover:opacity-80" style={{ color: 'var(--ink-700)' }} title="新建 (New)">
          <FileText size={14} /> 新建
        </button>
        <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-1 px-2 py-1 rounded text-body-sm hover:opacity-80" style={{ color: 'var(--ink-700)' }} title="打开 (Open)">
          <FolderOpen size={14} /> 打开
        </button>
        <input ref={fileInputRef} type="file" accept=".txt,.js,.ts,.tsx,.jsx,.json,.md,.css,.html" className="hidden" onChange={handleOpen} />
        <button onClick={handleSave} className="flex items-center gap-1 px-2 py-1 rounded text-body-sm hover:opacity-80" style={{ color: 'var(--ink-700)' }} title="保存 (Save)">
          <Save size={14} /> 保存
        </button>
        <div className="w-px h-5 mx-1" style={{ backgroundColor: 'var(--ink-300)' }} />
        <button onClick={() => { setShowFind(v => !v); setShowReplace(false); }} className="flex items-center gap-1 px-2 py-1 rounded text-body-sm hover:opacity-80" style={{ color: showFind ? 'var(--cinnabar)' : 'var(--ink-700)' }} title="查找 (Find)">
          <Search size={14} />
        </button>
        <button onClick={() => { setShowFind(true); setShowReplace(true); }} className="flex items-center gap-1 px-2 py-1 rounded text-body-sm hover:opacity-80" style={{ color: 'var(--ink-700)' }} title="替换 (Replace)">
          <Replace size={14} />
        </button>
        <div className="w-px h-5 mx-1" style={{ backgroundColor: 'var(--ink-300)' }} />
        <button onClick={() => setSyntaxHighlight(v => !v)} className="flex items-center gap-1 px-2 py-1 rounded text-body-sm hover:opacity-80" style={{ color: syntaxHighlight ? 'var(--cinnabar)' : 'var(--ink-700)' }} title="语法高亮 (Syntax Highlight)">
          <Hash size={14} />
        </button>
        <button onClick={() => setShowSettings(v => !v)} className="flex items-center gap-1 px-2 py-1 rounded text-body-sm hover:opacity-80" style={{ color: 'var(--ink-700)' }} title="设置 (Settings)">
          <Settings size={14} />
        </button>
        <div className="flex-1" />
        <span className="text-caption" style={{ color: 'var(--ink-500)' }}>
          {wordCount.words} 词 / {wordCount.chars} 字
        </span>
      </div>

      {/* Find/Replace Bar */}
      {showFind && (
        <div className="flex items-center gap-2 px-2 py-1 border-b" style={{ borderColor: 'var(--ink-200)', backgroundColor: 'var(--ink-100)' }}>
          <input
            ref={findInputRef}
            value={findText}
            onChange={e => setFindText(e.target.value)}
            placeholder="查找 (Find)..."
            className="px-2 py-1 rounded text-body-sm outline-none"
            style={{ border: '1px solid var(--ink-300)', backgroundColor: 'var(--ink-50)', color: 'var(--ink-900)', width: 160 }}
          />
          {showReplace && (
            <input
              value={replaceText}
              onChange={e => setReplaceText(e.target.value)}
              placeholder="替换为 (Replace)..."
              className="px-2 py-1 rounded text-body-sm outline-none"
              style={{ border: '1px solid var(--ink-300)', backgroundColor: 'var(--ink-50)', color: 'var(--ink-900)', width: 160 }}
            />
          )}
          <button onClick={handleFindPrev} className="p-1 rounded hover:opacity-80" style={{ color: 'var(--ink-600)' }}><ChevronUp size={14} /></button>
          <button onClick={handleFindNext} className="p-1 rounded hover:opacity-80" style={{ color: 'var(--ink-600)' }}><ChevronDown size={14} /></button>
          {showReplace && (
            <>
              <button onClick={handleReplace} className="px-2 py-1 rounded text-body-sm" style={{ backgroundColor: 'var(--ink-200)', color: 'var(--ink-700)' }}>替换</button>
              <button onClick={handleReplaceAll} className="px-2 py-1 rounded text-body-sm" style={{ backgroundColor: 'var(--ink-200)', color: 'var(--ink-700)' }}>全部</button>
            </>
          )}
          <span className="text-caption" style={{ color: 'var(--ink-500)' }}>
            {findMatches.length > 0 ? `${findIndex + 1}/${findMatches.length}` : ''}
          </span>
          <button onClick={() => { setShowFind(false); setShowReplace(false); }} className="p-1 ml-auto" style={{ color: 'var(--ink-500)' }}><X size={14} /></button>
        </div>
      )}

      {/* Settings */}
      {showSettings && (
        <div className="flex items-center gap-4 px-2 py-1 border-b" style={{ borderColor: 'var(--ink-200)', backgroundColor: 'var(--ink-100)' }}>
          <div className="flex items-center gap-2">
            <Type size={12} style={{ color: 'var(--ink-500)' }} />
            <span className="text-body-sm" style={{ color: 'var(--ink-600)' }}>字体大小 (Font Size):</span>
            <input type="range" min={10} max={24} value={fontSize} onChange={e => setFontSize(Number(e.target.value))} className="w-20" />
            <span className="text-caption" style={{ color: 'var(--ink-500)' }}>{fontSize}px</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-body-sm" style={{ color: 'var(--ink-600)' }}>缩进 (Tab):</span>
            <input type="range" min={1} max={8} value={tabSize} onChange={e => setTabSize(Number(e.target.value))} className="w-16" />
            <span className="text-caption" style={{ color: 'var(--ink-500)' }}>{tabSize}</span>
          </div>
          <button onClick={() => setShowSettings(false)} className="ml-auto p-1" style={{ color: 'var(--ink-500)' }}><X size={14} /></button>
        </div>
      )}

      {/* Editor Area */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Line Numbers */}
        <div
          ref={lineNumbersRef}
          className="flex-shrink-0 overflow-hidden text-right select-none py-2"
          style={{ width: 48, backgroundColor: 'var(--ink-100)', color: 'var(--ink-400)', fontSize, lineHeight: `${fontSize + 6}px`, fontFamily: '"Maple Mono CN", "Courier New", monospace' }}
        >
          {lines.map((_, i) => (
            <div key={i} className="pr-2" style={{ height: fontSize + 6 }}>{i + 1}</div>
          ))}
        </div>

        {/* Textarea */}
        <div className="flex-1 relative">
          <textarea
            ref={textareaRef}
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            onClick={updateCursorPos}
            onKeyUp={updateCursorPos}
            onScroll={handleScroll}
            spellCheck={false}
            className="w-full h-full resize-none outline-none border-none p-2"
            style={{
              fontSize,
              lineHeight: `${fontSize + 6}px`,
              fontFamily: '"Maple Mono CN", "Courier New", monospace',
              color: 'var(--ink-900)',
              backgroundColor: 'var(--ink-50)',
              tabSize,
            }}
          />
        </div>
      </div>

      {/* Status Bar */}
      <div className="flex items-center justify-between px-2 py-0.5 border-t" style={{ borderColor: 'var(--ink-200)', backgroundColor: 'var(--ink-100)', color: 'var(--ink-500)' }}>
        <div className="flex items-center gap-3">
          <span className="text-caption">行 {cursorPos.line}, 列 {cursorPos.col}</span>
          <span className="text-caption">|</span>
          <span className="text-caption">{wordCount.lines} 行</span>
          <span className="text-caption">|</span>
          <span className="text-caption">{wordCount.chars} 字符</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-caption">UTF-8</span>
          <span className="text-caption">|</span>
          <span className="text-caption">{syntaxHighlight ? '高亮开' : '高亮关'}</span>
        </div>
      </div>
    </div>
  );
}

import { useState, useCallback, useMemo, useRef } from 'react';
import {
  Braces, ChevronRight, ChevronDown, Plus, Trash2, Edit2, Check, X,
  FileDown, FileUp, Search, Copy, RotateCcw, AlignLeft, Minimize2
} from 'lucide-react';
import { cn } from '@/lib/utils';

const SAMPLE_JSON = {
  "system": {
    "name": "Ink OS",
    "version": "1.3.0",
    "theme": "ink-wash",
    "language": "zh-CN",
    "debug": false,
    "features": {
      "windowManager": true,
      "virtualDesktop": false,
      "gestures": true
    }
  },
  "desktop": {
    "wallpaper": "wallpaper-default.jpg",
    "iconSize": 48,
    "gridSpacing": 16,
    "showGrid": true,
    "dockPosition": "bottom"
  },
  "appearance": {
    "fontSize": 14,
    "fontFamily": "Noto Sans SC",
    "inkTone": "medium",
    "animations": true,
    "transparency": 0.85
  },
  "user": {
    "username": "moshui",
    "displayName": "墨白",
    "avatar": "/avatars/default.png",
    "roles": ["admin", "developer"],
    "preferences": {
      "autoSave": true,
      "lineNumbers": true,
      "sidebarVisible": true
    }
  },
  "apps": [
    { "id": "terminal", "name": "终端", "category": "system", "installed": true },
    { "id": "calendar", "name": "日历", "category": "system", "installed": true },
    { "id": "calculator", "name": "计算器", "category": "system", "installed": true },
    { "id": "gogame", "name": "围棋", "category": "games", "installed": false },
    { "id": "markdowneditor", "name": "Markdown编辑器", "category": "office", "installed": true }
  ],
  "network": {
    "proxy": null,
    "timeout": 30000,
    "retries": 3
  }
};

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

interface TreeNodeProps {
  name: string;
  value: JsonValue;
  depth: number;
  path: string;
  searchQuery: string;
  onSelect: (path: string, value: JsonValue) => void;
  selectedPath: string | null;
  onUpdate: (path: string, newValue: JsonValue) => void;
  onDelete: (path: string) => void;
}

function TreeNode({ name, value, depth, path, searchQuery, onSelect, selectedPath, onUpdate, onDelete }: TreeNodeProps) {
  const [expanded, setExpanded] = useState(depth < 2);
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const isSelected = selectedPath === path;
  const isObject = value !== null && typeof value === 'object';
  const isArray = Array.isArray(value);
  const children = isObject ? Object.entries(value as Record<string, JsonValue>) : [];

  const matchesSearch = useMemo(() => {
    if (!searchQuery) return false;
    const q = searchQuery.toLowerCase();
    return name.toLowerCase().includes(q) || JSON.stringify(value).toLowerCase().includes(q);
  }, [name, value, searchQuery]);

  const startEdit = useCallback(() => {
    setEditValue(JSON.stringify(value));
    setEditing(true);
  }, [value]);

  const saveEdit = useCallback(() => {
    try {
      const parsed = JSON.parse(editValue);
      onUpdate(path, parsed);
      setEditing(false);
    } catch {
      // ignore parse error
    }
  }, [editValue, path, onUpdate]);

  const getTypeColor = (v: JsonValue): string => {
    if (v === null) return 'var(--ink-400)';
    if (typeof v === 'boolean') return 'var(--info)';
    if (typeof v === 'number') return 'var(--cinnabar)';
    if (typeof v === 'string') return 'var(--ink-700)';
    return 'var(--ink-800)';
  };

  const formatValue = (v: JsonValue): string => {
    if (v === null) return 'null';
    if (typeof v === 'string') return `"${v}"`;
    return String(v);
  };

  return (
    <div>
      <div
        className={cn(
          'flex items-center gap-1 py-0.5 pr-2 cursor-pointer transition-colors',
          isSelected && 'border-l-2'
        )}
        style={{
          paddingLeft: `${depth * 16 + 4}px`,
          backgroundColor: isSelected ? 'var(--wash-light)' : matchesSearch ? 'rgba(179,57,47,0.08)' : 'transparent',
          borderLeftColor: isSelected ? 'var(--cinnabar)' : 'transparent',
        }}
        onClick={() => onSelect(path, value)}
      >
        {isObject ? (
          <button
            onClick={e => { e.stopPropagation(); setExpanded(!expanded); }}
            className="p-0.5 rounded hover:bg-[rgba(26,26,26,0.05)]"
          >
            {expanded ? <ChevronDown size={10} style={{ color: 'var(--ink-500)' }} /> : <ChevronRight size={10} style={{ color: 'var(--ink-500)' }} />}
          </button>
        ) : (
          <span className="w-[18px]" />
        )}
        <span className="text-caption font-mono" style={{ color: 'var(--ink-800)', fontFamily: 'var(--font-code)', fontSize: '12px' }}>
          {name}:
        </span>
        {!isObject && !editing && (
          <span className="text-caption font-mono ml-1" style={{ color: getTypeColor(value), fontFamily: 'var(--font-code)', fontSize: '12px' }}>
            {formatValue(value)}
          </span>
        )}
        {editing && (
          <div className="flex items-center gap-1 flex-1">
            <input
              value={editValue}
              onChange={e => setEditValue(e.target.value)}
              className="flex-1 text-caption px-1 py-0.5 rounded border font-mono"
              style={{ borderColor: 'var(--ink-300)', backgroundColor: 'var(--ink-50)', fontSize: '12px', fontFamily: 'var(--font-code)' }}
              onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditing(false); }}
              autoFocus
            />
            <button onClick={saveEdit} className="p-0.5"><Check size={10} style={{ color: 'var(--success)' }} /></button>
            <button onClick={() => setEditing(false)} className="p-0.5"><X size={10} style={{ color: 'var(--cinnabar)' }} /></button>
          </div>
        )}
        {isObject && (
          <span className="text-caption ml-1" style={{ color: 'var(--ink-500)', fontSize: '11px' }}>
            {isArray ? `[${children.length}]` : `{${children.length}}`}
          </span>
        )}
        {isSelected && !editing && (
          <div className="flex items-center gap-0.5 ml-auto">
            {!isObject && <button onClick={e => { e.stopPropagation(); startEdit(); }} className="p-0.5 rounded hover:bg-[rgba(26,26,26,0.05)]"><Edit2 size={10} style={{ color: 'var(--ink-500)' }} /></button>}
            <button onClick={e => { e.stopPropagation(); onDelete(path); }} className="p-0.5 rounded hover:bg-[rgba(26,26,26,0.05)]"><Trash2 size={10} style={{ color: 'var(--cinnabar)' }} /></button>
          </div>
        )}
      </div>
      {isObject && expanded && children.map(([childName, childValue]) => (
        <TreeNode
          key={`${path}.${childName}`}
          name={childName}
          value={childValue}
          depth={depth + 1}
          path={`${path}.${childName}`}
          searchQuery={searchQuery}
          onSelect={onSelect}
          selectedPath={selectedPath}
          onUpdate={onUpdate}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}

export default function JSONEditor() {
  const [jsonData, setJsonData] = useState<JsonValue>(SAMPLE_JSON);
  const [rawMode, setRawMode] = useState(false);
  const [rawText, setRawText] = useState(() => JSON.stringify(SAMPLE_JSON, null, 2));
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [selectedValue, setSelectedValue] = useState<JsonValue | null>(null);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const nodeCount = useMemo(() => {
    const count = (v: JsonValue): number => {
      if (v === null || typeof v !== 'object') return 1;
      return 1 + Object.values(v).reduce((sum: number, c: unknown) => sum + count(c as JsonValue), 0);
    };
    return count(jsonData);
  }, [jsonData]);

  const validate = useCallback(() => {
    try {
      if (rawMode) {
        JSON.parse(rawText);
      }
      setError('');
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    }
  }, [rawMode, rawText]);

  const formatJson = useCallback(() => {
    try {
      const parsed = JSON.parse(rawText);
      const formatted = JSON.stringify(parsed, null, 2);
      setRawText(formatted);
      setJsonData(parsed);
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }, [rawText]);

  const compactJson = useCallback(() => {
    try {
      const parsed = JSON.parse(rawText);
      const compact = JSON.stringify(parsed);
      setRawText(compact);
      setJsonData(parsed);
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }, [rawText]);

  const handleRawChange = useCallback((text: string) => {
    setRawText(text);
    try {
      const parsed = JSON.parse(text);
      setJsonData(parsed);
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  const handleSelect = useCallback((path: string, value: JsonValue) => {
    setSelectedPath(path);
    setSelectedValue(value);
  }, []);

  const handleUpdate = useCallback((path: string, newValue: JsonValue) => {
    setJsonData((prev: JsonValue) => {
      const newData = JSON.parse(JSON.stringify(prev));
      const parts = path.split('.').slice(1);
      let target: any = newData;
      for (let i = 0; i < parts.length - 1; i++) {
        target = target[parts[i]];
      }
      target[parts[parts.length - 1]] = newValue;
      setRawText(JSON.stringify(newData, null, 2));
      return newData;
    });
  }, []);

  const handleDelete = useCallback((path: string) => {
    setJsonData((prev: JsonValue) => {
      const newData = JSON.parse(JSON.stringify(prev));
      const parts = path.split('.').slice(1);
      let target: any = newData;
      for (let i = 0; i < parts.length - 1; i++) {
        target = target[parts[i]];
      }
      delete target[parts[parts.length - 1]];
      setRawText(JSON.stringify(newData, null, 2));
      return newData;
    });
    setSelectedPath(null);
  }, []);

  const handleImport = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = event => {
      const text = event.target?.result as string;
      try {
        const parsed = JSON.parse(text);
        setJsonData(parsed);
        setRawText(JSON.stringify(parsed, null, 2));
        setError('');
      } catch (e) {
        setError('无效的JSON文件 (Invalid JSON file)');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }, []);

  const handleExport = useCallback(() => {
    const blob = new Blob([JSON.stringify(jsonData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'data.json';
    a.click();
    URL.revokeObjectURL(url);
  }, [jsonData]);

  const syntaxHighlight = (text: string) => {
    if (!text) return '';
    return text
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/("(?:[^"\\]|\\.)*")/g, '<span style="color:var(--ink-700)">$1</span>')
      .replace(/\b(true|false)\b/g, '<span style="color:var(--info)">$1</span>')
      .replace(/\b(null)\b/g, '<span style="color:var(--ink-400);font-style:italic">$1</span>')
      .replace(/\b(\d+\.?\d*)\b/g, '<span style="color:var(--cinnabar)">$1</span>');
  };

  return (
    <div className="w-full h-full flex flex-col" style={{ backgroundColor: 'var(--ink-50)' }}>
      {/* Toolbar */}
      <div className="flex items-center gap-1 px-3 py-1.5 border-b flex-wrap" style={{ borderColor: 'var(--ink-200)', backgroundColor: 'var(--ink-100)' }}>
        <button onClick={formatJson} className="flex items-center gap-1 px-2 py-1 rounded text-caption transition-colors hover:bg-[rgba(26,26,26,0.05)]" style={{ color: 'var(--ink-700)' }}>
          <AlignLeft size={12} /> 格式化 (Format)
        </button>
        <button onClick={compactJson} className="flex items-center gap-1 px-2 py-1 rounded text-caption transition-colors hover:bg-[rgba(26,26,26,0.05)]" style={{ color: 'var(--ink-700)' }}>
          <Minimize2 size={12} /> 压缩 (Compact)
        </button>
        <button onClick={validate} className="flex items-center gap-1 px-2 py-1 rounded text-caption transition-colors hover:bg-[rgba(26,26,26,0.05)]" style={{ color: 'var(--ink-700)' }}>
          <Check size={12} /> 验证 (Validate)
        </button>
        <div className="w-px h-4 mx-1" style={{ backgroundColor: 'var(--ink-300)' }} />
        <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-1 px-2 py-1 rounded text-caption transition-colors hover:bg-[rgba(26,26,26,0.05)]" style={{ color: 'var(--ink-700)' }}>
          <FileUp size={12} /> 导入 (Import)
        </button>
        <input ref={fileInputRef} type="file" accept=".json" className="hidden" onChange={handleImport} />
        <button onClick={handleExport} className="flex items-center gap-1 px-2 py-1 rounded text-caption transition-colors hover:bg-[rgba(26,26,26,0.05)]" style={{ color: 'var(--ink-700)' }}>
          <FileDown size={12} /> 导出 (Export)
        </button>
        <div className="w-px h-4 mx-1" style={{ backgroundColor: 'var(--ink-300)' }} />
        <div className="flex items-center gap-1 flex-1 min-w-[120px]">
          <Search size={12} style={{ color: 'var(--ink-500)' }} />
          <input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="搜索 (Search)..."
            className="flex-1 text-caption px-1 py-0.5 rounded border"
            style={{ borderColor: 'var(--ink-300)', backgroundColor: 'var(--ink-50)', fontSize: '12px' }}
          />
        </div>
        <button
          onClick={() => setRawMode(!rawMode)}
          className={cn(
            'px-2 py-1 rounded text-caption transition-colors',
            rawMode ? 'text-white' : ''
          )}
          style={{ backgroundColor: rawMode ? 'var(--ink-800)' : 'transparent', color: rawMode ? 'var(--ink-50)' : 'var(--ink-600)' }}
        >
          {rawMode ? '树视图 (Tree)' : '文本 (Raw)'}
        </button>
      </div>

      {/* Status bar */}
      <div className="flex items-center gap-3 px-3 py-0.5 border-b" style={{ borderColor: 'var(--ink-200)', backgroundColor: 'var(--ink-100)' }}>
        <span className="text-caption" style={{ color: 'var(--ink-500)' }}>
          节点 (Nodes): <span style={{ color: 'var(--ink-700)' }}>{nodeCount}</span>
        </span>
        <span className="text-caption" style={{ color: 'var(--ink-500)' }}>
          大小 (Size): <span style={{ color: 'var(--ink-700)' }}>{(JSON.stringify(jsonData).length / 1024).toFixed(2)} KB</span>
        </span>
        {error ? (
          <span className="text-caption" style={{ color: 'var(--cinnabar)' }}>错误 (Error): {error}</span>
        ) : (
          <span className="text-caption flex items-center gap-1" style={{ color: 'var(--success)' }}><Check size={10} /> 有效 (Valid)</span>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden flex">
        {!rawMode ? (
          <div className="flex-1 overflow-auto" style={{ backgroundColor: 'var(--ink-50)' }}>
            {Object.entries(jsonData as Record<string, JsonValue>).map(([key, value]) => (
              <TreeNode
                key={key}
                name={key}
                value={value}
                depth={0}
                path={`root.${key}`}
                searchQuery={searchQuery}
                onSelect={handleSelect}
                selectedPath={selectedPath}
                onUpdate={handleUpdate}
                onDelete={handleDelete}
              />
            ))}
          </div>
        ) : (
          <div className="flex-1 flex flex-col overflow-hidden">
            <textarea
              value={rawText}
              onChange={e => handleRawChange(e.target.value)}
              className="flex-1 w-full h-full p-3 font-mono text-body-sm resize-none outline-none border-0"
              style={{
                backgroundColor: 'var(--ink-50)',
                color: 'var(--ink-800)',
                fontFamily: 'var(--font-code), monospace',
                fontSize: '13px',
                lineHeight: 1.6,
              }}
              spellCheck={false}
            />
          </div>
        )}

        {/* Detail panel */}
        {selectedPath && selectedValue !== null && !rawMode && (
          <div className="w-56 border-l p-3 overflow-auto" style={{ borderColor: 'var(--ink-200)', backgroundColor: 'var(--ink-100)' }}>
            <div className="text-heading-sm mb-2" style={{ color: 'var(--ink-800)' }}>节点详情 (Node)</div>
            <div className="text-caption mb-1" style={{ color: 'var(--ink-500)' }}>路径 (Path)</div>
            <div className="text-body-sm font-mono mb-3 break-all" style={{ color: 'var(--ink-700)', fontSize: '11px', fontFamily: 'var(--font-code)' }}>{selectedPath}</div>
            <div className="text-caption mb-1" style={{ color: 'var(--ink-500)' }}>类型 (Type)</div>
            <div className="text-body-sm mb-3" style={{ color: 'var(--ink-800)' }}>
              {selectedValue === null ? 'null' : Array.isArray(selectedValue) ? 'array' : typeof selectedValue}
            </div>
            <div className="text-caption mb-1" style={{ color: 'var(--ink-500)' }}>值 (Value)</div>
            <pre className="text-body-sm p-2 rounded overflow-auto" style={{ backgroundColor: 'var(--ink-50)', color: 'var(--ink-700)', fontFamily: 'var(--font-code)', fontSize: '11px' }}>
              {JSON.stringify(selectedValue, null, 2)}
            </pre>
            <button
              onClick={() => { navigator.clipboard.writeText(JSON.stringify(selectedValue, null, 2)); }}
              className="flex items-center gap-1 mt-2 px-3 py-1 rounded text-caption"
              style={{ backgroundColor: 'var(--ink-800)', color: 'var(--ink-50)' }}
            >
              <Copy size={10} /> 复制值 (Copy)
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

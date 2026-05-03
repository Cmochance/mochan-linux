import { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import {
  Bold, Italic, Heading, Link, Image, Code, Quote, List,
  ListOrdered, FileText, FolderOpen, Save, Download, Hash
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { fsClient } from '@/lib/fs';
import { usePayloadPath } from '@/lib/openFile';

const STORAGE_KEY = 'markdowneditor-content';

const DEFAULT_CONTENT = `# 欢迎使用 Markdown 编辑器 (Welcome to Markdown Editor)

这是 **Ink OS** 内置的 Markdown 编辑器，支持实时预览和多种格式。

## 功能特性 (Features)

- **实时预览**: 左侧编辑，右侧即时渲染
- **工具栏**: 快捷插入各种格式
- **导出 HTML**: 将内容导出为 HTML 文件
- **GitHub Flavored Markdown**: 支持表格、代码块等

## 格式示例 (Formatting Examples)

### 文本样式
*斜体 (Italic)* 和 **粗体 (Bold)** 和 ~~删除线~~

### 代码
行内代码: \`console.log("hello")\`

代码块:
\`\`\`javascript
function greet(name) {
  return \`Hello, \${name}!\`;
}
console.log(greet("World"));
\`\`\`

### 引用
> 知之为知之，不知为不知，是知也。
> — 孔子

### 列表
- 项目一
- 项目二
  - 子项目
  - 子项目
- 项目三

1. 第一步
2. 第二步
3. 第三步

### 表格
| 功能 | 状态 | 说明 |
|------|------|------|
| 编辑 | 已完成 | 支持基础编辑 |
| 预览 | 已完成 | 实时渲染 |
| 导出 | 已完成 | 支持 HTML |

### 链接和图片
[Ink OS 官网](https://example.com)

---
*祝您使用愉快！*
`;

const toolbarButtons = [
  { icon: Bold, label: '粗体 (Bold)', prefix: '**', suffix: '**' },
  { icon: Italic, label: '斜体 (Italic)', prefix: '*', suffix: '*' },
  { icon: Heading, label: '标题 (Heading)', prefix: '## ', suffix: '' },
  { icon: Link, label: '链接 (Link)', prefix: '[', suffix: '](url)' },
  { icon: Image, label: '图片 (Image)', prefix: '![alt](', suffix: ')' },
  { icon: Code, label: '代码块 (Code)', prefix: '```\n', suffix: '\n```' },
  { icon: Quote, label: '引用 (Quote)', prefix: '> ', suffix: '' },
  { icon: List, label: '无序列表 (List)', prefix: '- ', suffix: '' },
  { icon: ListOrdered, label: '有序列表 (Ordered)', prefix: '1. ', suffix: '' },
];

export default function MarkdownEditor({ windowId }: { windowId?: string }) {
  const remotePath = usePayloadPath(windowId);
  const [remoteSavePath, setRemoteSavePath] = useState<string | null>(null);
  const [remoteStatus, setRemoteStatus] = useState<'idle' | 'loading' | 'saving' | 'error'>('idle');
  const [remoteError, setRemoteError] = useState<string | null>(null);

  const [content, setContent] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY) || DEFAULT_CONTENT; } catch { return DEFAULT_CONTENT; }
  });
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // FileManager double-click → load via /api/fs.
  useEffect(() => {
    if (!remotePath) return;
    let alive = true;
    setRemoteStatus('loading');
    setRemoteSavePath(remotePath);
    void fsClient
      .read(remotePath)
      .then((r) => {
        if (!alive) return;
        setContent(r.content);
        setRemoteStatus('idle');
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
      await fsClient.write(remoteSavePath, content);
      setRemoteStatus('idle');
      setRemoteError(null);
    } catch (err) {
      setRemoteStatus('error');
      setRemoteError(err instanceof Error ? err.message : String(err));
    }
  }, [remoteSavePath, content]);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, content); } catch { /* noop */ }
  }, [content]);

  const wordCount = useMemo(() => {
    const text = content.replace(/[#*`_\[\]\(\)!\-\|>]/g, '');
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
    return { words, chars: content.length };
  }, [content]);

  const insertFormat = useCallback((prefix: string, suffix: string) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = content.substring(start, end);
    const newText = content.substring(0, start) + prefix + selected + suffix + content.substring(end);
    setContent(newText);
    requestAnimationFrame(() => {
      ta.focus();
      const newPos = start + prefix.length + selected.length;
      ta.selectionStart = ta.selectionEnd = newPos;
    });
  }, [content]);

  const handleScroll = useCallback(() => {
    const ta = textareaRef.current;
    const pv = previewRef.current;
    if (!ta || !pv) return;
    const ratio = ta.scrollTop / (ta.scrollHeight - ta.clientHeight || 1);
    pv.scrollTop = ratio * (pv.scrollHeight - pv.clientHeight || 1);
  }, []);

  const handleNew = () => {
    if (window.confirm('确定要新建吗？未保存的内容将丢失。(New file - unsaved content will be lost)')) {
      setContent('');
    }
  };

  const handleOpen = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => { setContent(String(ev.target?.result || '')); };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleSave = () => {
    if (remoteSavePath) {
      void saveRemote();
      return;
    }
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'document.md';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportHTML = () => {
    const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<title>Exported Markdown</title>
<style>
body { font-family: 'Noto Sans SC', system-ui, sans-serif; max-width: 800px; margin: 40px auto; padding: 0 20px; color: #1a1a1a; background: #f0ebe4; line-height: 1.8; }
h1, h2, h3, h4 { font-family: 'Noto Serif SC', serif; border-bottom: 1px solid #d9d9d9; padding-bottom: 8px; }
code { font-family: 'Maple Mono CN', monospace; background: rgba(179,57,47,0.08); padding: 2px 6px; border-radius: 3px; font-size: 13px; }
pre { background: #e8e4df; padding: 12px; border-left: 3px solid #b3392f; border-radius: 4px; overflow-x: auto; }
blockquote { border-left: 3px solid #9e9e9e; margin: 0; padding-left: 16px; color: #5c5c5c; }
table { border-collapse: collapse; width: 100%; }
th, td { border: 1px solid #d9d9d9; padding: 8px; }
th { background: #e8e4df; }
a { color: #5a7a8a; }
img { max-width: 100%; }
</style>
</head>
<body>
<div id="content"></div>
<script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
<script>document.getElementById('content').innerHTML = marked.parse(${JSON.stringify(content)});</script>
</body>
</html>`;
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'document.html';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="w-full h-full flex flex-col" style={{ backgroundColor: 'var(--ink-50)' }}>
      {/* Toolbar */}
      <div className="flex items-center gap-1 px-2 py-1 border-b flex-shrink-0" style={{ borderColor: 'var(--ink-200)', backgroundColor: 'var(--ink-100)' }}>
        <button onClick={handleNew} className="flex items-center gap-1 px-2 py-1 rounded text-body-sm hover:opacity-80" style={{ color: 'var(--ink-700)' }} title="新建 (New)">
          <FileText size={14} />
        </button>
        <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-1 px-2 py-1 rounded text-body-sm hover:opacity-80" style={{ color: 'var(--ink-700)' }} title="打开 (Open)">
          <FolderOpen size={14} />
        </button>
        <input ref={fileInputRef} type="file" accept=".md,.markdown,.txt" className="hidden" onChange={handleOpen} />
        <button onClick={handleSave} className="flex items-center gap-1 px-2 py-1 rounded text-body-sm hover:opacity-80" style={{ color: 'var(--ink-700)' }} title="保存 (Save)">
          <Save size={14} />
        </button>
        <div className="w-px h-5 mx-1" style={{ backgroundColor: 'var(--ink-300)' }} />
        {toolbarButtons.map((btn) => (
          <button
            key={btn.label}
            onClick={() => insertFormat(btn.prefix, btn.suffix)}
            className="flex items-center px-1.5 py-1 rounded text-body-sm hover:opacity-80"
            style={{ color: 'var(--ink-700)' }}
            title={btn.label}
          >
            <btn.icon size={14} />
          </button>
        ))}
        <div className="w-px h-5 mx-1" style={{ backgroundColor: 'var(--ink-300)' }} />
        <button onClick={handleExportHTML} className="flex items-center gap-1 px-2 py-1 rounded text-body-sm hover:opacity-80" style={{ color: 'var(--ink-700)' }} title="导出 HTML (Export HTML)">
          <Download size={14} /> HTML
        </button>
        <div className="flex-1" />
        <span className="text-caption" style={{ color: 'var(--ink-500)' }}>
          {wordCount.words} 词 / {wordCount.chars} 字
        </span>
      </div>

      {/* Split Pane */}
      <div className="flex-1 flex overflow-hidden">
        {/* Editor */}
        <div className="flex-1 flex flex-col border-r" style={{ borderColor: 'var(--ink-200)' }}>
          <div className="px-2 py-0.5 text-caption border-b" style={{ backgroundColor: 'var(--ink-100)', color: 'var(--ink-500)', borderColor: 'var(--ink-200)' }}>
            编辑器 (Editor)
          </div>
          <textarea
            ref={textareaRef}
            value={content}
            onChange={e => setContent(e.target.value)}
            onScroll={handleScroll}
            spellCheck={false}
            className="flex-1 resize-none outline-none border-none p-3"
            style={{
              fontFamily: '"Maple Mono CN", "Courier New", monospace',
              fontSize: 13,
              lineHeight: '1.8',
              color: 'var(--ink-900)',
              backgroundColor: 'var(--ink-50)',
              tabSize: 2,
            }}
            placeholder="在此输入 Markdown... (Type Markdown here...)"
          />
        </div>

        {/* Preview */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="px-2 py-0.5 text-caption border-b" style={{ backgroundColor: 'var(--ink-100)', color: 'var(--ink-500)', borderColor: 'var(--ink-200)' }}>
            预览 (Preview)
          </div>
          <div
            ref={previewRef}
            className="flex-1 overflow-auto p-4"
            style={{ backgroundColor: 'var(--ink-50)' }}
          >
            <div className="prose max-w-none markdown-preview">
              <ReactMarkdown
                components={{
                  h1: ({ children }) => <h1 style={{ fontFamily: '"Noto Serif SC", serif', color: 'var(--ink-800)', borderBottom: '1px solid var(--ink-200)', paddingBottom: 8, fontSize: 24, fontWeight: 600, marginBottom: 16 }}>{children}</h1>,
                  h2: ({ children }) => <h2 style={{ fontFamily: '"Noto Serif SC", serif', color: 'var(--ink-800)', borderBottom: '1px solid var(--ink-200)', paddingBottom: 6, fontSize: 20, fontWeight: 600, marginTop: 24, marginBottom: 12 }}>{children}</h2>,
                  h3: ({ children }) => <h3 style={{ fontFamily: '"Noto Serif SC", serif', color: 'var(--ink-700)', fontSize: 16, fontWeight: 600, marginTop: 20, marginBottom: 8 }}>{children}</h3>,
                  p: ({ children }) => <p style={{ color: 'var(--ink-900)', lineHeight: 1.8, marginBottom: 12, fontSize: 15 }}>{children}</p>,
                  code: ({ children }) => <code style={{ fontFamily: '"Maple Mono CN", monospace', backgroundColor: 'rgba(179,57,47,0.08)', padding: '2px 6px', borderRadius: 3, fontSize: 13, color: 'var(--cinnabar)' }}>{children}</code>,
                  pre: ({ children }) => <pre style={{ backgroundColor: 'var(--ink-100)', padding: 12, borderLeft: '3px solid var(--cinnabar)', borderRadius: 4, overflow: 'auto', marginBottom: 12 }}>{children}</pre>,
                  blockquote: ({ children }) => <blockquote style={{ borderLeft: '3px solid var(--ink-400)', margin: '0 0 12px 0', paddingLeft: 16, color: 'var(--ink-600)', fontStyle: 'italic' }}>{children}</blockquote>,
                  ul: ({ children }) => <ul style={{ color: 'var(--ink-900)', paddingLeft: 24, marginBottom: 12, lineHeight: 1.8 }}>{children}</ul>,
                  ol: ({ children }) => <ol style={{ color: 'var(--ink-900)', paddingLeft: 24, marginBottom: 12, lineHeight: 1.8 }}>{children}</ol>,
                  li: ({ children }) => <li style={{ marginBottom: 4 }}>{children}</li>,
                  a: ({ children, href }) => <a href={href} style={{ color: 'var(--info)', textDecoration: 'none' }} onMouseEnter={e => (e.currentTarget.style.textDecoration = 'underline')} onMouseLeave={e => (e.currentTarget.style.textDecoration = 'none')}>{children}</a>,
                  table: ({ children }) => <table style={{ borderCollapse: 'collapse', width: '100%', marginBottom: 12, border: '1px solid var(--ink-200)' }}>{children}</table>,
                  th: ({ children }) => <th style={{ border: '1px solid var(--ink-200)', padding: '8px', backgroundColor: 'var(--ink-100)', textAlign: 'left', fontWeight: 600 }}>{children}</th>,
                  td: ({ children }) => <td style={{ border: '1px solid var(--ink-200)', padding: '8px' }}>{children}</td>,
                  hr: () => <hr style={{ border: 'none', borderTop: '1px solid var(--ink-200)', margin: '16px 0' }} />,
                  strong: ({ children }) => <strong style={{ fontWeight: 600 }}>{children}</strong>,
                  em: ({ children }) => <em style={{ fontStyle: 'italic' }}>{children}</em>,
                }}
              >
                {content}
              </ReactMarkdown>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

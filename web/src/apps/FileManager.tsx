import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowUp,
  Home,
  RefreshCw,
  FolderPlus,
  Upload,
  Download,
  Pencil,
  Trash2,
  Save,
  X,
  File as FileIcon,
  Folder,
  Link2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  fsClient,
  formatSize,
  formatMtime,
  type FsEntry,
  type FsListResponse,
} from '@/lib/fs';
import { ApiError } from '@/lib/api';
import { CodeEditor } from '@/components/CodeEditor';
import { openFileInApp } from '@/lib/openFile';

const SHORTCUTS: { label: string; path: string }[] = [
  { label: '主目录', path: '~' },
  { label: '/', path: '/' },
  { label: '/etc', path: '/etc' },
  { label: '/var/log', path: '/var/log' },
  { label: '/tmp', path: '/tmp' },
];

interface EditorState {
  path: string;
  original: string;
  current: string;
  saving: boolean;
  error: string | null;
}

export default function FileManager() {
  const [home, setHome] = useState<string>('/');
  const [listing, setListing] = useState<FsListResponse | null>(null);
  const [pathInput, setPathInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<FsEntry | null>(null);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [renameTarget, setRenameTarget] = useState<FsEntry | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [mkdirOpen, setMkdirOpen] = useState(false);
  const [mkdirValue, setMkdirValue] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // initial load: fetch home, then list it
  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const h = await fsClient.home();
        if (!alive) return;
        setHome(h);
        await load(h);
      } catch (e) {
        if (alive) setError(toMsg(e));
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function load(path: string) {
    setLoading(true);
    setError(null);
    try {
      const resolved = path === '~' ? home : path;
      const r = await fsClient.list(resolved);
      setListing(r);
      setPathInput(r.path);
      setSelected(null);
    } catch (e) {
      setError(toMsg(e));
    } finally {
      setLoading(false);
    }
  }

  const sortedEntries = useMemo(() => {
    if (!listing) return [];
    return [...listing.entries].sort((a, b) => {
      if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1;
      return a.name.localeCompare(b.name, 'zh-Hans');
    });
  }, [listing]);

  async function openEntry(e: FsEntry) {
    if (e.is_dir) {
      await load(e.path);
      return;
    }
    // Route to a dedicated app if the extension is known
    // (markdown / image / text editor for source code).
    if (openFileInApp(e.path)) {
      return;
    }
    if (e.size > 8 * 1024 * 1024) {
      // big file → just download
      window.open(fsClient.downloadURL(e.path), '_blank');
      return;
    }
    try {
      const r = await fsClient.read(e.path);
      if (!r.is_text) {
        window.open(fsClient.downloadURL(e.path), '_blank');
        return;
      }
      setEditor({
        path: r.path,
        original: r.content,
        current: r.content,
        saving: false,
        error: null,
      });
    } catch (err) {
      setError(toMsg(err));
    }
  }

  async function saveEditor() {
    if (!editor) return;
    setEditor({ ...editor, saving: true, error: null });
    try {
      await fsClient.write(editor.path, editor.current);
      setEditor({ ...editor, original: editor.current, saving: false });
      // refresh listing in case mtime changed in current view
      if (listing) void load(listing.path);
    } catch (err) {
      setEditor({ ...editor, saving: false, error: toMsg(err) });
    }
  }

  async function doDelete(e: FsEntry) {
    const ok = window.confirm(
      `确认删除 ${e.is_dir ? '目录' : '文件'} ${e.name}?\n${e.is_dir ? '所有子内容会一并删除。' : ''}`,
    );
    if (!ok) return;
    try {
      await fsClient.remove(e.path, e.is_dir);
      if (listing) void load(listing.path);
    } catch (err) {
      setError(toMsg(err));
    }
  }

  async function doRename() {
    if (!renameTarget || !renameValue.trim()) {
      setRenameTarget(null);
      return;
    }
    const newName = renameValue.trim();
    if (newName === renameTarget.name) {
      setRenameTarget(null);
      return;
    }
    const parent = listing?.path ?? home;
    const to = `${parent.replace(/\/+$/, '')}/${newName}`;
    try {
      await fsClient.move(renameTarget.path, to);
      setRenameTarget(null);
      if (listing) void load(listing.path);
    } catch (err) {
      setError(toMsg(err));
    }
  }

  async function doMkdir() {
    if (!mkdirValue.trim() || !listing) {
      setMkdirOpen(false);
      return;
    }
    const target = `${listing.path.replace(/\/+$/, '')}/${mkdirValue.trim()}`;
    try {
      await fsClient.mkdir(target);
      setMkdirOpen(false);
      setMkdirValue('');
      void load(listing.path);
    } catch (err) {
      setError(toMsg(err));
    }
  }

  async function onUploadFiles(files: FileList | null) {
    if (!files || files.length === 0 || !listing) return;
    try {
      await fsClient.upload(listing.path, files);
      void load(listing.path);
    } catch (err) {
      setError(toMsg(err));
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  return (
    <div className="flex h-full w-full flex-col" style={{ backgroundColor: 'var(--ink-50)' }}>
      {/* Toolbar */}
      <div
        className="flex items-center gap-2 border-b px-3 py-2"
        style={{ borderColor: 'var(--ink-200)', backgroundColor: 'var(--ink-100)' }}
      >
        <Button size="icon" variant="ghost" onClick={() => listing && load(listing.parent)} disabled={!listing}>
          <ArrowUp className="h-4 w-4" />
        </Button>
        <Button size="icon" variant="ghost" onClick={() => load(home)}>
          <Home className="h-4 w-4" />
        </Button>
        <Button size="icon" variant="ghost" onClick={() => listing && load(listing.path)} disabled={!listing}>
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </Button>

        <form
          className="flex-1"
          onSubmit={(e) => {
            e.preventDefault();
            const v = pathInput.trim();
            if (v) void load(v);
          }}
        >
          <Input
            value={pathInput}
            onChange={(e) => setPathInput(e.target.value)}
            placeholder="路径,如 /home/mochan"
            className="font-mono text-sm"
          />
        </form>

        <Button size="sm" variant="outline" onClick={() => setMkdirOpen(true)} disabled={!listing}>
          <FolderPlus className="mr-1 h-4 w-4" />
          新建目录
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => onUploadFiles(e.target.files)}
        />
        <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={!listing}>
          <Upload className="mr-1 h-4 w-4" />
          上传
        </Button>
      </div>

      {/* Main */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <div
          className="w-44 shrink-0 overflow-y-auto border-r p-2"
          style={{ borderColor: 'var(--ink-200)' }}
        >
          {SHORTCUTS.map((s) => (
            <button
              key={s.path}
              className="w-full rounded px-2 py-1.5 text-left text-sm hover:bg-[var(--ink-200)]"
              style={{ color: 'var(--ink-600)' }}
              onClick={() => load(s.path)}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* Listing */}
        <div className="flex-1 overflow-auto">
          {error && (
            <div className="m-3 rounded border border-red-300 bg-red-50 p-2 text-sm text-red-700">
              {error}
            </div>
          )}
          {!listing && !error && (
            <div className="flex h-full items-center justify-center text-sm" style={{ color: 'var(--ink-400)' }}>
              加载中…
            </div>
          )}
          {listing && (
            <table className="w-full table-fixed text-sm">
              <thead className="sticky top-0 z-10" style={{ backgroundColor: 'var(--ink-100)' }}>
                <tr style={{ color: 'var(--ink-500)' }}>
                  <th className="w-1/2 px-3 py-2 text-left font-medium">名称</th>
                  <th className="w-24 px-3 py-2 text-right font-medium">大小</th>
                  <th className="w-44 px-3 py-2 text-left font-medium">修改时间</th>
                  <th className="w-28 px-3 py-2 text-left font-medium">权限</th>
                  <th className="w-32 px-3 py-2 text-right font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {sortedEntries.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-3 py-12 text-center" style={{ color: 'var(--ink-400)' }}>
                      （空目录）
                    </td>
                  </tr>
                )}
                {sortedEntries.map((e) => (
                  <tr
                    key={e.path}
                    className={`cursor-default hover:bg-[var(--ink-100)] ${selected?.path === e.path ? 'bg-[var(--ink-200)]' : ''}`}
                    onClick={() => setSelected(e)}
                    onDoubleClick={() => openEntry(e)}
                  >
                    <td className="px-3 py-1.5">
                      <div className="flex items-center gap-2 truncate">
                        {e.is_dir ? (
                          <Folder className="h-4 w-4 shrink-0" style={{ color: 'var(--ink-500)' }} />
                        ) : e.symlink ? (
                          <Link2 className="h-4 w-4 shrink-0" style={{ color: 'var(--ink-400)' }} />
                        ) : (
                          <FileIcon className="h-4 w-4 shrink-0" style={{ color: 'var(--ink-400)' }} />
                        )}
                        <span className="truncate" title={e.symlink ? `→ ${e.symlink}` : e.name}>
                          {e.name}
                          {e.symlink && <span className="ml-1 text-xs opacity-60">→ {e.symlink}</span>}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums" style={{ color: 'var(--ink-500)' }}>
                      {e.is_dir ? '—' : formatSize(e.size)}
                    </td>
                    <td className="px-3 py-1.5 tabular-nums" style={{ color: 'var(--ink-500)' }}>
                      {formatMtime(e.mtime)}
                    </td>
                    <td className="px-3 py-1.5 font-mono text-xs" style={{ color: 'var(--ink-500)' }}>
                      {e.mode}
                    </td>
                    <td className="px-3 py-1.5">
                      <div className="flex items-center justify-end gap-1">
                        {!e.is_dir && (
                          <a
                            href={fsClient.downloadURL(e.path)}
                            download
                            className="rounded p-1 hover:bg-[var(--ink-200)]"
                            title="下载"
                            onClick={(ev) => ev.stopPropagation()}
                          >
                            <Download className="h-3.5 w-3.5" />
                          </a>
                        )}
                        <button
                          className="rounded p-1 hover:bg-[var(--ink-200)]"
                          title="重命名"
                          onClick={(ev) => {
                            ev.stopPropagation();
                            setRenameTarget(e);
                            setRenameValue(e.name);
                          }}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          className="rounded p-1 text-red-600 hover:bg-red-100"
                          title="删除"
                          onClick={(ev) => {
                            ev.stopPropagation();
                            void doDelete(e);
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Editor dialog */}
      <Dialog open={!!editor} onOpenChange={(o) => !o && setEditor(null)}>
        <DialogContent className="!max-w-4xl">
          <DialogHeader>
            <DialogTitle className="font-mono text-sm">{editor?.path}</DialogTitle>
          </DialogHeader>
          {editor && (
            <div className="overflow-hidden rounded border" style={{ borderColor: 'var(--ink-200)' }}>
              <CodeEditor
                path={editor.path}
                value={editor.current}
                onChange={(v) => setEditor((e) => (e ? { ...e, current: v } : e))}
                height="60vh"
              />
            </div>
          )}
          {editor?.error && (
            <div className="rounded border border-red-300 bg-red-50 p-2 text-sm text-red-700">
              {editor.error}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditor(null)}>
              <X className="mr-1 h-4 w-4" />
              关闭
            </Button>
            <Button
              onClick={saveEditor}
              disabled={!editor || editor.saving || editor.current === editor.original}
            >
              <Save className="mr-1 h-4 w-4" />
              {editor?.saving ? '保存中…' : '保存'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename dialog */}
      <Dialog open={!!renameTarget} onOpenChange={(o) => !o && setRenameTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>重命名</DialogTitle>
          </DialogHeader>
          <Input
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void doRename();
            }}
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameTarget(null)}>
              取消
            </Button>
            <Button onClick={doRename}>确认</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Mkdir dialog */}
      <Dialog open={mkdirOpen} onOpenChange={setMkdirOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新建目录</DialogTitle>
          </DialogHeader>
          <Input
            value={mkdirValue}
            onChange={(e) => setMkdirValue(e.target.value)}
            placeholder="目录名"
            onKeyDown={(e) => {
              if (e.key === 'Enter') void doMkdir();
            }}
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setMkdirOpen(false)}>
              取消
            </Button>
            <Button onClick={doMkdir}>创建</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function toMsg(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.status === 403) return '权限不足';
    if (e.status === 404) return '路径不存在';
    if (e.status === 409) return '已存在';
    if (e.status === 413) return '文件过大';
    return e.body || `错误 ${e.status}`;
  }
  if (e instanceof Error) return e.message;
  return String(e);
}

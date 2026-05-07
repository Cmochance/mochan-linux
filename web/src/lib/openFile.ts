import { useWindowStore } from '@/stores/useWindowStore';

export function basename(path: string): string {
  const i = path.lastIndexOf('/');
  return i < 0 ? path : path.slice(i + 1) || '/';
}

export function extensionOf(path: string): string {
  const slash = path.lastIndexOf('/');
  const dot = path.lastIndexOf('.');
  if (dot <= slash) return '';
  return path.slice(dot + 1).toLowerCase();
}

interface RouteEntry {
  exts: readonly string[];
  appId: string;
  titlePrefix: string;
  width?: number;
  height?: number;
}

const ROUTES: readonly RouteEntry[] = [
  {
    exts: ['md', 'markdown'],
    appId: 'markdowneditor',
    titlePrefix: 'Markdown',
    width: 1000,
    height: 720,
  },
  {
    exts: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico', 'avif'],
    appId: 'imageviewer',
    titlePrefix: '图片',
    width: 880,
    height: 640,
  },
  {
    exts: ['pdf'],
    appId: 'pdfreader',
    titlePrefix: 'PDF',
    width: 980,
    height: 720,
  },
  {
    exts: ['mp3', 'm4a', 'aac', 'wav', 'ogg', 'oga', 'flac', 'opus'],
    appId: 'musicplayer',
    titlePrefix: '音乐',
    width: 560,
    height: 720,
  },
  {
    exts: ['mp4', 'webm', 'ogv', 'mov', 'mkv'],
    appId: 'videoplayer',
    titlePrefix: '视频',
    width: 980,
    height: 640,
  },
  {
    exts: ['txt', 'log', 'conf', 'cfg', 'ini', 'env', 'sh', 'bash', 'zsh',
           'go', 'py', 'rs', 'js', 'jsx', 'ts', 'tsx', 'json', 'yaml', 'yml',
           'toml', 'html', 'htm', 'css', 'scss', 'sql', 'rb', 'php',
           'java', 'kt', 'c', 'cpp', 'h', 'hpp', 'cs'],
    appId: 'texteditor',
    titlePrefix: '文本',
    width: 980,
    height: 700,
  },
];

function findRoute(path: string): RouteEntry | undefined {
  const ext = extensionOf(path);
  if (!ext) return undefined;
  return ROUTES.find((r) => r.exts.includes(ext));
}

/**
 * Open the given absolute file path in the most appropriate app.
 * Returns true if a dedicated app was opened; false if no specialized
 * handler exists (caller should fall back to its own preview / download).
 */
export function openFileInApp(path: string): boolean {
  const route = findRoute(path);
  if (!route) return false;
  useWindowStore.getState().openWindow(
    route.appId,
    `${route.titlePrefix} - ${basename(path)}`,
    {
      width: route.width,
      height: route.height,
      payload: { path, source: 'filemanager' },
    },
  );
  return true;
}

/**
 * Read window payload from the store. Apps consuming a payload call this in
 * their effect; returns undefined if no windowId or no payload.
 */
export function usePayloadPath(windowId: string | undefined): string | undefined {
  if (!windowId) return undefined;
  const win = useWindowStore.getState().getWindowById(windowId);
  const p = win?.payload?.path;
  return typeof p === 'string' ? p : undefined;
}

export interface FileManagerPayload {
  initialPath?: string;
  selectName?: string;
}

/**
 * Read FileManager-specific payload (initialPath, selectName) from the
 * window store. Used when another app launched FileManager and pre-selected
 * a directory + entry, e.g. "open in file manager" from DownloadManager.
 */
export function readFileManagerPayload(windowId: string | undefined): FileManagerPayload {
  if (!windowId) return {};
  const win = useWindowStore.getState().getWindowById(windowId);
  const p = win?.payload as FileManagerPayload | undefined;
  return {
    initialPath: typeof p?.initialPath === 'string' ? p.initialPath : undefined,
    selectName: typeof p?.selectName === 'string' && p.selectName ? p.selectName : undefined,
  };
}

/**
 * Open the FileManager focused on a specific filesystem location. Pass an
 * absolute file path; the parent dir is opened and the file is selected.
 * Pass an absolute dir (with trailing `/` or pointing at a directory) to
 * just open it without a selection.
 */
export function openInFileManager(targetPath: string): void {
  const isDir = targetPath.endsWith('/');
  const lastSlash = targetPath.lastIndexOf('/');
  const dir = isDir ? targetPath : targetPath.slice(0, lastSlash) || '/';
  const selectName = isDir ? '' : basename(targetPath);
  useWindowStore.getState().openWindow(
    'filemanager',
    `文件管理 - ${basename(dir)}`,
    {
      width: 960,
      height: 640,
      payload: { initialPath: dir, selectName, source: 'open-in-fm' },
    },
  );
}

import { apiFetch, apiJSON, ApiError } from './api';

export interface FsEntry {
  name: string;
  path: string;
  is_dir: boolean;
  size: number;
  mtime: number;
  mode: string;
  symlink?: string;
}

export interface FsListResponse {
  path: string;
  parent: string;
  entries: FsEntry[];
}

export interface FsReadResponse {
  path: string;
  size: number;
  mtime: number;
  content: string;
  is_text: boolean;
}

export const fsClient = {
  async home(): Promise<string> {
    const r = await apiJSON<{ home: string }>('/api/fs/home');
    return r.home;
  },

  async list(path: string): Promise<FsListResponse> {
    return apiJSON<FsListResponse>(`/api/fs/list?path=${encodeURIComponent(path)}`);
  },

  async read(path: string): Promise<FsReadResponse> {
    return apiJSON<FsReadResponse>(`/api/fs/read?path=${encodeURIComponent(path)}`);
  },

  async write(path: string, content: string): Promise<FsEntry> {
    return apiJSON<FsEntry>('/api/fs/write', {
      method: 'POST',
      body: JSON.stringify({ path, content }),
    });
  },

  async mkdir(path: string, parents = false): Promise<FsEntry> {
    return apiJSON<FsEntry>('/api/fs/mkdir', {
      method: 'POST',
      body: JSON.stringify({ path, parents }),
    });
  },

  async remove(path: string, recursive = false): Promise<void> {
    const url = `/api/fs/?path=${encodeURIComponent(path)}&recursive=${recursive}`;
    const res = await apiFetch(url, { method: 'DELETE' });
    if (!res.ok) throw new ApiError(res.status, await res.text());
  },

  async move(from: string, to: string): Promise<FsEntry> {
    return apiJSON<FsEntry>('/api/fs/move', {
      method: 'POST',
      body: JSON.stringify({ from, to }),
    });
  },

  downloadURL(path: string): string {
    return `/api/fs/download?path=${encodeURIComponent(path)}`;
  },

  async upload(dir: string, files: FileList | File[]): Promise<{ saved: FsEntry[] }> {
    const fd = new FormData();
    fd.append('path', dir);
    for (const f of Array.from(files)) fd.append('file', f);
    const res = await apiFetch('/api/fs/upload', { method: 'POST', body: fd });
    if (!res.ok) throw new ApiError(res.status, await res.text());
    return res.json();
  },
};

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export function formatMtime(unix: number): string {
  const d = new Date(unix * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

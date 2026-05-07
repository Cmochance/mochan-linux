import { apiFetch, apiJSON, ApiError } from './api';

export type DownloadStatus = 'queued' | 'downloading' | 'completed' | 'failed' | 'canceled';

export interface DownloadJob {
  id: string;
  url: string;
  file_name: string;
  output_path?: string;
  status: DownloadStatus;
  size_bytes: number;
  downloaded: number;
  speed_bytes: number;
  error?: string;
  created_at: string;
  updated_at: string;
  started_at?: string;
  completed_at?: string;
}

export const downloadsClient = {
  async list(): Promise<DownloadJob[]> {
    const r = await apiJSON<{ downloads: DownloadJob[] }>('/api/downloads/');
    return r.downloads;
  },

  async create(url: string, fileName = ''): Promise<DownloadJob> {
    return apiJSON<DownloadJob>('/api/downloads/', {
      method: 'POST',
      body: JSON.stringify({ url, file_name: fileName }),
    });
  },

  async get(id: string): Promise<DownloadJob> {
    return apiJSON<DownloadJob>(`/api/downloads/${encodeURIComponent(id)}`);
  },

  async cancel(id: string): Promise<DownloadJob> {
    return apiJSON<DownloadJob>(`/api/downloads/${encodeURIComponent(id)}/cancel`, {
      method: 'POST',
    });
  },

  async retry(id: string): Promise<DownloadJob> {
    return apiJSON<DownloadJob>(`/api/downloads/${encodeURIComponent(id)}/retry`, {
      method: 'POST',
    });
  },

  async remove(id: string): Promise<DownloadJob> {
    const res = await apiFetch(`/api/downloads/${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (!res.ok) throw new ApiError(res.status, await res.text());
    return res.json() as Promise<DownloadJob>;
  },

  /**
   * Run `apt-get install` against a completed .deb download. Streams SSE
   * frames from the server: each `data: ...` becomes one onLine call; the
   * trailing `event: exit\ndata: <code>` resolves the returned promise
   * with the numeric exit code. The optional AbortSignal closes the
   * fetch (which terminates the server-side scanner loop, but not the
   * apt process — apt always runs to completion once started).
   */
  async installDeb(
    id: string,
    onLine: (line: string) => void,
    signal?: AbortSignal,
  ): Promise<number> {
    const res = await apiFetch(`/api/downloads/${encodeURIComponent(id)}/install`, {
      method: 'POST',
      signal,
    });
    if (!res.ok || !res.body) {
      throw new ApiError(res.status, await res.text());
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buf = '';
    let exitCode = -1;
    let eventName = '';
    let dataLines: string[] = [];

    const flushFrame = () => {
      const data = dataLines.join('\n');
      dataLines = [];
      if (eventName === 'exit') {
        const n = parseInt(data.trim(), 10);
        exitCode = Number.isFinite(n) ? n : -1;
      } else {
        if (data.length > 0) onLine(data);
      }
      eventName = '';
    };

    // SSE framing: lines beginning with "event:" set event name, "data:"
    // accumulate into the next dispatch, blank line dispatches.
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, idx);
        buf = buf.slice(idx + 1);
        if (line === '') {
          flushFrame();
          continue;
        }
        if (line.startsWith('event:')) {
          eventName = line.slice(6).trim();
        } else if (line.startsWith('data:')) {
          // Per SSE spec, a single space after the colon is stripped if
          // present; we emit "data: " on the server so always strip it.
          const v = line.slice(5);
          dataLines.push(v.startsWith(' ') ? v.slice(1) : v);
        }
        // Other field types (id:, retry:) are not used.
      }
    }
    if (dataLines.length > 0) flushFrame();
    return exitCode;
  },
};

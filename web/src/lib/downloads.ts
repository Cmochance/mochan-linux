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
   * from the server: each `data: ...` becomes one onLine; an
   * `event: status\ndata: <verdict>|<detail>` carries dpkg-query's
   * post-install verdict (success | partial | failed | unknown); the
   * trailing `event: exit\ndata: <code>` resolves the returned promise.
   * The optional AbortSignal closes the fetch (which terminates the
   * server-side scanner loop, but not the apt process — apt always
   * runs to completion once started).
   */
  async installDeb(
    id: string,
    onLine: (line: string) => void,
    signal?: AbortSignal,
    onStatus?: (verdict: InstallVerdict, detail: string) => void,
  ): Promise<{ exitCode: number; verdict: InstallVerdict; detail: string }> {
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
    let verdict: InstallVerdict = 'unknown';
    let detail = '';
    let eventName = '';
    let dataLines: string[] = [];

    const flushFrame = () => {
      const data = dataLines.join('\n');
      dataLines = [];
      if (eventName === 'exit') {
        const n = parseInt(data.trim(), 10);
        exitCode = Number.isFinite(n) ? n : -1;
      } else if (eventName === 'status') {
        const sep = data.indexOf('|');
        const v = (sep >= 0 ? data.slice(0, sep) : data).trim();
        const d = sep >= 0 ? data.slice(sep + 1) : '';
        if (v === 'success' || v === 'partial' || v === 'failed' || v === 'unknown') {
          verdict = v;
          detail = d;
          onStatus?.(verdict, detail);
        }
      } else {
        if (data.length > 0) onLine(data);
      }
      eventName = '';
    };

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
      }
    }
    if (dataLines.length > 0) flushFrame();
    // No `status` frame received but apt exited nonzero — treat as a
    // hard failure rather than "unknown". Common causes: server-side
    // pipe error before status was emitted, or the SSE stream was
    // truncated mid-way. Hiding the nonzero exit behind "状态未知"
    // downplays a real install error.
    if (verdict === 'unknown' && exitCode !== 0) {
      verdict = 'failed';
      detail = detail || `apt exit ${exitCode} (no status frame)`;
      onStatus?.(verdict, detail);
    }
    return { exitCode, verdict, detail };
  },
};

export type InstallVerdict = 'success' | 'partial' | 'failed' | 'unknown';

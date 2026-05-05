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
};

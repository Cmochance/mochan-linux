import { apiFetch, apiJSON, ApiError } from './api';

export interface DiskInfo {
  mount: string;
  fstype: string;
  total: number;
  used: number;
  free: number;
  percent: number;
}

export interface SysStat {
  hostname: string;
  kernel: string;
  os: string;
  arch: string;
  uptime: number;
  boot_time: number;
  load_1: number;
  load_5: number;
  load_15: number;
  cpu_count: number;
  cpu_percent: number;
  cpu_per_core: number[];
  mem_total: number;
  mem_used: number;
  mem_percent: number;
  swap_total: number;
  swap_used: number;
  disks: DiskInfo[];
  net: { bytes_sent: number; bytes_recv: number };
  now: number;
}

export interface ProcessInfo {
  pid: number;
  ppid: number;
  name: string;
  user: string;
  status: string;
  cpu_percent: number;
  mem_rss: number;
  mem_percent: number;
  created: number;
  cmdline: string;
  threads: number;
}

export const sysClient = {
  stat: () => apiJSON<SysStat>('/api/sys/stat'),
  processes: (limit = 200) =>
    apiJSON<{ processes: ProcessInfo[]; total: number }>(`/api/sys/processes?limit=${limit}`),
  async kill(pid: number, signal: 'TERM' | 'KILL' | 'INT' | 'HUP' = 'TERM'): Promise<void> {
    const res = await apiFetch('/api/sys/kill', {
      method: 'POST',
      body: JSON.stringify({ pid, signal }),
    });
    if (!res.ok) throw new ApiError(res.status, await res.text());
  },
};

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  if (bytes < 1024 ** 4) return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  return `${(bytes / 1024 ** 4).toFixed(2)} TB`;
}

export function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}天 ${h}时 ${m}分`;
  if (h > 0) return `${h}时 ${m}分`;
  return `${m}分`;
}

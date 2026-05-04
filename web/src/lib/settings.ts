import { apiFetch, apiJSON, ApiError } from './api';

export interface SettingsDoc {
  theme: 'ink' | 'dark' | 'light';
  language: 'zh' | 'en';
  wallpaper: string;
}

export interface Wallpaper {
  name: string;
  url: string;
  size: number;
  source: 'bundled' | 'user';
}

/**
 * Resolve a wallpaper id to a renderable URL. Bundled IDs (those starting
 * with `wallpaper-`) point at the static `./<id>.jpg` shipped in the
 * frontend bundle; everything else is treated as a user-uploaded filename
 * and proxied via `/api/settings/wallpapers/<filename>`.
 */
export function wallpaperUrl(id: string): string {
  if (id.startsWith('wallpaper-')) return `./${id}.jpg`;
  return `/api/settings/wallpapers/${encodeURIComponent(id)}`;
}

export const settingsClient = {
  get: () => apiJSON<SettingsDoc>('/api/settings/'),
  patch: (patch: Partial<SettingsDoc>) =>
    apiJSON<SettingsDoc>('/api/settings/', {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),
  listWallpapers: () =>
    apiJSON<{ wallpapers: Wallpaper[] }>('/api/settings/wallpapers/'),
  async uploadWallpaper(files: FileList | File[]): Promise<{ saved: Wallpaper[] }> {
    const fd = new FormData();
    for (const f of Array.from(files)) fd.append('file', f);
    const res = await apiFetch('/api/settings/wallpapers/', {
      method: 'POST',
      body: fd,
    });
    if (!res.ok) throw new ApiError(res.status, await res.text());
    return res.json();
  },
  async deleteWallpaper(name: string): Promise<void> {
    const res = await apiFetch(
      `/api/settings/wallpapers/${encodeURIComponent(name)}`,
      { method: 'DELETE' },
    );
    if (!res.ok) throw new ApiError(res.status, await res.text());
  },
};

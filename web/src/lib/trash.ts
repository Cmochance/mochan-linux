import { apiJSON } from './api';

export interface TrashItem {
  id: string;
  name: string;
  original_path: string;
  is_dir: boolean;
  size: number;
  mode: string;
  deleted_at: string;
}

export const trashClient = {
  async list(): Promise<TrashItem[]> {
    const r = await apiJSON<{ items: TrashItem[] }>('/api/trash/list');
    return r.items;
  },

  async move(path: string): Promise<TrashItem> {
    return apiJSON<TrashItem>('/api/trash/move', {
      method: 'POST',
      body: JSON.stringify({ path }),
    });
  },

  async restore(id: string): Promise<TrashItem> {
    return apiJSON<TrashItem>('/api/trash/restore', {
      method: 'POST',
      body: JSON.stringify({ id }),
    });
  },

  async delete(ids: string[]): Promise<{ deleted: number }> {
    return apiJSON<{ deleted: number }>('/api/trash/delete', {
      method: 'POST',
      body: JSON.stringify({ ids }),
    });
  },

  async empty(): Promise<{ deleted: number }> {
    return apiJSON<{ deleted: number }>('/api/trash/empty', {
      method: 'POST',
    });
  },
};

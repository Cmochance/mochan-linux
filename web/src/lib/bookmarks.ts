import { apiJSON, apiFetch, ApiError } from './api';

export interface BookmarkFolder {
  id: string;
  name: string;
  parent_id?: string;
}

export interface BookmarkItem {
  id: string;
  title: string;
  url: string;
  description?: string;
  folder_id: string;
  favicon?: string;
  visit_count: number;
  created_at: string;
  updated_at: string;
}

export interface BookmarkState {
  folders: BookmarkFolder[];
  bookmarks: BookmarkItem[];
}

async function remove(path: string): Promise<void> {
  const res = await apiFetch(path, { method: 'DELETE' });
  if (!res.ok) throw new ApiError(res.status, await res.text());
}

export const bookmarksClient = {
  list: () => apiJSON<BookmarkState>('/api/bookmarks/'),
  addBookmark: (bookmark: Partial<BookmarkItem>) => apiJSON<BookmarkItem>('/api/bookmarks/bookmarks', {
    method: 'POST',
    body: JSON.stringify(bookmark),
  }),
  updateBookmark: (id: string, bookmark: Partial<BookmarkItem>) => apiJSON<BookmarkItem>(`/api/bookmarks/bookmarks/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(bookmark),
  }),
  deleteBookmark: (id: string) => remove(`/api/bookmarks/bookmarks/${encodeURIComponent(id)}`),
  visitBookmark: (id: string) => apiJSON<BookmarkItem>(`/api/bookmarks/bookmarks/${encodeURIComponent(id)}/visit`, { method: 'POST' }),
  addFolder: (name: string) => apiJSON<BookmarkFolder>('/api/bookmarks/folders', {
    method: 'POST',
    body: JSON.stringify({ name }),
  }),
  deleteFolder: (id: string) => remove(`/api/bookmarks/folders/${encodeURIComponent(id)}`),
  importData: (state: BookmarkState) => apiJSON<BookmarkState>('/api/bookmarks/import', {
    method: 'POST',
    body: JSON.stringify(state),
  }),
};

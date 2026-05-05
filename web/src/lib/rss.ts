import { apiJSON, apiFetch, ApiError } from './api';

export interface RSSFeed {
  id: string;
  title: string;
  url: string;
  site_url?: string;
  category: string;
  unread_count: number;
  last_refresh_at?: string;
  last_error?: string;
  created_at: string;
  updated_at: string;
}

export interface RSSArticle {
  id: string;
  feed_id: string;
  title: string;
  link?: string;
  summary?: string;
  content?: string;
  author?: string;
  published_at?: string;
  read: boolean;
  starred: boolean;
  created_at: string;
  updated_at: string;
}

export const rssClient = {
  async feeds(): Promise<RSSFeed[]> {
    const r = await apiJSON<{ feeds: RSSFeed[] }>('/api/rss/feeds');
    return r.feeds;
  },

  async addFeed(url: string, category = ''): Promise<RSSFeed> {
    return apiJSON<RSSFeed>('/api/rss/feeds', {
      method: 'POST',
      body: JSON.stringify({ url, category }),
    });
  },

  async deleteFeed(id: string): Promise<RSSFeed> {
    const res = await apiFetch(`/api/rss/feeds/${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (!res.ok) throw new ApiError(res.status, await res.text());
    return res.json() as Promise<RSSFeed>;
  },

  async refreshFeed(id: string): Promise<RSSFeed> {
    return apiJSON<RSSFeed>(`/api/rss/feeds/${encodeURIComponent(id)}/refresh`, {
      method: 'POST',
    });
  },

  async refreshAll(): Promise<{ feeds: RSSFeed[]; error?: string }> {
    return apiJSON<{ feeds: RSSFeed[]; error?: string }>('/api/rss/refresh', {
      method: 'POST',
    });
  },

  async articles(options: { feedID?: string; starred?: boolean } = {}): Promise<RSSArticle[]> {
    const params = new URLSearchParams();
    if (options.feedID) params.set('feed_id', options.feedID);
    if (options.starred) params.set('starred', 'true');
    const qs = params.toString();
    const r = await apiJSON<{ articles: RSSArticle[] }>(`/api/rss/articles${qs ? `?${qs}` : ''}`);
    return r.articles;
  },

  async setRead(id: string, read: boolean): Promise<RSSArticle> {
    return apiJSON<RSSArticle>(`/api/rss/articles/${encodeURIComponent(id)}/read`, {
      method: 'POST',
      body: JSON.stringify({ read }),
    });
  },

  async setStarred(id: string, starred: boolean): Promise<RSSArticle> {
    return apiJSON<RSSArticle>(`/api/rss/articles/${encodeURIComponent(id)}/star`, {
      method: 'POST',
      body: JSON.stringify({ starred }),
    });
  },

  async markAllRead(feedID = ''): Promise<{ updated: number }> {
    return apiJSON<{ updated: number }>('/api/rss/articles/read-all', {
      method: 'POST',
      body: JSON.stringify({ feed_id: feedID }),
    });
  },
};

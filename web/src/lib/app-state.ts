import { apiFetch, apiJSON, ApiError } from './api';

export interface AppStateDocument<T = unknown> {
  app_id: string;
  updated_at: string;
  data: T;
}

export interface AppStateSummary {
  app_id: string;
  updated_at: string;
  size: number;
}

export const appStateClient = {
  list: () => apiJSON<{ apps: AppStateSummary[] }>('/api/app-state/'),

  get: <T = unknown>(appID: string) =>
    apiJSON<AppStateDocument<T>>(`/api/app-state/${encodeURIComponent(appID)}`),

  async getOrDefault<T>(appID: string, fallback: T): Promise<T> {
    try {
      const doc = await this.get<T>(appID);
      return doc.data;
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) return fallback;
      throw err;
    }
  },

  put: <T>(appID: string, data: T) =>
    apiJSON<AppStateDocument<T>>(`/api/app-state/${encodeURIComponent(appID)}`, {
      method: 'PUT',
      body: JSON.stringify({ data }),
    }),

  patch: <T = unknown>(appID: string, patch: Record<string, unknown>) =>
    apiJSON<AppStateDocument<T>>(`/api/app-state/${encodeURIComponent(appID)}`, {
      method: 'PATCH',
      body: JSON.stringify({ patch }),
    }),

  async remove(appID: string): Promise<void> {
    const res = await apiFetch(`/api/app-state/${encodeURIComponent(appID)}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new ApiError(res.status, await res.text());
  },
};

import { apiFetch, apiJSON, ApiError } from './api';

export interface DesktopApp {
  id: string;
  name: string;
  exec: string;
  icon: string;
  comment: string;
}

export interface GUISession {
  id: string;
  display: number;
  port: number;
  command: string;
  unit_name: string;
  actor: string;
  started_at: string;
  url: string;
}

export const guiAppsClient = {
  async listApps(): Promise<DesktopApp[]> {
    const data = await apiJSON<{ apps: DesktopApp[] | null }>('/api/gui/apps');
    return data.apps ?? [];
  },

  async listSessions(): Promise<GUISession[]> {
    const data = await apiJSON<{ sessions: GUISession[] | null }>('/api/gui/');
    return data.sessions ?? [];
  },

  async launch(command: string): Promise<GUISession> {
    return apiJSON<GUISession>('/api/gui/launch', {
      method: 'POST',
      body: JSON.stringify({ command }),
    });
  },

  async stop(id: string): Promise<void> {
    const res = await apiFetch(`/api/gui/sessions/${encodeURIComponent(id)}/stop`, { method: 'POST' });
    if (!res.ok) throw new ApiError(res.status, await res.text());
  },
};

import { create } from 'zustand';
import { apiFetch, ApiError } from '@/lib/api';

type Status = 'unknown' | 'authenticated' | 'unauthenticated';

interface AuthState {
  status: Status;
  username: string | null;
  expiresAt: number | null;
  check: () => Promise<void>;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  status: 'unknown',
  username: null,
  expiresAt: null,

  check: async () => {
    try {
      const res = await apiFetch('/api/me');
      if (!res.ok) {
        set({ status: 'unauthenticated', username: null, expiresAt: null });
        return;
      }
      const data = (await res.json()) as { username: string; expires: number };
      set({
        status: 'authenticated',
        username: data.username,
        expiresAt: data.expires,
      });
    } catch {
      set({ status: 'unauthenticated', username: null, expiresAt: null });
    }
  },

  login: async (username, password) => {
    const res = await apiFetch('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    if (!res.ok) {
      throw new ApiError(res.status, await res.text());
    }
    const data = (await res.json()) as {
      username: string;
      expires_at: string;
    };
    set({
      status: 'authenticated',
      username: data.username,
      expiresAt: Date.parse(data.expires_at) / 1000,
    });
  },

  logout: async () => {
    await apiFetch('/api/auth/logout', { method: 'POST' });
    set({ status: 'unauthenticated', username: null, expiresAt: null });
  },
}));

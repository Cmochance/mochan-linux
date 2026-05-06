import { create } from 'zustand';
import { apiFetch, ApiError } from '@/lib/api';

type Status = 'unknown' | 'authenticated' | 'unauthenticated';

interface AuthState {
  status: Status;
  username: string | null;
  email: string | null;
  role: string | null;
  expiresAt: number | null;
  check: () => Promise<void>;
  login: (identifier: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  status: 'unknown',
  username: null,
  email: null,
  role: null,
  expiresAt: null,

  check: async () => {
    try {
      const res = await apiFetch('/api/me');
      if (!res.ok) {
        set({ status: 'unauthenticated', username: null, email: null, role: null, expiresAt: null });
        return;
      }
      const data = (await res.json()) as { username: string; role?: string; expires: number };
      set({
        status: 'authenticated',
        username: data.username,
        role: data.role ?? null,
        expiresAt: data.expires,
      });
    } catch {
      set({ status: 'unauthenticated', username: null, email: null, role: null, expiresAt: null });
    }
  },

  login: async (identifier, password) => {
    const res = await apiFetch('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ identifier, password }),
    });
    if (!res.ok) {
      throw new ApiError(res.status, await res.text());
    }
    const data = (await res.json()) as {
      username: string;
      email?: string;
      role?: string;
      expires_at: string;
    };
    set({
      status: 'authenticated',
      username: data.username,
      email: data.email ?? null,
      role: data.role ?? null,
      expiresAt: Date.parse(data.expires_at) / 1000,
    });
  },

  logout: async () => {
    await apiFetch('/api/auth/logout', { method: 'POST' });
    set({ status: 'unauthenticated', username: null, email: null, role: null, expiresAt: null });
  },
}));

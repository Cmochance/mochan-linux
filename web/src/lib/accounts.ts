import { apiFetch, apiJSON, ApiError } from './api';

export interface Invite {
  id: number;
  code: string;
  email?: string;
  created_at: string;
  expires_at: string;
  used: boolean;
  expired: boolean;
  created_by_username?: string;
  used_by_username?: string;
}

export interface CreateInviteInput {
  email?: string;
  ttl_hours?: number;
}

export const accountsClient = {
  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    const res = await apiFetch('/api/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({
        current_password: currentPassword,
        new_password: newPassword,
      }),
    });
    if (!res.ok) {
      throw new ApiError(res.status, await res.text());
    }
  },

  async listInvites(): Promise<Invite[]> {
    const data = await apiJSON<{ invites: Invite[] | null }>('/api/admin/invites');
    return data.invites ?? [];
  },

  async createInvite(input: CreateInviteInput): Promise<Invite> {
    const body: Record<string, unknown> = {};
    if (input.email) body.email = input.email;
    if (input.ttl_hours) body.ttl_hours = input.ttl_hours;
    return apiJSON<Invite>('/api/admin/invites', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  async deleteInvite(id: number): Promise<void> {
    const res = await apiFetch(`/api/admin/invites/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      throw new ApiError(res.status, await res.text());
    }
  },
};

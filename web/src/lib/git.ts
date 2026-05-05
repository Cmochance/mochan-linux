import { apiFetch, apiJSON, ApiError } from './api';

export interface GitRepo {
  id: string;
  name: string;
  path: string;
  added_at: string;
}

export interface GitStatusFile {
  path: string;
  old_path?: string;
  staged: boolean;
  unstaged: boolean;
  change: 'added' | 'deleted' | 'modified' | 'renamed' | 'copied';
  raw: string;
}

export interface GitStatus {
  repo: GitRepo;
  branch: string;
  head: string;
  upstream?: string;
  ahead: number;
  behind: number;
  files: GitStatusFile[];
  working_tree_clean: boolean;
}

export interface GitCommit {
  hash: string;
  short: string;
  subject: string;
  author: string;
  date: string;
  refs?: string;
}

export interface GitBranch {
  name: string;
  current: boolean;
}

async function noContent(path: string, init: RequestInit): Promise<void> {
  const res = await apiFetch(path, init);
  if (!res.ok) throw new ApiError(res.status, await res.text());
}

export const gitClient = {
  repos: () => apiJSON<{ repos: GitRepo[] }>('/api/git/repos'),
  addRepo: (path: string, name?: string) => apiJSON<GitRepo>('/api/git/repos', {
    method: 'POST',
    body: JSON.stringify({ path, name }),
  }),
  deleteRepo: (id: string) => noContent(`/api/git/repos/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  status: (id: string) => apiJSON<GitStatus>(`/api/git/repos/${encodeURIComponent(id)}/status`),
  diff: (id: string, path: string, staged = false) =>
    apiJSON<{ diff: string }>(`/api/git/repos/${encodeURIComponent(id)}/diff?path=${encodeURIComponent(path)}&staged=${staged}`),
  log: (id: string) => apiJSON<{ commits: GitCommit[] }>(`/api/git/repos/${encodeURIComponent(id)}/log`),
  branches: (id: string) => apiJSON<{ branches: GitBranch[] }>(`/api/git/repos/${encodeURIComponent(id)}/branches`),
  stage: (id: string, paths: string[]) => apiJSON<{ output: string }>(`/api/git/repos/${encodeURIComponent(id)}/stage`, {
    method: 'POST',
    body: JSON.stringify({ paths }),
  }),
  unstage: (id: string, paths: string[]) => apiJSON<{ output: string }>(`/api/git/repos/${encodeURIComponent(id)}/unstage`, {
    method: 'POST',
    body: JSON.stringify({ paths }),
  }),
  commit: (id: string, message: string) => apiJSON<{ output: string }>(`/api/git/repos/${encodeURIComponent(id)}/commit`, {
    method: 'POST',
    body: JSON.stringify({ message }),
  }),
  checkout: (id: string, branch: string) => apiJSON<{ output: string }>(`/api/git/repos/${encodeURIComponent(id)}/checkout`, {
    method: 'POST',
    body: JSON.stringify({ branch }),
  }),
  createBranch: (id: string, name: string, checkout = true) => apiJSON<{ output: string }>(`/api/git/repos/${encodeURIComponent(id)}/branch`, {
    method: 'POST',
    body: JSON.stringify({ name, checkout }),
  }),
  fetch: (id: string) => apiJSON<{ output: string }>(`/api/git/repos/${encodeURIComponent(id)}/fetch`, { method: 'POST' }),
  pull: (id: string) => apiJSON<{ output: string }>(`/api/git/repos/${encodeURIComponent(id)}/pull`, { method: 'POST' }),
  merge: (id: string, branch: string) => apiJSON<{ output: string }>(`/api/git/repos/${encodeURIComponent(id)}/merge`, {
    method: 'POST',
    body: JSON.stringify({ branch }),
  }),
};

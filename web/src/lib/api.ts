export class ApiError extends Error {
  status: number;
  body: string;

  constructor(status: number, body: string) {
    super(`API ${status}: ${body}`);
    this.status = status;
    this.body = body;
  }
}

export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const isFormData = typeof FormData !== 'undefined' && init?.body instanceof FormData;
  return fetch(path, {
    ...init,
    credentials: 'include',
    headers: {
      ...(init?.body && !isFormData ? { 'content-type': 'application/json' } : {}),
      ...(init?.headers ?? {}),
    },
  });
}

export async function apiJSON<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const res = await apiFetch(path, init);
  if (!res.ok) {
    throw new ApiError(res.status, await res.text());
  }
  return res.json() as Promise<T>;
}

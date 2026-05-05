import { apiJSON } from './api';

export type ApiTesterMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS';

export interface ApiTesterHeader {
  key: string;
  value: string;
  enabled: boolean;
}

export interface ApiTesterRunRequest {
  method: ApiTesterMethod;
  url: string;
  headers: ApiTesterHeader[];
  body: string;
  timeout_ms?: number;
}

export interface ApiTesterRunResponse {
  status: number;
  status_text: string;
  headers: Record<string, string>;
  body: string;
  time_ms: number;
  size: number;
  truncated: boolean;
  error?: string;
}

export const apiTesterClient = {
  run(request: ApiTesterRunRequest): Promise<ApiTesterRunResponse> {
    return apiJSON<ApiTesterRunResponse>('/api/api-tester/run', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  },
};

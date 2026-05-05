import { apiJSON } from './api';

export interface TransferConnection {
  protocol: 'sftp';
  host: string;
  port: number;
  username: string;
  password: string;
}

export interface RemoteEntry {
  name: string;
  path: string;
  is_dir: boolean;
  size: number;
  mtime: number;
}

export const fileTransferClient = {
  connect: (connection: TransferConnection) => apiJSON<{ connected: boolean; protocol: string; cwd: string }>('/api/file-transfer/connect', {
    method: 'POST',
    body: JSON.stringify({ connection }),
  }),
  list: (connection: TransferConnection, path: string) => apiJSON<{ path: string; entries: RemoteEntry[] }>('/api/file-transfer/list', {
    method: 'POST',
    body: JSON.stringify({ connection, path }),
  }),
  mkdir: (connection: TransferConnection, path: string) => apiJSON<{ path: string }>('/api/file-transfer/mkdir', {
    method: 'POST',
    body: JSON.stringify({ connection, path }),
  }),
  delete: (connection: TransferConnection, path: string, recursive = false) => apiJSON<{ path: string }>('/api/file-transfer/delete', {
    method: 'POST',
    body: JSON.stringify({ connection, path, recursive }),
  }),
  upload: (connection: TransferConnection, localPath: string, remotePath: string) => apiJSON<{ bytes: number }>('/api/file-transfer/upload', {
    method: 'POST',
    body: JSON.stringify({ connection, local_path: localPath, remote_path: remotePath }),
  }),
  download: (connection: TransferConnection, remotePath: string, localPath: string) => apiJSON<{ bytes: number }>('/api/file-transfer/download', {
    method: 'POST',
    body: JSON.stringify({ connection, remote_path: remotePath, local_path: localPath }),
  }),
};

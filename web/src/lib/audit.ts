import { apiJSON } from './api';

export interface AuditEvent {
  time: string;
  type: string;
  actor: string;
  ip?: string;
  outcome?: string;
  detail?: Record<string, unknown>;
}

export const auditClient = {
  tail: (limit = 200, type?: string) =>
    apiJSON<{ events: AuditEvent[]; more: boolean }>(
      `/api/sys/audit/?limit=${limit}${type ? `&type=${encodeURIComponent(type)}` : ''}`,
    ),
};

export const EVENT_LABELS: Record<string, { label: string; color: string }> = {
  'auth.login.success': { label: '登录成功', color: '#7fb4f7' },
  'auth.login.fail':    { label: '登录失败', color: '#ff6b6b' },
  'auth.logout':        { label: '退出登录', color: '#a8a8a8' },
  'fs.write':           { label: '写文件',   color: '#90ee90' },
  'fs.mkdir':           { label: '建目录',   color: '#90ee90' },
  'fs.delete':          { label: '删除',     color: '#ff8a8a' },
  'fs.move':            { label: '移动',     color: '#ffd966' },
  'fs.upload':          { label: '上传',     color: '#90ee90' },
  'sys.kill':           { label: '杀进程',   color: '#ff6b6b' },
};

export function eventLabel(type: string): { label: string; color: string } {
  return EVENT_LABELS[type] ?? { label: type, color: '#888' };
}

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
  'appstate.put':       { label: '保存应用状态', color: '#90ee90' },
  'appstate.patch':     { label: '更新应用状态', color: '#ffd966' },
  'appstate.delete':    { label: '删除应用状态', color: '#ff8a8a' },
  'trash.move':         { label: '移入回收站', color: '#ffd966' },
  'trash.restore':      { label: '还原回收站', color: '#90ee90' },
  'trash.delete':       { label: '永久删除', color: '#ff8a8a' },
  'trash.empty':        { label: '清空回收站', color: '#ff8a8a' },
  'download.create':    { label: '创建下载', color: '#7fb4f7' },
  'download.cancel':    { label: '取消下载', color: '#ffd966' },
  'download.retry':     { label: '重试下载', color: '#90ee90' },
  'download.delete':    { label: '删除下载记录', color: '#ff8a8a' },
  'apitester.run':      { label: 'API 请求', color: '#7fb4f7' },
  'rss.feed.add':       { label: '添加 RSS 订阅', color: '#90ee90' },
  'rss.feed.delete':    { label: '删除 RSS 订阅', color: '#ff8a8a' },
  'rss.feed.refresh':   { label: '刷新 RSS 订阅', color: '#7fb4f7' },
  'rss.refresh':        { label: '刷新 RSS', color: '#7fb4f7' },
  'rss.article.read':   { label: 'RSS 已读状态', color: '#ffd966' },
  'rss.article.star':   { label: 'RSS 星标状态', color: '#ffd966' },
  'rss.article.read_all': { label: 'RSS 全部已读', color: '#ffd966' },
};

export function eventLabel(type: string): { label: string; color: string } {
  return EVENT_LABELS[type] ?? { label: type, color: '#888' };
}

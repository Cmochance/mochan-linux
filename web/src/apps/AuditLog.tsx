import { useEffect, useMemo, useState } from 'react';
import { RefreshCw, ShieldCheck, ShieldAlert, FilterX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { auditClient, eventLabel, EVENT_LABELS, type AuditEvent } from '@/lib/audit';
import { ApiError } from '@/lib/api';

const POLL_MS = 5000;

export default function AuditLog() {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [more, setMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<string>('all');
  const [auto, setAuto] = useState(true);

  const refresh = async () => {
    setLoading(true);
    try {
      const r = await auditClient.tail(500, filter === 'all' ? undefined : filter);
      setEvents(r.events);
      setMore(r.more);
      setError(null);
    } catch (e) {
      setError(
        e instanceof ApiError ? `请求失败 ${e.status}` : e instanceof Error ? e.message : String(e),
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
    if (!auto) return;
    const id = setInterval(refresh, POLL_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, auto]);

  const stats = useMemo(() => {
    let success = 0, fail = 0;
    for (const e of events) {
      if (e.type === 'auth.login.success') success++;
      else if (e.type === 'auth.login.fail') fail++;
    }
    return { success, fail };
  }, [events]);

  return (
    <div className="flex h-full flex-col" style={{ backgroundColor: 'var(--ink-50)' }}>
      <div
        className="flex items-center gap-2 border-b px-3 py-2"
        style={{ borderColor: 'var(--ink-200)', backgroundColor: 'var(--ink-100)' }}
      >
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="h-8 w-44">
            <SelectValue placeholder="所有事件" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">所有事件</SelectItem>
            {Object.entries(EVENT_LABELS).map(([k, v]) => (
              <SelectItem key={k} value={k}>
                {v.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          size="sm"
          variant={auto ? 'default' : 'outline'}
          onClick={() => setAuto((v) => !v)}
        >
          {auto ? `自动刷新 (${POLL_MS / 1000}s)` : '已暂停'}
        </Button>

        <Button size="icon" variant="ghost" onClick={refresh}>
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </Button>

        {filter !== 'all' && (
          <Button size="sm" variant="ghost" onClick={() => setFilter('all')}>
            <FilterX className="mr-1 h-3.5 w-3.5" />
            清除筛选
          </Button>
        )}

        <div className="ml-auto flex items-center gap-3 text-xs" style={{ color: 'var(--ink-500)' }}>
          <span className="flex items-center gap-1">
            <ShieldCheck className="h-3.5 w-3.5" style={{ color: '#7fb4f7' }} />
            登录成功 {stats.success}
          </span>
          <span className="flex items-center gap-1">
            <ShieldAlert className="h-3.5 w-3.5" style={{ color: '#ff6b6b' }} />
            登录失败 {stats.fail}
          </span>
          <span>共 {events.length} 条{more ? ' (有截断)' : ''}</span>
        </div>
      </div>

      {error && (
        <div className="mx-3 mt-2 rounded border border-red-300 bg-red-50 p-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10" style={{ backgroundColor: 'var(--ink-100)' }}>
            <tr style={{ color: 'var(--ink-500)' }}>
              <th className="w-44 px-3 py-2 text-left font-medium">时间</th>
              <th className="w-28 px-3 py-2 text-left font-medium">事件</th>
              <th className="w-24 px-3 py-2 text-left font-medium">用户</th>
              <th className="w-36 px-3 py-2 text-left font-medium">来源 IP</th>
              <th className="w-20 px-3 py-2 text-left font-medium">结果</th>
              <th className="px-3 py-2 text-left font-medium">详情</th>
            </tr>
          </thead>
          <tbody>
            {events.length === 0 && !loading && (
              <tr>
                <td colSpan={6} className="px-3 py-12 text-center" style={{ color: 'var(--ink-400)' }}>
                  （暂无审计事件）
                </td>
              </tr>
            )}
            {events.map((e, i) => {
              const lab = eventLabel(e.type);
              return (
                <tr key={i} className="hover:bg-[var(--ink-100)]">
                  <td className="px-3 py-1 font-mono text-xs tabular-nums" style={{ color: 'var(--ink-700)' }}>
                    {formatTime(e.time)}
                  </td>
                  <td className="px-3 py-1">
                    <span
                      className="rounded px-1.5 py-0.5 text-xs"
                      style={{ backgroundColor: lab.color + '22', color: lab.color, border: '1px solid ' + lab.color + '55' }}
                    >
                      {lab.label}
                    </span>
                  </td>
                  <td className="px-3 py-1 font-mono text-xs" style={{ color: 'var(--ink-700)' }}>
                    {e.actor || '-'}
                  </td>
                  <td className="px-3 py-1 font-mono text-xs" style={{ color: 'var(--ink-500)' }}>
                    {e.ip || '-'}
                  </td>
                  <td className="px-3 py-1 text-xs">
                    <span
                      style={{
                        color: e.outcome === 'deny' ? '#ff6b6b' : e.outcome === 'error' ? '#f0ad4e' : 'var(--ink-500)',
                      }}
                    >
                      {e.outcome || '-'}
                    </span>
                  </td>
                  <td className="px-3 py-1 font-mono text-xs" style={{ color: 'var(--ink-500)' }}>
                    {e.detail ? renderDetail(e.detail) : ''}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function renderDetail(d: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(d)) {
    if (Array.isArray(v)) {
      parts.push(`${k}=[${v.length} items]`);
    } else if (typeof v === 'object' && v !== null) {
      parts.push(`${k}=${JSON.stringify(v)}`);
    } else {
      parts.push(`${k}=${String(v)}`);
    }
  }
  return parts.join('  ');
}

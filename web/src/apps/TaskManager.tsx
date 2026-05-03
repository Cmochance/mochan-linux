import { useEffect, useMemo, useState } from 'react';
import { Search, RefreshCw, Skull, ChevronUp, ChevronDown } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { sysClient, formatBytes, type ProcessInfo } from '@/lib/sys';
import { ApiError } from '@/lib/api';

const POLL_MS = 3000;

type SortKey = 'cpu_percent' | 'mem_rss' | 'pid' | 'name';

export default function TaskManager() {
  const [procs, setProcs] = useState<ProcessInfo[]>([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('cpu_percent');
  const [sortDesc, setSortDesc] = useState(true);
  const [killTarget, setKillTarget] = useState<ProcessInfo | null>(null);
  const [killSignal, setKillSignal] = useState<'TERM' | 'KILL' | 'INT' | 'HUP'>('TERM');
  const [killing, setKilling] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try {
      const r = await sysClient.processes(500);
      setProcs(r.processes);
      setTotal(r.total);
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
    const id = setInterval(refresh, POLL_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const f = filter.trim().toLowerCase();
    let list = procs;
    if (f) {
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(f) ||
          String(p.pid).includes(f) ||
          p.user.toLowerCase().includes(f) ||
          p.cmdline.toLowerCase().includes(f),
      );
    }
    return [...list].sort((a, b) => {
      const av = a[sortKey] as number | string;
      const bv = b[sortKey] as number | string;
      if (typeof av === 'string') {
        return sortDesc ? String(bv).localeCompare(String(av)) : String(av).localeCompare(String(bv));
      }
      return sortDesc ? Number(bv) - Number(av) : Number(av) - Number(bv);
    });
  }, [procs, filter, sortKey, sortDesc]);

  const onSort = (k: SortKey) => {
    if (sortKey === k) setSortDesc(!sortDesc);
    else {
      setSortKey(k);
      setSortDesc(true);
    }
  };

  const doKill = async () => {
    if (!killTarget) return;
    setKilling(true);
    try {
      await sysClient.kill(killTarget.pid, killSignal);
      setKillTarget(null);
      setTimeout(refresh, 250);
    } catch (e) {
      setError(
        e instanceof ApiError
          ? e.status === 403
            ? '权限不足,需要更高权限才能结束此进程'
            : `请求失败 ${e.status}`
          : e instanceof Error
            ? e.message
            : String(e),
      );
    } finally {
      setKilling(false);
    }
  };

  return (
    <div className="flex h-full flex-col" style={{ backgroundColor: 'var(--ink-50)' }}>
      <div
        className="flex items-center gap-2 border-b px-3 py-2"
        style={{ borderColor: 'var(--ink-200)', backgroundColor: 'var(--ink-100)' }}
      >
        <Search className="h-4 w-4" style={{ color: 'var(--ink-500)' }} />
        <Input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="搜索 PID / 名称 / 用户 / 命令行"
          className="h-8 max-w-md"
        />
        <Button size="icon" variant="ghost" onClick={refresh}>
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </Button>
        <div className="ml-auto text-xs" style={{ color: 'var(--ink-500)' }}>
          {filtered.length} / {total} 个进程
        </div>
      </div>

      {error && (
        <div className="mx-3 mt-2 rounded border border-red-300 bg-red-50 p-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="flex-1 overflow-auto">
        <table className="w-full table-fixed text-sm">
          <thead className="sticky top-0 z-10" style={{ backgroundColor: 'var(--ink-100)' }}>
            <tr style={{ color: 'var(--ink-500)' }}>
              <Th sortKey="pid" current={sortKey} desc={sortDesc} onClick={onSort} className="w-20">
                PID
              </Th>
              <Th sortKey="name" current={sortKey} desc={sortDesc} onClick={onSort} className="w-1/4">
                名称
              </Th>
              <th className="w-24 px-3 py-2 text-left font-medium">用户</th>
              <Th sortKey="cpu_percent" current={sortKey} desc={sortDesc} onClick={onSort} className="w-20 text-right">
                CPU%
              </Th>
              <Th sortKey="mem_rss" current={sortKey} desc={sortDesc} onClick={onSort} className="w-24 text-right">
                内存
              </Th>
              <th className="w-16 px-3 py-2 text-center font-medium">线程</th>
              <th className="w-20 px-3 py-2 text-left font-medium">状态</th>
              <th className="px-3 py-2 text-left font-medium">命令行</th>
              <th className="w-16 px-3 py-2 text-right font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => (
              <tr key={p.pid} className="hover:bg-[var(--ink-100)]">
                <td className="px-3 py-1 tabular-nums" style={{ color: 'var(--ink-700)' }}>{p.pid}</td>
                <td className="truncate px-3 py-1" title={p.name}>
                  {p.name || '(unknown)'}
                </td>
                <td className="px-3 py-1 truncate text-xs" style={{ color: 'var(--ink-500)' }}>
                  {p.user || '-'}
                </td>
                <td className="px-3 py-1 text-right tabular-nums" style={{ color: 'var(--ink-700)' }}>
                  {p.cpu_percent.toFixed(1)}
                </td>
                <td className="px-3 py-1 text-right tabular-nums" style={{ color: 'var(--ink-700)' }}>
                  {formatBytes(p.mem_rss)}
                </td>
                <td className="px-3 py-1 text-center tabular-nums" style={{ color: 'var(--ink-500)' }}>
                  {p.threads}
                </td>
                <td className="px-3 py-1 font-mono text-xs" style={{ color: 'var(--ink-500)' }}>
                  {p.status}
                </td>
                <td className="truncate px-3 py-1 font-mono text-xs" title={p.cmdline} style={{ color: 'var(--ink-500)' }}>
                  {p.cmdline || p.name}
                </td>
                <td className="px-3 py-1 text-right">
                  <button
                    className="rounded p-1 text-red-600 hover:bg-red-100"
                    title="结束进程"
                    onClick={() => {
                      setKillTarget(p);
                      setKillSignal('TERM');
                    }}
                  >
                    <Skull className="h-3.5 w-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={!!killTarget} onOpenChange={(o) => !o && setKillTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>结束进程</DialogTitle>
          </DialogHeader>
          {killTarget && (
            <div className="space-y-3 text-sm">
              <div>
                <span className="text-muted-foreground">PID:</span>{' '}
                <span className="font-mono">{killTarget.pid}</span>{' '}
                <span className="text-muted-foreground">·</span>{' '}
                <span>{killTarget.name}</span>
              </div>
              <div className="font-mono text-xs text-muted-foreground">
                {killTarget.cmdline}
              </div>
              <div>
                <div className="mb-1 text-xs text-muted-foreground">信号</div>
                <div className="flex gap-2">
                  {(['TERM', 'INT', 'HUP', 'KILL'] as const).map((s) => (
                    <Button
                      key={s}
                      size="sm"
                      variant={killSignal === s ? 'default' : 'outline'}
                      onClick={() => setKillSignal(s)}
                    >
                      {s}
                    </Button>
                  ))}
                </div>
                <div className="mt-2 text-xs text-muted-foreground">
                  TERM 优雅退出 · INT 等价 Ctrl+C · HUP 重载 · KILL 强杀(不可被捕获)
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setKillTarget(null)}>
              取消
            </Button>
            <Button onClick={doKill} disabled={killing} className="bg-red-600 hover:bg-red-700">
              {killing ? '执行中…' : `发送 SIG${killSignal}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Th({
  children,
  sortKey,
  current,
  desc,
  onClick,
  className = '',
}: {
  children: React.ReactNode;
  sortKey: SortKey;
  current: SortKey;
  desc: boolean;
  onClick: (k: SortKey) => void;
  className?: string;
}) {
  return (
    <th
      className={`cursor-pointer select-none px-3 py-2 text-left font-medium ${className}`}
      onClick={() => onClick(sortKey)}
    >
      <span className="inline-flex items-center gap-1">
        {children}
        {current === sortKey && (desc ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />)}
      </span>
    </th>
  );
}

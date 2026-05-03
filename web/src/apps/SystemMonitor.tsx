import { useEffect, useState } from 'react';
import { Cpu, MemoryStick, HardDrive, Network, Server, Activity } from 'lucide-react';
import { sysClient, formatBytes, formatUptime, type SysStat } from '@/lib/sys';
import { ApiError } from '@/lib/api';

const POLL_MS = 2000;

export default function SystemMonitor() {
  const [stat, setStat] = useState<SysStat | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [prevNet, setPrevNet] = useState<{ t: number; rx: number; tx: number } | null>(null);
  const [rate, setRate] = useState<{ rx: number; tx: number }>({ rx: 0, tx: 0 });

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const s = await sysClient.stat();
        if (!alive) return;
        setStat(s);
        setError(null);
        setPrevNet((prev) => {
          const now = { t: s.now, rx: s.net.bytes_recv, tx: s.net.bytes_sent };
          if (prev && now.t > prev.t) {
            const dt = now.t - prev.t;
            setRate({ rx: (now.rx - prev.rx) / dt, tx: (now.tx - prev.tx) / dt });
          }
          return now;
        });
      } catch (e) {
        if (!alive) return;
        setError(
          e instanceof ApiError ? `请求失败 ${e.status}` : e instanceof Error ? e.message : String(e),
        );
      }
    };
    void tick();
    const id = setInterval(tick, POLL_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  if (error && !stat) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-red-600">{error}</div>
    );
  }
  if (!stat) {
    return (
      <div className="flex h-full items-center justify-center text-sm" style={{ color: 'var(--ink-400)' }}>
        加载中…
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto p-4" style={{ backgroundColor: 'var(--ink-50)' }}>
      <div className="grid gap-4 md:grid-cols-2">
        <Card title="主机" icon={<Server className="h-4 w-4" />}>
          <KV k="主机名" v={stat.hostname} />
          <KV k="操作系统" v={stat.os} />
          <KV k="内核" v={stat.kernel} />
          <KV k="架构" v={stat.arch} />
          <KV k="已运行" v={formatUptime(stat.uptime)} />
          <KV k="负载" v={`${stat.load_1.toFixed(2)} / ${stat.load_5.toFixed(2)} / ${stat.load_15.toFixed(2)}`} />
        </Card>

        <Card title={`CPU · ${stat.cpu_count} 核`} icon={<Cpu className="h-4 w-4" />}>
          <Bar label="总占用" value={stat.cpu_percent} max={100} />
          <div className="mt-2 grid grid-cols-2 gap-1">
            {stat.cpu_per_core.map((p, i) => (
              <Bar key={i} label={`#${i}`} value={p} max={100} compact />
            ))}
          </div>
        </Card>

        <Card title="内存" icon={<MemoryStick className="h-4 w-4" />}>
          <Bar
            label={`${formatBytes(stat.mem_used)} / ${formatBytes(stat.mem_total)}`}
            value={stat.mem_percent}
            max={100}
          />
          {stat.swap_total > 0 && (
            <div className="mt-2">
              <Bar
                label={`Swap ${formatBytes(stat.swap_used)} / ${formatBytes(stat.swap_total)}`}
                value={stat.swap_total > 0 ? (stat.swap_used / stat.swap_total) * 100 : 0}
                max={100}
              />
            </div>
          )}
        </Card>

        <Card title="网络" icon={<Network className="h-4 w-4" />}>
          <KV k="↓ 接收速率" v={`${formatBytes(rate.rx)}/s`} />
          <KV k="↑ 发送速率" v={`${formatBytes(rate.tx)}/s`} />
          <KV k="累计接收" v={formatBytes(stat.net.bytes_recv)} />
          <KV k="累计发送" v={formatBytes(stat.net.bytes_sent)} />
        </Card>

        <Card title="磁盘" icon={<HardDrive className="h-4 w-4" />} className="md:col-span-2">
          {stat.disks.length === 0 && <div className="text-sm" style={{ color: 'var(--ink-400)' }}>无可用挂载点</div>}
          {stat.disks.map((d) => (
            <div key={d.mount} className="mb-2 last:mb-0">
              <div className="mb-1 flex items-center justify-between text-xs" style={{ color: 'var(--ink-500)' }}>
                <span className="font-mono">
                  {d.mount} <span className="opacity-60">({d.fstype})</span>
                </span>
                <span className="tabular-nums">
                  {formatBytes(d.used)} / {formatBytes(d.total)} · {d.percent.toFixed(1)}%
                </span>
              </div>
              <Bar value={d.percent} max={100} />
            </div>
          ))}
        </Card>
      </div>

      <div className="mt-4 flex items-center justify-end gap-2 text-xs" style={{ color: 'var(--ink-400)' }}>
        <Activity className="h-3 w-3" />
        每 {POLL_MS / 1000}s 自动刷新
      </div>
    </div>
  );
}

function Card({
  title,
  icon,
  children,
  className = '',
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-lg border p-3 ${className}`}
      style={{ borderColor: 'var(--ink-200)', backgroundColor: 'var(--ink-100)' }}
    >
      <div
        className="mb-2 flex items-center gap-2 text-sm font-medium"
        style={{ color: 'var(--ink-700)' }}
      >
        {icon}
        <span>{title}</span>
      </div>
      <div>{children}</div>
    </div>
  );
}

function KV({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between py-0.5 text-sm">
      <span style={{ color: 'var(--ink-500)' }}>{k}</span>
      <span className="font-mono tabular-nums" style={{ color: 'var(--ink-800)' }}>
        {v}
      </span>
    </div>
  );
}

function Bar({
  label,
  value,
  max,
  compact = false,
}: {
  label?: string;
  value: number;
  max: number;
  compact?: boolean;
}) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  const color = pct > 85 ? '#ff6b6b' : pct > 60 ? '#f0ad4e' : '#7fb4f7';
  return (
    <div>
      {label && (
        <div
          className={`mb-0.5 flex justify-between ${compact ? 'text-[10px]' : 'text-xs'}`}
          style={{ color: 'var(--ink-500)' }}
        >
          <span>{label}</span>
          <span className="tabular-nums">{pct.toFixed(1)}%</span>
        </div>
      )}
      <div
        className="overflow-hidden rounded"
        style={{ backgroundColor: 'var(--ink-200)', height: compact ? 4 : 8 }}
      >
        <div
          className="h-full transition-[width] duration-300"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

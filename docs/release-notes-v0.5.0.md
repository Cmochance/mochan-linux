# mochan-linux v0.5.0

> 本版本主线: **加上安全审计**。任何敏感操作都会落到一份只追加的 JSONL 日志里——登录成功、登录失败、退出登录、文件写 / 删 / 移 / 上传、进程被杀,带真实客户端 IP(透过 Cloudflare 与反向代理的 `X-Forwarded-For` / `CF-Connecting-IP`)。新增 `审计日志` 桌面应用,可按事件类型筛选,5 秒自动刷新,顶栏统计登录成功 / 失败次数。

## 中文

### 后端 `internal/audit`

- **JSONL 写入**: 每行一个 `Event`,字段为 `time / type / actor / ip / outcome / detail`。文件位于 `<DataDir>/audit.log`(默认 `/var/lib/mochan/audit.log`),权限 0640,只追加。
- **轮转**: 单文件超过 10 MiB 时改名为 `.1` 重开;最多保留一份历史,旧的 `.1` 会被覆盖。单用户低频场景下不需要 logrotate 那一套。
- **静默容错**: `Logger.Log` 是 nil-safe,审计写入失败永远不会中断底层操作(登录、文件写等)。
- **真客户端 IP**: `audit.ClientIP(r)` 按优先级取 `CF-Connecting-IP` → `X-Real-IP` → `X-Forwarded-For`(取首段) → `RemoteAddr`。在 `linux.mochance.xyz`(CF orange-cloud → NPM → mochan)上确认能拿到原始访问者 IP。

### 已捕获事件

| 类型 | 触发位置 | detail 字段 |
|---|---|---|
| `auth.login.success` | `/api/auth/login` 验证通过 | (无,actor 即用户名) |
| `auth.login.fail` | `/api/auth/login` 401 前 | (无,outcome=`deny`) |
| `auth.logout` | `/api/auth/logout` | (无) |
| `fs.write` | `/api/fs/write` 成功后 | `path`, `size` |
| `fs.mkdir` | `/api/fs/mkdir` 成功后 | `path`, `parents` |
| `fs.delete` | `/api/fs/?path=...` DELETE 成功后 | `path`, `recursive` |
| `fs.move` | `/api/fs/move` 成功后 | `from`, `to` |
| `fs.upload` | `/api/fs/upload` 成功后 | `dir`, `files: [{name, size}]` |
| `sys.kill` | `/api/sys/kill` 成功发信号后 | `pid`, `signal` |

故意**不**记录的事件:`fs.list` / `fs.read` / `fs.stat` / `fs.download` / `sys.stat` / `sys.processes` —— 这些是高频读操作,记进审计日志反而把真正可疑的事件埋掉。

### 查询接口

- `GET /api/sys/audit/?limit=200&type=auth.login.fail` —— 返回最近 N 条事件,按时间倒序。`type` 可选,精确匹配。
- 透明合并 `audit.log` 与 `audit.log.1` 两个文件,所以即使最近发生过轮转也能回溯。
- 单次最多 5000 条;有截断时返回 `more: true`。

### 前端 `apps/AuditLog.tsx`

- 注册在"系统工具"分类,图标 `ScrollText`。
- 顶栏:事件类型下拉(`所有事件` / 9 种事件类型)、自动刷新开关(默认开,5 秒一次)、手动刷新按钮、清除筛选按钮。
- 表格:时间(本地时区) / 事件(带颜色的 chip) / 用户 / IP / 结果(`ok` 灰,`deny` 红,`error` 橙) / 详情(把 `detail` 按 `key=value` 拍平)。
- 顶栏右侧实时统计当前视图里登录成功 / 失败次数,方便一眼看出爆破。

### 端到端验证

部署到 `https://linux.mochance.xyz` 后用 `/tmp/mochan-deploy/credentials.txt` 跑了一次完整流程:

```text
auth.login.fail   admin   38.150.4.233   deny   (wrong password)
auth.login.success admin  38.150.4.233   ok
fs.mkdir          admin   38.150.4.233   ok     {path:"/tmp/audit-test", parents:false}
fs.write          admin   38.150.4.233   ok     {path:"/tmp/audit-test/x.txt", size:2}
fs.delete         admin   38.150.4.233   ok     {path:"/tmp/audit-test", recursive:true}
auth.logout       admin   38.150.4.233   ok
auth.login.success admin  38.150.4.233   ok     (re-login)
```

### 仓库整理(同版本附赠)

- 删掉了 v0.1.0 → v0.4.0 三条 commit 里残留的 `Co-Authored-By: Claude` trailer,`https://github.com/Cmochance/mochan-linux/graphs/contributors` 现在只剩 Cmochance。

### 已知未做

- 暂未提供"导出审计日志为 CSV / 下载原始 JSONL 文件"的按钮 —— 现阶段直接 `cat /var/lib/mochan/audit.log` 或走 `/api/sys/audit/?limit=5000` 拿就可以。
- 没有"按 IP 自动锁定"逻辑(类似 fail2ban) —— 仍然推荐在反向代理或操作系统层做。审计日志的目的是**事后可追溯**,不是 IPS。
- 终端会话结束 / WebSocket 断开尚未审计;`/ws/pty` 内部的 shell 命令也不会被审计(终端字面上是"shell 直连",审计意义有限,且记录所有键盘输入会冲掉真正的安全事件)。

## English

### Backend `internal/audit`

- JSONL append-only writer at `<DataDir>/audit.log` (default `/var/lib/mochan/audit.log`), perms `0640`. Each row carries `time`, `type`, `actor`, `ip`, `outcome`, `detail`.
- Rotates to `.1` when the active file exceeds 10 MiB; we keep one rotation. Adequate for single-user, low-volume audit; no logrotate dependency.
- `Logger.Log` is nil-safe — an audit-write failure never breaks the underlying operation (login, file write, etc.).
- Real client IP: `audit.ClientIP(r)` prefers `CF-Connecting-IP` → `X-Real-IP` → first hop of `X-Forwarded-For` → `RemoteAddr`. Verified end-to-end on the `linux.mochance.xyz` deployment (Cloudflare → NPM → mochan).

### Captured events

`auth.login.success`, `auth.login.fail`, `auth.logout`, `fs.write`, `fs.mkdir`, `fs.delete`, `fs.move`, `fs.upload`, `sys.kill`. Each event records actor, IP, outcome (`ok` / `deny` / `error`) and event-specific detail (path, size, recursive, signal, etc.).

Deliberately **not** recorded: `fs.list` / `fs.read` / `fs.stat` / `fs.download` / `sys.stat` / `sys.processes`. High-frequency reads drown out the actually suspicious events.

### Query endpoint

- `GET /api/sys/audit/?limit=200&type=auth.login.fail` — newest-first, transparently merges `audit.log` and `audit.log.1` so a recent rotation does not lose events.
- Single response max 5000 rows; `more: true` indicates truncation.

### Frontend `apps/AuditLog.tsx`

Registered as "审计日志" / "Audit Log" under system tools (`ScrollText` icon). Type-filter dropdown, 5 s auto-refresh toggle, manual refresh, clear-filter. Table renders time / typed-and-colored badge / actor / IP / outcome / flattened detail. Toolbar shows live login-success and login-fail counts.

### Repo housekeeping (same release)

- Stripped `Co-Authored-By: Claude` trailer from the v0.1.0 → v0.4.0 commits. The contributor graph now correctly shows only Cmochance.

### Known gaps

- No CSV / raw-JSONL export button yet — the file at `/var/lib/mochan/audit.log` is plain JSONL, and `/api/sys/audit/?limit=5000` already returns the same content.
- No IP-based auto-blocking (no fail2ban-equivalent). Audit is for forensic trail, not IPS — keep IP throttling at the reverse-proxy / OS layer.
- PTY sessions are not audited at the keystroke level — the keyboard stream goes straight into a real shell, and recording every keystroke would drown the security signal we actually care about.

## Verify and install

```bash
curl -LO https://github.com/Cmochance/mochan-linux/releases/download/v0.5.0/mochan-linux-amd64.tar.gz
curl -LO https://github.com/Cmochance/mochan-linux/releases/download/v0.5.0/mochan-linux-amd64.tar.gz.sha256
sha256sum -c mochan-linux-amd64.tar.gz.sha256
tar xzf mochan-linux-amd64.tar.gz
```

The release was built by GitHub Actions (`.github/workflows/release.yml`) on tag push; both `linux/amd64` and `linux/arm64` artifacts are signed by their per-file `.sha256`.

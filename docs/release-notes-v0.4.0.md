# mochan-linux v0.4.0

> 本版本主线：**首次公开,把"浏览器即 Linux 桌面"从概念做到端到端可用**。一周内连续推完 Phase 0–3,单 Go 二进制(13 MB,前端 `embed.FS` 注入)就能部署一个让你从任何设备打开 `https://your.domain` 直接拿到真终端、真文件系统、真进程管理、真系统监控的水墨风工作站,专门用来测试自己开发的 Linux 应用。

## 中文

### 一、登录与认证 (v0.1.0 → v0.1.1)

- **登录门**: bcrypt 密码 + HS256 JWT,Token 写到 `HttpOnly Secure SameSite=Lax` cookie。前端 `AuthGate` 启动时调 `/api/me`,未登录显示水墨风登录屏,**未通过认证看不到桌面任何内容**。
- **退出登录**: StatusBar 右上角用户下拉,点击调 `/api/auth/logout` 清 cookie,立刻回到登录屏。
- **CLI 子命令**: `mochan hash-password` 从 stdin 读密码出 bcrypt 哈希,`mochan gen-secret` 出 48 字节十六进制 JWT 密钥,避免明文密码进 shell history。
- **Phase 0 安全修复**: 早期前端的桌面在未认证时直接渲染(后端鉴权对,前端没 gate);这一版补齐前端 gate,把"看不到 UI 就是没访问权"做成硬保证。

### 二、真终端 (v0.2.0)

- **后端 `/ws/pty`**: 基于 `coder/websocket` + `creack/pty`,通过 cookie 或 `?token=` 传 JWT,握手时验证后调 `pty.StartWithSize` 起 `bash -l`。运行身份是服务用户(`mochan`),有 NOPASSWD sudo 时浏览器里直接 `sudo apt install …` 测自己应用,无需 SSH。
- **前端 `apps/Terminal.tsx`**: `@xterm/xterm` v5 + `xterm-addon-fit`,`TERM=xterm-256color` + `COLORTERM=truecolor` + `LANG=C.UTF-8`,`htop` / `vim` / `tmux` / `lazygit` 全跑,窗口 resize 通过 JSON 控制帧 `{type:"resize", cols, rows}` 发回服务器走 `TIOCSWINSZ`。
- **配色**: 12 位 ANSI 调色板按水墨主题重调,不抢桌面注意力。

### 三、真文件系统 (v0.3.0)

- **后端 `/api/fs/*`**: `home` / `list` / `read` / `write` / `mkdir` / `delete` / `move` / `upload` / `download` / `stat`。读 8 MiB 上限、写 32 MiB、上传 256 MiB;返回真实 OS 错误(403 / 404 / 409 / 413)。
- **不做 chroot**: 整个主机文件系统可见,权限完全由 OS 决定。`mochan` 用户访问 `/root` → 403,访问 `/etc/hostname` → 200 文本,访问自己 home → 全权限。
- **前端 `apps/FileManager.tsx`**: 替换之前的 20 行占位 stub。顶栏路径输入框 + 上一级 / 主目录 / 刷新;左侧栏快捷入口(主目录 / / / `/etc` / `/var/log` / `/tmp`);表格视图带图标 / 大小 / 修改时间 / 权限串 / 操作(下载 / 重命名 / 删除);软链显示 `→ target`;双击目录进入,双击文本进编辑器,双击非文本走下载。

### 四、代码编辑器、系统监控、进程管理 (v0.4.0)

- **CodeMirror 6 编辑器** (`components/CodeEditor.tsx`): 替换 v0.3.0 的 textarea。按文件扩展名自动识别 JS / TS / JSON / Python / HTML / CSS / Markdown / YAML 加载语言扩展,`one-dark` 主题,行号 / 折叠 / 自动补全 / 搜索全开。FileManager 双击文本文件直接进。
- **`/api/sys/stat`**: 基于 `gopsutil/v4`,单次请求拿主机名 / 内核 / OS / 架构 / uptime / 1-5-15 负载 / CPU 总占用 + 每核占用 / 内存 / Swap / 所有非 pseudo 挂载点 / 网络累积字节。
- **`apps/SystemMonitor.tsx`**: 每 2 秒轮询,进度条颜色按占用阈值变化(≤60 % 蓝、60-85 % 橙、>85 % 红),网速通过两次采样差分本地计算。
- **`/api/sys/processes` + `/api/sys/kill`**: 进程列表带 PID / PPID / 用户 / 状态 / CPU% / RSS / 线程 / cmdline;kill 端点接受 `TERM` / `INT` / `HUP` / `KILL`,**拒绝 pid ≤ 1**,权限不足返回 403。
- **`apps/TaskManager.tsx`**: 替换之前的伪进程列表。搜索 PID / 名称 / 用户 / cmdline;按 CPU / RSS / PID / 名称双向排序;杀进程对话框含信号选择器和说明(TERM 优雅 / INT 等价 Ctrl+C / HUP 重载 / KILL 强杀)。

### 五、部署与发布

- **单二进制**: 前端 `npm run build` 后 `cp -r web/dist server/internal/static/dist`,再 `go build` 通过 `embed.FS` 注入。运行时只需要二进制 + `/etc/mochan/config.env`,**无 Node 运行时、无 npm、无依赖目录**。
- **systemd unit**: `After=docker.service`(因为绑 Docker bridge IP `172.17.0.1:38421`,对应反向代理在容器里的常见情况) + `EnvironmentFile=/etc/mochan/config.env`,崩溃自动 `Restart=on-failure`。
- **install.sh**: 交互式装服务用户(默认 `mochan`)+ NOPASSWD sudo + 二进制 + systemd unit + 启动 + curl `/healthz` 自检,幂等可重跑。
- **Nginx Proxy Manager 集成**: 完整字段说明在 [`deploy/npm-proxy-host.md`](../deploy/npm-proxy-host.md)。**已在 NPM Advanced 框踩过坑**——文档明确告知只能贴完整 nginx 指令(`proxy_read_timeout 86400s;` 不能写 `proxy_*_timeout`),否则 NPM 会保存原文导致 nginx -t 失败 + SSL block 不生成 → Cloudflare 525 SSL handshake failed。
- **多架构 release**: `.github/workflows/release.yml` 监听 `v*` tag,并行构建 `linux/amd64` + `linux/arm64`,各自打 tar.gz + sha256,上传到 Release。本版本预构建产物含 `mochan-linux-amd64.tar.gz`、`mochan-linux-arm64.tar.gz`、`SHA256SUMS`。

### 六、生产部署示范

- 已在 `https://linux.mochance.xyz` 跑通,运行宿主: DigitalOcean Droplet (Ubuntu 24.04.3, 2 vCPU, 4 GB)。
- 反向代理: Nginx Proxy Manager 容器 + Cloudflare orange-cloud(CF SSL/TLS = Full(strict))。
- 端口分配: mochan 绑 `172.17.0.1:38421`(Docker bridge IP,私网,外网不可达),NPM 反代 `linux.mochance.xyz` → `http://172.17.0.1:38421`,WebSockets 升级开启。

### 已知未做

- 桌面应用之间的 inter-app 调用(FileManager 双击 .md 跳到 MarkdownEditor 等)尚未串起来,每个 app 独立运行。
- 多用户与会话隔离(每用户独立容器、配额)目前明确不在 scope 内——本项目就是单用户。
- 文件管理器未做拖拽多选 / 右键菜单。
- 终端会话不支持断线重连(暂时是切断重起)。

## English

> Headline of this release: **first public cut, "browser as Linux desktop" taken from concept to end-to-end usable**. Phases 0–3 shipped in one week. A single Go binary (13 MB, frontend embedded via `embed.FS`) is enough to deploy a workstation reachable as `https://your.domain` from any device, giving you a real terminal, real filesystem, real process manager, and real system monitor — purpose-built for testing your own Linux applications.

### 1. Auth and login (v0.1.0 → v0.1.1)

- bcrypt password + HS256 JWT in an `HttpOnly Secure SameSite=Lax` cookie. The React `AuthGate` calls `/api/me` on mount; on 401 it shows an ink-style login screen, and **the desktop renders nothing until login succeeds**.
- StatusBar user dropdown with "Log out" calls `/api/auth/logout`, clears the cookie, and returns to the login screen.
- CLI: `mochan hash-password` reads from stdin and prints a bcrypt hash; `mochan gen-secret` prints a 48-byte hex JWT key. No plaintext passwords land in shell history.
- Phase 0 frontend gap: an earlier build rendered the desktop with no auth check (the backend was already gated, but the frontend was not). Fixed in v0.1.1 — no UI without a verified token.

### 2. Real terminal (v0.2.0)

- Backend `/ws/pty` over `coder/websocket` + `creack/pty`, JWT via cookie or `?token=`. Spawns `bash -l` as the service user (`mochan`); with NOPASSWD sudo configured, you can `sudo apt install …` directly from the browser to test your own apps without SSH.
- Frontend `apps/Terminal.tsx`: `@xterm/xterm` + fit addon, `TERM=xterm-256color`, `COLORTERM=truecolor`, `LANG=C.UTF-8`. `htop` / `vim` / `tmux` / `lazygit` all work. Window resize sends `{type:"resize", cols, rows}` JSON control frames; the server applies `TIOCSWINSZ`.
- 12-color ANSI palette retuned to match the ink theme.

### 3. Real filesystem (v0.3.0)

- Backend `/api/fs/*`: `home`, `list`, `read`, `write`, `mkdir`, `delete`, `move`, `upload`, `download`, `stat`. Read cap 8 MiB, write 32 MiB, upload 256 MiB. Errors surface as real OS conditions (403 / 404 / 409 / 413).
- **No chroot.** The whole host FS is reachable; the OS enforces the boundary. `mochan` reading `/root` → 403; reading `/etc/hostname` → 200 text; reading its own home → full access.
- Frontend `apps/FileManager.tsx` replaces the 20-line placeholder. Path input + up / home / refresh in the toolbar; sidebar shortcuts (Home, /, /etc, /var/log, /tmp); table view with icon / size / mtime / permission string / actions (download / rename / delete); symlinks shown with `→ target`; double-click a folder to descend, a text file to open the editor, a binary to download.

### 4. Editor, system monitor, process manager (v0.4.0)

- CodeMirror 6 editor (`components/CodeEditor.tsx`) replacing the v0.3.0 textarea. JS / TS / JSON / Python / HTML / CSS / Markdown / YAML language modes auto-loaded by extension, `one-dark` theme, line numbers / folding / autocompletion / search all on. FileManager opens text files into it.
- `/api/sys/stat` backed by `gopsutil/v4`. One request returns hostname / kernel / OS / arch / uptime / 1-5-15 load / aggregate and per-core CPU / memory / swap / every non-pseudo mountpoint / cumulative network bytes.
- `apps/SystemMonitor.tsx` polls every 2 s; bar color shifts by threshold (≤60 % blue, 60–85 % orange, >85 % red). Network rate is computed locally from two consecutive samples.
- `/api/sys/processes` + `/api/sys/kill`. Process list includes PID / PPID / user / status / CPU% / RSS / threads / cmdline. The kill endpoint accepts `TERM` / `INT` / `HUP` / `KILL`, **refuses pid ≤ 1**, and surfaces permission errors as 403.
- `apps/TaskManager.tsx` replaces the previous fake process list. Search across PID / name / user / cmdline; sort by CPU / RSS / PID / name; kill dialog with signal selector and short explanations (TERM graceful, INT = Ctrl+C, HUP reload, KILL non-catchable).

### 5. Deploy and release

- **Single binary.** `npm run build` → `cp -r web/dist server/internal/static/dist` → `go build` injects the frontend through `embed.FS`. The runtime needs only the binary plus `/etc/mochan/config.env`. No Node runtime, no npm, no `node_modules`.
- **systemd unit** with `After=docker.service` (because the typical setup binds `172.17.0.1:38421` to be reachable from a containerized reverse proxy) and `EnvironmentFile=/etc/mochan/config.env`. `Restart=on-failure` for crash recovery.
- **install.sh**: idempotent — creates the service user (default `mochan`), grants NOPASSWD sudo, installs the binary, writes the systemd unit, starts the service, curls `/healthz`.
- **Nginx Proxy Manager**: full field-by-field setup in [`deploy/npm-proxy-host.md`](../deploy/npm-proxy-host.md). The doc explicitly warns that the Advanced Config field is pasted verbatim — you must use complete directives like `proxy_read_timeout 86400s;`, not abbreviated patterns like `proxy_*_timeout`, or NPM saves the bad text and `nginx -t` fails silently, the `listen 443 ssl` block is suppressed, and Cloudflare returns "525 SSL handshake failed".
- **Multi-arch release.** `.github/workflows/release.yml` triggers on `v*` tags, builds `linux/amd64` and `linux/arm64` in parallel, packages each as a `.tar.gz` with `sha256`, and uploads them to the GitHub Release.

### 6. Reference deployment

Production instance: `https://linux.mochance.xyz`. Host: DigitalOcean Droplet (Ubuntu 24.04.3, 2 vCPU, 4 GB). Reverse proxy: containerized Nginx Proxy Manager. CDN: Cloudflare proxy (orange cloud) with SSL/TLS = Full (strict). mochan binds `172.17.0.1:38421` (Docker bridge IP, never reachable externally), NPM forwards with WebSocket upgrade enabled.

### Known gaps

- Inter-app routing (e.g. double-clicking an `.md` in FileManager to launch MarkdownEditor) is not wired yet — apps are independent windows.
- Multi-user is intentionally out of scope. This is single-user by design.
- File manager has no drag-multi-select or right-click context menu yet.
- Terminal sessions don't survive reconnect — they simply restart.

## Verify and install

Each artifact ships with its sha256 in `SHA256SUMS`:

```bash
curl -LO https://github.com/Cmochance/mochan-linux/releases/download/v0.4.0/mochan-linux-amd64.tar.gz
curl -LO https://github.com/Cmochance/mochan-linux/releases/download/v0.4.0/SHA256SUMS
sha256sum -c <(grep mochan-linux-amd64.tar.gz SHA256SUMS)
tar xzf mochan-linux-amd64.tar.gz
```

Full deployment steps in [README.md](https://github.com/Cmochance/mochan-linux#基本用法). **Read the security section before exposing this on a public domain.**

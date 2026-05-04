# mochan-linux v1.0.0

> 本版本主线: **首个稳定版本**。从 v0.1.0 到 v0.9.0 一周内连续推完十一个 Stage,把"浏览器即 Linux 桌面"这件事做到了从概念到端到端可用——单 Go 二进制部署、登录门、真终端、真文件、真进程、真审计、真壁纸、可在手机上用、断网自动重连。这一版**不引入新代码**,只是给整个旅程打个稳定的 1.0 标记,标志着 API 从此进入 SemVer 语义,后续 `v1.x.0` 加功能、`v1.0.x` 修问题、`v2.0.0` 是有意 break 才会发。

## 中文

### v1.0.0 里都有什么

| 层 | 能力 |
|---|---|
| 鉴权 | bcrypt + JWT in HttpOnly cookie,登录门 + 退出登录;登录成功 / 失败 / 退出全部进审计 |
| 终端 | WebSocket ↔ creack/pty 桥;前端 xterm.js;持久命名 session + 256 KiB 环形缓冲 + 抖动指数退避自动重连;5 分钟无客户端自动回收 |
| 文件 | `/api/fs/*` 全套 REST(list/read/write/mkdir/move/delete/upload/download/stat),以服务用户身份运行,不做 chroot,权限交给内核 |
| 编辑器 | CodeMirror 6,扩展名识别 JS/TS/JSON/Python/Go/HTML/CSS/Markdown/YAML 等十几种语言 |
| 系统 | `/api/sys/{stat,processes,kill}` 由 gopsutil 驱动,SystemMonitor 与 TaskManager 实时跑 |
| 审计 | JSONL 追加日志 `<DataDir>/audit.log`,10 MiB 轮转,AuditLog 应用类型筛选 + 自动刷新 + 计数 |
| 设置 | 服务端持久化主题 / 语言 / 壁纸,壁纸桶 `<DataDir>/wallpapers/` 可上传可删除 |
| App 互通 | FileManager 双击按扩展名分派到 MarkdownEditor / ImageViewer / TextEditor,加载与保存都走 `/api/fs` |
| 移动端 | < 768 px 自动窗口全屏化,拖动调整禁用,标题栏按钮放大到 22 px 触屏可点,Dock 横滑 |
| 分发 | 单二进制(前端 `embed.FS` 注入),多架构 GitHub Actions release(amd64 + arm64 + 汇总 SHA256SUMS) |

### 故意不做的

- **多用户**: 单用户系统,设计上就是给一个人用的工作站。要多用户请走每用户一个独立部署。
- **UI 改端口 / 改密码**: 这两个改动需要重启 systemd 服务并联动反向代理,不应该是 in-app 一键。仍然走 `/etc/mochan/config.env` + `systemctl restart mochan`。
- **2FA / OAuth / SSO**: 仍是单密码。如果暴露公网必须配 fail2ban 在反向代理层。
- **内置 IPS / 限流**: 审计日志只是事后取证,主动防护交给反向代理层。
- **PTY 跨进程持久化**: 服务进程崩了 PTY 全没。要扛进程崩用 tmux,这是一句话能解的事所以本项目不投入 disk-backed session。
- **PWA / 离线模式**: 没 service worker 也不可加到主屏。

### 版本策略

- `v1.x.0`(minor): 向后兼容的新功能。
- `v1.0.x`(patch): bug fix / 安全修复,无 API 变更。
- `v2.0.0`: 仅在主动决定 break 时(例如转向多用户),目前**不在路线图上**。

### 旅程回顾

| Stage | Tag | 一句话 |
|---|---|---|
| 0 | v0.1.0 | 脚手架: Go + chi + JWT + embed.FS,systemd + NPM 部署管线 |
| 1 | v0.1.1 | 前端 AuthGate 登录门 + 后端 `/api/auth/logout` |
| 2 | v0.2.0 | `/ws/pty` 真终端,xterm.js + creack/pty + bash -l |
| 3 | v0.3.0 | `/api/fs/*` 真文件系统 + FileManager 重写 |
| 4 | v0.4.0 | 系统监控 + 进程管理 + CodeMirror 编辑器 + StatusBar 退出登录 + 多架构 release CI |
| 5 | (并入 v0.4.0) | 公开仓库 `Cmochance/mochan-linux`,首次 GitHub release |
| 6 | v0.5.0 | `/api/sys/audit/` 安全审计日志 + AuditLog 应用 |
| 7 | v0.6.0 | FileManager 双击分派到 ImageViewer / MarkdownEditor / TextEditor |
| 8 | v0.7.0 | 移动端可用性(窗口全屏化 + Dock 横滑) |
| 9 | v0.8.0 | PTY 会话剥离 WebSocket 生命周期,自动重连 |
| 10 | v0.9.0 | Settings 真接入,服务端持久化主题 / 语言 / 壁纸 + 壁纸桶 |
| 11 | **v1.0.0** | 稳定版标记 |

总计: 服务端 ~3500 行 Go,前端 ~5000 行 TS/TSX(不含 50 多个原生应用 stub),最终二进制 14 MB(linux/amd64 含全部前端)。

### 反向代理须知

- 必须开 WebSocket 升级。
- Cloudflare orange-cloud 模式下 SSL/TLS 必须 Full 或 Full(strict)。
- NPM 在 Docker 容器里时,后端必须绑 `172.17.0.1:38421`(或 `0.0.0.0` + 防火墙)。NPM Advanced 字段只能贴完整指令(如 `proxy_read_timeout 86400s;`),不要贴缩写模式。

### 部署

```bash
# 在 VPS 上
curl -L https://github.com/Cmochance/mochan-linux/releases/download/v1.0.0/mochan-linux-amd64.tar.gz | tar xz
sudo install -m 0755 mochan-linux-amd64 /usr/local/bin/mochan

# 设密码
sudo /usr/local/bin/mochan hash-password   # 输入密码,得到 bcrypt 哈希

# 配 /etc/mochan/config.env(参照仓库 .env.example)
# 装 systemd unit(参照 deploy/mochan.service)
sudo systemctl enable --now mochan

# 在反向代理后面绑 https://your.domain
```

完整步骤见 [README.md](https://github.com/Cmochance/mochan-linux#基本用法) 与 [`deploy/`](https://github.com/Cmochance/mochan-linux/tree/main/deploy)。

## English

### What's in v1.0.0

| Layer | Capability |
|---|---|
| Auth | bcrypt + JWT in HttpOnly cookie, login gate, logout endpoint, all auth events captured in the audit log |
| Terminal | WebSocket ↔ creack/pty bridge with xterm.js front-end; named persistent sessions backed by a 256 KiB ring buffer; auto-reconnect with jittered exponential backoff; idle reaper at 5 min |
| Filesystem | `/api/fs/*` REST suite running as the OS user, no chroot — perms enforced by the host kernel |
| Editor | CodeMirror 6, language detection by extension across a dozen+ languages |
| System | `/api/sys/{stat,processes,kill}` powered by gopsutil; SystemMonitor and TaskManager apps |
| Audit | JSONL append-only log at `<DataDir>/audit.log`, 10 MiB rotation, AuditLog viewer with type filter and rolling counters |
| Settings | Server-side persistence of theme / language / wallpaper; user-uploaded wallpaper bucket on disk |
| Inter-app | FileManager double-click routes by extension to MarkdownEditor / ImageViewer / TextEditor; load and save through `/api/fs` |
| Mobile | <768 px viewport: every window is fullscreen between StatusBar and Dock, drag/resize disabled, traffic-light buttons enlarged, Dock scrolls horizontally |
| Distribution | Single binary with `embed.FS`-injected frontend; multi-arch GitHub Actions releases (amd64 + arm64 + consolidated SHA256SUMS) |

### Intentionally out of scope

- Multi-user (this is a single-user workstation by design).
- In-UI port / password edit (those need a service restart, wrong layer).
- 2FA / OAuth / SSO.
- Built-in IPS / rate limiting (use the reverse proxy).
- Cross-restart PTY persistence (use tmux).
- PWA / offline.

### Versioning policy

`v1.x.0` adds features; `v1.0.x` ships fixes; `v2.0.0` would only happen on an intentional break, none planned.

### Install

```bash
curl -L https://github.com/Cmochance/mochan-linux/releases/download/v1.0.0/mochan-linux-amd64.tar.gz | tar xz
sudo install -m 0755 mochan-linux-amd64 /usr/local/bin/mochan
sudo /usr/local/bin/mochan hash-password   # type your password, copy the bcrypt hash
# Fill in /etc/mochan/config.env (see .env.example), install deploy/mochan.service
sudo systemctl enable --now mochan
# Front it with a reverse proxy that does TLS + WebSocket upgrade
```

See [README.md](https://github.com/Cmochance/mochan-linux#基本用法) and [`deploy/`](https://github.com/Cmochance/mochan-linux/tree/main/deploy) for the full setup.

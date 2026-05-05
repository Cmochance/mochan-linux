# mochan-linux

[![GitHub stars](https://img.shields.io/github/stars/Cmochance/mochan-linux?style=social)](https://github.com/Cmochance/mochan-linux/stargazers)
[![License](https://img.shields.io/github/license/Cmochance/mochan-linux)](LICENSE)
[![Go](https://img.shields.io/badge/Go-1.24%2B-blue?logo=go)](https://go.dev/)
[![Downloads](https://img.shields.io/github/downloads/Cmochance/mochan-linux/total?label=downloads)](https://github.com/Cmochance/mochan-linux/releases)

mochan-linux 是一个**自托管的、浏览器即可访问的 Linux 工作站**。在自己的 VPS 上跑一个 Go 二进制，浏览器打开 `https://your.domain` 就能拿到一个带终端、文件管理器、系统监控、进程管理器的水墨风桌面，所有操作落到真实 Linux 上——不是模拟、不是沙箱，是 `bash -l` + 主机文件系统。

和 `tsl0922/ttyd`、`butlerx/wetty` 这类只给 Web 终端的工具不同，mochan-linux 给的是**完整桌面体验**：多窗口、文件管理、代码编辑、系统监控同框，单二进制部署不依赖 Docker / Node 运行时。和 `coder/code-server` 的"浏览器里跑 VS Code"不同，mochan-linux 不绑定单一 IDE——它是一个壳，下面是真实主机。

启动后通过 Nginx Proxy Manager / Caddy / Traefik 任选一种反向代理终结 TLS，浏览器侧用 bcrypt + JWT cookie 鉴权一次，之后终端走 WebSocket、文件 / 进程 / 监控走 REST，全程同源不绕外网。

## 项目状态

- 当前版本：**v1.0.0**（首个稳定版）
- 已验证宿主：Ubuntu 24.04 LTS x86_64（生产部署在 `linux.mochance.xyz`，文档见 [`deploy/`](deploy/)）
- 实验兼容：Debian 12 / Ubuntu 22.04 / 任意带 systemd 的 Linux 发行版；架构 amd64 + arm64
- 反向代理：Nginx Proxy Manager（已端到端验证，含 WebSocket 升级 + Let's Encrypt）、Caddy / Traefik / 原生 nginx 同样适用
- 部署形态：单 Go 二进制（前端 `embed.FS` 注入）+ systemd unit + `/etc/mochan/config.env`
- 更新日志：[CHANGELOG.md](CHANGELOG.md)，逐版本完整变更详见 [GitHub Releases](https://github.com/Cmochance/mochan-linux/releases) 或 [`docs/release-notes-v*.md`](docs/)

## 能做什么

- **登录门**：bcrypt 密码 + HS256 JWT，写入 `HttpOnly Secure SameSite=Lax` cookie；前端 `AuthGate` 启动时调 `/api/me` 校验，失败显示水墨风登录屏，**未登录看不到桌面任何内容**。
- **真终端**：浏览器内 xterm.js 经 WebSocket 接到服务器侧 `creack/pty` 打开的 `bash -l`，支持 256 色、UTF-8、`htop` / `vim` / `tmux` 全部能跑，窗口缩放自动 `TIOCSWINSZ`。
- **服务器侧浏览器**：桌面里的浏览器应用通过 `/api/browser/proxy?url=...` 由 VPS 后端发起 HTTP/HTTPS 请求，可访问服务器本机 `127.0.0.1` 和服务器内网可达地址；页面脚本默认禁用，HTML 链接、图片、样式会改写回同一个代理路径。
- **真文件系统**：`/api/fs/{home,list,read,write,mkdir,delete,move,upload,download,stat}`，整个主机 FS 可见，权限由 OS 决定（mochan 用户访问 `/root` → 403；访问 `/etc/hostname` → 200 文本）。FileManager 支持双击文本进 CodeMirror 6 编辑、上传 / 下载 / 重命名 / 软链显示。
- **代码编辑器**：CodeMirror 6 + `one-dark` 主题，按扩展名识别 JS / TS / JSON / Python / HTML / CSS / Markdown / YAML 自动语法高亮。
- **系统监控**：`/api/sys/stat` 由 gopsutil 后端，每 2 秒前端轮询。CPU 总占用 + 每核占用、内存 / Swap、所有挂载点磁盘、网络累积 + 实时速率。
- **进程管理**：`/api/sys/processes` 全量进程，`/api/sys/kill` 信号端点（拒绝 pid ≤ 1）。前端可按 PID/CPU/内存/名称排序、搜索、`TERM`/`INT`/`HUP`/`KILL` 信号选择对话框。
- **PTY 持久会话**：`/ws/pty?session=<id>` 后端会保留 256 KiB 环形缓冲；浏览器 tab 睡眠、CF 间歇掐 WebSocket、地铁信号断都不会丢 `htop` / `vim` 状态。客户端走指数退避自动重连(600ms 起,封顶 8s),5 分钟无客户端的 session 自动回收。
- **安全审计日志**：`/api/sys/audit/` 把登录成功 / 失败、`fs` 写操作、`sys.kill` 全部追加到 `<DataDir>/audit.log`(JSONL,10 MiB 轮转),前端 `审计日志` 应用按类型筛选、5 秒自动刷新、登录成功/失败实时计数。
- **应用间联动**：FileManager 双击 `.md` → MarkdownEditor、图片 → ImageViewer、源码 → TextEditor,这些应用从 `/api/fs/read` 加载,保存按钮回写 `/api/fs/write`。
- **设置真接入**：主题 / 语言 / 桌面壁纸由 `/api/settings/` 持久化到 `<DataDir>/settings.json`,换浏览器也保留。可上传任意图片做壁纸,文件存在 `<DataDir>/wallpapers/`。
- **NOPASSWD sudo（可选）**：`mochan` 服务用户配 NOPASSWD sudo 后，浏览器终端里直接 `sudo apt install …` 测试自己开发的 Linux 应用，无需 SSH。
- **移动端可用**：≤ 768 px 视口下窗口自动覆盖整屏(StatusBar 与 Dock 之间),拖动 / 调整大小禁用,标题栏按钮放大到 22 px 触屏可点。
- **单二进制部署**：前端 build 后通过 `embed.FS` 嵌进 Go 二进制（约 13 MB），服务器只需要 systemd + bash，**无 Node 运行时、无 npm、无依赖目录**。
- **多架构 release**：GitHub Actions 在每个 `v*` tag 自动出 `linux/amd64` 和 `linux/arm64` 二进制 + 单文件 `SHA256SUMS` 汇总。

## 界面预览

> 截图待补,预计存放路径如下;在你自己的部署上跑一下 `https://your.domain` 即可看到。
>
> | 桌面 + StatusBar + Dock | 终端 (xterm.js + tmux) |
> |---|---|
> | `docs/img/desktop.png` | `docs/img/terminal.png` |
> | **文件管理器 + CodeMirror** | **系统监控 (CPU 每核 / 内存 / 磁盘 / 网速)** |
> | `docs/img/file-manager.png` | `docs/img/system-monitor.png` |
> | **审计日志** | **设置 (主题 + 壁纸网格)** |
> | `docs/img/audit-log.png` | `docs/img/settings.png` |

## 下载

最新已发布版本在 GitHub Release：

```text
https://github.com/Cmochance/mochan-linux/releases/latest
```

每个版本至少包含：

- `mochan-linux-amd64.tar.gz`：Linux x86_64（绝大多数 VPS / 物理机）
- `mochan-linux-arm64.tar.gz`：Linux ARM64（树莓派 4/5、Apple Silicon 上的 Linux VM、ARM 云主机）
- `SHA256SUMS`：校验文件，每条对应一个 `.tar.gz`

校验：

```bash
sha256sum -c <(grep mochan-linux-amd64.tar.gz SHA256SUMS)
```

## 安全前提（部署前必读）

本项目按设计**把目标主机的真实 shell 暴露给已认证的浏览器用户**。配置错一项就是从"私人工作站"变成"全互联网可达的远程代码执行入口"。强制规则：

- 单用户单密码 ≥ 16 字符。**爆破防护极弱**——`/api/auth/login` 仅做 500 ms 固定延时，强烈建议在反向代理层加 `fail2ban` 或 IP 白名单。
- 必须 HTTPS。后端默认绑 `127.0.0.1:38421`（或反代在 Docker 里时绑 `172.17.0.1:38421`），**永远不要把 38421 直接暴到公网**。
- 浏览器应用是服务器侧代理。已登录用户可以让 VPS 请求公网、`127.0.0.1` 和内网 HTTP 服务；后端会拦截 link-local 和常见云 metadata 地址，但不要把账号开放给不完全可信的人。
- `MOCHAN_JWT_SECRET` ≥ 32 字节随机；用 `mochan gen-secret` 生成；泄露立即轮换。
- 服务用户必须**非 root**（默认 `mochan`）。NOPASSWD sudo 只在你确实需要从浏览器装包时给。
- `unattended-upgrades`、SSH key-only、root 禁登都按 Linux 加固常规来。

如果以上任意一条不熟悉，**先在内网部署一遍**再往公网放。

## 基本用法

### 1. 在服务器上初次部署

```bash
# 在你的 macOS / Linux 工作站上
git clone https://github.com/Cmochance/mochan-linux
cd mochan-linux
make release GOOS=linux GOARCH=amd64       # 产出 ./bin/mochan-linux-amd64

# 上传到 VPS
scp ./bin/mochan-linux-amd64 root@your.vps:/tmp/mochan
scp ./deploy/install.sh ./deploy/mochan.service root@your.vps:/tmp/

# 在 VPS 上装
ssh root@your.vps "bash /tmp/install.sh --binary /tmp/mochan"
# 脚本会交互问账号 / 密码，自动建 mochan 用户 + 配 NOPASSWD sudo + 写 systemd unit
```

### 2. 反向代理（举例：Nginx Proxy Manager）

新建 Proxy Host：
- Domain Names：`linux.your.domain`
- Forward Hostname / IP：`172.17.0.1`（NPM 在 Docker 容器里时；原生 nginx / Caddy 直接 `127.0.0.1`）
- Forward Port：`38421`
- **Websockets Support：ON**（终端必需）
- SSL：Let's Encrypt + Force SSL + HSTS

完整字段说明、Cloudflare 配合、advanced config 注意事项见 [`deploy/npm-proxy-host.md`](deploy/npm-proxy-host.md)。

### 3. 浏览器登录

打开 `https://linux.your.domain`，输 `admin` 和你刚才设的密码 → 进入桌面。

- 顶栏右上角点用户名 → "退出登录" 清 cookie
- 桌面应用：终端 / 文件管理器 / 系统监控 / 任务管理器 全部接真后端
- 终端里 `sudo apt install neofetch` 验证 NOPASSWD sudo 配好

## 开发与构建

```bash
# 前端 dev server (port 3000) 自动代理 /api 和 /ws 到本地 38421
cd web && npm install && npm run dev
# 如果后端临时跑在其他端口，可设置：
# MOCHAN_DEV_TARGET=http://127.0.0.1:38422 npm run dev

# 后端 dev server (port 38421) 用临时凭据
bash scripts/dev.sh
# 默认账号 admin / devpassword，可通过 MOCHAN_DEV_PASSWORD 覆盖
```

生产构建：`make release GOOS=linux GOARCH=amd64`，产物 `./bin/mochan-linux-amd64`。

## 仓库结构

```
mochan-linux/
├── web/                    React + Vite + shadcn/ui + xterm.js + CodeMirror 6
├── server/                 Go 1.24+ 后端（chi + JWT + embed.FS + creack/pty + gopsutil）
│   ├── cmd/mochan/         入口 + CLI 子命令（run / hash-password / gen-secret / version）
│   └── internal/
│       ├── auth/           bcrypt + JWT 中间件
│       ├── browser/        /api/browser/proxy 服务器侧网页代理
│       ├── pty/            /ws/pty WebSocket ↔ PTY
│       ├── fsapi/          /api/fs/*
│       ├── sysinfo/        /api/sys/*
│       └── static/         go:embed 前端 dist
├── deploy/                 systemd unit + install.sh + NPM 配置说明
├── scripts/                dev.sh、deploy 助手
├── Makefile                make build / make release
└── .github/workflows/      tag 触发的多架构 release
```

## License

[MIT](LICENSE) © Cmochance

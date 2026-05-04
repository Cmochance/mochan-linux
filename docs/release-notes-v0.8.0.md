# mochan-linux v0.8.0

> 本版本主线: **终端不再因为网络抖一下就死**。WebSocket 断了 PTY 不死,客户端用同一 session ID 重连即接回原 shell,服务端 256 KiB 环形缓冲会重放最近输出,xterm 看到的就像 tmux 一样无缝。`htop` / `vim` / 编译输出在地铁信号断、笔记本短暂休眠、CF 间歇性掐 WebSocket 时都不丢。

## 中文

### 后端: 会话与 WebSocket 解耦

`internal/pty` 重构,新增 `session.go`:

- **`Session`**: 一个长寿命的 PTY 包装。持有 `*os.File`(PTY) + `*exec.Cmd`(bash) + `ringBuffer` (256 KiB) + 订阅者集合。一个独立 goroutine 持续从 PTY 读,每块同时 (a) 写入环形缓冲、(b) 广播给所有订阅者通道。
- **`Manager`**: 进程级单例,持有 `map[string]*Session`,带 30 秒一次的 reaper goroutine。reaper 把"订阅者数 == 0 且 lastIdle 超过 idleTTL"的 session 标记关闭(默认 idleTTL = 5 分钟)。
- **`/ws/pty`**: 不再每次 WebSocket 进来就 `pty.StartWithSize` 起新 shell。改为 `Manager.GetOrCreate(id, opts)` —— 已存在就附加(共用 PTY + 缓冲),不存在就用这个 ID 创建新 session。

### 协议: 握手控制帧 + 二进制重放

升级成功后,服务端现在先发一个 **JSON 文本帧**:

```json
{
  "type": "attached",
  "session_id": "abc123…",
  "cols": 80,
  "rows": 24,
  "buffer_len": 12345
}
```

紧接着发 `buffer_len` 字节的**二进制帧**,内容是环形缓冲的完整快照(可以是 0 字节)。

之后流量回到 v0.2.0 起就有的格式:
- 二进制帧 = PTY 输出/输入
- 文本帧 = JSON 控制消息(目前只有 `{type:"resize", cols, rows}`)

### 前端: `apps/Terminal.tsx` 自动重连

- 组件挂载时用 `crypto.randomUUID()` 生成 session ID,放在闭包里(不写 localStorage,见下)。
- WebSocket URL 带 `?session=<id>`,断开后跑指数退避重连(初始 600 ms,倍率 1.6,封顶 8 s,加随机抖动)。
- 重连成功在终端里打印 `[已重新连接]`(绿色,2 行,不打扰主流)。
- 第一次连接收到 `attached` 控制帧后,缓冲重放只是写进 xterm,xterm 自己根据 ANSI 序列(光标定位 / 清屏 / 重绘)正确恢复界面——TUI 比如 vim/htop 在 SIGWINCH 后也会自己全屏重绘,所以"重连后画面正确"是协议自然产物。

### 为什么 session ID 不持久化

刻意的:

1. 多窗口需要独立 shell。如果 ID 写 localStorage,同一浏览器开两个终端窗口会争抢同一个 PTY,鼠标在哪个窗口打字都会"穿越"。
2. 浏览器硬刷新后想要"接续昨天的会话"是 `tmux` / `screen` 的工作,不该让本工具承担。tmux 已经做得很好,直接 `tmux new -s work` + `tmux attach -t work` 即可。
3. 当 session 被 reaper 回收后,继续用同一 ID 重连服务端会**新建一个同 ID 的 session**(因为 ID 不可达 → 当作新建),静默切到一个空 shell,用户看到"重连成功但是 htop 没了"会很困惑。强制每次新组件挂载就新 ID,行为一致。

### 空闲回收: 5 分钟无客户端 → kill PTY

`Manager.reapLoop` 每 30 秒扫一次:订阅者数 == 0 且 lastIdle 超过 5 分钟的 session 调用 `markClosed()`,关 PTY、`process.Kill` + `Wait`、关所有订阅者通道、从 map 移除、写日志 `pty: reaping idle session <id>`。

正常场景:
- 你打开一个终端窗口 → 创建 session A → 你点关闭按钮(window 关闭) → WebSocket 断 → reaper 5 分钟后清掉 A。中间这 5 分钟你又打开一个新终端就是新 session(因为新组件 = 新 ID),A 自然死。
- 网络断 30 秒重连 → 你的客户端用同 ID 重连 → reaper 不会动这个 session,因为 lastIdle 在 30 秒前被刷新成 now,但更重要的是你重连后订阅者数从 0 变 1,reaper 条件不满足。

### 已知边界

- **服务进程崩溃 / 重启 → 所有 session 死**。这是单进程内存型 session,不持久。systemd 重启服务后 PTY 全没,前端会看到重连失败一段时间然后 reconnect 时 server 给一个新 session ID(空 shell)。要扛进程崩溃就得用 tmux,这是一句话能解的事所以本版本不投入 disk-backed session。
- **共享一个 ID 的多客户端**: 协议支持(同时广播给所有订阅者),但前端没暴露这个能力,每个 Terminal 组件实例都有独立 ID。
- **环形缓冲 256 KiB**: 大概是 80×24 全屏 ANSI 重绘 5–8 次。tmux / vim 这类自带屏幕状态的应用没问题;`tail -f /var/log/big.log` 这种纯 append 流断 1 分钟可能丢失一些早期行(屏幕重绘可恢复但是 xterm scrollback 里只剩缓冲长度)。

## English

### Backend: PTY lifetime decoupled from WebSocket

`internal/pty` now has a `Session`/`Manager` pair. A `Session` wraps the PTY file, the `*exec.Cmd`, a 256 KiB ring buffer, and a subscriber map; a goroutine streams every PTY read into the buffer and fans it out to subscriber channels. A process-wide `Manager` owns the named-session map and runs a 30 s reaper that kills sessions whose subscriber count has been zero for >5 minutes.

### Protocol: handshake control frame + binary replay

After upgrade, the server sends a JSON text frame `{"type":"attached", "session_id":..., "cols":..., "rows":..., "buffer_len":N}` followed by `N` bytes of binary replay. The rest of the protocol is unchanged.

### Frontend: random session ID + exponential backoff

`apps/Terminal.tsx` mints a random session ID per component instance, attaches it to the WebSocket URL, and on close auto-reconnects with jittered exponential backoff (600 ms → 8 s, factor 1.6). After a successful reconnect, the terminal prints `[已重新连接]` inline.

### Intentional non-features

- Session ID is **not** persisted to localStorage. Two terminal windows in the same browser get independent shells; a hard refresh starts a fresh shell. Use tmux for "want my shell back tomorrow."
- Sessions die with the server process — they live in memory. systemd restart kills all PTYs.
- Buffer is 256 KiB (~5–8 full-screen redraws); long pure-append streams may lose early lines on a 1-minute disconnect.

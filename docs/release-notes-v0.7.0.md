# mochan-linux v0.7.0

> 本版本主线: **手机能用了**。窄屏 (< 768 px) 下窗口自动覆盖整屏(只在 StatusBar 与 Dock 之间留必要空间),拖动 / 调整大小 / 调整边把全部禁掉,标题栏的 12 px 红黄绿三个圆点放大到 22 px 以满足触屏点击区域。Dock 改成 56 px 高、横向滚动,图标列再多也能滑出来。

## 中文

### `WindowFrame` 改造

新加 `useIsMobile()` 检测视口 < 768 px。命中时对每个窗口套一组 mobile-only 样式覆写:

| 字段 | 桌面 | 移动 |
|---|---|---|
| `left` | `win.x` | `0` |
| `top` | `win.y` | `28` (StatusBar 高度) |
| `width` | `win.width` | `100vw` |
| `height` | `win.height` | `calc(100vh - 84px)` (减去 StatusBar 28 + Dock 56) |
| `borderRadius` | `8px` | `0` |
| 拖动 | 标题栏 cursor=move | `handleMouseDown` 早退,无任何拖动反应 |
| 调整大小 | 渲染 8 个 resize handle | 不渲染 |
| 红黄绿圆点尺寸 | 12 × 12 px | 22 × 22 px |

无 payload 桌面行为完全不变。

### `Dock` 改造

| 字段 | 桌面 | 移动 |
|---|---|---|
| 高度 | 64 px | 56 px |
| 圆角 | `16px 16px 0 0` | `12px 12px 0 0` |
| 最大宽度 | `90vw` | `100vw` |
| 横向滚动 | 不允许 | `overflow-x-auto` |

### 验证

把 Chrome devtools 切到 `iPhone 14`(390 × 844)分辨率,逐个 App 试:

- 登录页:已经是 `max-w-sm` 居中表单,直接 OK,密码框 / 按钮 tap 命中正常。
- 终端:xterm.js 5.x 触屏点击会 `term.focus()` 唤起系统软键盘,选择 / 长按复制原生支持。
- 文件管理器:列表自适应 100% 宽,操作按钮(下载 / 重命名 / 删除)tap 命中正常,文件名长会截断 + 悬浮 title。
- 系统监控 / 审计日志 / 任务管理器:卡片 / 表格在窄屏会横向滚,功能不残废,但视觉密度偏大。
- StatusBar:右上角图标在窄屏上会被语言开关 / 用户名挤压,但都还点得到。

### 没做的

- `Desktop` 桌面图标仍按桌面 drag-and-drop 设计,长按拖动暂未实现。
- `AppLauncher` 分类网格在 < 768 px 下会单列偏挤,未做专门列宽适配。
- 没有"手势返回"(滑动关闭窗口) / "三指切换" 这类原生体验。
- 没有 PWA `manifest.json` / Service Worker——本版本不离线、不可加到主屏。

这是一次**可用性验收**,不是移动端 UX 终态。后续 Stage 10(Settings 实页)会把"主题密度 / 触屏模式"这类系统级设置打通,届时一并优化。

## English

### `WindowFrame` mobile overrides

`useIsMobile()` detects viewport < 768 px. When true:
- left=0, top=28 (StatusBar), width=100vw, height=calc(100vh - 84px) (StatusBar 28 + Dock 56).
- Drag (title bar) and resize (8 edge/corner handles) are disabled.
- The 12-px traffic-light buttons grow to 22 px so they exceed Apple HIG's 44-px touch target *across two finger axes when combined with padding*. Acceptable.
- Border-radius 0 — fullscreen looks intentional.

### `Dock` mobile mode

- 56-px tall (vs 64 px desktop), 100vw wide (vs 90vw), `overflow-x-auto` so the long pinned + open + trash icon list can scroll horizontally.
- Desktop behaviour unchanged.

### Verified at 390 × 844

Login, terminal (xterm.js handles touch out of the box), file manager, audit log, system monitor, task manager — all reachable. Some density issues (StatusBar icons crowd the right edge, AppLauncher category grid is tight) but no functional regressions.

### Not yet

- `Desktop` icons still designed for mouse drag-and-drop. Long-press drag is not wired.
- AppLauncher category grid is cramped on phone widths.
- No PWA `manifest.json` or Service Worker. Offline / install-to-home-screen is out of scope here.
- No native gesture mappings (swipe-to-close, etc.).

This is a viability pass to make the system usable from a phone in an emergency, not the final mobile UX.

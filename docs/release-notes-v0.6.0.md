# mochan-linux v0.6.0

> 本版本主线: **应用之间真的串起来了**。FileManager 双击文件不再永远落到 CodeMirror 模态框,按扩展名路由到对应的桌面 App: `.md` 进 MarkdownEditor、图片进 ImageViewer、源码 / 文本进 TextEditor。这些 App 在被这样打开时会直接走 `/api/fs/read`(或图片的 `downloadURL`)从主机文件系统加载,保存按钮也直接写回真文件——不再是浏览器下载。

## 中文

### 路由表 (`lib/openFile.ts`)

按扩展名分派,文件管理器双击触发:

| 扩展名 | 目标 App | 行为 |
|---|---|---|
| `.md` / `.markdown` | MarkdownEditor | `/api/fs/read` 加载,保存按钮 → `/api/fs/write` |
| `.jpg` / `.jpeg` / `.png` / `.gif` / `.webp` / `.svg` / `.bmp` / `.ico` / `.avif` | ImageViewer | `/api/fs/download` 直链作为 `<img src>`,自动测尺寸 |
| `.txt` / `.log` / `.conf` / `.cfg` / `.ini` / `.env` / `.sh` / `.bash` / `.zsh` / `.go` / `.py` / `.rs` / `.js` / `.jsx` / `.ts` / `.tsx` / `.json` / `.yaml` / `.yml` / `.toml` / `.html` / `.css` / `.sql` / `.rb` / `.php` / `.java` / `.kt` / `.c` / `.cpp` / `.h` / `.hpp` / `.cs` 等 | TextEditor | `/api/fs/read` 加载,Ctrl+S → `/api/fs/write` |
| 其它文本(≤8 MiB) | FileManager CodeMirror 模态 | 兜底,与 v0.3.0 一样 |
| 二进制 / 大文件 | 下载 | 兜底,与 v0.3.0 一样 |

### 数据通道: `WindowData.payload`

`useWindowStore` 的 `WindowData` 加了 `payload?: Record<string, unknown>` 字段。`openWindow(appId, title, { payload: { path, source: 'filemanager' } })` 把上下文塞进去,App 用 `usePayloadPath(windowId)` 取出。

这是一个**可选**通道——没 payload 启动的窗口(开始菜单 / Dock 点击)走原来的本地存储行为完全不变。

### 三个被改造的 App

- **TextEditor**: 收到 payload 时,丢掉 localStorage 的草稿,改成显示远端文件内容。`Ctrl+S` 和 "保存" 按钮直接写 `/api/fs/write`。无 payload 时保留原来的"下载到浏览器" 行为。
- **MarkdownEditor**: 同上。继续支持实时 Markdown 预览。
- **ImageViewer**: 收到 payload 时,把 `/api/fs/download?path=...` URL 当作 `<img src>` 直接渲染,顺便用 `Image()` 探测自然尺寸填进 `images` 数组。其它已有功能(缩放 / 旋转 / 翻转 / 拖放上传 / 幻灯片)不变。

### 为什么不路由 `.json` 到 JSONEditor?

JSONEditor 还是个本地 stub,没有 fs-aware 模式。`.json` 在路由表里被归到 TextEditor(CodeMirror 自带 JSON 高亮),后续可以单独把 JSONEditor 改造好再切。

### 未做

- 反向操作不存在: TextEditor 内置的 "新建/打开本地文件 / 下载" 按钮没有"保存到主机文件系统"的快捷入口。临时方案是从 FileManager 启动以拿到 payload。
- 没有 "用其它 App 打开" 的右键菜单——只有默认路由,改路由要改 `lib/openFile.ts`。
- ImageViewer 的"下一张/上一张"在 payload 模式下只有一张图,翻页无效;需要改成支持远端目录列表。

## English

### Extension routing (`lib/openFile.ts`)

Double-clicking a file in FileManager now routes by extension:

| Ext | Target App | Behaviour |
|---|---|---|
| `.md` / `.markdown` | MarkdownEditor | loads via `/api/fs/read`, save → `/api/fs/write` |
| common image extensions | ImageViewer | uses `/api/fs/download` as the `<img>` source, probes natural size |
| common text / code extensions | TextEditor | loads via `/api/fs/read`, Ctrl+S → `/api/fs/write` |
| other text (≤8 MiB) | FileManager CodeMirror modal | fallback (unchanged) |
| binary / oversize | download | fallback (unchanged) |

### Data channel: `WindowData.payload`

`useWindowStore.WindowData` gained `payload?: Record<string, unknown>`. The opener writes `openWindow(appId, title, { payload: { path, source: 'filemanager' } })`; consumers read `usePayloadPath(windowId)`. Apps launched without a payload keep their original local-storage behaviour.

### Apps modified

TextEditor, MarkdownEditor, ImageViewer now opt in to the payload protocol. When launched with a path, they fetch the file from `/api/fs` and override the default content; save buttons write back to `/api/fs/write` instead of triggering a browser download.

### Not yet

- TextEditor's stand-alone "save" still downloads to the browser unless it was launched with a payload.
- No right-click "open with…" menu yet — defaults are hard-coded in `lib/openFile.ts`.
- ImageViewer in payload mode shows a single image; the prev/next paging assumes a directory walk, which we haven't wired yet.

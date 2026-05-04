# mochan-linux v0.9.0

> 本版本主线: **设置真接入**。Settings 不再是纯 localStorage 的 stub —— 主题 / 语言 / 桌面壁纸由后端 `/api/settings` 持久化(写到 `/var/lib/mochan/settings.json`),换浏览器也保留。新增完整的壁纸桶 `/var/lib/mochan/wallpapers/`,可以从设置面板里直接上传图片做壁纸。Settings 应用整个重写成多页签:外观 / 语言 / 关于,关于页接 `/api/sys/stat` 实时显示主机信息。

## 中文

### 后端 `internal/settings`

两个组件:

- **`Store`**: 单文件 JSON 持久化。原子写入(写到 `.tmp` 然后 `os.Rename`),0640 权限,只接受 enum 值合法的 patch(theme ∈ {ink, dark, light},language ∈ {zh, en})。
- **`Bucket`**: 用户上传的壁纸放在 `<DataDir>/wallpapers/`。文件名校验拦截 `..` / `/` / NUL,扩展名白名单(`.jpg / .jpeg / .png / .webp / .gif / .bmp / .avif`)。

### 端点

| 方法 | 路径 | 用途 |
|---|---|---|
| GET | `/api/settings/` | 返回 `{theme, language, wallpaper}` |
| PATCH | `/api/settings/` | 合并 patch,持久化,返回新状态 |
| GET | `/api/settings/wallpapers/` | 列出 bundled + user 壁纸,返回 `{name, url, size, source}` |
| POST | `/api/settings/wallpapers/` | multipart 上传,字段名 `file` |
| GET | `/api/settings/wallpapers/{name}` | 流式返回用户上传的壁纸文件(带 5min Cache-Control) |
| DELETE | `/api/settings/wallpapers/{name}` | 删除用户壁纸 |

### 前端 `apps/Settings.tsx` 完全重写

旧 stub 是 372 行 localStorage UI 但实际不生效(theme 在 useSystemStore,Settings 自己又写一份),改成 200 行的三页签:

- **外观**: 主题三按钮(水墨 / 夜色 / 宣纸)+ 壁纸 4 列网格(bundled 走 `./wallpaper-xxx.jpg`,user 走 `/api/settings/wallpapers/xxx`),user 壁纸 hover 出现红色删除按钮。点选 = 立即生效(zustand 改 → useSettingsSync 钩子 debounce 300ms 写回服务器)。上传按钮调 `/api/settings/wallpapers/` POST。
- **语言**: 中文 / English 二选一。
- **关于**: 水墨 Linux 品牌区 + GitHub / Releases 外链 + 实时主机信息卡(主机名 / OS / 内核 / 架构 / 已运行 / CPU 核数 / 内存 / 磁盘挂载数 / 负载 / 当前用户)。

### `useSettingsSync` 钩子

```ts
// 在 Layout 里挂上,每次 booted 都跑一次
useSettingsSync()
```

逻辑:

1. 进入 Layout(已登录) → fetch `/api/settings/` → 拿到 `{theme, language, wallpaper}` → 用 `setTheme`/`setLanguage`/`setWallpaper` 灌进 zustand。**服务端是真理之源**,把 localStorage 作为暖启动缓存——先用 localStorage 渲染屏幕,再用服务端值覆盖,体感不闪烁。
2. zustand `subscribe` 监听 theme / language / wallpaper 变化,300ms 防抖后 PATCH 服务器。
3. `lastWritten` 记忆最近一次同步内容,避免回声(服务器响应触发的 setState 不应再 PATCH)。

副作用:**StatusBar 上那个右上角的语言切换按钮现在也会真持久化到服务端**——任何路径改的 zustand 都会被 hook 同步,Settings 应用不需要垄断这个能力。

### 桌面壁纸打通真 FS

`Desktop` / `LockScreen` / `AuthGate` 三处之前都硬编码 `url(./${wallpaper}.jpg)`。新增 `wallpaperUrl(id)` 帮手:

```ts
export function wallpaperUrl(id: string): string {
  if (id.startsWith('wallpaper-')) return `./${id}.jpg`;
  return `/api/settings/wallpapers/${encodeURIComponent(id)}`;
}
```

`useDesktopStore.WallpaperId` 类型从五个字面量 union 放宽到 `string`,所以用户上传的任意图名都能作为合法 wallpaper id 存。

### 试一下

1. Settings → 外观 → 上传新壁纸:选张本机图片 → 网格里立刻出现 → 点它 → 桌面 / 锁屏 / 登录页背景同步切换。
2. 服务器端能验证: `ssh dochenmo 'cat /var/lib/mochan/settings.json && ls /var/lib/mochan/wallpapers/'` 看到 `{"theme":"ink","language":"zh","wallpaper":"<your.png>"}` 和实际文件。
3. 在另一台机器(或匿名隐私窗口)登录:壁纸已经是你刚才设的——服务端拿回来的不是 localStorage。

### 故意不做的

- **端口设置**: 改 `MOCHAN_LISTEN` 涉及 systemd 重启 + 反向代理上游联动,不该是 in-app 一键。仍然走 `/etc/mochan/config.env` + `systemctl restart mochan`。
- **密码修改**: 暂未做。理由同上(密码哈希在 `config.env`,需要原子改文件 + 重启)。Stage 11 之前应当补,但本版本不投入。
- **2FA / OAuth**: 仍是单密码,记忆里硬规则警告未变。

## English

### Backend

`internal/settings` adds a `Store` (atomic JSON write to `<DataDir>/settings.json`, 0640) and a `Bucket` for user-uploaded wallpapers under `<DataDir>/wallpapers/`. Endpoints under `/api/settings/`: `GET` / `PATCH` for the document, `GET` / `POST` / `GET {name}` / `DELETE {name}` for the wallpaper bucket. Patch values are validated against enums; uploads are filename-guarded against traversal and extension-whitelisted.

### Frontend

`apps/Settings.tsx` rewritten as a tabbed page (Appearance / Language / About). Theme buttons, language toggle, wallpaper grid with hover-to-delete and an upload button. About tab renders live host info via `/api/sys/stat`.

A new `useSettingsSync()` hook runs in `Layout`. It bootstraps zustand stores from the server on entry, then debounce-writes back any local mutation (300 ms) — so the StatusBar language toggle persists too, not just the Settings app.

`Desktop` / `LockScreen` / `AuthGate` resolve wallpaper URLs through a new `wallpaperUrl(id)` helper that routes bundled IDs to the static bundle and any other ID to `/api/settings/wallpapers/<name>`.

### Verify

```bash
ssh user@host 'cat /var/lib/mochan/settings.json && ls /var/lib/mochan/wallpapers/'
```

After uploading a wallpaper from Settings, you'll see the file on disk and the JSON updated. Logging in from a fresh browser shows the same theme/wallpaper because the server is the source of truth — localStorage is just a warm cache.

### Out of scope

- **Listen port** is intentionally not in the UI; changing it requires editing `/etc/mochan/config.env` plus a service restart and a reverse-proxy update.
- **Password change** is not in this release — same constraint (password hash lives in `config.env`).
- **2FA / OAuth** still out of scope; this is single-user by design.

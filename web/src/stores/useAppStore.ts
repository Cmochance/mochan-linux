import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface AppDefinition {
  id: string;
  name: string;
  nameEn: string;
  icon: string;
  category: AppCategory;
  description: string;
}

export type AppCategory =
  | 'system'
  | 'office'
  | 'media'
  | 'network'
  | 'dev'
  | 'games'
  | 'education';

export const APP_CATEGORIES: Record<AppCategory, { label: string; labelEn: string }> = {
  system: { label: '系统工具', labelEn: 'System Tools' },
  office: { label: '办公', labelEn: 'Office' },
  media: { label: '多媒体', labelEn: 'Media' },
  network: { label: '网络', labelEn: 'Network' },
  dev: { label: '开发', labelEn: 'Development' },
  games: { label: '游戏', labelEn: 'Games' },
  education: { label: '学习', labelEn: 'Education' },
};

export const APPS: AppDefinition[] = [
  // System Tools (12)
  { id: 'filemanager', name: '文件管理', nameEn: 'File Manager', icon: 'FolderOpen', category: 'system', description: '浏览和管理文件系统' },
  { id: 'terminal', name: '终端', nameEn: 'Terminal', icon: 'Terminal', category: 'system', description: '命令行终端模拟器' },
  { id: 'systemmonitor', name: '系统监视器', nameEn: 'System Monitor', icon: 'Activity', category: 'system', description: '实时系统资源监控' },
  { id: 'settings', name: '设置', nameEn: 'Settings', icon: 'Settings', category: 'system', description: '系统偏好设置' },
  { id: 'calculator', name: '计算器', nameEn: 'Calculator', icon: 'Calculator', category: 'system', description: '科学计算器' },
  { id: 'calendar', name: '日历', nameEn: 'Calendar', icon: 'Calendar', category: 'system', description: '日历和日程管理' },
  { id: 'clock', name: '时钟', nameEn: 'Clock', icon: 'Clock', category: 'system', description: '世界时钟、闹钟、秒表' },
  { id: 'screenshot', name: '截图工具', nameEn: 'Screenshot', icon: 'Camera', category: 'system', description: '屏幕截图和标注' },
  { id: 'notes', name: '便签', nameEn: 'Notes', icon: 'StickyNote', category: 'system', description: '桌面便签' },
  { id: 'trash', name: '废纸篓', nameEn: 'Trash', icon: 'Trash2', category: 'system', description: '已删除文件' },
  { id: 'taskmanager', name: '任务管理器', nameEn: 'Task Manager', icon: 'ListTodo', category: 'system', description: '进程管理和监控' },
  { id: 'weather', name: '天气', nameEn: 'Weather', icon: 'CloudSun', category: 'system', description: '天气预报' },

  // Office (8)
  { id: 'texteditor', name: '文本编辑器', nameEn: 'Text Editor', icon: 'FileText', category: 'office', description: '纯文本编辑器' },
  { id: 'markdowneditor', name: 'Markdown编辑器', nameEn: 'Markdown Editor', icon: 'FileCode2', category: 'office', description: 'Markdown编辑和预览' },
  { id: 'spreadsheet', name: '电子表格', nameEn: 'Spreadsheet', icon: 'Table2', category: 'office', description: '电子表格处理' },
  { id: 'paint', name: '绘图', nameEn: 'Paint', icon: 'Palette', category: 'office', description: '水墨风格绘图工具' },
  { id: 'mindmap', name: '思维导图', nameEn: 'Mind Map', icon: 'GitFork', category: 'office', description: '思维导图编辑' },
  { id: 'presentation', name: '演示文稿', nameEn: 'Presentation', icon: 'Presentation', category: 'office', description: '幻灯片演示' },
  { id: 'pdfreader', name: 'PDF阅读器', nameEn: 'PDF Reader', icon: 'BookOpen', category: 'office', description: 'PDF文档阅读' },
  { id: 'translator', name: '翻译', nameEn: 'Translator', icon: 'Languages', category: 'office', description: '多语言翻译' },

  // Media (8)
  { id: 'musicplayer', name: '音乐播放器', nameEn: 'Music Player', icon: 'Music', category: 'media', description: '音乐播放和管理' },
  { id: 'videoplayer', name: '视频播放器', nameEn: 'Video Player', icon: 'PlayCircle', category: 'media', description: '视频播放' },
  { id: 'imageviewer', name: '图片查看器', nameEn: 'Image Viewer', icon: 'Image', category: 'media', description: '图片浏览和编辑' },
  { id: 'voicerecorder', name: '录音机', nameEn: 'Voice Recorder', icon: 'Mic', category: 'media', description: '音频录制' },
  { id: 'photoalbum', name: '相册', nameEn: 'Photo Album', icon: 'Images', category: 'media', description: '照片管理和浏览' },
  { id: 'radio', name: '收音机', nameEn: 'Radio', icon: 'Radio', category: 'media', description: '网络电台' },
  { id: 'camera', name: '相机', nameEn: 'Camera', icon: 'Camera', category: 'media', description: '摄像头拍照' },
  { id: 'metronome', name: '节拍器', nameEn: 'Metronome', icon: 'Timer', category: 'media', description: '音乐节拍器' },

  // Network (8)
  { id: 'browser', name: '浏览器', nameEn: 'Browser', icon: 'Globe', category: 'network', description: '网页浏览器' },
  { id: 'emailclient', name: '邮件客户端', nameEn: 'Email', icon: 'Mail', category: 'network', description: '电子邮件管理' },
  { id: 'chatapp', name: '聊天应用', nameEn: 'Chat', icon: 'MessageCircle', category: 'network', description: '即时通讯' },
  { id: 'ftpclient', name: 'FTP客户端', nameEn: 'FTP Client', icon: 'HardDriveUpload', category: 'network', description: '文件传输协议' },
  { id: 'sshclient', name: 'SSH客户端', nameEn: 'SSH Client', icon: 'Shield', category: 'network', description: '安全远程连接' },
  { id: 'downloadmanager', name: '下载管理器', nameEn: 'Download Manager', icon: 'Download', category: 'network', description: '下载任务管理' },
  { id: 'rssreader', name: 'RSS阅读器', nameEn: 'RSS Reader', icon: 'Rss', category: 'network', description: 'RSS订阅阅读' },
  { id: 'bookmarks', name: '书签管理', nameEn: 'Bookmarks', icon: 'Bookmark', category: 'network', description: '网页书签管理' },

  // Dev (8)
  { id: 'gitclient', name: 'Git客户端', nameEn: 'Git Client', icon: 'GitBranch', category: 'dev', description: '版本控制管理' },
  { id: 'jsoneditor', name: 'JSON编辑器', nameEn: 'JSON Editor', icon: 'Braces', category: 'dev', description: 'JSON编辑和格式化' },
  { id: 'regextester', name: '正则测试器', nameEn: 'Regex Tester', icon: 'Search', category: 'dev', description: '正则表达式测试' },
  { id: 'apitester', name: 'API测试器', nameEn: 'API Tester', icon: 'Plug', category: 'dev', description: 'HTTP接口测试' },
  { id: 'colorpicker', name: '取色器', nameEn: 'Color Picker', icon: 'Pipette', category: 'dev', description: '颜色选择和转换' },
  { id: 'base64tool', name: 'Base64工具', nameEn: 'Base64 Tool', icon: 'Code2', category: 'dev', description: 'Base64编码解码' },
  { id: 'qrcodegenerator', name: '二维码生成', nameEn: 'QR Generator', icon: 'QrCode', category: 'dev', description: '二维码生成器' },
  { id: 'passwordgenerator', name: '密码生成器', nameEn: 'Password Generator', icon: 'KeyRound', category: 'dev', description: '安全密码生成' },

  // Games (8)
  { id: 'gogame', name: '围棋', nameEn: 'Go', icon: 'CircleDot', category: 'games', description: '围棋对弈' },
  { id: 'chinesechess', name: '中国象棋', nameEn: 'Chinese Chess', icon: 'Grid3X3', category: 'games', description: '象棋对弈' },
  { id: 'mahjong', name: '麻将', nameEn: 'Mahjong', icon: 'LayoutGrid', category: 'games', description: '麻将连连看' },
  { id: 'gomoku', name: '五子棋', nameEn: 'Gomoku', icon: 'X', category: 'games', description: '五子棋对弈' },
  { id: 'sudoku', name: '数独', nameEn: 'Sudoku', icon: 'Grid2X2', category: 'games', description: '数独谜题' },
  { id: 'snake', name: '贪吃蛇', nameEn: 'Snake', icon: 'Snail', category: 'games', description: '经典贪吃蛇' },
  { id: 'puzzle2048', name: '2048', nameEn: '2048', icon: 'Combine', category: 'games', description: '2048数字游戏' },
  { id: 'jigsawpuzzle', name: '拼图', nameEn: 'Jigsaw', icon: 'Puzzle', category: 'games', description: '图片拼图' },

  // Education (5)
  { id: 'dictionary', name: '词典', nameEn: 'Dictionary', icon: 'BookMarked', category: 'education', description: '中英词典' },
  { id: 'notebook', name: '笔记本', nameEn: 'Notebook', icon: 'NotebookPen', category: 'education', description: '笔记记录' },
  { id: 'whitenoise', name: '白噪音', nameEn: 'White Noise', icon: 'Waves', category: 'education', description: '环境白噪音' },
  { id: 'pomodoro', name: '番茄钟', nameEn: 'Pomodoro', icon: 'Clock', category: 'education', description: '番茄工作法' },
  { id: 'habittracker', name: '习惯追踪', nameEn: 'Habit Tracker', icon: 'CheckCircle2', category: 'education', description: '习惯养成追踪' },
];

interface AppState {
  apps: AppDefinition[];
  recentApps: string[];
  dockApps: string[];
  launchedApp: string | null;

  launchApp: (id: string) => void;
  pinToDock: (id: string) => void;
  unpinFromDock: (id: string) => void;
  getAppById: (id: string) => AppDefinition | undefined;
  clearLaunchedApp: () => void;
}

const DEFAULT_DOCK_APPS = [
  'filemanager',
  'terminal',
  'browser',
  'texteditor',
  'settings',
  'trash',
];

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      apps: APPS,
      recentApps: [],
      dockApps: DEFAULT_DOCK_APPS,
      launchedApp: null,

      launchApp: (id) => {
        set((state) => ({
          recentApps: [id, ...state.recentApps.filter((a) => a !== id)].slice(0, 6),
          launchedApp: id,
        }));
      },

      pinToDock: (id) =>
        set((state) => ({
          dockApps: state.dockApps.includes(id)
            ? state.dockApps
            : [...state.dockApps.filter((a) => a !== 'trash'), id, 'trash'],
        })),

      unpinFromDock: (id) =>
        set((state) => ({
          dockApps: state.dockApps.filter((a) => a !== id),
        })),

      getAppById: (id) => {
        return get().apps.find((app) => app.id === id);
      },

      clearLaunchedApp: () => set({ launchedApp: null }),
    }),
    {
      name: 'ink-os-apps',
      partialize: (state) => ({
        dockApps: state.dockApps,
        recentApps: state.recentApps,
      }),
    }
  )
);

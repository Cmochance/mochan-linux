import { useState, useEffect } from 'react';
import {
  Palette, Monitor, Volume2, Globe, Calendar, Info, Accessibility,
  Sun, Moon, Droplets, Check
} from 'lucide-react';

type Theme = 'ink' | 'dark' | 'light';
type Category = 'appearance' | 'display' | 'sound' | 'language' | 'datetime' | 'accessibility' | 'about';

interface SettingsState {
  theme: Theme;
  wallpaper: string;
  brightness: number;
  volume: number;
  notifications: boolean;
  language: 'zh' | 'en';
  timeFormat: '24h' | '12h';
  showSeconds: boolean;
  dateFormat: string;
  highContrast: boolean;
  largeText: boolean;
  reducedMotion: boolean;
}

const SETTINGS_KEY = 'ink-os-settings';

const defaultSettings: SettingsState = {
  theme: 'ink',
  wallpaper: 'default',
  brightness: 80,
  volume: 60,
  notifications: true,
  language: 'zh',
  timeFormat: '24h',
  showSeconds: false,
  dateFormat: 'YYYY-MM-DD',
  highContrast: false,
  largeText: false,
  reducedMotion: false,
};

const wallpapers = [
  { id: 'default', name: 'Mountain Landscape (山水)', color: '#8B9DAF' },
  { id: 'ink-splash', name: 'Ink Splash (墨韵)', color: '#2d2d2d' },
  { id: 'bamboo', name: 'Bamboo (竹林)', color: '#6B7F5C' },
  { id: 'lotus', name: 'Lotus (荷花)', color: '#9B8AA0' },
  { id: 'calligraphy', name: 'Calligraphy (书法)', color: '#A0845C' },
];

function loadSettings(): SettingsState {
  try {
    const saved = localStorage.getItem(SETTINGS_KEY);
    return saved ? { ...defaultSettings, ...JSON.parse(saved) } : defaultSettings;
  } catch {
    return defaultSettings;
  }
}

function saveSettings(s: SettingsState) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
}

export default function Settings() {
  const [settings, setSettings] = useState<SettingsState>(loadSettings);
  const [activeCategory, setActiveCategory] = useState<Category>('appearance');

  useEffect(() => { saveSettings(settings); }, [settings]);

  const update = <K extends keyof SettingsState>(key: K, value: SettingsState[K]) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const categories: { id: Category; name: string; icon: React.ReactNode }[] = [
    { id: 'appearance', name: 'Personalization (个性化)', icon: <Palette size={16} /> },
    { id: 'display', name: 'Display (显示)', icon: <Monitor size={16} /> },
    { id: 'sound', name: 'Sound (声音)', icon: <Volume2 size={16} /> },
    { id: 'language', name: 'Language (语言)', icon: <Globe size={16} /> },
    { id: 'datetime', name: 'Date & Time (日期时间)', icon: <Calendar size={16} /> },
    { id: 'accessibility', name: 'Accessibility (辅助功能)', icon: <Accessibility size={16} /> },
    { id: 'about', name: 'About (关于)', icon: <Info size={16} /> },
  ];

  const ToggleSwitch = ({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) => (
    <button
      onClick={() => onChange(!checked)}
      className={`relative w-10 h-5 rounded-full transition-colors ${checked ? 'bg-cinnabar' : 'bg-ink-300'}`}
    >
      <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${checked ? 'translate-x-5' : 'translate-x-0.5'}`} />
    </button>
  );

  return (
    <div className="w-full h-full flex bg-ink-50 overflow-hidden">
      {/* Sidebar */}
      <div className="w-52 bg-ink-100 border-r border-ink-200 flex-shrink-0 overflow-y-auto">
        {categories.map(cat => (
          <button
            key={cat.id}
            onClick={() => setActiveCategory(cat.id)}
            className={`w-full flex items-center gap-2 px-4 py-2.5 text-body-sm transition-colors text-left ${
              activeCategory === cat.id
                ? 'bg-ink-50 border-l-2 border-cinnabar text-ink-800'
                : 'border-l-2 border-transparent text-ink-600 hover:bg-ink-50'
            }`}
          >
            {cat.icon}
            <span className="truncate">{cat.name}</span>
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {activeCategory === 'appearance' && (
          <div className="space-y-6">
            <h2 className="text-heading-md text-ink-800">Personalization (个性化)</h2>

            {/* Theme */}
            <div className="bg-ink-50 rounded-md p-4 border border-ink-200">
              <h3 className="text-body-sm font-medium text-ink-700 mb-3">Theme (主题)</h3>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { id: 'ink' as Theme, name: 'Ink Wash (水墨)', icon: <Droplets size={24} /> },
                  { id: 'dark' as Theme, name: 'Ink Black (墨黑)', icon: <Moon size={24} /> },
                  { id: 'light' as Theme, name: 'Rice Paper (宣纸)', icon: <Sun size={24} /> },
                ].map(t => (
                  <button
                    key={t.id}
                    onClick={() => update('theme', t.id)}
                    className={`flex flex-col items-center gap-2 p-4 rounded-md border-2 transition-colors ${
                      settings.theme === t.id ? 'border-cinnabar bg-[rgba(179,57,47,0.05)]' : 'border-ink-200 hover:border-ink-400'
                    }`}
                  >
                    <span className="text-ink-600">{t.icon}</span>
                    <span className="text-body-sm text-ink-700">{t.name}</span>
                    {settings.theme === t.id && <Check size={16} className="text-cinnabar" />}
                  </button>
                ))}
              </div>
            </div>

            {/* Wallpaper */}
            <div className="bg-ink-50 rounded-md p-4 border border-ink-200">
              <h3 className="text-body-sm font-medium text-ink-700 mb-3">Wallpaper (壁纸)</h3>
              <div className="grid grid-cols-5 gap-3">
                {wallpapers.map(wp => (
                  <button
                    key={wp.id}
                    onClick={() => update('wallpaper', wp.id)}
                    className={`relative rounded-md overflow-hidden border-2 transition-all aspect-video ${
                      settings.wallpaper === wp.id ? 'border-cinnabar ring-2 ring-cinnabar/20' : 'border-ink-200 hover:border-ink-400'
                    }`}
                    style={{ backgroundColor: wp.color }}
                  >
                    {settings.wallpaper === wp.id && (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <Check size={20} className="text-white drop-shadow-lg" />
                      </div>
                    )}
                    <span className="absolute bottom-1 left-1 right-1 text-caption text-white text-center drop-shadow-lg truncate">{wp.name}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeCategory === 'display' && (
          <div className="space-y-6">
            <h2 className="text-heading-md text-ink-800">Display (显示)</h2>
            <div className="bg-ink-50 rounded-md p-4 border border-ink-200 space-y-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-body-sm text-ink-700">Brightness (亮度)</span>
                  <span className="text-caption text-ink-500">{settings.brightness}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={settings.brightness}
                  onChange={e => update('brightness', parseInt(e.target.value))}
                  className="w-full h-1.5 bg-ink-200 rounded-full appearance-none cursor-pointer accent-cinnabar"
                  style={{ accentColor: '#b3392f' }}
                />
              </div>
              <div className="border-t border-ink-200 pt-3">
                <div className="text-body-sm text-ink-700 mb-1">Resolution (分辨率)</div>
                <div className="text-body-sm text-ink-500">1920 × 1080 (Full HD)</div>
              </div>
              <div className="border-t border-ink-200 pt-3">
                <div className="text-body-sm text-ink-700 mb-2">Scale (缩放)</div>
                <div className="flex gap-2">
                  {['100%', '125%', '150%'].map(s => (
                    <button
                      key={s}
                      className="px-3 py-1 rounded border border-ink-300 text-body-sm text-ink-600 hover:border-cinnabar transition-colors"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeCategory === 'sound' && (
          <div className="space-y-6">
            <h2 className="text-heading-md text-ink-800">Sound (声音)</h2>
            <div className="bg-ink-50 rounded-md p-4 border border-ink-200 space-y-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-body-sm text-ink-700">Master Volume (主音量)</span>
                  <span className="text-caption text-ink-500">{settings.volume}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={settings.volume}
                  onChange={e => update('volume', parseInt(e.target.value))}
                  className="w-full h-1.5 bg-ink-200 rounded-full appearance-none cursor-pointer"
                  style={{ accentColor: '#b3392f' }}
                />
              </div>
              <div className="flex items-center justify-between border-t border-ink-200 pt-3">
                <span className="text-body-sm text-ink-700">Notification Sounds (通知声音)</span>
                <ToggleSwitch checked={settings.notifications} onChange={v => update('notifications', v)} />
              </div>
            </div>
          </div>
        )}

        {activeCategory === 'language' && (
          <div className="space-y-6">
            <h2 className="text-heading-md text-ink-800">Language (语言)</h2>
            <div className="bg-ink-50 rounded-md p-4 border border-ink-200 space-y-3">
              <div className="text-body-sm text-ink-700 mb-2">Interface Language (界面语言)</div>
              {[
                { id: 'zh' as const, name: '中文 (Chinese)' },
                { id: 'en' as const, name: 'English (英文)' },
              ].map(lang => (
                <button
                  key={lang.id}
                  onClick={() => update('language', lang.id)}
                  className={`w-full flex items-center justify-between p-3 rounded-md border transition-colors ${
                    settings.language === lang.id ? 'border-cinnabar bg-[rgba(179,57,47,0.05)]' : 'border-ink-200 hover:border-ink-400'
                  }`}
                >
                  <span className="text-body-sm text-ink-700">{lang.name}</span>
                  {settings.language === lang.id && <Check size={16} className="text-cinnabar" />}
                </button>
              ))}
            </div>
          </div>
        )}

        {activeCategory === 'datetime' && (
          <div className="space-y-6">
            <h2 className="text-heading-md text-ink-800">Date & Time (日期时间)</h2>
            <div className="bg-ink-50 rounded-md p-4 border border-ink-200 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-body-sm text-ink-700">Time Format (时间格式)</span>
                <div className="flex gap-2">
                  {(['24h', '12h'] as const).map(f => (
                    <button
                      key={f}
                      onClick={() => update('timeFormat', f)}
                      className={`px-3 py-1 rounded text-body-sm border transition-colors ${
                        settings.timeFormat === f ? 'border-cinnabar bg-cinnabar text-white' : 'border-ink-300 text-ink-600 hover:border-ink-500'
                      }`}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-center justify-between border-t border-ink-200 pt-3">
                <span className="text-body-sm text-ink-700">Show Seconds (显示秒数)</span>
                <ToggleSwitch checked={settings.showSeconds} onChange={v => update('showSeconds', v)} />
              </div>
              <div className="flex items-center justify-between border-t border-ink-200 pt-3">
                <span className="text-body-sm text-ink-700">Date Format (日期格式)</span>
                <select
                  value={settings.dateFormat}
                  onChange={e => update('dateFormat', e.target.value)}
                  className="bg-ink-100 border border-ink-300 rounded px-2 py-1 text-body-sm text-ink-700 outline-none"
                >
                  <option value="YYYY-MM-DD">YYYY-MM-DD</option>
                  <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                  <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                </select>
              </div>
              <div className="border-t border-ink-200 pt-3">
                <div className="text-body-sm text-ink-700 mb-1">Time Zone (时区)</div>
                <div className="text-body-sm text-ink-500">{Intl.DateTimeFormat().resolvedOptions().timeZone}</div>
              </div>
            </div>
          </div>
        )}

        {activeCategory === 'accessibility' && (
          <div className="space-y-6">
            <h2 className="text-heading-md text-ink-800">Accessibility (辅助功能)</h2>
            <div className="bg-ink-50 rounded-md p-4 border border-ink-200 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-body-sm text-ink-700">High Contrast (高对比度)</div>
                  <div className="text-caption text-ink-500">Enhanced visibility for all UI elements</div>
                </div>
                <ToggleSwitch checked={settings.highContrast} onChange={v => update('highContrast', v)} />
              </div>
              <div className="flex items-center justify-between border-t border-ink-200 pt-3">
                <div>
                  <div className="text-body-sm text-ink-700">Large Text (大字体)</div>
                  <div className="text-caption text-ink-500">Scale up all text by 1.25x</div>
                </div>
                <ToggleSwitch checked={settings.largeText} onChange={v => update('largeText', v)} />
              </div>
              <div className="flex items-center justify-between border-t border-ink-200 pt-3">
                <div>
                  <div className="text-body-sm text-ink-700">Reduced Motion (减少动画)</div>
                  <div className="text-caption text-ink-500">Disable all animations</div>
                </div>
                <ToggleSwitch checked={settings.reducedMotion} onChange={v => update('reducedMotion', v)} />
              </div>
            </div>
          </div>
        )}

        {activeCategory === 'about' && (
          <div className="space-y-6">
            <h2 className="text-heading-md text-ink-800">About Ink OS (关于)</h2>
            <div className="bg-ink-50 rounded-md p-6 border border-ink-200 text-center">
              <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-ink-800 flex items-center justify-center">
                <span className="text-ink-50 font-display text-4xl">墨</span>
              </div>
              <div className="text-heading-lg text-ink-800 mb-1">Ink OS</div>
              <div className="text-body-sm text-ink-500 mb-4">Version (版本) 1.0.0</div>
              <div className="text-caption text-ink-400 mb-2">Build Date: 2024-06-15</div>
              <div className="space-y-2 text-body-sm text-ink-600 max-w-xs mx-auto text-left mt-4">
                <div className="flex justify-between border-b border-ink-200 pb-1">
                  <span>Total Apps (应用总数)</span>
                  <span className="font-medium">57</span>
                </div>
                <div className="flex justify-between border-b border-ink-200 pb-1">
                  <span>DE (桌面环境)</span>
                  <span className="font-medium">Ink Desktop</span>
                </div>
                <div className="flex justify-between border-b border-ink-200 pb-1">
                  <span>Theme Engine (主题引擎)</span>
                  <span className="font-medium">Ink Wash 1.0</span>
                </div>
                <div className="flex justify-between border-b border-ink-200 pb-1">
                  <span>License (许可证)</span>
                  <span className="font-medium">MIT</span>
                </div>
              </div>
              <div className="mt-4 text-caption text-ink-400">
                Made with traditional Chinese ink-wash aesthetics.
              </div>
              <div className="text-caption text-ink-400">
                以水墨之美，构建数字世界。
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

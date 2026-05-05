import { useState, useRef, useEffect, useCallback } from 'react';
import {
  ArrowLeft, ArrowRight, RotateCw, Home, Star, Lock, Globe,
  Plus, X, Clock, Bookmark, Search,
  CloudRain, Sun, Cloud, Music, Video, ShoppingCart,
  Code2, Palette, MessageSquare, Newspaper
} from 'lucide-react';
import { bookmarksClient, type BookmarkItem } from '@/lib/bookmarks';

interface Tab {
  id: string;
  url: string;
  title: string;
  history: string[];
  historyIndex: number;
}

interface HistoryEntry {
  url: string;
  title: string;
  timestamp: Date;
}

interface BrowserProps {
  windowId?: string;
}

const HOME_URL = 'ink://home';

const PRESET_SITES: Record<string, { title: string; content: React.ReactNode }> = {
  [HOME_URL]: {
    title: '起始页 (Start Page)',
    content: null,
  },
  'ink://news': {
    title: '新闻门户 (News Portal)',
    content: null,
  },
  'ink://search': {
    title: '搜索 (Search)',
    content: null,
  },
};

const QUICK_LINKS = [
  { url: 'https://search.ink', title: '搜索 (Search)', icon: Search },
  { url: 'https://news.ink', title: '新闻 (News)', icon: Newspaper },
  { url: 'https://weather.ink', title: '天气 (Weather)', icon: Sun },
  { url: 'https://music.ink', title: '音乐 (Music)', icon: Music },
  { url: 'https://video.ink', title: '视频 (Video)', icon: Video },
  { url: 'https://shop.ink', title: '购物 (Shop)', icon: ShoppingCart },
  { url: 'https://wiki.ink', title: '百科 (Wiki)', icon: Globe },
  { url: 'https://code.ink', title: '代码 (Code)', icon: Code2 },
];

const SIMULATED_SITES: Record<string, { title: string; icon?: React.ReactNode }> = {
  'search.ink': { title: '搜索 (Search)' },
  'news.ink': { title: '新闻门户 (News Portal)' },
  'weather.ink': { title: '天气 (Weather)' },
  'mail.ink': { title: '邮件 (Mail)' },
  'shop.ink': { title: '购物 (Shop)' },
  'music.ink': { title: '音乐 (Music)' },
  'video.ink': { title: '视频 (Video)' },
  'map.ink': { title: '地图 (Maps)' },
  'wiki.ink': { title: '百科 (Wiki)' },
  'code.ink': { title: '代码 (Code)' },
  'art.ink': { title: '艺术馆 (Art Gallery)' },
  'forum.ink': { title: '论坛 (Forum)' },
  'translate.ink': { title: '翻译 (Translate)' },
  'clock.ink': { title: '世界时钟 (World Clock)' },
};

// News articles
const NEWS_ARTICLES = [
  { id: 1, title: '水墨画艺术数字化传承新进展', summary: '传统水墨画通过数字技术获得新生，VR技术让观众身临其境体验创作过程。', category: '文化', time: '2小时前' },
  { id: 2, title: '新型量子计算机突破1000量子比特', summary: '科学家宣布量子计算重大里程碑，有望在药物研发领域实现革命性突破。', category: '科技', time: '4小时前' },
  { id: 3, title: '全球气候峰会达成新共识', summary: '190个国家签署新的气候行动计划，承诺2030年前碳排放减少40%。', category: '国际', time: '6小时前' },
  { id: 4, title: '中国空间站完成新一轮科学实验', summary: '航天员成功完成微重力环境下的植物培育实验，为太空农业奠定基础。', category: '航天', time: '8小时前' },
  { id: 5, title: 'AI辅助诊断系统在基层医院普及', summary: '人工智能医疗诊断系统已覆盖全国80%的县级医院，大幅提升诊断准确率。', category: '医疗', time: '12小时前' },
  { id: 6, title: '丝绸之路考古新发现', summary: '考古队在敦煌发现保存完好的唐代壁画，揭示古代东西方文化交流细节。', category: '历史', time: '1天前' },
];

// Search results
const MOCK_SEARCH_RESULTS = [
  { title: '水墨画 - 百度百科', url: 'https://wiki.ink/水墨画', snippet: '水墨画是中国绘画的代表，以墨为主要原料，加以清水的多少引为浓墨、淡墨、干墨、湿墨、焦墨等，画出不同浓淡（黑、白、灰）层次。' },
  { title: '中国水墨画技法入门教程', url: 'https://art.ink/tutorial', snippet: '学习传统水墨画的基本技法，包括握笔姿势、墨色控制、常用皴法等基础内容。适合零基础初学者。' },
  { title: '历代水墨画名家作品赏析', url: 'https://art.ink/gallery', snippet: '从王维、苏轼到齐白石、张大千，赏析历代水墨画大师的传世之作，解读其艺术风格与创作背景。' },
  { title: '数字水墨：传统艺术的现代演绎', url: 'https://tech.ink/digital-ink', snippet: '探索数字技术如何为传统水墨画注入新的生命力，包括数字绘画工具和生成式AI的应用。' },
];

let tabCounter = 0;

const BROWSER_PROXY_PATH = '/api/browser/proxy';

function httpHost(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.host;
    }
  } catch {
    return '';
  }
  return url.replace(/^https?:\/\//, '').split('/')[0];
}

function shouldUseSimulatedPage(url: string): boolean {
  if (url === HOME_URL || url.startsWith('ink://')) return true;
  return Boolean(SIMULATED_SITES[httpHost(url)]);
}

function titleForURL(url: string): string {
  const preset = PRESET_SITES[url]?.title;
  if (preset) return preset;
  const host = httpHost(url);
  return SIMULATED_SITES[host]?.title || host || url;
}

function browserProxyURL(url: string): string {
  return `${BROWSER_PROXY_PATH}?url=${encodeURIComponent(url)}`;
}

function ServerBrowserPage({ url, onFrameNavigate }: { url: string; onFrameNavigate: (url: string) => void }) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [loaded, setLoaded] = useState(false);
  const src = browserProxyURL(url);

  useEffect(() => {
    setLoaded(false);
  }, [src]);

  const handleLoad = () => {
    setLoaded(true);
    try {
      const frameHref = frameRef.current?.contentWindow?.location.href;
      if (!frameHref) return;
      const current = new URL(frameHref, window.location.origin);
      if (current.pathname !== BROWSER_PROXY_PATH) return;
      const nextURL = current.searchParams.get('url');
      if (nextURL && nextURL !== url) {
        onFrameNavigate(nextURL);
      }
    } catch {
      // Cross-origin access should not happen because the iframe stays on this origin.
    }
  };

  return (
    <div className="relative w-full h-full" style={{ backgroundColor: 'var(--ink-50)' }}>
      {!loaded && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3" style={{ backgroundColor: 'var(--ink-50)' }}>
          <div className="w-48 h-3 rounded animate-pulse" style={{ backgroundColor: 'var(--ink-200)' }} />
          <div className="w-36 h-3 rounded animate-pulse" style={{ backgroundColor: 'var(--ink-200)' }} />
          <div className="w-56 h-3 rounded animate-pulse" style={{ backgroundColor: 'var(--ink-200)' }} />
        </div>
      )}
      <iframe
        key={src}
        ref={frameRef}
        src={src}
        title={titleForURL(url)}
        sandbox="allow-same-origin"
        onLoad={handleLoad}
        className="w-full h-full border-0"
        style={{ backgroundColor: 'white' }}
      />
    </div>
  );
}

function SimulatedPage({ url, onNavigate }: { url: string; onNavigate: (url: string) => void }) {
  const [searchQuery, setSearchQuery] = useState('');

  if (url === HOME_URL || url === '') {
    return (
      <div className="flex flex-col items-center justify-center h-full" style={{ backgroundColor: 'var(--ink-50)' }}>
        <div className="text-display-lg mb-8" style={{ color: 'var(--ink-800)', fontFamily: '"ZCOOL XiaoWei", cursive, serif' }}>
          墨 (Ink)
        </div>
        <div className="w-full max-w-xl relative mb-10">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2" size={18} style={{ color: 'var(--ink-400)' }} />
          <input
            type="text"
            placeholder="搜索 (Search)..."
            className="w-full py-3 pl-12 pr-4 text-body-md"
            style={{
              backgroundColor: 'var(--ink-100)',
              border: '1px solid var(--ink-200)',
              borderRadius: '24px',
              color: 'var(--ink-900)',
              outline: 'none',
            }}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && searchQuery.trim()) {
                onNavigate('ink://search?q=' + encodeURIComponent(searchQuery.trim()));
              }
            }}
          />
        </div>
        <div className="grid grid-cols-4 gap-4 max-w-xl w-full px-4">
          {QUICK_LINKS.map((link) => (
            <button
              key={link.url}
              onClick={() => onNavigate(link.url)}
              className="flex flex-col items-center gap-2 p-4 rounded-lg transition-all duration-150 hover:scale-105"
              style={{ backgroundColor: 'var(--ink-100)' }}
            >
              <link.icon size={24} style={{ color: 'var(--ink-700)' }} />
              <span className="text-caption" style={{ color: 'var(--ink-600)' }}>{link.title}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (url.startsWith('ink://search')) {
    const query = new URLSearchParams(url.split('?')[1]).get('q') || '';
    return (
      <div className="h-full overflow-auto p-6" style={{ backgroundColor: 'var(--ink-50)' }}>
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center gap-3 mb-6">
            <Search size={20} style={{ color: 'var(--ink-400)' }} />
            <span className="text-body-lg" style={{ color: 'var(--ink-700)' }}>{query}</span>
            <span className="text-caption ml-auto" style={{ color: 'var(--ink-400)' }}>约 {MOCK_SEARCH_RESULTS.length} 条结果</span>
          </div>
          {MOCK_SEARCH_RESULTS.map((result, i) => (
            <div key={i} className="mb-5 p-4 rounded-lg" style={{ backgroundColor: 'var(--ink-100)' }}>
              <button
                onClick={() => onNavigate(result.url)}
                className="text-heading-sm mb-1 hover:underline text-left"
                style={{ color: '#5a7a8a' }}
              >
                {result.title}
              </button>
              <div className="text-caption mb-2" style={{ color: 'var(--success)' }}>{result.url}</div>
              <div className="text-body-sm" style={{ color: 'var(--ink-600)' }}>{result.snippet}</div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (url === 'ink://news') {
    return (
      <div className="h-full overflow-auto" style={{ backgroundColor: 'var(--ink-50)' }}>
        <div className="p-6">
          <div className="flex items-center gap-2 mb-6">
            <Newspaper size={24} style={{ color: 'var(--cinnabar)' }} />
            <h1 className="text-heading-lg" style={{ color: 'var(--ink-900)' }}>每日新闻 (Daily News)</h1>
          </div>
          <div className="grid gap-4">
            {NEWS_ARTICLES.map((article) => (
              <div key={article.id} className="p-4 rounded-lg" style={{ backgroundColor: 'var(--ink-100)', borderLeft: '3px solid var(--cinnabar)' }}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-caption px-2 py-0.5 rounded" style={{ backgroundColor: 'var(--wash-light)', color: 'var(--ink-600)' }}>{article.category}</span>
                  <span className="text-caption" style={{ color: 'var(--ink-400)' }}>{article.time}</span>
                </div>
                <h3 className="text-heading-sm mb-1" style={{ color: 'var(--ink-900)' }}>{article.title}</h3>
                <p className="text-body-sm" style={{ color: 'var(--ink-600)' }}>{article.summary}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Simulated external sites
  const host = url.replace(/^https?:\/\//, '').split('/')[0];
  const siteInfo = SIMULATED_SITES[host];

  if (siteInfo) {
    if (host === 'search.ink') {
      return (
        <div className="flex flex-col items-center justify-center h-full" style={{ backgroundColor: '#fafafa' }}>
          <Globe size={48} style={{ color: 'var(--ink-400)' }} className="mb-4" />
          <div className="text-display-lg mb-6" style={{ color: '#1a73e8' }}>Ink Search</div>
          <div className="w-full max-w-lg relative mb-8">
            <input
              type="text"
              placeholder="输入关键词搜索..."
              className="w-full py-3 px-5 text-body-md"
              style={{ border: '1px solid #dfe1e5', borderRadius: '24px', outline: 'none' }}
            />
          </div>
          <div className="flex gap-3">
            <button className="px-4 py-2 rounded text-body-sm" style={{ backgroundColor: '#f8f9fa', border: '1px solid #dfe1e5' }}>搜索 (Search)</button>
            <button className="px-4 py-2 rounded text-body-sm" style={{ backgroundColor: '#f8f9fa', border: '1px solid #dfe1e5' }}>手气不错 (I'm Feeling Lucky)</button>
          </div>
        </div>
      );
    }

    if (host === 'weather.ink') {
      const cities = [
        { name: '北京', temp: '22°C', icon: Sun },
        { name: '上海', temp: '25°C', icon: Cloud },
        { name: '杭州', temp: '23°C', icon: CloudRain },
        { name: '成都', temp: '20°C', icon: Sun },
      ];
      return (
        <div className="h-full overflow-auto p-6" style={{ backgroundColor: '#e8f4f8' }}>
          <h1 className="text-heading-lg mb-4" style={{ color: '#1565c0' }}>天气 (Weather)</h1>
          <div className="grid grid-cols-2 gap-4">
            {cities.map((city) => (
              <div key={city.name} className="p-4 rounded-lg flex items-center gap-4" style={{ backgroundColor: 'white', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
                <city.icon size={36} style={{ color: '#ff9800' }} />
                <div>
                  <div className="text-heading-sm">{city.name}</div>
                  <div className="text-body-lg" style={{ color: '#1565c0' }}>{city.temp}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      );
    }

    if (host === 'wiki.ink') {
      return (
        <div className="h-full overflow-auto p-6" style={{ backgroundColor: 'white' }}>
          <h1 className="text-heading-lg mb-2" style={{ color: 'var(--ink-900)' }}>水墨画 (Ink Wash Painting)</h1>
          <p className="text-body-sm mb-4" style={{ color: 'var(--ink-500)' }}>来自墨百科，自由的百科全书</p>
          <div className="text-body-md space-y-3" style={{ color: 'var(--ink-800)' }}>
            <p>水墨画，又称中国画，中国传统绘画形式之一。以墨为主要原料，加以清水的多少引为浓墨、淡墨、干墨、湿墨、焦墨等，画出不同浓淡（黑、白、灰）层次。</p>
            <p>水墨画起源于唐代，成于五代，盛于宋元，明清以来继续发展。其特点在于讲究笔墨情趣，追求形神兼备，强调意境营造。</p>
            <h3 className="text-heading-sm mt-4 mb-2">历史 (History)</h3>
            <p>唐代王维被尊为"水墨画之祖"，他首创了泼墨山水。宋代是水墨画发展的黄金时期，苏轼、米芾等文人画家将诗、书、画融为一体，开创了文人画传统。</p>
          </div>
        </div>
      );
    }

    if (host === 'shop.ink') {
      const products = [
        { name: '毛笔套装', price: '¥128' },
        { name: '宣纸 (100张)', price: '¥89' },
        { name: '墨锭', price: '¥56' },
        { name: '砚台', price: '¥168' },
      ];
      return (
        <div className="h-full overflow-auto p-6" style={{ backgroundColor: '#fafafa' }}>
          <h1 className="text-heading-lg mb-4" style={{ color: 'var(--ink-900)' }}>文房四宝商城 (Stationery Shop)</h1>
          <div className="grid grid-cols-2 gap-4">
            {products.map((p, i) => (
              <div key={i} className="p-4 rounded-lg" style={{ backgroundColor: 'white', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
                <div className="h-24 rounded mb-3 flex items-center justify-center" style={{ backgroundColor: '#f0f0f0' }}>
                  <ShoppingCart size={32} style={{ color: 'var(--ink-300)' }} />
                </div>
                <div className="text-body-md font-medium" style={{ color: 'var(--ink-800)' }}>{p.name}</div>
                <div className="text-heading-sm mt-1" style={{ color: 'var(--cinnabar)' }}>{p.price}</div>
              </div>
            ))}
          </div>
        </div>
      );
    }

    if (host === 'music.ink') {
      const songs = [
        { title: '高山流水', artist: '古琴名曲', duration: '5:32' },
        { title: '平沙落雁', artist: '古筝独奏', duration: '4:18' },
        { title: '十面埋伏', artist: '琵琶名曲', duration: '6:45' },
        { title: '梅花三弄', artist: '笛子独奏', duration: '4:56' },
      ];
      return (
        <div className="h-full overflow-auto p-6" style={{ backgroundColor: '#fafafa' }}>
          <h1 className="text-heading-lg mb-4" style={{ color: 'var(--ink-900)' }}>音乐 (Music)</h1>
          {songs.map((s, i) => (
            <div key={i} className="flex items-center gap-4 p-3 mb-2 rounded-lg" style={{ backgroundColor: 'white' }}>
              <Music size={20} style={{ color: '#e91e63' }} />
              <div className="flex-1">
                <div className="text-body-md" style={{ color: 'var(--ink-800)' }}>{s.title}</div>
                <div className="text-caption" style={{ color: 'var(--ink-500)' }}>{s.artist}</div>
              </div>
              <div className="text-caption" style={{ color: 'var(--ink-400)' }}>{s.duration}</div>
            </div>
          ))}
        </div>
      );
    }

    if (host === 'video.ink') {
      const videos = [
        { title: '水墨画入门教程 - 第一集', views: '12.5万', duration: '15:30' },
        { title: '山水画技法详解', views: '8.3万', duration: '22:45' },
        { title: '书法基本功训练', views: '6.7万', duration: '18:20' },
        { title: '古琴演奏艺术', views: '4.2万', duration: '30:15' },
      ];
      return (
        <div className="h-full overflow-auto p-6" style={{ backgroundColor: '#fafafa' }}>
          <h1 className="text-heading-lg mb-4" style={{ color: 'var(--ink-900)' }}>视频 (Video)</h1>
          {videos.map((v, i) => (
            <div key={i} className="flex gap-3 p-3 mb-2 rounded-lg" style={{ backgroundColor: 'white' }}>
              <div className="w-32 h-20 rounded flex items-center justify-center flex-shrink-0" style={{ backgroundColor: '#333' }}>
                <Video size={24} style={{ color: 'white' }} />
              </div>
              <div className="flex-1">
                <div className="text-body-md" style={{ color: 'var(--ink-800)' }}>{v.title}</div>
                <div className="text-caption mt-1" style={{ color: 'var(--ink-500)' }}>{v.views} 次观看</div>
              </div>
            </div>
          ))}
        </div>
      );
    }

    if (host === 'code.ink') {
      const snippets = [
        { title: '水墨画生成器 - Python', lang: 'Python', desc: '使用PIL库生成随机水墨画效果' },
        { title: '书法字体渲染 - CSS', lang: 'CSS', desc: '使用CSS变量实现动态书法字体样式' },
        { title: 'Canvas 粒子效果', lang: 'JavaScript', desc: 'HTML5 Canvas实现的墨水粒子动画' },
      ];
      return (
        <div className="h-full overflow-auto p-6" style={{ backgroundColor: '#fafafa' }}>
          <h1 className="text-heading-lg mb-4" style={{ color: 'var(--ink-900)' }}>代码分享 (Code Share)</h1>
          {snippets.map((s, i) => (
            <div key={i} className="p-4 mb-3 rounded-lg" style={{ backgroundColor: 'white', border: '1px solid #e0e0e0' }}>
              <div className="flex items-center gap-2 mb-2">
                <Code2 size={18} style={{ color: '#4a7c59' }} />
                <span className="text-body-md font-medium" style={{ color: 'var(--ink-800)' }}>{s.title}</span>
              </div>
              <div className="text-caption mb-2" style={{ color: 'var(--info)' }}>{s.lang}</div>
              <div className="text-body-sm" style={{ color: 'var(--ink-600)' }}>{s.desc}</div>
            </div>
          ))}
        </div>
      );
    }

    if (host === 'art.ink') {
      return (
        <div className="h-full overflow-auto p-6" style={{ backgroundColor: '#fafafa' }}>
          <h1 className="text-heading-lg mb-4" style={{ color: 'var(--ink-900)' }}>数字艺术馆 (Digital Art Gallery)</h1>
          <div className="grid grid-cols-3 gap-3">
            {[1,2,3,4,5,6].map((n) => (
              <div key={n} className="aspect-square rounded-lg flex items-center justify-center" style={{ backgroundColor: '#f0f0f0' }}>
                <Palette size={32} style={{ color: 'var(--ink-300)' }} />
              </div>
            ))}
          </div>
        </div>
      );
    }

    if (host === 'forum.ink') {
      const threads = [
        { title: '大家最近在读什么书？', author: '墨友_01', replies: 23 },
        { title: '初学者求推荐毛笔品牌', author: '书法小白', replies: 15 },
        { title: '分享我的山水画练习作品', author: '山水之间', replies: 42 },
        { title: '关于水墨画颜料的选择', author: '色彩探索', replies: 18 },
      ];
      return (
        <div className="h-full overflow-auto p-6" style={{ backgroundColor: '#fafafa' }}>
          <h1 className="text-heading-lg mb-4" style={{ color: 'var(--ink-900)' }}>论坛 (Forum)</h1>
          {threads.map((t, i) => (
            <div key={i} className="flex items-center gap-3 p-3 mb-2 rounded-lg" style={{ backgroundColor: 'white' }}>
              <MessageSquare size={18} style={{ color: 'var(--ink-400)' }} />
              <div className="flex-1">
                <div className="text-body-md" style={{ color: 'var(--ink-800)' }}>{t.title}</div>
                <div className="text-caption" style={{ color: 'var(--ink-500)' }}>by {t.author}</div>
              </div>
              <div className="text-caption" style={{ color: 'var(--ink-400)' }}>{t.replies} 回复</div>
            </div>
          ))}
        </div>
      );
    }

    // Generic site page
    return (
      <div className="flex flex-col items-center justify-center h-full" style={{ backgroundColor: 'var(--ink-50)' }}>
        <Globe size={48} style={{ color: 'var(--ink-300)' }} className="mb-4" />
        <h1 className="text-heading-lg mb-2" style={{ color: 'var(--ink-700)' }}>{siteInfo.title}</h1>
        <p className="text-body-md mb-4" style={{ color: 'var(--ink-500)' }}>{host}</p>
        <p className="text-body-sm" style={{ color: 'var(--ink-400)' }}>这是一个模拟网站 (Simulated website)</p>
      </div>
    );
  }

  // 404 Page
  return (
    <div className="flex flex-col items-center justify-center h-full" style={{ backgroundColor: 'var(--ink-50)' }}>
      <div className="text-display-xl mb-4" style={{ color: 'var(--ink-300)', fontFamily: '"ZCOOL XiaoWei", cursive, serif' }}>
        404
      </div>
      <h1 className="text-heading-lg mb-2" style={{ color: 'var(--ink-700)' }}>页面未找到 (Page Not Found)</h1>
      <p className="text-body-md mb-4" style={{ color: 'var(--ink-500)' }}>无法找到地址: {url}</p>
      <button
        onClick={() => onNavigate(HOME_URL)}
        className="px-4 py-2 rounded text-body-sm transition-all duration-150 hover:scale-105"
        style={{ backgroundColor: 'var(--ink-800)', color: 'var(--ink-50)' }}
      >
        返回首页 (Back to Home)
      </button>
    </div>
  );
}

export default function Browser({ windowId: _windowId }: BrowserProps) {
  const [tabs, setTabs] = useState<Tab[]>([{
    id: 'tab-0',
    url: HOME_URL,
    title: '起始页 (Start)',
    history: [HOME_URL],
    historyIndex: 0,
  }]);
  const [activeTabId, setActiveTabId] = useState('tab-0');
  const [bookmarks, setBookmarks] = useState<BookmarkItem[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [addressValue, setAddressValue] = useState(HOME_URL);
  const [isLoading, setIsLoading] = useState(false);
  const addressRef = useRef<HTMLInputElement>(null);

  const activeTab = tabs.find(t => t.id === activeTabId) || tabs[0];

  useEffect(() => {
    if (activeTab) {
      setAddressValue(activeTab.url);
    }
  }, [activeTab?.url]);

  const loadBookmarks = useCallback(async () => {
    try {
      const data = await bookmarksClient.list();
      setBookmarks(data.bookmarks);
    } catch {
      setBookmarks([]);
    }
  }, []);

  useEffect(() => {
    loadBookmarks();
  }, [loadBookmarks]);

  const navigateTo = useCallback((url: string, tabId?: string) => {
    const targetId = tabId || activeTabId;
    setIsLoading(true);
    setTimeout(() => {
      setTabs(prev => prev.map(t => {
        if (t.id !== targetId) return t;
        const newHistory = t.history.slice(0, t.historyIndex + 1);
        newHistory.push(url);
        const title = titleForURL(url);
        return {
          ...t,
          url,
          title: title || url,
          history: newHistory,
          historyIndex: newHistory.length - 1,
        };
      }));
      setHistory(prev => [{ url, title: url, timestamp: new Date() }, ...prev].slice(0, 100));
      setIsLoading(false);
    }, 300);
  }, [activeTabId]);

  const syncFrameNavigation = useCallback((url: string) => {
    setTabs(prev => prev.map(t => {
      if (t.id !== activeTabId || t.url === url) return t;
      const newHistory = t.history.slice(0, t.historyIndex + 1);
      newHistory.push(url);
      return {
        ...t,
        url,
        title: titleForURL(url),
        history: newHistory,
        historyIndex: newHistory.length - 1,
      };
    }));
    setHistory(prev => {
      if (prev[0]?.url === url) return prev;
      return [{ url, title: titleForURL(url), timestamp: new Date() }, ...prev].slice(0, 100);
    });
  }, [activeTabId]);

  const canGoBack = activeTab?.historyIndex > 0;
  const canGoForward = activeTab ? activeTab.historyIndex < activeTab.history.length - 1 : false;

  const goBack = () => {
    if (!canGoBack || !activeTab) return;
    const newIndex = activeTab.historyIndex - 1;
    const url = activeTab.history[newIndex];
    setTabs(prev => prev.map(t =>
      t.id === activeTabId ? { ...t, url, historyIndex: newIndex } : t
    ));
  };

  const goForward = () => {
    if (!canGoForward || !activeTab) return;
    const newIndex = activeTab.historyIndex + 1;
    const url = activeTab.history[newIndex];
    setTabs(prev => prev.map(t =>
      t.id === activeTabId ? { ...t, url, historyIndex: newIndex } : t
    ));
  };

  const refresh = () => {
    setIsLoading(true);
    setTimeout(() => setIsLoading(false), 500);
  };

  const goHome = () => navigateTo(HOME_URL);

  const newTab = () => {
    const newId = `tab-${++tabCounter}`;
    setTabs(prev => [...prev, {
      id: newId,
      url: HOME_URL,
      title: '新标签 (New Tab)',
      history: [HOME_URL],
      historyIndex: 0,
    }]);
    setActiveTabId(newId);
  };

  const closeTab = (tabId: string) => {
    if (tabs.length === 1) return;
    setTabs(prev => {
      const filtered = prev.filter(t => t.id !== tabId);
      if (tabId === activeTabId) {
        const closedIdx = prev.findIndex(t => t.id === tabId);
        const newActive = filtered[Math.min(closedIdx, filtered.length - 1)];
        setActiveTabId(newActive.id);
      }
      return filtered;
    });
  };

  const toggleBookmark = async () => {
    const url = activeTab?.url;
    if (!url || url === HOME_URL) return;
    const existing = bookmarks.find(b => b.url === url);
    if (existing) {
      await bookmarksClient.deleteBookmark(existing.id);
    } else {
      await bookmarksClient.addBookmark({
        title: activeTab.title || titleForURL(url),
        url,
        folder_id: 'favorites',
      });
    }
    await loadBookmarks();
  };

  const isBookmarked = bookmarks.some(b => b.url === activeTab?.url);

  const handleAddressSubmit = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      let url = addressValue.trim();
      if (!url) return;
      if (url.startsWith('ink://')) {
        navigateTo(url);
      } else if (!url.startsWith('http://') && !url.startsWith('https://')) {
        if (url.includes('.') && !url.includes(' ')) {
          url = 'https://' + url;
          navigateTo(url);
        } else {
          navigateTo('ink://search?q=' + encodeURIComponent(url));
        }
      } else {
        navigateTo(url);
      }
    }
  };

  return (
    <div className="w-full h-full flex flex-col" style={{ backgroundColor: 'var(--ink-50)' }}>
      {/* Address bar */}
      <div className="flex items-center gap-2 px-3 py-1.5" style={{ backgroundColor: 'var(--ink-100)', borderBottom: '1px solid var(--ink-200)' }}>
        <div className="flex items-center gap-1">
          <button onClick={goBack} disabled={!canGoBack} className="p-1.5 rounded transition-all duration-150 disabled:opacity-30 hover:bg-black/5">
            <ArrowLeft size={16} style={{ color: 'var(--ink-700)' }} />
          </button>
          <button onClick={goForward} disabled={!canGoForward} className="p-1.5 rounded transition-all duration-150 disabled:opacity-30 hover:bg-black/5">
            <ArrowRight size={16} style={{ color: 'var(--ink-700)' }} />
          </button>
          <button onClick={refresh} className="p-1.5 rounded transition-all duration-150 hover:bg-black/5">
            <RotateCw size={16} style={{ color: 'var(--ink-700)' }} className={isLoading ? 'animate-spin' : ''} />
          </button>
          <button onClick={goHome} className="p-1.5 rounded transition-all duration-150 hover:bg-black/5">
            <Home size={16} style={{ color: 'var(--ink-700)' }} />
          </button>
        </div>
        <div className="flex-1 flex items-center gap-2 px-3 py-1 rounded-full" style={{ backgroundColor: 'var(--ink-50)', border: '1px solid var(--ink-200)' }}>
          <Lock size={14} style={{ color: 'var(--success)' }} />
          <input
            ref={addressRef}
            type="text"
            value={addressValue}
            onChange={(e) => setAddressValue(e.target.value)}
            onKeyDown={handleAddressSubmit}
            className="flex-1 text-body-sm bg-transparent outline-none"
            style={{ color: 'var(--ink-700)' }}
          />
          <button onClick={toggleBookmark} className="transition-all duration-150 hover:scale-110">
            <Star size={14} style={{ color: isBookmarked ? '#b8860b' : 'var(--ink-400)', fill: isBookmarked ? '#b8860b' : 'none' }} />
          </button>
        </div>
        <button onClick={() => setShowHistory(!showHistory)} className="p-1.5 rounded transition-all duration-150 hover:bg-black/5">
          <Clock size={16} style={{ color: showHistory ? 'var(--cinnabar)' : 'var(--ink-700)' }} />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-0.5 px-2 overflow-x-auto" style={{ backgroundColor: 'var(--ink-100)', borderBottom: '1px solid var(--ink-200)', minHeight: '32px' }}>
        {tabs.map(tab => (
          <div
            key={tab.id}
            onClick={() => setActiveTabId(tab.id)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-caption cursor-pointer transition-all duration-150 select-none max-w-[160px]"
            style={{
              backgroundColor: tab.id === activeTabId ? 'var(--ink-50)' : 'var(--ink-200)',
              color: tab.id === activeTabId ? 'var(--ink-900)' : 'var(--ink-500)',
              borderTop: tab.id === activeTabId ? '2px solid var(--cinnabar)' : '2px solid transparent',
              borderRadius: '4px 4px 0 0',
            }}
          >
            <Globe size={12} />
            <span className="truncate flex-1">{tab.title}</span>
            {tabs.length > 1 && (
              <button
                onClick={(e) => { e.stopPropagation(); closeTab(tab.id); }}
                className="opacity-0 hover:opacity-100 rounded-full p-0.5"
                style={{ color: 'var(--ink-400)' }}
              >
                <X size={12} />
              </button>
            )}
          </div>
        ))}
        <button onClick={newTab} className="p-1 rounded transition-all duration-150 hover:bg-black/5 ml-1">
          <Plus size={14} style={{ color: 'var(--ink-600)' }} />
        </button>
      </div>

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden relative">
        <div className="flex-1 overflow-hidden">
          {isLoading ? (
            <div className="w-full h-full flex flex-col items-center justify-center gap-3" style={{ backgroundColor: 'var(--ink-50)' }}>
              <div className="w-48 h-3 rounded animate-pulse" style={{ backgroundColor: 'var(--ink-200)' }} />
              <div className="w-36 h-3 rounded animate-pulse" style={{ backgroundColor: 'var(--ink-200)' }} />
              <div className="w-56 h-3 rounded animate-pulse" style={{ backgroundColor: 'var(--ink-200)' }} />
            </div>
          ) : shouldUseSimulatedPage(activeTab?.url || HOME_URL) ? (
            <SimulatedPage url={activeTab?.url || HOME_URL} onNavigate={(url) => navigateTo(url)} />
          ) : (
            <ServerBrowserPage url={activeTab?.url || HOME_URL} onFrameNavigate={syncFrameNavigation} />
          )}
        </div>

        {/* History sidebar */}
        {showHistory && (
          <div
            className="w-64 overflow-auto flex-shrink-0"
            style={{ backgroundColor: 'var(--ink-100)', borderLeft: '1px solid var(--ink-200)' }}
          >
            <div className="flex items-center justify-between p-3" style={{ borderBottom: '1px solid var(--ink-200)' }}>
              <span className="text-body-sm font-medium" style={{ color: 'var(--ink-700)' }}>历史 (History)</span>
              <button onClick={() => setShowHistory(false)} className="p-1 rounded hover:bg-black/5">
                <X size={14} style={{ color: 'var(--ink-400)' }} />
              </button>
            </div>
            {history.length === 0 ? (
              <div className="p-4 text-center text-body-sm" style={{ color: 'var(--ink-400)' }}>暂无历史记录</div>
            ) : (
              <div>
                {history.map((entry, i) => (
                  <button
                    key={i}
                    onClick={() => { navigateTo(entry.url); setShowHistory(false); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-left transition-all duration-150 hover:bg-black/5"
                  >
                    <Clock size={12} style={{ color: 'var(--ink-400)', flexShrink: 0 }} />
                    <div className="flex-1 min-w-0">
                      <div className="text-caption truncate" style={{ color: 'var(--ink-700)' }}>{entry.title}</div>
                      <div className="text-caption truncate" style={{ color: 'var(--ink-400)' }}>{entry.url}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* Bookmarks section */}
            <div className="flex items-center p-3 mt-2" style={{ borderTop: '1px solid var(--ink-200)', borderBottom: '1px solid var(--ink-200)' }}>
              <Bookmark size={14} style={{ color: 'var(--ink-500)', marginRight: '8px' }} />
              <span className="text-body-sm font-medium" style={{ color: 'var(--ink-700)' }}>书签 (Bookmarks)</span>
            </div>
            {bookmarks.map((bm) => (
              <button
                key={bm.id}
                onClick={() => {
                  navigateTo(bm.url);
                  bookmarksClient.visitBookmark(bm.id).then(loadBookmarks).catch(() => undefined);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-left transition-all duration-150 hover:bg-black/5"
              >
                <Star size={12} style={{ color: '#b8860b', fill: '#b8860b', flexShrink: 0 }} />
                <span className="text-caption truncate" style={{ color: 'var(--ink-700)' }}>{bm.title}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Status bar */}
      <div className="flex items-center justify-between px-3 py-0.5" style={{ backgroundColor: 'var(--ink-100)', borderTop: '1px solid var(--ink-200)' }}>
        <div className="flex items-center gap-3">
          <span className="text-caption" style={{ color: 'var(--ink-500)' }}>
            {isLoading ? '加载中... (Loading...)' : '完成 (Done)'}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <Lock size={10} style={{ color: 'var(--success)' }} />
          <span className="text-caption" style={{ color: 'var(--ink-400)' }}>
            {(activeTab?.url || '').startsWith('http://') ? 'HTTP' : (activeTab?.url || '').startsWith('https://') ? 'HTTPS' : 'LOCAL'}
          </span>
          <span className="text-caption" style={{ color: 'var(--ink-400)' }}>100%</span>
        </div>
      </div>
    </div>
  );
}

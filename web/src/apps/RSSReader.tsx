import { useState } from 'react';
import {
  Rss, Plus, X, RefreshCw, Star, Search,
  CheckCircle, Globe, BookOpen,
  Newspaper, Sparkles, PenTool, Palette, Code2
} from 'lucide-react';

interface Article {
  id: string;
  title: string;
  summary: string;
  content: string;
  date: string;
  read: boolean;
  starred: boolean;
  feedId: string;
}

interface Feed {
  id: string;
  name: string;
  url: string;
  category: string;
  unreadCount: number;
  icon: typeof Rss;
}

interface RSSReaderProps {
  windowId?: string;
}

const FEEDS: Feed[] = [
  { id: 'f1', name: '墨 OS 博客 (Ink OS Blog)', url: 'https://blog.ink-os.local/feed', category: '系统', icon: Code2, unreadCount: 5 },
  { id: 'f2', name: '中华艺术日报 (Chinese Art Daily)', url: 'https://artdaily.ink/feed', category: '艺术', icon: Palette, unreadCount: 8 },
  { id: 'f3', name: '科技墨迹 (Tech Ink)', url: 'https://techink.ink/feed', category: '科技', icon: Sparkles, unreadCount: 6 },
  { id: 'f4', name: '诗词周刊 (Poetry Weekly)', url: 'https://poetryweekly.ink/feed', category: '文学', icon: PenTool, unreadCount: 4 },
  { id: 'f5', name: '书法时报 (Calligraphy Times)', url: 'https://calligraphy.ink/feed', category: '书法', icon: BookOpen, unreadCount: 7 },
];

const ARTICLES: Article[] = [
  // Ink OS Blog
  { id: 'a1', title: '墨 OS 2.0 版本发布：全新水墨主题引擎', summary: '经过六个月的开发，墨 OS 2.0 正式发布。新版本引入了全新的渲染引擎，让水墨效果更加逼真自然。', content: '经过六个月的精心开发，墨 OS 2.0 版本正式发布。\n\n本次更新的亮点包括：\n\n1. 全新水墨渲染引擎：采用最新的粒子系统模拟墨水在宣纸上的晕染效果。\n2. 性能优化：启动速度提升40%，内存占用降低25%。\n3. 新增8款应用程序：包括围棋、象棋、待办事项等。\n4. 改进的文件管理器：支持标签页和快速预览。\n5. 更好的多语言支持。\n\n感谢所有测试用户的反馈！', date: '2024-01-15', read: false, starred: false, feedId: 'f1' },
  { id: 'a2', title: '如何在墨 OS 中定制你的桌面壁纸', summary: '本教程详细介绍如何使用内置壁纸编辑器创建个性化水墨风格壁纸。', content: '墨 OS 内置了强大的壁纸编辑器，让你可以轻松创建个性化的水墨风格桌面背景。\n\n步骤：\n1. 打开「设置」应用\n2. 选择「桌面与壁纸」\n3. 点击「创建自定义壁纸」\n4. 选择底图、添加山水元素\n5. 调整墨色浓淡\n6. 保存并应用\n\n更多高级技巧请参阅完整文档。', date: '2024-01-13', read: false, starred: true, feedId: 'f1' },
  { id: 'a3', title: '墨 OS 应用开发入门指南', summary: '想要为墨 OS 开发应用？这篇指南将带你从零开始创建你的第一个应用。', content: '墨 OS 采用 React + TypeScript 技术栈，开发者可以使用熟悉的 Web 技术创建原生体验的应用。\n\n环境准备：\n- Node.js 20+\n- npm 或 yarn\n- 墨 OS SDK\n\n快速开始：\n```bash\nnpm create ink-app my-app\ncd my-app\nnpm install\nnpm run dev\n```\n\nAPI 文档详见开发者中心。', date: '2024-01-10', read: true, starred: false, feedId: 'f1' },
  { id: 'a4', title: '系统安全更新通知', summary: '已推送重要的安全补丁，建议所有用户尽快更新。', content: '安全团队发现并修复了三个中等严重程度的安全漏洞。\n\n受影响版本：墨 OS 1.x - 2.0.3\n修复版本：2.0.4\n\n更新方式：系统自动更新已推送，也可手动在「设置」-「系统更新」中检查。\n\n安全永远是我们的首要任务。', date: '2024-01-08', read: true, starred: false, feedId: 'f1' },
  { id: 'a5', title: '社区贡献者月度表彰', summary: '感谢本月为墨 OS 做出贡献的开发者们。', content: '本月优秀贡献者：\n\n- @inkArtist: 修复了文件管理器中的三个bug\n- @calligraphyDev: 新增书法练习应用\n- @mountainCoder: 优化了系统性能\n\n你们的贡献让墨 OS 变得更好！', date: '2024-01-05', read: true, starred: false, feedId: 'f1' },
  // Chinese Art Daily
  { id: 'a6', title: '故宫博物院推出全新数字文物展览', summary: '「数字故宫」项目正式上线，超过10万件文物实现高清数字化。', content: '故宫博物院今日宣布「数字故宫」项目正式上线。\n\n该项目历时三年，完成了超过10万件珍贵文物的数字化工作。观众可以通过互联网高清观赏文物细节，部分展品还提供3D模型浏览。\n\n特别推荐的展览包括：\n- 《千里江山图》全卷高清展示\n- 宋代瓷器3D互动展览\n- 紫禁城建筑VR漫游\n\n访问 digital.dpm.org.cn 即可体验。', date: '2024-01-14', read: false, starred: false, feedId: 'f2' },
  { id: 'a7', title: '当代水墨艺术家王天德个展开幕', summary: '著名当代水墨艺术家王天德的最新个展「墨境」在上海当代艺术馆开幕。', content: '王天德最新个展「墨境」今日在上海当代艺术馆开幕，展期持续至3月底。\n\n本次展览共展出 artist 近三年创作的40余幅作品，包括大型水墨装置、互动投影作品和传统纸本水墨。\n\n策展人表示：「王天德的作品将传统水墨语言与当代观念完美融合，是东方美学在21世纪的重要表达。」', date: '2024-01-12', read: false, starred: true, feedId: 'f2' },
  { id: 'a8', title: '苏州博物馆举办吴门画派特展', summary: '「吴门风烟」特展汇集了沈周、文徵明、唐寅、仇英等吴门四家的精品之作。', content: '苏州博物馆「吴门风烟」特展于今日开幕，展出明代吴门画派代表作品80余件。\n\n展品包括：\n- 沈周《庐山高图》\n- 文徵明《真赏斋图》\n- 唐寅《秋风纨扇图》\n- 仇英《桃源仙境图》\n\n此次特展是近二十年来规模最大的吴门画派专题展览。', date: '2024-01-11', read: true, starred: false, feedId: 'f2' },
  { id: 'a9', title: '敦煌壁画数字化保护取得新突破', summary: '敦煌研究院发布最新壁画数字化成果，色彩还原度达到历史新高。', content: '敦煌研究院今日发布了最新的壁画数字化保护成果。\n\n新技术亮点：\n1. 多光谱成像技术，还原壁画原始色彩\n2. AI辅助修复，智能识别受损区域\n3. 高精度3D扫描，记录壁画表面纹理\n4. 区块链存证，确保数字资产安全\n\n目前已完成第285窟、第320窟等重点洞窟的数字化工作。', date: '2024-01-09', read: false, starred: false, feedId: 'f2' },
  // Tech Ink
  { id: 'a10', title: '量子计算在密码学领域的最新应用', summary: '研究人员展示了如何利用量子计算机破解传统加密算法。', content: '清华大学量子信息中心的研究团队在《自然》杂志发表了最新研究成果。\n\n研究表明，使用50个量子比特的量子计算机可以在数小时内破解2048位RSA加密。\n\n团队同时提出了基于量子密钥分发的新型加密方案，该方案被认为可以抵抗量子计算机的攻击。\n\n这一发现对金融、政府等领域的网络安全具有重大意义。', date: '2024-01-14', read: false, starred: false, feedId: 'f3' },
  { id: 'a11', title: '国产AI芯片性能突破国际水平', summary: '新一代AI训练芯片「墨芯」在基准测试中表现优异。', content: '国产AI芯片「墨芯3代」在MLPerf基准测试中取得了突破性成绩。\n\n关键指标：\n- 训练性能：比上一代提升300%\n- 能效比：领先国际同类产品40%\n- 支持模型：从GPT到扩散模型全覆盖\n\n该芯片采用7nm工艺制造，集成了超过1000亿个晶体管。\n\n业内专家认为，这标志着国产AI芯片已进入世界领先水平。', date: '2024-01-11', read: true, starred: false, feedId: 'f3' },
  { id: 'a12', title: '6G通信技术白皮书发布', summary: '工信部发布6G技术研发白皮书，勾勒未来通信蓝图。', content: '工信部今日发布《6G技术研发白皮书》，系统阐述了6G技术的发展愿景和关键技术方向。\n\n6G关键特征：\n- 峰值速率：1 Tbps\n- 空口时延：0.1毫秒\n- 连接密度：每平方米1000个设备\n- 频谱效率：比5G提升10倍\n\n预计2030年左右实现商用部署。', date: '2024-01-08', read: true, starred: false, feedId: 'f3' },
  // Poetry Weekly
  { id: 'a13', title: '《全唐诗》数字化项目完成', summary: '历时五年的《全唐诗》数字化校勘工程正式完成。', content: '由北京大学牵头的《全唐诗》数字化校勘项目今日宣布完成。\n\n该项目对清代康熙年间编定的《全唐诗》进行了全面数字化处理，共收录诗人2200余位，诗作48900余首。\n\n成果包括：\n- 全文检索系统\n- 多版本比对工具\n- 诗人关系网络图\n- 地理信息系统\n\n访问 poetry.pku.edu.cn 即可使用。', date: '2024-01-13', read: false, starred: true, feedId: 'f4' },
  { id: 'a14', title: '现代诗歌创作论坛征稿启事', summary: '2024年度现代诗歌创作论坛面向全球华人诗人征稿。', content: '2024年度现代诗歌创作论坛将于4月在杭州举行，现面向全球华人诗人征稿。\n\n征稿要求：\n- 主题：「城市与山水」\n- 体裁：现代诗，每人限投3首\n- 字数：每首不超过50行\n- 截止日期：2024年3月1日\n\n优秀作品将结集出版，并由专业朗诵团队录制音频。', date: '2024-01-10', read: true, starred: false, feedId: 'f4' },
  // Calligraphy Times
  { id: 'a15', title: '兰亭书法节筹备工作启动', summary: '第40届兰亭书法节将于今年三月在绍兴举行。', content: '第40届兰亭书法节筹备工作正式启动，活动将于3月3日（农历二月初三）在绍兴兰亭举行。\n\n主要活动包括：\n- 晋圣仪式\n- 书法大赛颁奖典礼\n- 名家现场挥毫\n- 书法教育论坛\n- 青少年书法展览\n\n本届书法节以「传承经典，创新未来」为主题。', date: '2024-01-12', read: false, starred: false, feedId: 'f5' },
  { id: 'a16', title: '硬笔书法等级考试报名开始', summary: '2024年春季硬笔书法等级考试报名通道已开启。', content: '中国书法家协会宣布，2024年春季硬笔书法等级考试报名正式开始。\n\n考试分级：\n- 初级（1-3级）\n- 中级（4-6级）\n- 高级（7-9级）\n\n报名时间：1月15日 - 2月15日\n考试时间：3月中旬\n\n报名方式：登录书法考级官方网站在线报名。', date: '2024-01-09', read: true, starred: false, feedId: 'f5' },
  { id: 'a17', title: '碑帖鉴赏：集王圣教序的艺术价值', summary: '深入解析唐代怀仁集王羲之书圣教序的书法价值。', content: '《集王圣教序》全称《大唐三藏圣教序》，由唐太宗撰文，唐代僧人怀仁集晋右军王羲之书。\n\n艺术特色：\n1. 集字而成，却能气韵贯通\n2. 笔法丰富，展现了王羲之行书的多种面貌\n3. 结构严谨，开合有度\n4. 章法自然，疏密得当\n\n学习行书者，此帖为必临经典。', date: '2024-01-07', read: true, starred: false, feedId: 'f5' },
];

export default function RSSReader({ windowId: _windowId }: RSSReaderProps) {
  const [feeds, setFeeds] = useState<Feed[]>(FEEDS);
  const [articles, setArticles] = useState<Article[]>(ARTICLES);
  const [selectedFeedId, setSelectedFeedId] = useState<string | null>(null);
  const [selectedArticleId, setSelectedArticleId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddFeed, setShowAddFeed] = useState(false);
  const [newFeedUrl, setNewFeedUrl] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const selectedArticle = articles.find(a => a.id === selectedArticleId);
  feeds.find(f => f.id === selectedFeedId); // validate feed exists

  const filteredArticles = articles.filter(a => {
    const matchesFeed = !selectedFeedId || a.feedId === selectedFeedId;
    const matchesSearch = !searchQuery ||
      a.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.summary.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.content.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesFeed && matchesSearch;
  });

  const totalUnread = articles.filter(a => !a.read).length;

  const selectArticle = (id: string) => {
    setSelectedArticleId(id);
    setArticles(prev => prev.map(a => a.id === id ? { ...a, read: true } : a));
    // Update feed unread count
    const article = articles.find(a => a.id === id);
    if (article && !article.read) {
      setFeeds(prev => prev.map(f => {
        if (f.id === article.feedId) return { ...f, unreadCount: Math.max(0, f.unreadCount - 1) };
        return f;
      }));
    }
  };

  const toggleStar = (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setArticles(prev => prev.map(a => a.id === id ? { ...a, starred: !a.starred } : a));
  };

  const markAllRead = () => {
    const articleIds = filteredArticles.map(a => a.id);
    setArticles(prev => prev.map(a => articleIds.includes(a.id) ? { ...a, read: true } : a));
    setFeeds(prev => prev.map(f => {
      if (!selectedFeedId || f.id === selectedFeedId) return { ...f, unreadCount: 0 };
      return f;
    }));
  };

  const refreshFeeds = () => {
    setRefreshing(true);
    setTimeout(() => {
      setRefreshing(false);
    }, 1500);
  };

  const addFeed = () => {
    if (!newFeedUrl.trim()) return;
    const newFeed: Feed = {
      id: `f-${Date.now()}`,
      name: '新订阅 (New Feed)',
      url: newFeedUrl,
      category: '自定义',
      unreadCount: 0,
      icon: Rss,
    };
    setFeeds(prev => [...prev, newFeed]);
    setNewFeedUrl('');
    setShowAddFeed(false);
  };

  const removeFeed = (feedId: string) => {
    setFeeds(prev => prev.filter(f => f.id !== feedId));
    if (selectedFeedId === feedId) setSelectedFeedId(null);
  };

  const starredCount = articles.filter(a => a.starred).length;

  return (
    <div className="w-full h-full flex" style={{ backgroundColor: 'var(--ink-50)' }}>
      {/* Feed sidebar */}
      <div className="w-52 flex-shrink-0 flex flex-col" style={{ backgroundColor: 'var(--ink-100)', borderRight: '1px solid var(--ink-200)' }}>
        <div className="p-3" style={{ borderBottom: '1px solid var(--ink-200)' }}>
          <div className="flex items-center gap-2 mb-2">
            <Rss size={18} style={{ color: 'var(--cinnabar)' }} />
            <h2 className="text-heading-sm" style={{ color: 'var(--ink-900)' }}>RSS 阅读器</h2>
          </div>
          <button
            onClick={() => setShowAddFeed(!showAddFeed)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-caption transition-all duration-150 hover:bg-black/5 w-full"
            style={{ color: 'var(--ink-600)' }}
          >
            <Plus size={14} /> 添加订阅 (Add Feed)
          </button>
        </div>

        {showAddFeed && (
          <div className="p-3" style={{ borderBottom: '1px solid var(--ink-200)' }}>
            <input
              type="text"
              value={newFeedUrl}
              onChange={(e) => setNewFeedUrl(e.target.value)}
              placeholder="RSS 链接..."
              className="w-full px-2 py-1 rounded text-caption outline-none mb-2"
              style={{ backgroundColor: 'var(--ink-50)', border: '1px solid var(--ink-200)', color: 'var(--ink-700)' }}
              onKeyDown={(e) => e.key === 'Enter' && addFeed()}
            />
            <div className="flex gap-2">
              <button onClick={addFeed} className="px-3 py-1 rounded text-caption" style={{ backgroundColor: 'var(--ink-800)', color: 'var(--ink-50)' }}>添加</button>
              <button onClick={() => setShowAddFeed(false)} className="px-3 py-1 rounded text-caption" style={{ color: 'var(--ink-500)' }}>取消</button>
            </div>
          </div>
        )}

        {/* All feeds */}
        <button
          onClick={() => setSelectedFeedId(null)}
          className="w-full flex items-center gap-2.5 px-4 py-2 text-left text-body-sm transition-all duration-150"
          style={{
            backgroundColor: selectedFeedId === null ? 'var(--wash-light)' : 'transparent',
            borderLeft: selectedFeedId === null ? '3px solid var(--cinnabar)' : '3px solid transparent',
            color: selectedFeedId === null ? 'var(--ink-900)' : 'var(--ink-600)',
          }}
        >
          <Globe size={16} />
          <span className="flex-1">全部 (All)</span>
          {totalUnread > 0 && (
            <span className="text-caption px-1.5 py-0.5 rounded-full" style={{ backgroundColor: 'var(--cinnabar)', color: 'white', fontSize: '10px' }}>
              {totalUnread}
            </span>
          )}
        </button>

        {/* Starred */}
        <button
          onClick={() => setSelectedFeedId('starred')}
          className="w-full flex items-center gap-2.5 px-4 py-2 text-left text-body-sm transition-all duration-150"
          style={{
            backgroundColor: selectedFeedId === 'starred' ? 'var(--wash-light)' : 'transparent',
            borderLeft: selectedFeedId === 'starred' ? '3px solid var(--cinnabar)' : '3px solid transparent',
            color: selectedFeedId === 'starred' ? 'var(--ink-900)' : 'var(--ink-600)',
          }}
        >
          <Star size={16} />
          <span className="flex-1">星标 (Starred)</span>
          {starredCount > 0 && <span className="text-caption" style={{ color: 'var(--ink-400)' }}>{starredCount}</span>}
        </button>

        <div className="mt-2 pt-2" style={{ borderTop: '1px solid var(--ink-200)' }}>
          <span className="text-caption px-4 block mb-1" style={{ color: 'var(--ink-400)' }}>订阅源 (Feeds)</span>
          {feeds.map(feed => {
            const FeedIcon = feed.icon;
            return (
              <button
                key={feed.id}
                onClick={() => setSelectedFeedId(feed.id)}
                className="w-full flex items-center gap-2.5 px-4 py-2 text-left text-body-sm transition-all duration-150 group"
                style={{
                  backgroundColor: selectedFeedId === feed.id ? 'var(--wash-light)' : 'transparent',
                  borderLeft: selectedFeedId === feed.id ? '3px solid var(--cinnabar)' : '3px solid transparent',
                  color: selectedFeedId === feed.id ? 'var(--ink-900)' : 'var(--ink-600)',
                }}
              >
                <FeedIcon size={16} />
                <span className="flex-1 truncate">{feed.name}</span>
                {feed.unreadCount > 0 && (
                  <span className="text-caption px-1.5 py-0.5 rounded-full" style={{ backgroundColor: 'var(--cinnabar)', color: 'white', fontSize: '10px' }}>
                    {feed.unreadCount}
                  </span>
                )}
                <button
                  onClick={(e) => { e.stopPropagation(); removeFeed(feed.id); }}
                  className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-black/5"
                >
                  <X size={10} style={{ color: 'var(--ink-400)' }} />
                </button>
              </button>
            );
          })}
        </div>
      </div>

      {/* Article list */}
      <div className="w-80 flex-shrink-0 flex flex-col overflow-hidden" style={{ backgroundColor: 'var(--ink-50)', borderRight: '1px solid var(--ink-200)' }}>
        <div className="flex items-center justify-between p-3 flex-shrink-0" style={{ borderBottom: '1px solid var(--ink-200)' }}>
          <div className="flex items-center gap-2 flex-1">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full flex-1" style={{ backgroundColor: 'var(--ink-100)', border: '1px solid var(--ink-200)' }}>
              <Search size={14} style={{ color: 'var(--ink-400)' }} />
              <input
                type="text"
                placeholder="搜索 (Search)..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="flex-1 text-body-sm bg-transparent outline-none"
                style={{ color: 'var(--ink-700)' }}
              />
            </div>
          </div>
          <button
            onClick={refreshFeeds}
            className="p-1.5 rounded transition-all duration-150 hover:bg-black/5 ml-2"
            title="刷新 (Refresh)"
          >
            <RefreshCw size={14} style={{ color: 'var(--ink-500)' }} className={refreshing ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={markAllRead}
            className="p-1.5 rounded transition-all duration-150 hover:bg-black/5 ml-1"
            title="全部标为已读 (Mark all read)"
          >
            <CheckCircle size={14} style={{ color: 'var(--success)' }} />
          </button>
        </div>

        <div className="flex-1 overflow-auto">
          {filteredArticles.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-2">
              <Newspaper size={32} style={{ color: 'var(--ink-300)' }} />
              <span className="text-body-sm" style={{ color: 'var(--ink-400)' }}>暂无文章 (No articles)</span>
            </div>
          ) : (
            filteredArticles.map(article => (
              <button
                key={article.id}
                onClick={() => selectArticle(article.id)}
                className="w-full text-left p-3 transition-all duration-150"
                style={{
                  backgroundColor: selectedArticleId === article.id ? 'var(--wash-light)' : 'transparent',
                  borderBottom: '1px solid var(--ink-200)',
                }}
              >
                <div className="flex items-start gap-2">
                  {!article.read && <div className="w-2 h-2 rounded-full flex-shrink-0 mt-1.5" style={{ backgroundColor: 'var(--cinnabar)' }} />}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1 mb-1">
                      <span className={`text-body-sm truncate flex-1 ${article.read ? '' : 'font-medium'}`} style={{ color: article.read ? 'var(--ink-500)' : 'var(--ink-900)' }}>
                        {article.title}
                      </span>
                    </div>
                    <p className="text-caption mb-1 line-clamp-2" style={{ color: 'var(--ink-500)' }}>{article.summary}</p>
                    <div className="flex items-center gap-2">
                      <span className="text-caption" style={{ color: 'var(--ink-400)' }}>{article.date}</span>
                      <button onClick={(e) => toggleStar(article.id, e)} className="transition-transform duration-150 hover:scale-110">
                        <Star size={12} style={{ color: article.starred ? '#b8860b' : 'var(--ink-300)', fill: article.starred ? '#b8860b' : 'none' }} />
                      </button>
                    </div>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Reading pane */}
      <div className="flex-1 overflow-auto">
        {selectedArticle ? (
          <div className="p-6 max-w-2xl">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-caption px-2 py-0.5 rounded" style={{ backgroundColor: 'var(--wash-light)', color: 'var(--ink-600)' }}>
                {feeds.find(f => f.id === selectedArticle.feedId)?.name}
              </span>
              <span className="text-caption" style={{ color: 'var(--ink-400)' }}>{selectedArticle.date}</span>
            </div>
            <h1 className="text-heading-lg mb-4" style={{ color: 'var(--ink-900)' }}>{selectedArticle.title}</h1>
            <div className="flex items-center gap-2 mb-6 pb-4" style={{ borderBottom: '1px solid var(--ink-200)' }}>
              <button
                onClick={() => toggleStar(selectedArticle.id)}
                className="flex items-center gap-1 px-3 py-1 rounded text-caption transition-all duration-150 hover:bg-black/5"
                style={{ color: selectedArticle.starred ? '#b8860b' : 'var(--ink-500)' }}
              >
                <Star size={14} style={{ fill: selectedArticle.starred ? '#b8860b' : 'none' }} />
                {selectedArticle.starred ? '已星标 (Starred)' : '星标 (Star)'}
              </button>
            </div>
            <div className="text-body-lg whitespace-pre-line" style={{ color: 'var(--ink-800)', lineHeight: 1.8 }}>
              {selectedArticle.content}
            </div>
          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center gap-2">
            <BookOpen size={48} style={{ color: 'var(--ink-300)' }} />
            <span className="text-body-md" style={{ color: 'var(--ink-400)' }}>选择文章以阅读 (Select an article to read)</span>
          </div>
        )}
      </div>
    </div>
  );
}

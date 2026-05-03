import { useState, useMemo, useCallback } from 'react';
import { ArrowRightLeft, Copy, Trash2, History, Languages, X, Volume2, Sparkles } from 'lucide-react';

const STORAGE_KEY_HISTORY = 'translator-history';

interface HistoryItem {
  id: string;
  sourceLang: string;
  targetLang: string;
  sourceText: string;
  targetText: string;
  timestamp: number;
}

interface LangEntry {
  code: string;
  name: string;
  flag: string;
}

const LANGUAGES: LangEntry[] = [
  { code: 'zh', name: '中文', flag: 'CN' },
  { code: 'en', name: 'English', flag: 'EN' },
  { code: 'ja', name: '日本語', flag: 'JP' },
  { code: 'ko', name: '한국어', flag: 'KR' },
  { code: 'fr', name: 'Français', flag: 'FR' },
  { code: 'es', name: 'Español', flag: 'ES' },
  { code: 'de', name: 'Deutsch', flag: 'DE' },
  { code: 'ru', name: 'Русский', flag: 'RU' },
];

const COMMON_PHRASES: Record<string, Record<string, string>> = {
  zh: {
    '你好': 'Hello / Hi',
    '谢谢': 'Thank you',
    '再见': 'Goodbye',
    '对不起': 'Sorry',
    '早上好': 'Good morning',
    '晚上好': 'Good evening',
    '请问': 'Excuse me',
    '多少钱': 'How much',
    '我不明白': 'I don\'t understand',
    '请帮忙': 'Please help',
    '在哪里': 'Where is',
    '我爱你': 'I love you',
    '祝你好运': 'Good luck',
    '生日快乐': 'Happy birthday',
    '恭喜发财': 'Wishing you prosperity',
    '您好，很高兴认识您': 'Hello, nice to meet you',
    '今天天气不错': 'The weather is nice today',
    '请问这个怎么用': 'How do I use this?',
    '我想去这个地方': 'I want to go to this place',
    '请问附近有什么好吃的': 'What\'s good to eat nearby?',
  },
  en: {
    'Hello': '你好',
    'Thank you': '谢谢',
    'Goodbye': '再见',
    'Sorry': '对不起',
    'Good morning': '早上好',
    'How are you': '你好吗',
    'Nice to meet you': '很高兴认识你',
    'I love you': '我爱你',
    'Good luck': '祝你好运',
    'Happy birthday': '生日快乐',
    'Where is the bathroom': '洗手间在哪里',
    'How much is this': '这个多少钱',
    'I don\'t understand': '我不明白',
    'Please help me': '请帮帮我',
    'What time is it': '现在几点了',
    'Can you speak more slowly': '你能说慢一点吗',
    'I am lost': '我迷路了',
    'Call the police': '报警',
    'I need a doctor': '我需要医生',
    'Where is the train station': '火车站在哪里',
  },
  ja: {
    'こんにちは': '你好',
    'ありがとう': '谢谢',
    'さようなら': '再见',
    'すみません': '对不起/不好意思',
    'おはよう': '早上好',
    'お願いします': '拜托了',
    'わかりません': '我不明白',
    '美味しい': '好吃',
    '大好き': '非常喜欢',
    'お元気ですか': '你好吗',
  },
  ko: {
    '안녕하세요': '你好',
    '감사합니다': '谢谢',
    '안녕히 가세요': '再见',
    '미안합니다': '对不起',
    '좋은 아침': '早上好',
    '사랑해요': '我爱你',
    '잘 지내요': '过得好吗',
    '맛있어요': '好吃',
    '얼마예요': '多少钱',
    '도와주세요': '请帮忙',
  },
  fr: {
    'Bonjour': '你好',
    'Merci': '谢谢',
    'Au revoir': '再见',
    'Excusez-moi': '对不起',
    'Comment allez-vous': '你好吗',
    'Je t\'aime': '我爱你',
    'Bon voyage': '一路顺风',
    'Bonne chance': '祝你好运',
    'S\'il vous plaît': '请',
    'Je ne comprends pas': '我不明白',
  },
  es: {
    'Hola': '你好',
    'Gracias': '谢谢',
    'Adiós': '再见',
    'Lo siento': '对不起',
    'Buenos días': '早上好',
    'Buenas noches': '晚上好',
    '¿Cómo estás': '你好吗',
    'Te quiero': '我爱你',
    'Buena suerte': '祝你好运',
    'No entiendo': '我不明白',
  },
  de: {
    'Hallo': '你好',
    'Danke': '谢谢',
    'Auf Wiedersehen': '再见',
    'Entschuldigung': '对不起',
    'Guten Morgen': '早上好',
    'Wie geht\'s': '你好吗',
    'Ich liebe dich': '我爱你',
    'Viel Glück': '祝你好运',
    'Ich verstehe nicht': '我不明白',
    'Bitte': '请',
  },
  ru: {
    'Привет': '你好',
    'Спасибо': '谢谢',
    'До свидания': '再见',
    'Извините': '对不起',
    'Доброе утро': '早上好',
    'Как дела': '你好吗',
    'Я люблю тебя': '我爱你',
    'Удачи': '祝你好运',
    'Я не понимаю': '我不明白',
    'Помогите': '请帮忙',
  },
};

const TRANSLATIONS_ZH_EN: Record<string, string> = {
  '你好': 'Hello', '世界': 'world', '墨水': 'ink', '操作系统': 'operating system',
  '文本': 'text', '编辑器': 'editor', '文件': 'file', '打开': 'open', '保存': 'save',
  '新建': 'new', '删除': 'delete', '复制': 'copy', '粘贴': 'paste', '剪切': 'cut',
  '搜索': 'search', '查找': 'find', '替换': 'replace', '设置': 'settings',
  '帮助': 'help', '关于': 'about', '退出': 'exit', '取消': 'cancel', '确定': 'OK',
  '是': 'yes', '否': 'no', '关闭': 'close', '最小化': 'minimize', '最大化': 'maximize',
  '还原': 'restore', '打印': 'print', '预览': 'preview', '导出': 'export', '导入': 'import',
  '撤销': 'undo', '重做': 'redo', '全选': 'select all', '插入': 'insert', '表格': 'table',
  '图片': 'image', '链接': 'link', '字体': 'font', '颜色': 'color', '大小': 'size',
  '粗体': 'bold', '斜体': 'italic', '下划线': 'underline', '删除线': 'strikethrough',
  '对齐': 'align', '左对齐': 'left align', '居中': 'center', '右对齐': 'right align',
  '列表': 'list', '编号': 'number', '项目符号': 'bullet', '缩进': 'indent',
  '减小缩进': 'decrease indent', '行距': 'line spacing', '页边距': 'margin',
  '纸张': 'paper', '方向': 'orientation', '横向': 'landscape', '纵向': 'portrait',
  '计算机': 'computer', '程序': 'program', '代码': 'code', '数据': 'data',
  '网络': 'network', '互联网': 'internet', '浏览器': 'browser', '网站': 'website',
  '电子邮件': 'email', '消息': 'message', '聊天': 'chat', '视频': 'video',
  '音频': 'audio', '图像': 'image', '照片': 'photo', '音乐': 'music',
  '游戏': 'game', '应用': 'app', '系统': 'system', '工具': 'tool',
  '日历': 'calendar', '时钟': 'clock', '闹钟': 'alarm', '计时器': 'timer',
  '天气': 'weather', '地图': 'map', '通讯录': 'contacts', '笔记': 'notes',
  '任务': 'task', '提醒': 'reminder', '书签': 'bookmark', '历史': 'history',
  '下载': 'download', '上传': 'upload', '文件夹': 'folder', '文档': 'document',
  '桌面': 'desktop', '窗口': 'window', '菜单': 'menu', '工具栏': 'toolbar',
  '状态栏': 'status bar', '侧边栏': 'sidebar', '标签页': 'tab', '面板': 'panel',
  '欢迎使用': 'Welcome to', '功能': 'feature', '支持': 'support',
  '用户': 'user', '管理员': 'admin', '账户': 'account', '密码': 'password',
  '登录': 'login', '注册': 'register', '忘记密码': 'forgot password',
  '个人信息': 'profile', '头像': 'avatar', '名称': 'name', '邮箱': 'email',
  '电话': 'phone', '地址': 'address', '城市': 'city', '国家': 'country',
  '语言': 'language', '时区': 'timezone', '日期': 'date', '时间': 'time',
  '今天': 'today', '昨天': 'yesterday', '明天': 'tomorrow', '本周': 'this week',
  '本月': 'this month', '今年': 'this year', '星期一': 'Monday', '星期二': 'Tuesday',
  '星期三': 'Wednesday', '星期四': 'Thursday', '星期五': 'Friday',
  '星期六': 'Saturday', '星期日': 'Sunday',
  '一月': 'January', '二月': 'February', '三月': 'March', '四月': 'April',
  '五月': 'May', '六月': 'June', '七月': 'July', '八月': 'August',
  '九月': 'September', '十月': 'October', '十一月': 'November', '十二月': 'December',
  '红色': 'red', '绿色': 'green', '蓝色': 'blue', '黄色': 'yellow',
  '黑色': 'black', '白色': 'white', '灰色': 'gray', '紫色': 'purple',
  '橙色': 'orange', '粉色': 'pink', '棕色': 'brown', '金色': 'gold',
  '银色': 'silver', '透明': 'transparent',
  '大': 'big', '小': 'small', '高': 'high/tall', '低': 'low', '长': 'long',
  '短': 'short', '快': 'fast', '慢': 'slow', '新': 'new', '旧': 'old',
  '好': 'good', '坏': 'bad', '美': 'beautiful', '丑': 'ugly',
  '简单': 'simple', '复杂': 'complex', '容易': 'easy', '困难': 'difficult',
  '重要': 'important', '紧急': 'urgent', '特殊': 'special', '一般': 'general',
  '公共': 'public', '私人': 'private', '安全': 'safe', '危险': 'dangerous',
};

export default function Translator() {
  const [sourceLang, setSourceLang] = useState('zh');
  const [targetLang, setTargetLang] = useState('en');
  const [sourceText, setSourceText] = useState('');
  const [targetText, setTargetText] = useState('');
  const [history, setHistory] = useState<HistoryItem[]>(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY_HISTORY) || '[]'); } catch { return []; }
  });
  const [showHistory, setShowHistory] = useState(false);
  const [copied, setCopied] = useState(false);

  const langMap = useMemo(() => {
    const map: Record<string, LangEntry> = {};
    LANGUAGES.forEach(l => map[l.code] = l);
    return map;
  }, []);

  const translate = useCallback(() => {
    if (!sourceText.trim()) { setTargetText(''); return; }

    const key = sourceText.trim();

    // 1. Check common phrases
    const phrases = COMMON_PHRASES[sourceLang];
    if (phrases && phrases[key]) {
      setTargetText(phrases[key]);
      addToHistory(sourceLang, targetLang, sourceText, phrases[key]);
      return;
    }

    // 2. For Chinese -> English, use dictionary
    if (sourceLang === 'zh' && targetLang === 'en') {
      const result = TRANSLATIONS_ZH_EN[key];
      if (result) {
        setTargetText(result);
        addToHistory(sourceLang, targetLang, sourceText, result);
        return;
      }
      // Try word-by-word for short phrases
      const words = key.split(/\s+/);
      if (words.length <= 5) {
        const translated = words.map(w => TRANSLATIONS_ZH_EN[w] || w).join(' ');
        if (translated !== key) {
          setTargetText(translated);
          addToHistory(sourceLang, targetLang, sourceText, translated);
          return;
        }
      }
    }

    // 3. For English -> Chinese
    if (sourceLang === 'en' && targetLang === 'zh') {
      const enDict = Object.entries(TRANSLATIONS_ZH_EN);
      // Direct match
      const direct = enDict.find(([, v]) => v.toLowerCase() === key.toLowerCase());
      if (direct) {
        setTargetText(direct[0]);
        addToHistory(sourceLang, targetLang, sourceText, direct[0]);
        return;
      }
      // Word by word
      const words = key.split(/\s+/);
      if (words.length <= 5) {
        const translated = words.map(w => {
          const entry = enDict.find(([, v]) => v.toLowerCase() === w.toLowerCase());
          return entry ? entry[0] : w;
        }).join('');
        if (translated !== key) {
          setTargetText(translated);
          addToHistory(sourceLang, targetLang, sourceText, translated);
          return;
        }
      }
    }

    // 4. Fallback: simulate translation
    const simResult = `[${langMap[targetLang]?.name || targetLang}] ${sourceText}`;
    setTargetText(simResult);
    addToHistory(sourceLang, targetLang, sourceText, simResult);
  }, [sourceLang, targetLang, sourceText, langMap]);

  const addToHistory = (sl: string, tl: string, st: string, tt: string) => {
    const item: HistoryItem = {
      id: Date.now().toString(),
      sourceLang: sl,
      targetLang: tl,
      sourceText: st,
      targetText: tt,
      timestamp: Date.now(),
    };
    setHistory(prev => {
      const next = [item, ...prev].slice(0, 20);
      try { localStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(next)); } catch { /* noop */ }
      return next;
    });
  };

  const swapLanguages = () => {
    const newSource = targetLang;
    const newTarget = sourceLang;
    setSourceLang(newSource);
    setTargetLang(newTarget);
    setSourceText(targetText);
    setTargetText(sourceText);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(targetText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleClear = () => {
    setSourceText('');
    setTargetText('');
  };

  const handleHistoryItem = (item: HistoryItem) => {
    setSourceLang(item.sourceLang);
    setTargetLang(item.targetLang);
    setSourceText(item.sourceText);
    setTargetText(item.targetText);
  };

  const handleDeleteHistory = (id: string) => {
    setHistory(prev => {
      const next = prev.filter(h => h.id !== id);
      try { localStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(next)); } catch { /* noop */ }
      return next;
    });
  };

  const sourcePhrases = useMemo(() => {
    const phrases = COMMON_PHRASES[sourceLang];
    return phrases ? Object.entries(phrases).slice(0, 10) : [];
  }, [sourceLang]);

  return (
    <div className="w-full h-full flex flex-col" style={{ backgroundColor: 'var(--ink-50)' }}>
      {/* Language Selection */}
      <div className="flex items-center justify-center gap-3 px-4 py-2 border-b" style={{ borderColor: 'var(--ink-200)', backgroundColor: 'var(--ink-100)' }}>
        <select
          value={sourceLang}
          onChange={e => setSourceLang(e.target.value)}
          className="px-3 py-1 rounded text-body-sm outline-none"
          style={{ border: '1px solid var(--ink-300)', backgroundColor: 'var(--ink-50)', color: 'var(--ink-900)', minWidth: 120 }}
        >
          {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.name}</option>)}
        </select>

        <button
          onClick={swapLanguages}
          className="flex items-center justify-center w-8 h-8 rounded-full hover:opacity-80 transition-transform"
          style={{ backgroundColor: 'var(--ink-200)', color: 'var(--ink-700)' }}
          title="交换 (Swap)"
        >
          <ArrowRightLeft size={14} />
        </button>

        <select
          value={targetLang}
          onChange={e => setTargetLang(e.target.value)}
          className="px-3 py-1 rounded text-body-sm outline-none"
          style={{ border: '1px solid var(--ink-300)', backgroundColor: 'var(--ink-50)', color: 'var(--ink-900)', minWidth: 120 }}
        >
          {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.name}</option>)}
        </select>

        <div className="flex-1" />

        <button
          onClick={() => setShowHistory(v => !v)}
          className="flex items-center gap-1 px-2 py-1 rounded text-body-sm hover:opacity-80"
          style={{ color: showHistory ? 'var(--cinnabar)' : 'var(--ink-700)' }}
        >
          <History size={14} /> 历史
        </button>
      </div>

      {/* Main Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Source */}
        <div className="flex-1 flex flex-col border-r" style={{ borderColor: 'var(--ink-200)' }}>
          <div className="px-3 py-1 text-caption flex items-center gap-2" style={{ color: 'var(--ink-500)', backgroundColor: 'var(--ink-100)' }}>
            <Languages size={12} />
            源语言 (Source) — {langMap[sourceLang]?.name}
          </div>
          <textarea
            value={sourceText}
            onChange={e => setSourceText(e.target.value)}
            placeholder="在此输入文本... (Enter text here...)"
            className="flex-1 resize-none outline-none border-none p-3"
            style={{
              fontFamily: '"Noto Sans SC", system-ui, sans-serif',
              fontSize: 15,
              lineHeight: 1.8,
              color: 'var(--ink-900)',
              backgroundColor: 'var(--ink-50)',
            }}
          />
          <div className="flex items-center justify-between px-3 py-1" style={{ backgroundColor: 'var(--ink-100)', color: 'var(--ink-500)' }}>
            <span className="text-caption">{sourceText.length} 字符</span>
            <div className="flex gap-2">
              <button onClick={handleClear} className="flex items-center gap-1 px-2 py-1 rounded text-caption hover:opacity-80" style={{ color: 'var(--ink-600)' }}>
                <Trash2 size={12} /> 清空
              </button>
            </div>
          </div>
        </div>

        {/* Right: Target */}
        <div className="flex-1 flex flex-col">
          <div className="px-3 py-1 text-caption flex items-center gap-2" style={{ color: 'var(--ink-500)', backgroundColor: 'var(--ink-100)' }}>
            <Sparkles size={12} />
            目标语言 (Target) — {langMap[targetLang]?.name}
          </div>
          <div
            className="flex-1 p-3 overflow-auto"
            style={{
              fontFamily: '"Noto Sans SC", system-ui, sans-serif',
              fontSize: 15,
              lineHeight: 1.8,
              color: 'var(--ink-900)',
              backgroundColor: 'var(--ink-50)',
              whiteSpace: 'pre-wrap',
            }}
          >
            {targetText || <span style={{ color: 'var(--ink-400)' }}>翻译结果将显示在这里... (Translation will appear here...)</span>}
          </div>
          <div className="flex items-center justify-between px-3 py-1" style={{ backgroundColor: 'var(--ink-100)', color: 'var(--ink-500)' }}>
            <span className="text-caption">{targetText.length} 字符</span>
            <button
              onClick={handleCopy}
              className="flex items-center gap-1 px-2 py-1 rounded text-caption hover:opacity-80"
              style={{ color: copied ? 'var(--success)' : 'var(--ink-600)' }}
            >
              <Copy size={12} /> {copied ? '已复制!' : '复制'}
            </button>
          </div>
        </div>
      </div>

      {/* Common Phrases + Translate Button */}
      <div className="border-t flex-shrink-0" style={{ borderColor: 'var(--ink-200)', backgroundColor: 'var(--ink-100)' }}>
        <div className="flex items-center gap-2 px-3 py-1">
          <span className="text-caption" style={{ color: 'var(--ink-500)' }}>常用短语 (Common Phrases):</span>
          <div className="flex gap-1 overflow-x-auto">
            {sourcePhrases.slice(0, 6).map(([phrase, translation]) => (
              <button
                key={phrase}
                onClick={() => { setSourceText(phrase); }}
                className="px-2 py-0.5 rounded text-caption whitespace-nowrap hover:opacity-80"
                style={{ backgroundColor: 'var(--ink-200)', color: 'var(--ink-700)' }}
                title={translation}
              >
                {phrase}
              </button>
            ))}
          </div>
        </div>
        <button
          onClick={translate}
          className="w-full py-2 text-body-md font-medium hover:opacity-90 active:opacity-80"
          style={{ backgroundColor: 'var(--ink-800)', color: 'var(--ink-50)' }}
        >
          翻译 (Translate)
        </button>
      </div>

      {/* History Panel */}
      {showHistory && (
        <div className="border-t" style={{ borderColor: 'var(--ink-200)', backgroundColor: 'var(--ink-50)', maxHeight: 200, overflow: 'auto' }}>
          <div className="flex items-center justify-between px-3 py-1 border-b" style={{ borderColor: 'var(--ink-200)' }}>
            <span className="text-caption font-medium" style={{ color: 'var(--ink-700)' }}>翻译历史 (Translation History)</span>
            <button onClick={() => setShowHistory(false)} className="p-0.5" style={{ color: 'var(--ink-500)' }}><X size={12} /></button>
          </div>
          {history.length === 0 ? (
            <div className="px-3 py-4 text-center text-caption" style={{ color: 'var(--ink-400)' }}>暂无历史记录 (No history yet)</div>
          ) : (
            history.map(item => (
              <div
                key={item.id}
                className="flex items-center gap-2 px-3 py-1.5 border-b cursor-pointer hover:opacity-80"
                style={{ borderColor: 'var(--ink-200)' }}
                onClick={() => handleHistoryItem(item)}
              >
                <span className="text-caption" style={{ color: 'var(--ink-500)', minWidth: 60 }}>
                  {langMap[item.sourceLang]?.name} → {langMap[item.targetLang]?.name}
                </span>
                <span className="text-caption truncate flex-1" style={{ color: 'var(--ink-700)' }}>{item.sourceText}</span>
                <span className="text-caption truncate flex-1" style={{ color: 'var(--ink-900)' }}>{item.targetText}</span>
                <button
                  onClick={e => { e.stopPropagation(); handleDeleteHistory(item.id); }}
                  className="p-0.5"
                  style={{ color: 'var(--ink-400)' }}
                >
                  <X size={12} />
                </button>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

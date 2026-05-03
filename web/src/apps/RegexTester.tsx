import { useState, useCallback, useMemo } from 'react';
import {
  Search, RotateCcw, Copy, Check, ChevronRight, Lightbulb,
  Replace, Bookmark, X
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface PresetPattern {
  name: string;
  nameEn: string;
  pattern: string;
  flags: string;
  description: string;
}

const PRESETS: PresetPattern[] = [
  { name: '邮箱', nameEn: 'Email', pattern: '[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}', flags: 'g', description: '匹配电子邮件地址 (Match email addresses)' },
  { name: '网址', nameEn: 'URL', pattern: 'https?://[^\\s]+', flags: 'gi', description: '匹配HTTP/HTTPS网址 (Match URLs)' },
  { name: '电话号码', nameEn: 'Phone', pattern: '\\d{3}-\\d{4}-\\d{4}', flags: 'g', description: '匹配电话号码格式 xxx-xxxx-xxxx (Match phone numbers)' },
  { name: 'IP地址', nameEn: 'IP Address', pattern: '\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}', flags: 'g', description: '匹配IPv4地址 (Match IPv4 addresses)' },
  { name: '日期', nameEn: 'Date', pattern: '\\d{4}-\\d{2}-\\d{2}', flags: 'g', description: '匹配YYYY-MM-DD日期格式 (Match dates)' },
  { name: '中文字符', nameEn: 'Chinese', pattern: '[\\u4e00-\\u9fff]+', flags: 'g', description: '匹配中文字符 (Match Chinese characters)' },
  { name: 'HTML标签', nameEn: 'HTML Tag', pattern: '<[^>]+>', flags: 'g', description: '匹配HTML标签 (Match HTML tags)' },
  { name: '数字', nameEn: 'Number', pattern: '\\d+', flags: 'g', description: '匹配数字 (Match numbers)' },
  { name: '十六进制颜色', nameEn: 'Hex Color', pattern: '#[0-9A-Fa-f]{6}', flags: 'g', description: '匹配十六进制颜色值 (Match hex color values)' },
  { name: '身份证号', nameEn: 'China ID', pattern: '\\d{17}[\\dXx]', flags: 'g', description: '匹配中国18位身份证号 (Match Chinese ID card numbers)' },
  { name: 'JSON键', nameEn: 'JSON Key', pattern: '"([^"]+)":', flags: 'g', description: '匹配JSON中的键 (Match JSON keys)' },
  { name: 'UUID', nameEn: 'UUID', pattern: '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}', flags: 'gi', description: '匹配UUID格式 (Match UUIDs)' },
];

const FLAGS = [
  { key: 'g', label: 'g', desc: '全局匹配 (Global)' },
  { key: 'i', label: 'i', desc: '忽略大小写 (Ignore case)' },
  { key: 'm', label: 'm', desc: '多行模式 (Multiline)' },
  { key: 's', label: 's', desc: '点匹配换行 (DotAll)' },
  { key: 'u', label: 'u', desc: 'Unicode模式 (Unicode)' },
  { key: 'y', label: 'y', desc: '粘性匹配 (Sticky)' },
];

const SAMPLE_TEXT = `欢迎使用墨韵操作系统 (Welcome to Ink OS)

联系方式:
  邮箱: developer@ink-os.cn
  电话: 138-1234-5678
  备用: support@ink-os.cn

网站: https://www.ink-os.cn
文档: https://docs.ink-os.cn/api/v1

配置信息:
  主服务器IP: 192.168.1.100
  备份服务器: 192.168.1.101
  版本发布日期: 2024-03-15

颜色主题:
  主色: #b3392f
  背景: #f0ebe4
  边框: #d9d9d9

用户ID: 550e8400-e29b-41d4-a716-446655440000
设备ID: A1B2C3D4-E5F6-7890-ABCD-EF1234567890`;

export default function RegexTester() {
  const [pattern, setPattern] = useState('[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}');
  const [activeFlags, setActiveFlags] = useState<Set<string>>(new Set(['g']));
  const [testText, setTestText] = useState(SAMPLE_TEXT);
  const [replaceText, setReplaceText] = useState('');
  const [showReplace, setShowReplace] = useState(false);
  const [showPresets, setShowPresets] = useState(true);
  const [copied, setCopied] = useState(false);

  const flagsString = useMemo(() => Array.from(activeFlags).join(''), [activeFlags]);

  const toggleFlag = useCallback((flag: string) => {
    setActiveFlags(prev => {
      const next = new Set(prev);
      if (next.has(flag)) next.delete(flag);
      else next.add(flag);
      return next;
    });
  }, []);

  const regexResult = useMemo(() => {
    if (!pattern) return { valid: true, matches: [] as RegExpMatchArray[], error: '', groups: [] as string[][] };
    try {
      const regex = new RegExp(pattern, flagsString);
      const matches = Array.from(testText.matchAll(regex));
      return { valid: true, matches, error: '', groups: matches.map(m => Array.from(m).slice(1)) };
    } catch (e) {
      return { valid: false, matches: [] as RegExpMatchArray[], error: (e as Error).message, groups: [] as string[][] };
    }
  }, [pattern, flagsString, testText]);

  const highlightedText = useMemo(() => {
    if (!regexResult.valid || regexResult.matches.length === 0) return null;

    const parts: { text: string; type: 'normal' | 'match'; index?: number }[] = [];
    let lastIndex = 0;

    for (const match of regexResult.matches) {
      const idx = match.index ?? 0;
      if (idx > lastIndex) {
        parts.push({ text: testText.slice(lastIndex, idx), type: 'normal' });
      }
      parts.push({ text: match[0], type: 'match', index: parts.filter(p => p.type === 'match').length + 1 });
      lastIndex = idx + match[0].length;
    }
    if (lastIndex < testText.length) {
      parts.push({ text: testText.slice(lastIndex), type: 'normal' });
    }

    return parts;
  }, [regexResult, testText]);

  const replacedText = useMemo(() => {
    if (!showReplace || !replaceText || !regexResult.valid) return '';
    try {
      const regex = new RegExp(pattern, flagsString);
      return testText.replace(regex, replaceText);
    } catch {
      return '';
    }
  }, [showReplace, replaceText, pattern, flagsString, testText, regexResult.valid]);

  const applyPreset = useCallback((preset: PresetPattern) => {
    setPattern(preset.pattern);
    setActiveFlags(new Set(preset.flags.split('')));
  }, []);

  const copyPattern = useCallback(() => {
    navigator.clipboard.writeText(`/${pattern}/${flagsString}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [pattern, flagsString]);

  const explainRegex = useMemo(() => {
    const explanations: string[] = [];
    if (pattern.includes('^')) explanations.push('^ — 字符串开头 (Start of string)');
    if (pattern.includes('$')) explanations.push('$ — 字符串结尾 (End of string)');
    if (pattern.includes('.')) explanations.push('. — 匹配任意字符 (Any character)');
    if (pattern.includes('\\d')) explanations.push('\\d — 匹配数字 (Digit)');
    if (pattern.includes('\\w')) explanations.push('\\w — 匹配单词字符 (Word character)');
    if (pattern.includes('\\s')) explanations.push('\\s — 匹配空白字符 (Whitespace)');
    if (pattern.includes('*')) explanations.push('* — 零次或多次 (Zero or more)');
    if (pattern.includes('+')) explanations.push('+ — 一次或多次 (One or more)');
    if (pattern.includes('?')) explanations.push('? — 零次或一次 (Zero or one)');
    if (pattern.includes('|')) explanations.push('| — 或 (Alternation)');
    if (pattern.includes('[]')) explanations.push('[...] — 字符集 (Character class)');
    if (pattern.includes('()')) explanations.push('(...) — 捕获组 (Capturing group)');
    if (pattern.includes('{')) explanations.push('{n,m} — 量词 (Quantifier)');
    if (explanations.length === 0) explanations.push('基本正则表达式模式 (Basic regex pattern)');
    return explanations;
  }, [pattern]);

  return (
    <div className="w-full h-full flex flex-col" style={{ backgroundColor: 'var(--ink-50)' }}>
      {/* Pattern input */}
      <div className="px-4 pt-3 pb-2">
        <div className="flex items-center gap-2 mb-2">
          <Search size={14} style={{ color: 'var(--ink-600)' }} />
          <span className="text-body-sm" style={{ color: 'var(--ink-700)' }}>正则表达式 (Regular Expression)</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-mono-md font-mono" style={{ color: 'var(--ink-400)', fontFamily: 'var(--font-code)' }}>/</span>
          <input
            value={pattern}
            onChange={e => setPattern(e.target.value)}
            placeholder="输入正则表达式 (Enter regex pattern)"
            className="flex-1 px-3 py-2 rounded font-mono text-body-md border-2 outline-none transition-colors"
            style={{
              backgroundColor: 'var(--ink-50)',
              borderColor: regexResult.valid ? (regexResult.matches.length > 0 ? 'var(--success)' : 'var(--ink-300)') : 'var(--cinnabar)',
              color: 'var(--ink-800)',
              fontFamily: 'var(--font-code)',
              fontSize: '14px',
            }}
          />
          <span className="text-mono-md font-mono" style={{ color: 'var(--ink-400)', fontFamily: 'var(--font-code)' }}>/</span>
          <span className="text-mono-md font-mono px-2 py-1 rounded" style={{ backgroundColor: 'var(--ink-100)', color: 'var(--ink-700)', fontFamily: 'var(--font-code)', minWidth: '40px', textAlign: 'center' }}>
            {flagsString || '–'}
          </span>
          <button onClick={copyPattern} className="p-1.5 rounded transition-colors hover:bg-[rgba(26,26,26,0.05)]">
            {copied ? <Check size={14} style={{ color: 'var(--success)' }} /> : <Copy size={14} style={{ color: 'var(--ink-500)' }} />}
          </button>
        </div>
        {regexResult.error && (
          <div className="mt-1 text-body-sm" style={{ color: 'var(--cinnabar)' }}>{regexResult.error}</div>
        )}

        {/* Flags */}
        <div className="flex gap-1 mt-2">
          {FLAGS.map(flag => (
            <button
              key={flag.key}
              onClick={() => toggleFlag(flag.key)}
              className="px-2 py-0.5 rounded-full text-caption transition-colors"
              style={{
                backgroundColor: activeFlags.has(flag.key) ? 'var(--ink-800)' : 'var(--ink-200)',
                color: activeFlags.has(flag.key) ? 'var(--ink-50)' : 'var(--ink-600)',
              }}
              title={flag.desc}
            >
              {flag.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Main content */}
        <div className="flex-1 flex flex-col overflow-hidden px-4 pb-3">
          {/* Test string */}
          <div className="flex items-center justify-between mb-1">
            <span className="text-body-sm" style={{ color: 'var(--ink-700)' }}>测试文本 (Test String)</span>
            <div className="flex gap-1">
              <button
                onClick={() => setShowReplace(!showReplace)}
                className={cn('flex items-center gap-1 px-2 py-0.5 rounded text-caption transition-colors', showReplace ? 'text-white' : '')}
                style={{ backgroundColor: showReplace ? 'var(--ink-800)' : 'transparent', color: showReplace ? 'var(--ink-50)' : 'var(--ink-500)' }}
              >
                <Replace size={10} /> 替换 (Replace)
              </button>
            </div>
          </div>
          <div className="flex-1 border rounded overflow-auto mb-2" style={{ borderColor: 'var(--ink-200)', backgroundColor: 'var(--ink-50)' }}>
            {highlightedText ? (
              <pre className="p-3 text-body-sm font-mono whitespace-pre-wrap break-all" style={{ fontFamily: 'var(--font-code)', lineHeight: 1.7, fontSize: '13px' }}>
                {highlightedText.map((part, i) => (
                  part.type === 'match' ? (
                    <span key={i} className="relative inline">
                      <span style={{ backgroundColor: 'rgba(179,57,47,0.15)', borderBottom: '2px solid var(--cinnabar)', color: 'var(--ink-900)' }}>
                        {part.text}
                      </span>
                      <span className="text-caption ml-0.5" style={{ color: 'var(--cinnabar)', fontSize: '9px', verticalAlign: 'super' }}>({part.index})</span>
                    </span>
                  ) : (
                    <span key={i} style={{ color: 'var(--ink-600)' }}>{part.text}</span>
                  )
                ))}
              </pre>
            ) : (
              <textarea
                value={testText}
                onChange={e => setTestText(e.target.value)}
                className="w-full h-full p-3 font-mono text-body-sm resize-none outline-none border-0"
                style={{ backgroundColor: 'transparent', color: 'var(--ink-700)', fontFamily: 'var(--font-code)', fontSize: '13px', lineHeight: 1.7 }}
                spellCheck={false}
              />
            )}
          </div>

          {/* Replace */}
          {showReplace && (
            <div className="mb-2 p-2 border rounded" style={{ borderColor: 'var(--ink-200)', backgroundColor: 'var(--ink-100)' }}>
              <div className="text-caption mb-1" style={{ color: 'var(--ink-500)' }}>替换为 (Replace with):</div>
              <input
                value={replaceText}
                onChange={e => setReplaceText(e.target.value)}
                placeholder="$1 或替换文本"
                className="w-full px-2 py-1 rounded border text-body-sm font-mono"
                style={{ backgroundColor: 'var(--ink-50)', borderColor: 'var(--ink-300)', fontFamily: 'var(--font-code)', fontSize: '13px' }}
              />
              {replacedText && (
                <div className="mt-2 p-2 rounded border" style={{ borderColor: 'var(--ink-200)', backgroundColor: 'var(--ink-50)' }}>
                  <div className="text-caption mb-1" style={{ color: 'var(--ink-500)' }}>替换结果 (Result):</div>
                  <pre className="text-body-sm font-mono whitespace-pre-wrap break-all" style={{ fontFamily: 'var(--font-code)', fontSize: '12px', color: 'var(--ink-700)' }}>{replacedText}</pre>
                </div>
              )}
            </div>
          )}

          {/* Match results */}
          {regexResult.matches.length > 0 && (
            <div className="border rounded overflow-hidden" style={{ borderColor: 'var(--ink-200)' }}>
              <div className="px-3 py-1.5 text-caption flex items-center gap-2" style={{ backgroundColor: 'var(--ink-100)', color: 'var(--ink-600)' }}>
                <Check size={10} style={{ color: 'var(--success)' }} />
                找到 {regexResult.matches.length} 个匹配 (Found {regexResult.matches.length} matches)
              </div>
              <div className="max-h-32 overflow-auto">
                {regexResult.matches.map((match, i) => (
                  <div key={i} className="flex items-center gap-3 px-3 py-1.5 border-t" style={{ borderColor: 'var(--ink-200)', backgroundColor: i % 2 === 0 ? 'var(--ink-50)' : 'var(--ink-100)' }}>
                    <span className="text-caption font-mono w-6 text-center" style={{ color: 'var(--cinnabar)', fontSize: '11px' }}>{i + 1}</span>
                    <span className="text-body-sm font-mono flex-1 truncate" style={{ color: 'var(--ink-800)', fontFamily: 'var(--font-code)', fontSize: '12px' }}>{match[0]}</span>
                    <span className="text-caption font-mono" style={{ color: 'var(--ink-400)', fontSize: '11px' }}>pos:{match.index}</span>
                    {match.length > 1 && (
                      <span className="text-caption font-mono" style={{ color: 'var(--info)', fontSize: '11px' }}>
                        组: {Array.from(match).slice(1).join(', ')}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Explanation */}
          <div className="mt-2 p-2 border rounded" style={{ borderColor: 'var(--ink-200)', backgroundColor: 'var(--ink-100)' }}>
            <div className="flex items-center gap-1 mb-1">
              <Lightbulb size={10} style={{ color: 'var(--warning)' }} />
              <span className="text-caption" style={{ color: 'var(--ink-600)' }}>表达式说明 (Explanation)</span>
            </div>
            {explainRegex.map((exp, i) => (
              <div key={i} className="text-caption pl-4" style={{ color: 'var(--ink-600)' }}>{exp}</div>
            ))}
          </div>
        </div>

        {/* Presets panel */}
        {showPresets && (
          <div className="w-60 border-l flex flex-col overflow-hidden" style={{ borderColor: 'var(--ink-200)', backgroundColor: 'var(--ink-100)' }}>
            <div className="flex items-center gap-1 px-3 py-2 border-b" style={{ borderColor: 'var(--ink-200)' }}>
              <Bookmark size={12} style={{ color: 'var(--ink-600)' }} />
              <span className="text-body-sm font-medium" style={{ color: 'var(--ink-700)' }}>预设模式 (Presets)</span>
            </div>
            <div className="flex-1 overflow-auto p-2">
              {PRESETS.map((preset, i) => (
                <button
                  key={i}
                  onClick={() => applyPreset(preset)}
                  className="w-full text-left p-2 mb-1 rounded border transition-all hover:shadow-sm"
                  style={{ borderColor: 'var(--ink-200)', backgroundColor: 'var(--ink-50)' }}
                >
                  <div className="flex items-center gap-1 mb-0.5">
                    <span className="text-body-sm font-medium" style={{ color: 'var(--ink-800)' }}>{preset.name}</span>
                    <span className="text-caption" style={{ color: 'var(--ink-400)' }}>({preset.nameEn})</span>
                  </div>
                  <div className="text-caption font-mono truncate mb-0.5" style={{ color: 'var(--cinnabar)', fontSize: '11px', fontFamily: 'var(--font-code)' }}>
                    {preset.pattern}
                  </div>
                  <div className="text-caption" style={{ color: 'var(--ink-500)', fontSize: '10px' }}>{preset.description}</div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

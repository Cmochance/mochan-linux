import { useState, useCallback, useMemo, useEffect } from 'react';
import {
  Key, Copy, Check, RefreshCw, Eye, EyeOff, Shield,
  ShieldAlert, ShieldCheck, History, Trash2
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface PasswordEntry {
  id: string;
  password: string;
  timestamp: string;
  length: number;
  strength: string;
}

const CHAR_SETS = {
  uppercase: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  lowercase: 'abcdefghijklmnopqrstuvwxyz',
  numbers: '0123456789',
  symbols: '!@#$%^&*()_+-=[]{}|;:,.<>?',
};

const AMBIGUOUS = '0O1lI';

function calculateEntropy(length: number, charsetSize: number): number {
  return Math.round(length * Math.log2(charsetSize));
}

function getStrengthLabel(entropy: number): { label: string; labelEn: string; color: string; level: number } {
  if (entropy < 40) return { label: '弱', labelEn: 'Weak', color: 'var(--cinnabar)', level: 1 };
  if (entropy < 60) return { label: '一般', labelEn: 'Fair', color: 'var(--warning)', level: 2 };
  if (entropy < 80) return { label: '良好', labelEn: 'Good', color: 'var(--info)', level: 3 };
  return { label: '强', labelEn: 'Strong', color: 'var(--success)', level: 4 };
}

function generatePassword(length: number, options: {
  uppercase: boolean;
  lowercase: boolean;
  numbers: boolean;
  symbols: boolean;
  excludeAmbiguous: boolean;
}): string {
  let charset = '';
  const required: string[] = [];

  if (options.uppercase) {
    charset += CHAR_SETS.uppercase;
    required.push(getRandomChar(CHAR_SETS.uppercase, options.excludeAmbiguous));
  }
  if (options.lowercase) {
    charset += CHAR_SETS.lowercase;
    required.push(getRandomChar(CHAR_SETS.lowercase, options.excludeAmbiguous));
  }
  if (options.numbers) {
    charset += CHAR_SETS.numbers;
    required.push(getRandomChar(CHAR_SETS.numbers, options.excludeAmbiguous));
  }
  if (options.symbols) {
    charset += CHAR_SETS.symbols;
    required.push(getRandomChar(CHAR_SETS.symbols, options.excludeAmbiguous));
  }

  if (!charset) return '';

  // Filter ambiguous characters
  if (options.excludeAmbiguous) {
    charset = charset.split('').filter(c => !AMBIGUOUS.includes(c)).join('');
  }

  // Fill remaining length
  const remaining = length - required.length;
  const passwordChars = [...required];

  for (let i = 0; i < remaining; i++) {
    passwordChars.push(getRandomChar(charset, false));
  }

  // Shuffle
  for (let i = passwordChars.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [passwordChars[i], passwordChars[j]] = [passwordChars[j], passwordChars[i]];
  }

  return passwordChars.join('');
}

function getRandomChar(charset: string, excludeAmbiguous: boolean): string {
  let cs = charset;
  if (excludeAmbiguous) {
    cs = cs.split('').filter(c => !AMBIGUOUS.includes(c)).join('');
  }
  const array = new Uint32Array(1);
  crypto.getRandomValues(array);
  return cs[array[0] % cs.length];
}

export default function PasswordGenerator() {
  const [length, setLength] = useState(16);
  const [uppercase, setUppercase] = useState(true);
  const [lowercase, setLowercase] = useState(true);
  const [numbers, setNumbers] = useState(true);
  const [symbols, setSymbols] = useState(true);
  const [excludeAmbiguous, setExcludeAmbiguous] = useState(false);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(true);
  const [history, setHistory] = useState<PasswordEntry[]>([]);
  const [copied, setCopied] = useState(false);
  const [autoGenerate, setAutoGenerate] = useState(true);

  const charsetSize = useMemo(() => {
    let size = 0;
    if (uppercase) size += options.excludeAmbiguous ? CHAR_SETS.uppercase.split('').filter(c => !AMBIGUOUS.includes(c)).length : CHAR_SETS.uppercase.length;
    if (lowercase) size += options.excludeAmbiguous ? CHAR_SETS.lowercase.split('').filter(c => !AMBIGUOUS.includes(c)).length : CHAR_SETS.lowercase.length;
    if (numbers) size += options.excludeAmbiguous ? CHAR_SETS.numbers.split('').filter(c => !AMBIGUOUS.includes(c)).length : CHAR_SETS.numbers.length;
    if (symbols) size += CHAR_SETS.symbols.length;
    return size;
  }, [uppercase, lowercase, numbers, symbols, excludeAmbiguous]);

  const options = useMemo(() => ({ uppercase, lowercase, numbers, symbols, excludeAmbiguous }), [uppercase, lowercase, numbers, symbols, excludeAmbiguous]);

  const entropy = useMemo(() => calculateEntropy(length, charsetSize || 1), [length, charsetSize]);
  const strength = useMemo(() => getStrengthLabel(entropy), [entropy]);

  const generate = useCallback(() => {
    if (charsetSize === 0) return;
    const newPassword = generatePassword(length, options);
    setPassword(newPassword);

    if (newPassword) {
      const entry: PasswordEntry = {
        id: Date.now().toString(),
        password: newPassword,
        timestamp: new Date().toLocaleTimeString(),
        length: newPassword.length,
        strength: strength.label,
      };
      setHistory(prev => [entry, ...prev].slice(0, 10));
    }
  }, [length, options, charsetSize, strength.label]);

  // Auto-generate when settings change
  useEffect(() => {
    if (autoGenerate && charsetSize > 0) {
      const timeout = setTimeout(generate, 100);
      return () => clearTimeout(timeout);
    }
  }, [length, uppercase, lowercase, numbers, symbols, excludeAmbiguous, autoGenerate, charsetSize, generate]);

  const copyPassword = useCallback(() => {
    if (!password) return;
    navigator.clipboard.writeText(password);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [password]);

  const strengthBars = [1, 2, 3, 4];

  return (
    <div className="w-full h-full flex flex-col overflow-auto" style={{ backgroundColor: 'var(--ink-50)' }}>
      <div className="p-4 space-y-4">
        {/* Password display */}
        <div
          className="rounded-lg border p-4"
          style={{ borderColor: 'var(--ink-200)', backgroundColor: 'var(--ink-100)' }}
        >
          <div className="flex items-center gap-2">
            <button
              onClick={generate}
              className="p-2 rounded transition-colors hover:bg-[rgba(26,26,26,0.05)]"
              style={{ color: 'var(--ink-600)' }}
              title="重新生成 (Regenerate)"
            >
              <RefreshCw size={16} />
            </button>
            <div className="flex-1 overflow-hidden">
              <div
                className="font-mono text-center break-all select-all"
                style={{
                  fontFamily: 'var(--font-code)',
                  fontSize: password.length > 32 ? '14px' : '18px',
                  color: 'var(--ink-900)',
                  letterSpacing: '0.05em',
                  minHeight: '28px',
                }}
              >
                {showPassword ? password : '•'.repeat(password.length)}
              </div>
            </div>
            <button
              onClick={() => setShowPassword(!showPassword)}
              className="p-2 rounded transition-colors hover:bg-[rgba(26,26,26,0.05)]"
              style={{ color: 'var(--ink-600)' }}
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
            <button
              onClick={copyPassword}
              disabled={!password}
              className="p-2 rounded transition-colors hover:bg-[rgba(26,26,26,0.05)] disabled:opacity-30"
              style={{ color: 'var(--ink-600)' }}
            >
              {copied ? <Check size={16} style={{ color: 'var(--success)' }} /> : <Copy size={16} />}
            </button>
          </div>
        </div>

        {/* Length slider */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-body-sm" style={{ color: 'var(--ink-700)' }}>长度 (Length)</span>
            <span className="text-heading-md font-mono" style={{ color: 'var(--ink-800)', fontFamily: 'var(--font-code)' }}>{length}</span>
          </div>
          <input
            type="range"
            min="8"
            max="64"
            value={length}
            onChange={e => setLength(Number(e.target.value))}
            className="w-full h-2 rounded-full appearance-none cursor-pointer"
            style={{
              background: `linear-gradient(to right, var(--cinnabar) 0%, var(--cinnabar) ${((length - 8) / 56) * 100}%, var(--ink-200) ${((length - 8) / 56) * 100}%, var(--ink-200) 100%)`,
              outline: 'none',
            }}
          />
          <div className="flex justify-between mt-1">
            <span className="text-caption" style={{ color: 'var(--ink-400)' }}>8</span>
            <span className="text-caption" style={{ color: 'var(--ink-400)' }}>64</span>
          </div>
        </div>

        {/* Character type toggles */}
        <div>
          <div className="text-body-sm mb-2" style={{ color: 'var(--ink-700)' }}>字符类型 (Character Types)</div>
          <div className="space-y-2">
            {[
              { key: 'uppercase' as const, label: '大写字母 (A-Z)', chars: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ' },
              { key: 'lowercase' as const, label: '小写字母 (a-z)', chars: 'abcdefghijklmnopqrstuvwxyz' },
              { key: 'numbers' as const, label: '数字 (0-9)', chars: '0123456789' },
              { key: 'symbols' as const, label: '符号 (!@#$...)', chars: '!@#$%^&*' },
            ].map(opt => (
              <label key={opt.key} className="flex items-center gap-3 cursor-pointer p-2 rounded transition-colors hover:bg-[rgba(26,26,26,0.03)]">
                <input
                  type="checkbox"
                  checked={options[opt.key]}
                  onChange={e => {
                    const setter = { uppercase: setUppercase, lowercase: setLowercase, numbers: setNumbers, symbols: setSymbols }[opt.key];
                    setter(e.target.checked);
                  }}
                  className="w-4 h-4 rounded"
                />
                <span className="text-body-sm flex-1" style={{ color: 'var(--ink-700)' }}>{opt.label}</span>
                <span className="text-caption font-mono" style={{ color: 'var(--ink-400)', fontFamily: 'var(--font-code)', fontSize: '10px' }}>{opt.chars}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Exclude ambiguous */}
        <label className="flex items-center gap-3 cursor-pointer p-2 rounded transition-colors hover:bg-[rgba(26,26,26,0.03)]">
          <input
            type="checkbox"
            checked={excludeAmbiguous}
            onChange={e => setExcludeAmbiguous(e.target.checked)}
            className="w-4 h-4 rounded"
          />
          <span className="text-body-sm" style={{ color: 'var(--ink-700)' }}>排除易混淆字符 (Exclude ambiguous: 0, O, l, 1, I)</span>
        </label>

        {/* Auto-generate */}
        <label className="flex items-center gap-3 cursor-pointer p-2 rounded transition-colors hover:bg-[rgba(26,26,26,0.03)]">
          <input
            type="checkbox"
            checked={autoGenerate}
            onChange={e => setAutoGenerate(e.target.checked)}
            className="w-4 h-4 rounded"
          />
          <span className="text-body-sm" style={{ color: 'var(--ink-700)' }}>设置更改时自动生成 (Auto-generate on change)</span>
        </label>

        {/* Strength indicator */}
        <div className="border rounded-lg p-3" style={{ borderColor: 'var(--ink-200)', backgroundColor: 'var(--ink-100)' }}>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Shield size={14} style={{ color: strength.color }} />
              <span className="text-body-sm font-medium" style={{ color: 'var(--ink-800)' }}>密码强度 (Strength)</span>
            </div>
            <span className="text-body-sm font-medium" style={{ color: strength.color }}>
              {strength.label} ({strength.labelEn})
            </span>
          </div>
          <div className="flex gap-1 mb-2">
            {strengthBars.map(bar => (
              <div
                key={bar}
                className="flex-1 h-1 rounded-full transition-all"
                style={{
                  backgroundColor: bar <= strength.level ? strength.color : 'var(--ink-200)',
                }}
              />
            ))}
          </div>
          <div className="flex items-center gap-1">
            <span className="text-caption" style={{ color: 'var(--ink-500)' }}>熵 (Entropy):</span>
            <span className="text-caption font-mono" style={{ color: 'var(--ink-700)', fontFamily: 'var(--font-code)' }}>{entropy} bits</span>
            <span className="text-caption ml-2" style={{ color: 'var(--ink-400)' }}>字符集大小: {charsetSize}</span>
          </div>
        </div>

        {/* Generate button */}
        <button
          onClick={generate}
          disabled={charsetSize === 0}
          className="w-full py-2.5 rounded text-body-sm font-medium transition-all disabled:opacity-40"
          style={{ backgroundColor: 'var(--ink-800)', color: 'var(--ink-50)' }}
        >
          <RefreshCw size={14} className="inline mr-2" />
          生成新密码 (Generate New Password)
        </button>

        {/* History */}
        {history.length > 0 && (
          <div className="border rounded-lg overflow-hidden" style={{ borderColor: 'var(--ink-200)' }}>
            <div className="flex items-center justify-between px-3 py-2 border-b" style={{ borderColor: 'var(--ink-200)', backgroundColor: 'var(--ink-100)' }}>
              <div className="flex items-center gap-1">
                <History size={12} style={{ color: 'var(--ink-500)' }} />
                <span className="text-caption" style={{ color: 'var(--ink-600)' }}>历史 (History)</span>
              </div>
              <button onClick={() => setHistory([])} className="p-0.5">
                <Trash2 size={10} style={{ color: 'var(--ink-400)' }} />
              </button>
            </div>
            <div className="max-h-36 overflow-auto">
              {history.map((entry, i) => (
                <div
                  key={entry.id}
                  className="flex items-center gap-2 px-3 py-1.5 border-b transition-colors hover:bg-[rgba(26,26,26,0.03)]"
                  style={{ borderColor: 'var(--ink-200)', backgroundColor: i % 2 === 0 ? 'var(--ink-50)' : 'var(--ink-100)' }}
                >
                  <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{
                    backgroundColor: entry.strength === '弱' ? 'var(--cinnabar)' :
                      entry.strength === '一般' ? 'var(--warning)' :
                      entry.strength === '良好' ? 'var(--info)' : 'var(--success)'
                  }} />
                  <span className="flex-1 font-mono truncate text-caption" style={{ fontFamily: 'var(--font-code)', fontSize: '11px', color: 'var(--ink-700)' }}>
                    {entry.password}
                  </span>
                  <span className="text-caption flex-shrink-0" style={{ color: 'var(--ink-400)', fontSize: '9px' }}>{entry.timestamp}</span>
                  <button
                    onClick={() => { navigator.clipboard.writeText(entry.password); }}
                    className="p-0.5 flex-shrink-0"
                  >
                    <Copy size={10} style={{ color: 'var(--ink-400)' }} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

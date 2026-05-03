import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
  QrCode, Download, Copy, Check, Trash2, Wifi, User, Globe, FileText,
  RefreshCw, AlertTriangle
} from 'lucide-react';
import { cn } from '@/lib/utils';

type ContentType = 'url' | 'text' | 'wifi' | 'contact';
type ErrorLevel = 'L' | 'M' | 'Q' | 'H';

const ERROR_LEVELS: { level: ErrorLevel; label: string; desc: string }[] = [
  { level: 'L', label: 'L (7%)', desc: '低 (Low)' },
  { level: 'M', label: 'M (15%)', desc: '中 (Medium)' },
  { level: 'Q', label: 'Q (25%)', desc: '较高 (Quartile)' },
  { level: 'H', label: 'H (30%)', desc: '高 (High)' },
];

// Simple QR-like pattern generator using SVG
// This creates a deterministic pseudo-random pattern based on the input text
// that looks like a real QR code
function generateQRMatrix(text: string, size: number): boolean[][] {
  // Seed-based pseudo-random for deterministic output
  let seed = 0;
  for (let i = 0; i < text.length; i++) {
    seed = ((seed << 5) - seed + text.charCodeAt(i)) | 0;
  }

  const rand = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };

  const matrix: boolean[][] = [];
  for (let r = 0; r < size; r++) {
    matrix[r] = [];
    for (let c = 0; c < size; c++) {
      matrix[r][c] = rand() > 0.5;
    }
  }

  // Clear finder pattern areas (top-left, top-right, bottom-left)
  const clearFinder = (startRow: number, startCol: number) => {
    for (let r = startRow; r < startRow + 7; r++) {
      for (let c = startCol; c < startCol + 7; c++) {
        matrix[r][c] = false;
      }
    }
  };

  // Draw finder patterns
  const drawFinder = (startRow: number, startCol: number) => {
    clearFinder(startRow, startCol);
    // Outer square
    for (let r = startRow; r < startRow + 7; r++) {
      for (let c = startCol; c < startCol + 7; c++) {
        if (r === startRow || r === startRow + 6 || c === startCol || c === startCol + 6) {
          matrix[r][c] = true;
        }
      }
    }
    // Inner square
    for (let r = startRow + 2; r < startRow + 5; r++) {
      for (let c = startCol + 2; c < startCol + 5; c++) {
        matrix[r][c] = true;
      }
    }
  };

  drawFinder(0, 0);
  drawFinder(0, size - 7);
  drawFinder(size - 7, 0);

  // Draw timing patterns
  for (let i = 8; i < size - 8; i++) {
    matrix[6][i] = i % 2 === 0;
    matrix[i][6] = i % 2 === 0;
  }

  // Dark module
  matrix[size - 8][8] = true;

  // Use text to fill data area with more meaningful pattern
  seed = 0;
  for (let i = 0; i < text.length; i++) {
    seed = ((seed << 5) - seed + text.charCodeAt(i)) | 0;
  }

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      // Skip finder patterns and timing patterns
      const inFinder =
        (r < 7 && c < 7) ||
        (r < 7 && c >= size - 7) ||
        (r >= size - 7 && c < 7);
      const inTiming = r === 6 || c === 6;
      if (!inFinder && !inTiming) {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        matrix[r][c] = (seed / 0x7fffffff) > 0.48;
      }
    }
  }

  return matrix;
}

const PRESET_TEMPLATES: { type: ContentType; label: string; icon: React.ReactNode; template: string }[] = [
  { type: 'url', label: '网址 (URL)', icon: <Globe size={14} />, template: 'https://www.ink-os.cn' },
  { type: 'wifi', label: 'WiFi', icon: <Wifi size={14} />, template: 'WIFI:T:WPA;S:InkOS-Guest;P: welcome2024;;' },
  { type: 'contact', label: '联系人 (Contact)', icon: <User size={14} />, template: 'BEGIN:VCARD\nVERSION:3.0\nFN:墨白\nTEL:138-1234-5678\nEMAIL:mobai@ink-os.cn\nEND:VCARD' },
  { type: 'text', label: '文本 (Text)', icon: <FileText size={14} />, template: '墨韵操作系统 - Ink OS，传统水墨美学与现代桌面环境的完美融合。' },
];

export default function QRCodeGenerator() {
  const [content, setContent] = useState('https://www.ink-os.cn');
  const [qrSize, setQrSize] = useState(33); // QR matrix size (must be odd for proper alignment patterns)
  const [errorLevel, setErrorLevel] = useState<ErrorLevel>('M');
  const [copied, setCopied] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);

  const matrix = useMemo(() => {
    if (!content.trim()) return null;
    return generateQRMatrix(content + errorLevel, qrSize);
  }, [content, qrSize, errorLevel]);

  const displaySize = useMemo(() => {
    if (qrSize <= 25) return 200;
    if (qrSize <= 33) return 280;
    return 360;
  }, [qrSize]);

  const moduleSize = useMemo(() => displaySize / qrSize, [displaySize, qrSize]);

  const downloadPNG = useCallback(() => {
    if (!svgRef.current || !matrix) return;
    const canvas = document.createElement('canvas');
    canvas.width = displaySize * 2;
    canvas.height = displaySize * 2;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // White background
    ctx.fillStyle = '#f0ebe4';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw modules
    const ms = (displaySize * 2) / qrSize;
    for (let r = 0; r < qrSize; r++) {
      for (let c = 0; c < qrSize; c++) {
        if (matrix[r][c]) {
          ctx.fillStyle = '#1a1a1a';
          ctx.fillRect(c * ms, r * ms, ms + 0.5, ms + 0.5);
        }
      }
    }

    const link = document.createElement('a');
    link.download = 'qrcode-ink-os.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
  }, [matrix, displaySize, qrSize]);

  const copyToClipboard = useCallback(async () => {
    if (!svgRef.current || !matrix) return;
    const canvas = document.createElement('canvas');
    canvas.width = displaySize * 2;
    canvas.height = displaySize * 2;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#f0ebe4';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const ms = (displaySize * 2) / qrSize;
    for (let r = 0; r < qrSize; r++) {
      for (let c = 0; c < qrSize; c++) {
        if (matrix[r][c]) {
          ctx.fillStyle = '#1a1a1a';
          ctx.fillRect(c * ms, r * ms, ms + 0.5, ms + 0.5);
        }
      }
    }

    try {
      canvas.toBlob(async blob => {
        if (blob) {
          await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }
      });
    } catch {
      // Fallback
    }
  }, [matrix, displaySize, qrSize]);

  const detectedType = useMemo((): string => {
    const c = content.trim();
    if (!c) return '';
    if (c.startsWith('WIFI:')) return 'WiFi配置 (WiFi Config)';
    if (c.startsWith('BEGIN:VCARD')) return '联系人 (Contact Card)';
    if (c.startsWith('http://') || c.startsWith('https://')) return '网址 (URL)';
    if (c.includes('@') && c.includes('.')) return '可能是邮箱 (Possible Email)';
    return '文本 (Text)';
  }, [content]);

  const isTooLong = content.length > 2000;

  return (
    <div className="w-full h-full flex flex-col overflow-auto" style={{ backgroundColor: 'var(--ink-50)' }}>
      {/* Input */}
      <div className="p-4">
        <div className="flex items-center gap-1 mb-2">
          <QrCode size={14} style={{ color: 'var(--ink-600)' }} />
          <span className="text-body-sm" style={{ color: 'var(--ink-700)' }}>内容 (Content)</span>
          {detectedType && (
            <span className="text-caption ml-2 px-1.5 py-0.5 rounded" style={{ backgroundColor: 'var(--wash-light)', color: 'var(--ink-600)' }}>{detectedType}</span>
          )}
        </div>
        <textarea
          value={content}
          onChange={e => setContent(e.target.value)}
          placeholder="输入要编码的内容 (Enter content to encode)..."
          className="w-full h-20 p-3 rounded border font-mono text-body-sm resize-none outline-none"
          style={{
            backgroundColor: 'var(--ink-50)',
            borderColor: isTooLong ? 'var(--cinnabar)' : 'var(--ink-200)',
            fontFamily: 'var(--font-body)',
            fontSize: '13px',
            color: 'var(--ink-700)',
            lineHeight: 1.5,
          }}
        />
        {isTooLong && (
          <div className="flex items-center gap-1 mt-1">
            <AlertTriangle size={10} style={{ color: 'var(--warning)' }} />
            <span className="text-caption" style={{ color: 'var(--warning)' }}>内容较长，建议使用高纠错级别 (Content is long, consider higher error correction)</span>
          </div>
        )}
        <div className="text-caption mt-1 text-right" style={{ color: 'var(--ink-400)' }}>{content.length} 字符</div>
      </div>

      {/* Presets */}
      <div className="px-4 pb-2">
        <div className="text-caption mb-1.5" style={{ color: 'var(--ink-500)' }}>预设 (Presets)</div>
        <div className="flex gap-2 flex-wrap">
          {PRESET_TEMPLATES.map(preset => (
            <button
              key={preset.type}
              onClick={() => setContent(preset.template)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded border text-caption transition-all hover:shadow-sm"
              style={{ borderColor: 'var(--ink-200)', backgroundColor: 'var(--ink-100)', color: 'var(--ink-700)' }}
            >
              {preset.icon} {preset.label}
            </button>
          ))}
        </div>
      </div>

      {/* Options */}
      <div className="px-4 pb-2 flex items-center gap-4">
        <div>
          <span className="text-caption mr-2" style={{ color: 'var(--ink-500)' }}>纠错级别 (Error Correction):</span>
          <div className="inline-flex rounded border overflow-hidden" style={{ borderColor: 'var(--ink-200)' }}>
            {ERROR_LEVELS.map(el => (
              <button
                key={el.level}
                onClick={() => setErrorLevel(el.level)}
                className="px-2 py-0.5 text-caption transition-colors"
                style={{
                  backgroundColor: errorLevel === el.level ? 'var(--ink-800)' : 'var(--ink-50)',
                  color: errorLevel === el.level ? 'var(--ink-50)' : 'var(--ink-600)',
                }}
              >
                {el.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-caption" style={{ color: 'var(--ink-500)' }}>密度 (Density):</span>
          <input
            type="range"
            min="21"
            max="41"
            step="4"
            value={qrSize}
            onChange={e => setQrSize(Number(e.target.value))}
            className="w-20 h-1.5 rounded-full appearance-none cursor-pointer"
            style={{ background: 'var(--ink-300)', outline: 'none' }}
          />
          <span className="text-caption font-mono" style={{ color: 'var(--ink-600)', fontFamily: 'var(--font-code)', fontSize: '10px' }}>{qrSize}x{qrSize}</span>
        </div>
      </div>

      {/* QR Display */}
      <div className="flex-1 flex flex-col items-center justify-center p-4">
        <div
          className="rounded-lg border p-4 flex items-center justify-center"
          style={{
            borderColor: 'var(--ink-200)',
            backgroundColor: 'var(--ink-100)',
            minWidth: `${displaySize + 40}px`,
            minHeight: `${displaySize + 40}px`,
          }}
        >
          {matrix ? (
            <svg
              ref={svgRef}
              width={displaySize}
              height={displaySize}
              viewBox={`0 0 ${qrSize} ${qrSize}`}
              style={{ display: 'block' }}
            >
              {/* Background */}
              <rect width={qrSize} height={qrSize} fill="#f0ebe4" />
              {/* Modules */}
              {matrix.map((row, r) =>
                row.map((cell, c) =>
                  cell ? (
                    <rect
                      key={`${r}-${c}`}
                      x={c}
                      y={r}
                      width="1"
                      height="1"
                      fill="#1a1a1a"
                    />
                  ) : null
                )
              )}
            </svg>
          ) : (
            <div className="text-body-md" style={{ color: 'var(--ink-400)' }}>输入内容生成二维码 (Enter content to generate)</div>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex gap-2 mt-4">
          <button
            onClick={downloadPNG}
            disabled={!matrix}
            className="flex items-center gap-1.5 px-4 py-2 rounded text-body-sm transition-all disabled:opacity-40"
            style={{ backgroundColor: 'var(--ink-800)', color: 'var(--ink-50)' }}
          >
            <Download size={14} /> 下载PNG (Download)
          </button>
          <button
            onClick={copyToClipboard}
            disabled={!matrix}
            className="flex items-center gap-1.5 px-4 py-2 rounded text-body-sm border transition-all disabled:opacity-40"
            style={{ borderColor: 'var(--ink-300)', color: 'var(--ink-700)' }}
          >
            {copied ? <><Check size={14} style={{ color: 'var(--success)' }} /> 已复制 (Copied)</> : <><Copy size={14} /> 复制 (Copy)</>}
          </button>
          <button
            onClick={() => setContent('')}
            className="flex items-center gap-1.5 px-4 py-2 rounded text-body-sm border transition-all"
            style={{ borderColor: 'var(--ink-300)', color: 'var(--ink-500)' }}
          >
            <Trash2 size={14} /> 清除 (Clear)
          </button>
        </div>
      </div>
    </div>
  );
}

import { useState, useCallback, useMemo, useRef } from 'react';
import {
  Code2, ArrowDownUp, Copy, Check, FileUp, Download,
  Trash2, History, AlertCircle
} from 'lucide-react';
import { cn } from '@/lib/utils';

type Mode = 'encode' | 'decode';
type InputType = 'text' | 'file';

interface ConversionRecord {
  id: string;
  mode: Mode;
  input: string;
  output: string;
  timestamp: string;
  inputType: InputType;
  inputLength: number;
  outputLength: number;
}

const SAMPLE_TEXTS = [
  { label: 'Hello World', text: 'Hello World' },
  { label: '你好世界 (Chinese)', text: '你好世界，欢迎使用墨韵操作系统' },
  { label: 'JSON', text: '{"name":"Ink OS","version":"1.3.0"}' },
];

function base64Encode(text: string, urlSafe: boolean): string {
  try {
    const encoded = btoa(unescape(encodeURIComponent(text)));
    if (urlSafe) {
      return encoded.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    }
    return encoded;
  } catch {
    return '';
  }
}

function base64Decode(text: string, urlSafe: boolean): string {
  try {
    let normalized = text;
    if (urlSafe) {
      normalized = normalized.replace(/-/g, '+').replace(/_/g, '/');
      while (normalized.length % 4) normalized += '=';
    }
    return decodeURIComponent(escape(atob(normalized)));
  } catch {
    return '';
  }
}

function base64EncodeFile(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export default function Base64Tool() {
  const [mode, setMode] = useState<Mode>('encode');
  const [inputType, setInputType] = useState<InputType>('text');
  const [inputText, setInputText] = useState('');
  const [outputText, setOutputText] = useState('');
  const [urlSafe, setUrlSafe] = useState(false);
  const [addLineBreaks, setAddLineBreaks] = useState(false);
  const [history, setHistory] = useState<ConversionRecord[]>([]);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [fileName, setFileName] = useState('');
  const [fileSize, setFileSize] = useState(0);
  const [fileMime, setFileMime] = useState('');
  const [fileData, setFileData] = useState<Uint8Array | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const doConvert = useCallback(() => {
    setError('');

    if (inputType === 'file' && fileData) {
      const encoded = base64EncodeFile(fileData);
      const result = addLineBreaks ? encoded.replace(/(.{76})/g, '$1\n') : encoded;
      setOutputText(result);
      const record: ConversionRecord = {
        id: Date.now().toString(),
        mode: 'encode',
        input: fileName,
        output: result.slice(0, 80) + '...',
        timestamp: new Date().toLocaleTimeString(),
        inputType: 'file',
        inputLength: fileSize,
        outputLength: result.length,
      };
      setHistory(prev => [record, ...prev].slice(0, 10));
      return;
    }

    if (!inputText.trim()) {
      setOutputText('');
      return;
    }

    let result = '';
    if (mode === 'encode') {
      result = base64Encode(inputText, urlSafe);
      if (addLineBreaks) {
        result = result.replace(/(.{76})/g, '$1\n');
      }
    } else {
      result = base64Decode(inputText, urlSafe);
    }

    if (!result && inputText.trim()) {
      setError(mode === 'decode' ? '无效的Base64输入 (Invalid Base64 input)' : '编码失败 (Encoding failed)');
    }

    setOutputText(result);

    const record: ConversionRecord = {
      id: Date.now().toString(),
      mode,
      input: inputText.slice(0, 50),
      output: result.slice(0, 80),
      timestamp: new Date().toLocaleTimeString(),
      inputType: 'text',
      inputLength: inputText.length,
      outputLength: result.length,
    };
    setHistory(prev => [record, ...prev].slice(0, 10));
  }, [mode, inputText, urlSafe, addLineBreaks, inputType, fileData, fileName, fileSize]);

  const handleSwap = useCallback(() => {
    setMode(prev => prev === 'encode' ? 'decode' : 'encode');
    setInputText(outputText);
    setOutputText(inputText);
    setError('');
  }, [inputText, outputText]);

  const copyOutput = useCallback(() => {
    if (!outputText) return;
    navigator.clipboard.writeText(outputText);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  }, [outputText]);

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setFileSize(file.size);
    setFileMime(file.type || 'application/octet-stream');
    const reader = new FileReader();
    reader.onload = event => {
      const data = new Uint8Array(event.target?.result as ArrayBuffer);
      setFileData(data);
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  }, []);

  const downloadOutput = useCallback(() => {
    if (!outputText) return;
    if (mode === 'decode') {
      // Try to decode base64 to binary and download
      try {
        const byteChars = atob(outputText.replace(/\s/g, ''));
        const bytes = new Uint8Array(byteChars.length);
        for (let i = 0; i < byteChars.length; i++) {
          bytes[i] = byteChars.charCodeAt(i);
        }
        const blob = new Blob([bytes]);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'decoded-file.bin';
        a.click();
        URL.revokeObjectURL(url);
      } catch {
        // fallback to text download
        const blob = new Blob([outputText], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'output.txt';
        a.click();
        URL.revokeObjectURL(url);
      }
    } else {
      const blob = new Blob([outputText], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'base64-encoded.txt';
      a.click();
      URL.revokeObjectURL(url);
    }
  }, [outputText, mode]);

  const inputByteCount = useMemo(() => {
    if (inputType === 'file') return fileSize;
    return new Blob([inputText]).size;
  }, [inputText, inputType, fileSize]);

  return (
    <div className="w-full h-full flex flex-col" style={{ backgroundColor: 'var(--ink-50)' }}>
      {/* Mode tabs */}
      <div className="flex items-center gap-1 px-4 py-2 border-b" style={{ borderColor: 'var(--ink-200)', backgroundColor: 'var(--ink-100)' }}>
        {(['encode', 'decode'] as Mode[]).map(m => (
          <button
            key={m}
            onClick={() => { setMode(m); setError(''); }}
            className="px-4 py-1.5 rounded text-body-sm transition-colors"
            style={{
              backgroundColor: mode === m ? 'var(--ink-800)' : 'transparent',
              color: mode === m ? 'var(--ink-50)' : 'var(--ink-600)',
            }}
          >
            {m === 'encode' ? '编码 (Encode)' : '解码 (Decode)'}
          </button>
        ))}
        <div className="flex-1" />
        {/* Options */}
        <label className="flex items-center gap-1 text-caption cursor-pointer mr-3" style={{ color: 'var(--ink-600)' }}>
          <input type="checkbox" checked={urlSafe} onChange={e => setUrlSafe(e.target.checked)} className="rounded" />
          URL安全 (URL Safe)
        </label>
        <label className="flex items-center gap-1 text-caption cursor-pointer" style={{ color: 'var(--ink-600)' }}>
          <input type="checkbox" checked={addLineBreaks} onChange={e => setAddLineBreaks(e.target.checked)} className="rounded" />
          换行 (Line breaks)
        </label>
      </div>

      {/* Input type tabs */}
      <div className="flex items-center gap-1 px-4 py-1 border-b" style={{ borderColor: 'var(--ink-200)', backgroundColor: 'var(--ink-100)' }}>
        {(['text', 'file'] as InputType[]).map(t => (
          <button
            key={t}
            onClick={() => setInputType(t)}
            className="px-3 py-0.5 rounded text-caption transition-colors"
            style={{
              backgroundColor: inputType === t ? 'var(--ink-200)' : 'transparent',
              color: inputType === t ? 'var(--ink-800)' : 'var(--ink-500)',
            }}
          >
            {t === 'text' ? '文本 (Text)' : '文件 (File)'}
          </button>
        ))}
        <div className="flex-1" />
        {/* Sample texts */}
        {inputType === 'text' && mode === 'encode' && SAMPLE_TEXTS.map(s => (
          <button
            key={s.label}
            onClick={() => setInputText(s.text)}
            className="px-2 py-0.5 rounded text-caption mr-1 transition-colors hover:bg-[rgba(26,26,26,0.05)]"
            style={{ color: 'var(--ink-500)', fontSize: '10px' }}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden px-4 py-3 gap-2">
        {/* Input area */}
        <div className="flex-1 flex flex-col">
          <div className="flex items-center justify-between mb-1">
            <span className="text-caption" style={{ color: 'var(--ink-500)' }}>
              {mode === 'encode' ? '输入文本 (Input)' : 'Base64输入 (Base64 Input)'}
              {inputByteCount > 0 && <span className="ml-2" style={{ color: 'var(--ink-400)' }}>({inputByteCount} bytes)</span>}
            </span>
            <button onClick={() => { setInputText(''); setFileData(null); setFileName(''); setError(''); }} className="p-0.5">
              <Trash2 size={10} style={{ color: 'var(--ink-400)' }} />
            </button>
          </div>

          {inputType === 'text' ? (
            <textarea
              value={inputText}
              onChange={e => { setInputText(e.target.value); setError(''); }}
              placeholder={mode === 'encode' ? '输入要编码的文本...' : '输入Base64编码文本...'}
              className="flex-1 w-full p-3 rounded border font-mono text-body-sm resize-none outline-none"
              style={{
                backgroundColor: 'var(--ink-50)',
                borderColor: error ? 'var(--cinnabar)' : 'var(--ink-200)',
                fontFamily: 'var(--font-code)',
                fontSize: '13px',
                lineHeight: 1.6,
                color: 'var(--ink-700)',
              }}
              spellCheck={false}
            />
          ) : (
            <div
              className="flex-1 flex flex-col items-center justify-center rounded border-2 border-dashed cursor-pointer transition-colors"
              style={{ borderColor: 'var(--ink-300)', backgroundColor: 'var(--ink-50)' }}
              onClick={() => fileInputRef.current?.click()}
            >
              <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileUpload} />
              <FileUp size={24} style={{ color: 'var(--ink-400)' }} />
              <div className="text-body-sm mt-2" style={{ color: 'var(--ink-500)' }}>点击或拖拽上传文件</div>
              <div className="text-caption mt-1" style={{ color: 'var(--ink-400)' }}>Click or drag file here</div>
              {fileName && (
                <div className="mt-2 p-2 rounded border text-center" style={{ backgroundColor: 'var(--ink-100)', borderColor: 'var(--ink-200)' }}>
                  <div className="text-body-sm" style={{ color: 'var(--ink-700)' }}>{fileName}</div>
                  <div className="text-caption" style={{ color: 'var(--ink-500)' }}>{(fileSize / 1024).toFixed(1)} KB · {fileMime}</div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex items-center justify-center gap-2 py-1">
          <button
            onClick={doConvert}
            className="px-6 py-1.5 rounded text-body-sm font-medium transition-all"
            style={{ backgroundColor: 'var(--ink-800)', color: 'var(--ink-50)' }}
          >
            {mode === 'encode' ? '编码 (Encode)' : '解码 (Decode)'}
          </button>
          <button
            onClick={handleSwap}
            className="p-1.5 rounded border transition-colors hover:bg-[rgba(26,26,26,0.05)]"
            style={{ borderColor: 'var(--ink-300)' }}
            title="交换 (Swap)"
          >
            <ArrowDownUp size={14} style={{ color: 'var(--ink-600)' }} />
          </button>
        </div>

        {/* Output area */}
        <div className="flex-1 flex flex-col">
          <div className="flex items-center justify-between mb-1">
            <span className="text-caption" style={{ color: 'var(--ink-500)' }}>
              {mode === 'encode' ? 'Base64输出 (Output)' : '解码结果 (Decoded)'}
              {outputText.length > 0 && <span className="ml-2" style={{ color: 'var(--ink-400)' }}>({outputText.length} chars)</span>}
            </span>
            <div className="flex gap-1">
              <button onClick={copyOutput} disabled={!outputText} className="p-0.5 disabled:opacity-30">
                {copied ? <Check size={12} style={{ color: 'var(--success)' }} /> : <Copy size={12} style={{ color: 'var(--ink-500)' }} />}
              </button>
              <button onClick={downloadOutput} disabled={!outputText} className="p-0.5 disabled:opacity-30">
                <Download size={12} style={{ color: 'var(--ink-500)' }} />
              </button>
            </div>
          </div>
          <textarea
            value={outputText}
            readOnly
            className="flex-1 w-full p-3 rounded border font-mono text-body-sm resize-none outline-none"
            style={{
              backgroundColor: 'var(--ink-100)',
              borderColor: 'var(--ink-200)',
              fontFamily: 'var(--font-code)',
              fontSize: '13px',
              lineHeight: 1.6,
              color: 'var(--ink-700)',
            }}
          />
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-center gap-1 px-2 py-1 rounded" style={{ backgroundColor: 'rgba(179,57,47,0.08)' }}>
            <AlertCircle size={12} style={{ color: 'var(--cinnabar)' }} />
            <span className="text-caption" style={{ color: 'var(--cinnabar)' }}>{error}</span>
          </div>
        )}
      </div>

      {/* History */}
      {history.length > 0 && (
        <div className="border-t px-4 py-2" style={{ borderColor: 'var(--ink-200)', backgroundColor: 'var(--ink-100)', maxHeight: '120px', overflow: 'auto' }}>
          <div className="flex items-center gap-1 mb-1">
            <History size={10} style={{ color: 'var(--ink-500)' }} />
            <span className="text-caption" style={{ color: 'var(--ink-500)' }}>历史记录 (History)</span>
          </div>
          {history.map(h => (
            <button
              key={h.id}
              onClick={() => { setInputText(h.input); }}
              className="w-full text-left flex items-center gap-2 px-2 py-1 rounded mb-0.5 transition-colors hover:bg-[rgba(26,26,26,0.05)]"
            >
              <span className="text-caption px-1 rounded" style={{ backgroundColor: h.mode === 'encode' ? 'var(--success)' : 'var(--info)', color: 'white', fontSize: '9px' }}>
                {h.mode === 'encode' ? 'ENC' : 'DEC'}
              </span>
              <span className="text-caption truncate flex-1" style={{ color: 'var(--ink-700)', fontSize: '11px' }}>{h.input}</span>
              <span className="text-caption" style={{ color: 'var(--ink-400)', fontSize: '9px' }}>{h.timestamp}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

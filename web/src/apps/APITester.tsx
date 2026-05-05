import { useState, useCallback, useMemo, useEffect } from 'react';
import {
  Send, Clock, Trash2, Copy, Check, Plus, X, History
} from 'lucide-react';
import { apiTesterClient, type ApiTesterRunResponse } from '../lib/api-tester';
import { appStateClient } from '../lib/app-state';

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS';

interface Header {
  key: string;
  value: string;
  enabled: boolean;
}

interface RequestEntry {
  id: string;
  method: HttpMethod;
  url: string;
  headers: Header[];
  body: string;
  timestamp: string;
  name: string;
}

interface ResponseData {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  time: number;
  size: number;
  truncated: boolean;
  error?: string;
}

const METHOD_COLORS: Record<HttpMethod, string> = {
  GET: '#4a7c59',
  POST: '#5a7a8a',
  PUT: '#b8860b',
  DELETE: '#b3392f',
  PATCH: '#7a5a8a',
  HEAD: '#5c5c5c',
  OPTIONS: '#7a7a7a',
};

const DEMO_ENDPOINTS: RequestEntry[] = [
  { id: 'demo1', method: 'GET', url: 'http://127.0.0.1:3001/healthz', headers: [{ key: 'Accept', value: 'text/plain', enabled: true }], body: '', timestamp: '', name: '本机健康检查 (Local Health)' },
  { id: 'demo2', method: 'GET', url: 'https://httpbin.org/get', headers: [{ key: 'Accept', value: 'application/json', enabled: true }], body: '', timestamp: '', name: 'HTTPBin GET' },
  { id: 'demo3', method: 'POST', url: 'https://httpbin.org/post', headers: [{ key: 'Content-Type', value: 'application/json', enabled: true }, { key: 'Accept', value: 'application/json', enabled: true }], body: '{\n  "name": "mochan-linux"\n}', timestamp: '', name: 'HTTPBin POST' },
];

const COMMON_HEADERS = ['Accept', 'Authorization', 'Content-Type', 'User-Agent', 'Cache-Control', 'X-API-Key', 'Origin', 'Referer'];
const APP_STATE_ID = 'apitester';

interface APITesterState {
  history: RequestEntry[];
}

function mapResponse(result: ApiTesterRunResponse): ResponseData {
  return {
    status: result.status,
    statusText: result.status_text || (result.error ? 'Request Error' : ''),
    headers: result.headers || {},
    body: result.body || '',
    time: result.time_ms || 0,
    size: result.size || 0,
    truncated: result.truncated,
    error: result.error,
  };
}

function requestName(method: HttpMethod, rawURL: string): string {
  try {
    const parsed = new URL(rawURL);
    return `${method} ${parsed.pathname || '/'}`;
  } catch {
    return `${method} ${rawURL}`;
  }
}

export default function APITester() {
  const [method, setMethod] = useState<HttpMethod>('GET');
  const [url, setUrl] = useState(DEMO_ENDPOINTS[0].url);
  const [headers, setHeaders] = useState<Header[]>(DEMO_ENDPOINTS[0].headers.map((h) => ({ ...h })));
  const [body, setBody] = useState('');
  const [activeTab, setActiveTab] = useState<'params' | 'headers' | 'body'>('headers');
  const [responseTab, setResponseTab] = useState<'body' | 'headers'>('body');
  const [response, setResponse] = useState<ResponseData | null>(null);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<RequestEntry[]>([]);
  const [showHistory, setShowHistory] = useState(true);
  const [copied, setCopied] = useState(false);

  const bodyView = useMemo(() => {
    if (!response) return '';
    if (responseTab === 'headers') return '';
    if (response.error) return response.error;
    try {
      const parsed = JSON.parse(response.body);
      return JSON.stringify(parsed, null, 2);
    } catch {
      return response.body;
    }
  }, [response, responseTab]);

  useEffect(() => {
    let mounted = true;
    appStateClient.getOrDefault<APITesterState>(APP_STATE_ID, { history: [] })
      .then((state) => {
        if (mounted && Array.isArray(state.history)) {
          setHistory(state.history.slice(0, 50));
        }
      })
      .catch(() => {
        if (mounted) setHistory([]);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const persistHistory = useCallback((next: RequestEntry[]) => {
    setHistory(next);
    void appStateClient.put<APITesterState>(APP_STATE_ID, { history: next });
  }, []);

  const handleSend = useCallback(async () => {
    setLoading(true);
    try {
      const result = await apiTesterClient.run({
        method,
        url,
        headers: headers.map((h) => ({ ...h })),
        body,
        timeout_ms: 15000,
      });
      setResponse(mapResponse(result));

      const entry: RequestEntry = {
        id: Date.now().toString(),
        method,
        url,
        headers: headers.map((h) => ({ ...h })),
        body,
        timestamp: new Date().toLocaleTimeString(),
        name: requestName(method, url),
      };
      const nextHistory = [entry, ...history].slice(0, 50);
      persistHistory(nextHistory);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setResponse({
        status: 0,
        statusText: 'Request Error',
        headers: {},
        body: '',
        time: 0,
        size: 0,
        truncated: false,
        error: message,
      });
    } finally {
      setLoading(false);
    }
  }, [method, url, headers, body, history, persistHistory]);

  const addHeader = useCallback(() => {
    setHeaders(prev => [...prev, { key: '', value: '', enabled: true }]);
  }, []);

  const removeHeader = useCallback((index: number) => {
    setHeaders(prev => prev.filter((_, i) => i !== index));
  }, []);

  const updateHeader = useCallback((index: number, field: 'key' | 'value' | 'enabled', val: string | boolean) => {
    setHeaders(prev => prev.map((h, i) => i === index ? { ...h, [field]: val } : h));
  }, []);

  const loadRequest = useCallback((req: RequestEntry) => {
    setMethod(req.method);
    setUrl(req.url);
    setHeaders(req.headers.map(h => ({ ...h })));
    setBody(req.body);
  }, []);

  const copyResponse = useCallback(() => {
    if (!response) return;
    navigator.clipboard.writeText(response.error || response.body);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [response]);

  const getStatusColor = (status: number) => {
    if (status === 0) return 'var(--cinnabar)';
    if (status < 300) return 'var(--success)';
    if (status < 400) return 'var(--info)';
    if (status < 500) return 'var(--warning)';
    return 'var(--cinnabar)';
  };

  const syntaxHighlight = (text: string) => {
    if (!text) return '';
    return text
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/("(?:[^"\\]|\\.)*")(\s*:)/g, '<span style="color:var(--ink-800)">$1</span>$2')
      .replace(/:(\s*)("(?:[^"\\]|\\.)*")/g, ':$1<span style="color:var(--cinnabar)">$2</span>')
      .replace(/:(\s*)(\d+\.?\d*)/g, ':$1<span style="color:var(--info)">$2</span>')
      .replace(/\b(true|false)\b/g, '<span style="color:var(--success)">$1</span>')
      .replace(/\b(null)\b/g, '<span style="color:var(--ink-400)">$1</span>');
  };

  return (
    <div className="w-full h-full flex" style={{ backgroundColor: 'var(--ink-50)' }}>
      {/* Main area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Request section */}
        <div className="flex flex-col border-b" style={{ borderColor: 'var(--ink-200)', minHeight: '45%' }}>
          {/* URL bar */}
          <div className="flex items-center gap-2 px-4 py-3" style={{ backgroundColor: 'var(--ink-100)' }}>
            <select
              value={method}
              onChange={e => setMethod(e.target.value as HttpMethod)}
              className="px-2 py-1.5 rounded text-body-sm font-medium outline-none"
              style={{ backgroundColor: METHOD_COLORS[method], color: 'white', fontFamily: 'var(--font-code)', fontSize: '12px', minWidth: '72px' }}
            >
              {Object.keys(METHOD_COLORS).map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
            <input
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="输入请求URL (Enter request URL)"
              className="flex-1 px-3 py-1.5 rounded text-body-sm border outline-none"
              style={{ backgroundColor: 'var(--ink-50)', borderColor: 'var(--ink-300)', fontFamily: 'var(--font-code)', fontSize: '13px', color: 'var(--ink-800)' }}
            />
            <button
              onClick={handleSend}
              disabled={loading || !url}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded text-body-sm font-medium transition-all disabled:opacity-40"
              style={{ backgroundColor: 'var(--ink-800)', color: 'var(--ink-50)' }}
            >
              {loading ? (
                <><div className="w-3 h-3 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--ink-50)', borderTopColor: 'transparent' }} /> 发送中...</>
              ) : (
                <><Send size={12} /> 发送 (Send)</>
              )}
            </button>
          </div>

          {/* Tabs */}
          <div className="flex border-b" style={{ borderColor: 'var(--ink-200)', backgroundColor: 'var(--ink-100)' }}>
            {(['headers', 'body'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className="px-4 py-1.5 text-body-sm transition-colors"
                style={{
                  color: activeTab === tab ? 'var(--ink-900)' : 'var(--ink-500)',
                  borderBottom: activeTab === tab ? '2px solid var(--cinnabar)' : '2px solid transparent',
                  backgroundColor: activeTab === tab ? 'var(--ink-50)' : 'transparent',
                }}
              >
                {tab === 'headers' && `请求头 (Headers) ${headers.filter(h => h.enabled && h.key).length > 0 ? `(${headers.filter(h => h.enabled && h.key).length})` : ''}`}
                {tab === 'body' && '请求体 (Body)'}
              </button>
            ))}
            <div className="flex-1" />
            <button onClick={() => setShowHistory(!showHistory)} className="px-3 py-1.5 text-caption" style={{ color: 'var(--ink-500)' }}>
              <History size={12} className="inline mr-1" />{showHistory ? '隐藏历史' : '显示历史'}
            </button>
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-auto p-3" style={{ backgroundColor: 'var(--ink-50)' }}>
            {activeTab === 'headers' && (
              <div>
                {headers.map((h, i) => (
                  <div key={i} className="flex items-center gap-2 mb-1">
                    <input
                      type="checkbox"
                      checked={h.enabled}
                      onChange={e => updateHeader(i, 'enabled', e.target.checked)}
                      className="rounded"
                    />
                    <input
                      value={h.key}
                      onChange={e => updateHeader(i, 'key', e.target.value)}
                      placeholder="Header名"
                      list="common-headers"
                      className="flex-1 px-2 py-1 rounded border text-body-sm"
                      style={{ backgroundColor: 'var(--ink-50)', borderColor: 'var(--ink-300)', fontFamily: 'var(--font-code)', fontSize: '12px', color: 'var(--ink-700)' }}
                    />
                    <input
                      value={h.value}
                      onChange={e => updateHeader(i, 'value', e.target.value)}
                      placeholder="值"
                      className="flex-[2] px-2 py-1 rounded border text-body-sm"
                      style={{ backgroundColor: 'var(--ink-50)', borderColor: 'var(--ink-300)', fontFamily: 'var(--font-code)', fontSize: '12px', color: 'var(--ink-700)' }}
                    />
                    <button onClick={() => removeHeader(i)} className="p-1"><X size={12} style={{ color: 'var(--ink-400)' }} /></button>
                  </div>
                ))}
                <datalist id="common-headers">
                  {COMMON_HEADERS.map(h => <option key={h} value={h} />)}
                </datalist>
                <button onClick={addHeader} className="flex items-center gap-1 mt-1 px-2 py-1 text-caption rounded" style={{ color: 'var(--ink-600)' }}>
                  <Plus size={10} /> 添加请求头 (Add Header)
                </button>
              </div>
            )}
            {activeTab === 'body' && (
              <textarea
                value={body}
                onChange={e => setBody(e.target.value)}
                placeholder={method === 'GET' ? 'GET请求通常不需要请求体 (GET requests usually don\'t have a body)' : '输入JSON请求体 (Enter JSON body)...'}
                disabled={method === 'GET' || method === 'HEAD'}
                className="w-full h-full min-h-[120px] p-3 rounded border font-mono text-body-sm resize-none outline-none"
                style={{
                  backgroundColor: 'var(--ink-50)',
                  borderColor: 'var(--ink-200)',
                  fontFamily: 'var(--font-code)',
                  fontSize: '13px',
                  lineHeight: 1.6,
                  color: 'var(--ink-700)',
                  opacity: method === 'GET' || method === 'HEAD' ? 0.5 : 1,
                }}
                spellCheck={false}
              />
            )}
          </div>
        </div>

        {/* Response section */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {response ? (
            <>
              {/* Response summary */}
              <div className="flex items-center gap-4 px-4 py-2 border-b" style={{ borderColor: 'var(--ink-200)', backgroundColor: 'var(--ink-100)' }}>
                <span className="text-heading-sm font-medium" style={{ color: getStatusColor(response.status) }}>{response.status || 'ERR'}</span>
                <span className="text-body-sm" style={{ color: 'var(--ink-600)' }}>{response.statusText}</span>
                <div className="w-px h-4" style={{ backgroundColor: 'var(--ink-300)' }} />
                <span className="flex items-center gap-1 text-caption" style={{ color: 'var(--ink-600)' }}><Clock size={10} /> {response.time}ms</span>
                <span className="text-caption" style={{ color: 'var(--ink-600)' }}>{response.size > 1024 ? `${(response.size / 1024).toFixed(1)} KB` : `${response.size} B`}</span>
                {response.truncated && <span className="text-caption" style={{ color: 'var(--warning)' }}>已截断</span>}
                <div className="flex-1" />
                <div className="flex gap-1">
                  {(['body', 'headers'] as const).map(tab => (
                    <button
                      key={tab}
                      onClick={() => setResponseTab(tab)}
                      className="px-2 py-0.5 rounded text-caption transition-colors"
                      style={{
                        backgroundColor: responseTab === tab ? 'var(--ink-800)' : 'transparent',
                        color: responseTab === tab ? 'var(--ink-50)' : 'var(--ink-600)',
                      }}
                    >
                      {tab === 'body' ? '响应体 (Body)' : '响应头 (Headers)'}
                    </button>
                  ))}
                  <button onClick={copyResponse} className="p-0.5 ml-1">
                    {copied ? <Check size={12} style={{ color: 'var(--success)' }} /> : <Copy size={12} style={{ color: 'var(--ink-500)' }} />}
                  </button>
                </div>
              </div>

              {/* Response content */}
              <div className="flex-1 overflow-auto p-3" style={{ backgroundColor: 'var(--ink-50)' }}>
                {responseTab === 'body' ? (
                  response.error ? (
                    <pre
                      className="text-body-sm font-mono whitespace-pre-wrap"
                      style={{ fontFamily: 'var(--font-code)', fontSize: '13px', lineHeight: 1.6, color: 'var(--cinnabar)' }}
                    >
                      {response.error}
                    </pre>
                  ) : (
                    <pre
                      className="text-body-sm font-mono"
                      style={{ fontFamily: 'var(--font-code)', fontSize: '13px', lineHeight: 1.6, color: 'var(--ink-700)' }}
                      dangerouslySetInnerHTML={{ __html: syntaxHighlight(bodyView) }}
                    />
                  )
                ) : (
                  <table className="w-full">
                    <tbody>
                      {Object.entries(response.headers).map(([key, val]) => (
                        <tr key={key} className="border-b" style={{ borderColor: 'var(--ink-200)' }}>
                          <td className="py-1 pr-4 text-body-sm font-medium" style={{ color: 'var(--ink-800)', fontFamily: 'var(--font-body)', fontSize: '12px' }}>{key}</td>
                          <td className="py-1 text-body-sm" style={{ color: 'var(--ink-600)', fontFamily: 'var(--font-code)', fontSize: '12px' }}>{val}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center" style={{ backgroundColor: 'var(--ink-50)' }}>
              <Send size={32} style={{ color: 'var(--ink-300)' }} />
              <div className="text-body-md mt-2" style={{ color: 'var(--ink-400)' }}>发送请求查看响应 (Send a request to see the response)</div>
            </div>
          )}
        </div>
      </div>

      {/* History sidebar */}
      {showHistory && (
        <div className="w-56 border-l flex flex-col overflow-hidden" style={{ borderColor: 'var(--ink-200)', backgroundColor: 'var(--ink-100)' }}>
          <div className="flex items-center justify-between px-3 py-2 border-b" style={{ borderColor: 'var(--ink-200)' }}>
            <span className="text-body-sm font-medium" style={{ color: 'var(--ink-700)' }}>
              <History size={12} className="inline mr-1" />历史 (History)
            </span>
            {history.length > 0 && (
              <button onClick={() => persistHistory([])} className="p-0.5"><Trash2 size={10} style={{ color: 'var(--ink-400)' }} /></button>
            )}
          </div>

          {/* Demo endpoints */}
          <div className="p-2 border-b" style={{ borderColor: 'var(--ink-200)' }}>
            <div className="text-caption mb-1" style={{ color: 'var(--ink-500)' }}>示例接口 (Examples)</div>
            {DEMO_ENDPOINTS.map(req => (
              <button
                key={req.id}
                onClick={() => loadRequest(req)}
                className="w-full text-left flex items-center gap-1.5 px-2 py-1 rounded mb-0.5 transition-colors hover:bg-[rgba(26,26,26,0.05)]"
              >
                <span className="text-caption font-medium px-1 rounded" style={{ backgroundColor: METHOD_COLORS[req.method], color: 'white', fontSize: '9px', minWidth: '28px', textAlign: 'center' }}>{req.method}</span>
                <span className="text-caption truncate flex-1" style={{ color: 'var(--ink-700)', fontSize: '11px' }}>{req.name}</span>
              </button>
            ))}
          </div>

          {/* Request history */}
          <div className="flex-1 overflow-auto p-2">
            {history.length === 0 ? (
              <div className="text-center text-caption py-4" style={{ color: 'var(--ink-400)' }}>暂无历史 (No history)</div>
            ) : (
              history.map(req => (
                <button
                  key={req.id}
                  onClick={() => loadRequest(req)}
                  className="w-full text-left flex items-center gap-1.5 px-2 py-1.5 rounded mb-0.5 border transition-colors"
                  style={{ borderColor: 'var(--ink-200)', backgroundColor: 'var(--ink-50)' }}
                >
                  <span className="text-caption font-medium px-1 rounded" style={{ backgroundColor: METHOD_COLORS[req.method], color: 'white', fontSize: '9px', minWidth: '28px', textAlign: 'center' }}>{req.method}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-caption truncate" style={{ color: 'var(--ink-700)', fontSize: '11px' }}>{req.url}</div>
                    <div className="text-caption" style={{ color: 'var(--ink-400)', fontSize: '9px' }}>{req.timestamp}</div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

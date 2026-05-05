import { useMemo, useState } from 'react';
import {
  Inbox, Send, FileText, Search, X, ChevronLeft, Reply,
  CheckCircle, PenTool, Mail, RefreshCw, Paperclip, Server
} from 'lucide-react';
import {
  mailClient,
  type ImapAccount,
  type MailFolder,
  type MailMessageDetail,
  type MailMessageSummary,
  type MailSecurity,
  type SmtpAccount
} from '../lib/mail';

interface EmailClientProps {
  windowId?: string;
}

const DEFAULT_IMAP: ImapAccount = {
  host: '',
  port: 993,
  security: 'tls',
  username: '',
  password: '',
};

const DEFAULT_SMTP: SmtpAccount = {
  host: '',
  port: 465,
  security: 'tls',
  username: '',
  password: '',
  from: '',
};

function splitList(value: string): string[] {
  return value
    .split(/[,\n;]/)
    .map(item => item.trim())
    .filter(Boolean);
}

function formatDate(value?: string): string {
  if (!value) return '';
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  return new Date(parsed).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function folderIcon(name: string) {
  const lower = name.toLowerCase();
  if (lower.includes('sent')) return Send;
  if (lower.includes('draft')) return FileText;
  return Inbox;
}

function isMessageDetail(message: MailMessageSummary | MailMessageDetail): message is MailMessageDetail {
  return 'body_text' in message;
}

export default function EmailClient({ windowId: _windowId }: EmailClientProps) {
  const [imap, setImap] = useState<ImapAccount>(DEFAULT_IMAP);
  const [smtp, setSmtp] = useState<SmtpAccount>(DEFAULT_SMTP);
  const [folders, setFolders] = useState<MailFolder[]>([]);
  const [folder, setFolder] = useState('INBOX');
  const [messages, setMessages] = useState<MailMessageSummary[]>([]);
  const [selectedUID, setSelectedUID] = useState<string | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<MailMessageDetail | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeTo, setComposeTo] = useState('');
  const [composeCc, setComposeCc] = useState('');
  const [composeSubject, setComposeSubject] = useState('');
  const [composeBody, setComposeBody] = useState('');
  const [attachmentPaths, setAttachmentPaths] = useState('');
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2400);
  };

  const updateImap = (patch: Partial<ImapAccount>) => setImap(prev => ({ ...prev, ...patch }));
  const updateSmtp = (patch: Partial<SmtpAccount>) => setSmtp(prev => ({ ...prev, ...patch }));

  const filteredMessages = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return messages.filter(message => !q ||
      message.from.toLowerCase().includes(q) ||
      message.subject.toLowerCase().includes(q) ||
      (message.to ?? '').toLowerCase().includes(q));
  }, [messages, searchQuery]);

  const selectedMessage = selectedDetail ?? messages.find(message => message.uid === selectedUID) ?? null;
  const unreadCount = messages.filter(message => !message.seen).length;

  const loadMessages = async (targetFolder = folder) => {
    setLoading(true);
    setError(null);
    try {
      const result = await mailClient.messages(imap, targetFolder, 50);
      setMessages(result.messages);
      setSelectedUID(null);
      setSelectedDetail(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const connect = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await mailClient.connect(imap, smtp.host ? smtp : undefined);
      const nextFolders = result.imap?.folders?.length ? result.imap.folders : [{ name: 'INBOX' }];
      const nextFolder = nextFolders[0]?.name || 'INBOX';
      setFolders(nextFolders);
      setFolder(nextFolder);
      setConnected(true);
      showToast('邮箱连接成功 (Mail connected)');
      const messageResult = await mailClient.messages(imap, nextFolder, 50);
      setMessages(messageResult.messages);
    } catch (err) {
      setConnected(false);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const switchFolder = async (name: string) => {
    setFolder(name);
    await loadMessages(name);
  };

  const selectMessage = async (message: MailMessageSummary) => {
    setSelectedUID(message.uid);
    setComposeOpen(false);
    setError(null);
    setMessages(prev => prev.map(item => item.uid === message.uid ? { ...item, seen: true } : item));
    try {
      const detail = await mailClient.message(imap, message.folder || folder, message.uid);
      setSelectedDetail(detail);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const openCompose = (reply?: MailMessageSummary | MailMessageDetail) => {
    if (reply) {
      setComposeTo(reply.from);
      setComposeCc('');
      setComposeSubject(`Re: ${reply.subject || ''}`);
      setComposeBody(`\n\n--- Original Message ---\nFrom: ${reply.from}\nDate: ${reply.date || ''}\nSubject: ${reply.subject || ''}\n\n${'body_text' in reply ? reply.body_text : ''}`);
    } else {
      setComposeTo('');
      setComposeCc('');
      setComposeSubject('');
      setComposeBody('');
    }
    setAttachmentPaths('');
    setComposeOpen(true);
    setSelectedUID(null);
    setSelectedDetail(null);
  };

  const sendEmail = async () => {
    if (!smtp.host.trim() || !smtp.from.trim()) {
      setError('SMTP host and From address are required.');
      return;
    }
    const to = splitList(composeTo);
    if (to.length === 0) {
      setError('At least one recipient is required.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await mailClient.send(smtp, {
        to,
        cc: splitList(composeCc),
        subject: composeSubject || '(no subject)',
        body: composeBody,
        attachments: splitList(attachmentPaths).map(path => ({ path })),
      });
      setComposeOpen(false);
      showToast('邮件已通过 SMTP 发送 (Sent through SMTP)');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const foldersForUI = folders.length ? folders : [{ name: 'INBOX' }];

  return (
    <div className="w-full h-full flex" style={{ backgroundColor: 'var(--ink-50)' }}>
      <div className="w-64 flex-shrink-0 flex flex-col" style={{ backgroundColor: 'var(--ink-100)', borderRight: '1px solid var(--ink-200)' }}>
        <div className="p-3 space-y-2" style={{ borderBottom: '1px solid var(--ink-200)' }}>
          <div className="flex items-center gap-2 text-body-sm font-medium" style={{ color: 'var(--ink-900)' }}>
            <Server size={15} />
            Mail Account
          </div>
          <input
            value={imap.host}
            onChange={e => updateImap({ host: e.target.value })}
            className="w-full px-2 py-1.5 rounded text-caption outline-none"
            style={{ backgroundColor: 'var(--ink-50)', border: '1px solid var(--ink-200)', color: 'var(--ink-900)' }}
            placeholder="IMAP host"
          />
          <div className="grid grid-cols-2 gap-2">
            <input
              type="number"
              value={imap.port}
              onChange={e => updateImap({ port: Number(e.target.value) || 993 })}
              className="px-2 py-1.5 rounded text-caption outline-none"
              style={{ backgroundColor: 'var(--ink-50)', border: '1px solid var(--ink-200)', color: 'var(--ink-900)' }}
            />
            <select
              value={imap.security}
              onChange={e => updateImap({ security: e.target.value as MailSecurity })}
              className="px-2 py-1.5 rounded text-caption outline-none"
              style={{ backgroundColor: 'var(--ink-50)', border: '1px solid var(--ink-200)', color: 'var(--ink-900)' }}
            >
              <option value="tls">TLS</option>
              <option value="starttls">STARTTLS</option>
              <option value="plain">Plain</option>
            </select>
          </div>
          <input
            value={imap.username}
            onChange={e => {
              const username = e.target.value;
              updateImap({ username });
              if (!smtp.username) updateSmtp({ username, from: username });
            }}
            className="w-full px-2 py-1.5 rounded text-caption outline-none"
            style={{ backgroundColor: 'var(--ink-50)', border: '1px solid var(--ink-200)', color: 'var(--ink-900)' }}
            placeholder="Username"
          />
          <input
            type="password"
            value={imap.password}
            onChange={e => {
              const password = e.target.value;
              updateImap({ password });
              if (!smtp.password) updateSmtp({ password });
            }}
            className="w-full px-2 py-1.5 rounded text-caption outline-none"
            style={{ backgroundColor: 'var(--ink-50)', border: '1px solid var(--ink-200)', color: 'var(--ink-900)' }}
            placeholder="Password"
          />
          <div className="grid grid-cols-2 gap-2">
            <input
              value={smtp.host}
              onChange={e => updateSmtp({ host: e.target.value })}
              className="px-2 py-1.5 rounded text-caption outline-none"
              style={{ backgroundColor: 'var(--ink-50)', border: '1px solid var(--ink-200)', color: 'var(--ink-900)' }}
              placeholder="SMTP host"
            />
            <input
              type="number"
              value={smtp.port}
              onChange={e => updateSmtp({ port: Number(e.target.value) || 465 })}
              className="px-2 py-1.5 rounded text-caption outline-none"
              style={{ backgroundColor: 'var(--ink-50)', border: '1px solid var(--ink-200)', color: 'var(--ink-900)' }}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <select
              value={smtp.security}
              onChange={e => updateSmtp({ security: e.target.value as MailSecurity })}
              className="px-2 py-1.5 rounded text-caption outline-none"
              style={{ backgroundColor: 'var(--ink-50)', border: '1px solid var(--ink-200)', color: 'var(--ink-900)' }}
            >
              <option value="tls">TLS</option>
              <option value="starttls">STARTTLS</option>
              <option value="plain">Plain</option>
            </select>
            <input
              value={smtp.from}
              onChange={e => updateSmtp({ from: e.target.value })}
              className="px-2 py-1.5 rounded text-caption outline-none"
              style={{ backgroundColor: 'var(--ink-50)', border: '1px solid var(--ink-200)', color: 'var(--ink-900)' }}
              placeholder="From"
            />
          </div>
          <button
            onClick={connect}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded text-body-sm font-medium disabled:opacity-60"
            style={{ backgroundColor: 'var(--ink-800)', color: 'var(--ink-50)' }}
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Connect
          </button>
        </div>

        <button
          onClick={() => openCompose()}
          disabled={!connected}
          className="flex items-center gap-2 mx-3 mt-3 mb-2 px-4 py-2 rounded text-body-sm font-medium transition-all duration-150 disabled:opacity-50"
          style={{ backgroundColor: 'var(--ink-800)', color: 'var(--ink-50)' }}
        >
          <PenTool size={16} />
          写邮件 (Compose)
        </button>

        <div className="flex-1 overflow-auto">
          {foldersForUI.map(item => {
            const Icon = folderIcon(item.name);
            return (
              <button
                key={item.name}
                onClick={() => switchFolder(item.name)}
                disabled={!connected || loading}
                className="w-full flex items-center gap-2.5 px-4 py-2 text-left text-body-sm transition-all duration-150 disabled:opacity-50"
                style={{
                  backgroundColor: folder === item.name ? 'var(--wash-light)' : 'transparent',
                  borderLeft: folder === item.name ? '3px solid var(--cinnabar)' : '3px solid transparent',
                  color: folder === item.name ? 'var(--ink-900)' : 'var(--ink-600)',
                }}
              >
                <Icon size={16} />
                <span className="flex-1 truncate">{item.name}</span>
                {item.name === folder && unreadCount > 0 && (
                  <span className="text-caption px-1.5 py-0.5 rounded-full" style={{ backgroundColor: 'var(--cinnabar)', color: 'white' }}>
                    {unreadCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div
        className="w-80 flex-shrink-0 flex flex-col overflow-hidden"
        style={{ backgroundColor: 'var(--ink-50)', borderRight: selectedUID ? '1px solid var(--ink-200)' : 'none' }}
      >
        <div className="p-3 space-y-2" style={{ borderBottom: '1px solid var(--ink-200)' }}>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full" style={{ backgroundColor: 'var(--ink-100)', border: '1px solid var(--ink-200)' }}>
            <Search size={14} style={{ color: 'var(--ink-400)' }} />
            <input
              type="text"
              placeholder="搜索邮件 (Search)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1 text-body-sm bg-transparent outline-none"
              style={{ color: 'var(--ink-700)' }}
            />
          </div>
          {connected && (
            <button
              onClick={() => loadMessages()}
              disabled={loading}
              className="w-full flex items-center justify-center gap-1 px-3 py-1.5 rounded text-caption disabled:opacity-50"
              style={{ backgroundColor: 'var(--ink-100)', color: 'var(--ink-600)', border: '1px solid var(--ink-200)' }}
            >
              <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
              Refresh
            </button>
          )}
          {error && (
            <div className="text-caption px-2 py-1.5 rounded" style={{ color: 'var(--error)', backgroundColor: 'rgba(179,57,47,0.08)' }}>
              {error}
            </div>
          )}
        </div>

        <div className="flex-1 overflow-auto">
          {filteredMessages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-2">
              <Mail size={32} style={{ color: 'var(--ink-300)' }} />
              <span className="text-body-sm" style={{ color: 'var(--ink-400)' }}>
                {connected ? '暂无邮件 (No emails)' : 'Connect an IMAP account'}
              </span>
            </div>
          ) : (
            filteredMessages.map(message => (
              <button
                key={message.uid}
                onClick={() => selectMessage(message)}
                className="w-full text-left p-3 transition-all duration-150"
                style={{
                  backgroundColor: selectedUID === message.uid ? 'var(--wash-light)' : message.seen ? 'transparent' : 'var(--wash-faint)',
                  borderBottom: '1px solid var(--ink-200)',
                }}
              >
                <div className="flex items-center gap-2 mb-1">
                  {!message.seen && <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: 'var(--cinnabar)' }} />}
                  <span className="text-body-sm font-medium flex-1 truncate" style={{ color: message.seen ? 'var(--ink-600)' : 'var(--ink-900)', fontWeight: message.seen ? 400 : 600 }}>
                    {message.from || '(unknown)'}
                  </span>
                </div>
                <div className="text-body-sm truncate mb-0.5" style={{ color: 'var(--ink-700)' }}>{message.subject || '(no subject)'}</div>
                <div className="text-caption mt-1" style={{ color: 'var(--ink-400)' }}>{formatDate(message.date)}</div>
              </button>
            ))
          )}
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        {composeOpen ? (
          <div className="h-full flex flex-col p-6" style={{ backgroundColor: 'var(--ink-50)' }}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-heading-sm" style={{ color: 'var(--ink-900)' }}>写邮件 (Compose)</h2>
              <button onClick={() => setComposeOpen(false)} className="p-1 rounded hover:bg-black/5">
                <X size={16} style={{ color: 'var(--ink-400)' }} />
              </button>
            </div>
            <div className="space-y-3 flex-1 flex flex-col">
              <input
                type="text"
                value={composeTo}
                onChange={(e) => setComposeTo(e.target.value)}
                className="w-full px-3 py-2 rounded text-body-sm outline-none"
                style={{ backgroundColor: 'var(--ink-100)', border: '1px solid var(--ink-200)', color: 'var(--ink-900)' }}
                placeholder="To"
              />
              <input
                type="text"
                value={composeCc}
                onChange={(e) => setComposeCc(e.target.value)}
                className="w-full px-3 py-2 rounded text-body-sm outline-none"
                style={{ backgroundColor: 'var(--ink-100)', border: '1px solid var(--ink-200)', color: 'var(--ink-900)' }}
                placeholder="Cc"
              />
              <input
                type="text"
                value={composeSubject}
                onChange={(e) => setComposeSubject(e.target.value)}
                className="w-full px-3 py-2 rounded text-body-sm outline-none"
                style={{ backgroundColor: 'var(--ink-100)', border: '1px solid var(--ink-200)', color: 'var(--ink-900)' }}
                placeholder="Subject"
              />
              <textarea
                value={composeBody}
                onChange={(e) => setComposeBody(e.target.value)}
                className="flex-1 w-full px-3 py-2 rounded text-body-sm outline-none resize-none"
                style={{ backgroundColor: 'var(--ink-100)', border: '1px solid var(--ink-200)', color: 'var(--ink-900)', lineHeight: 1.8 }}
                placeholder="Body"
              />
              <div className="flex items-center gap-2 px-3 py-2 rounded" style={{ backgroundColor: 'var(--ink-100)', border: '1px solid var(--ink-200)' }}>
                <Paperclip size={14} style={{ color: 'var(--ink-500)' }} />
                <input
                  type="text"
                  value={attachmentPaths}
                  onChange={(e) => setAttachmentPaths(e.target.value)}
                  className="flex-1 bg-transparent outline-none text-caption"
                  style={{ color: 'var(--ink-800)' }}
                  placeholder="Server file paths, separated by comma or newline"
                />
              </div>
              <div className="flex items-center gap-3 pt-2">
                <button
                  onClick={sendEmail}
                  disabled={loading}
                  className="flex items-center gap-2 px-4 py-2 rounded text-body-sm font-medium transition-all duration-150 disabled:opacity-50"
                  style={{ backgroundColor: 'var(--ink-800)', color: 'var(--ink-50)' }}
                >
                  <Send size={14} />
                  发送 (Send)
                </button>
                <button
                  onClick={() => setComposeOpen(false)}
                  className="px-4 py-2 rounded text-body-sm transition-all duration-150"
                  style={{ backgroundColor: 'var(--ink-200)', color: 'var(--ink-700)' }}
                >
                  取消 (Cancel)
                </button>
              </div>
            </div>
          </div>
        ) : selectedMessage ? (
          <div className="h-full flex flex-col p-6 overflow-auto" style={{ backgroundColor: 'var(--ink-50)' }}>
            <div className="flex items-center gap-2 mb-4 pb-3" style={{ borderBottom: '1px solid var(--ink-200)' }}>
              <button onClick={() => { setSelectedUID(null); setSelectedDetail(null); }} className="p-1.5 rounded hover:bg-black/5">
                <ChevronLeft size={16} style={{ color: 'var(--ink-600)' }} />
              </button>
              <button onClick={() => openCompose(selectedMessage)} className="flex items-center gap-1 px-3 py-1.5 rounded text-caption transition-all duration-150 hover:bg-black/5" style={{ color: 'var(--ink-600)' }}>
                <Reply size={14} /> 回复 (Reply)
              </button>
            </div>

            <div className="mb-4">
              <h2 className="text-heading-md mb-3" style={{ color: 'var(--ink-900)' }}>{selectedMessage.subject || '(no subject)'}</h2>
              <div className="flex items-center gap-3 mb-2">
                <div className="w-9 h-9 rounded-full flex items-center justify-center text-body-sm" style={{ backgroundColor: 'var(--ink-300)', color: 'white' }}>
                  {(selectedMessage.from || '?')[0]}
                </div>
                <div>
                  <div className="text-body-sm font-medium" style={{ color: 'var(--ink-800)' }}>{selectedMessage.from || '(unknown)'}</div>
                  {selectedMessage.to && <div className="text-caption" style={{ color: 'var(--ink-500)' }}>To: {selectedMessage.to}</div>}
                </div>
                <div className="ml-auto text-caption" style={{ color: 'var(--ink-400)' }}>{formatDate(selectedMessage.date)}</div>
              </div>
            </div>

            <div className="text-body-md whitespace-pre-line" style={{ color: 'var(--ink-800)', lineHeight: 1.8 }}>
              {isMessageDetail(selectedMessage) ? selectedMessage.body_text : 'Loading...'}
            </div>

            {isMessageDetail(selectedMessage) && selectedMessage.attachments && selectedMessage.attachments.length > 0 && (
              <div className="mt-6 space-y-2">
                {selectedMessage.attachments.map(attachment => (
                  <div key={`${attachment.filename}-${attachment.size}`} className="flex items-center gap-2 px-3 py-2 rounded" style={{ backgroundColor: 'var(--ink-100)', border: '1px solid var(--ink-200)' }}>
                    <Paperclip size={14} style={{ color: 'var(--ink-500)' }} />
                    <span className="text-body-sm" style={{ color: 'var(--ink-700)' }}>{attachment.filename}</span>
                    <span className="ml-auto text-caption" style={{ color: 'var(--ink-400)' }}>{Math.round(attachment.size / 1024)} KB</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center gap-2" style={{ backgroundColor: 'var(--ink-50)' }}>
            <Mail size={48} style={{ color: 'var(--ink-300)' }} />
            <span className="text-body-md" style={{ color: 'var(--ink-400)' }}>选择邮件以阅读 (Select an email to read)</span>
          </div>
        )}
      </div>

      {toast && (
        <div className="fixed top-4 right-4 px-4 py-2 rounded-lg text-body-sm flex items-center gap-2 z-50" style={{ backgroundColor: 'var(--ink-800)', color: 'var(--ink-50)', boxShadow: 'var(--shadow-xl)' }}>
          <CheckCircle size={16} />
          {toast}
        </div>
      )}
    </div>
  );
}

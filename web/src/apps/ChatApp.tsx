import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Send, Smile, Search, Phone, Video, MoreVertical, CheckCheck,
  Circle, Image
} from 'lucide-react';

type OnlineStatus = 'online' | 'away' | 'offline';

interface Message {
  id: string;
  content: string;
  sender: 'me' | 'them';
  timestamp: string;
  type: 'text' | 'emoji';
}

interface Contact {
  id: string;
  name: string;
  status: OnlineStatus;
  avatar: string;
  lastMessage: string;
  lastTime: string;
  unread: number;
  messages: Message[];
}

interface ChatAppProps {
  windowId?: string;
}

const EMOJIS = ['😀', '😂', '🥰', '😎', '🤔', '👍', '👏', '🙏', '❤️', '🔥',
  '🎉', '✨', '🌟', '💯', '🤗', '😊', '🤩', '😋', '🌸', '🍀',
  '🎨', '📚', '🎵', '🎭', '🏔️', '🌊', '☀️', '🌙', '⭐', '💫',
  '👋', '🙌', '💪', '🎯', '💡', '🎁', '🌺', '🍵', '🖋️', '📜',
  '🎋', '🏮', '🐉', '🦅', '🐟', '🌿', '🍂', '❄️', '🎋', '🎍'];

const INITIAL_CONTACTS: Contact[] = [
  {
    id: '1', name: '李白 (Li Bai)', status: 'online', avatar: '李',
    lastMessage: '举杯邀明月，对影成三人', lastTime: '10:30', unread: 2,
    messages: [
      { id: '1', content: '好友，近日可好？', sender: 'them', timestamp: '10:25', type: 'text' },
      { id: '2', content: '我正在庐山脚下写诗呢', sender: 'them', timestamp: '10:26', type: 'text' },
      { id: '3', content: '相当不错！最近也在练习书法', sender: 'me', timestamp: '10:28', type: 'text' },
      { id: '4', content: '举杯邀明月，对影成三人', sender: 'them', timestamp: '10:30', type: 'text' },
    ]
  },
  {
    id: '2', name: '苏轼 (Su Shi)', status: 'online', avatar: '苏',
    lastMessage: '大江东去，浪淘尽...', lastTime: '09:45', unread: 1,
    messages: [
      { id: '1', content: '朋友，来尝尝我做的东坡肉', sender: 'them', timestamp: '09:40', type: 'text' },
      { id: '2', content: '下次一定！', sender: 'me', timestamp: '09:42', type: 'text' },
      { id: '3', content: '大江东去，浪淘尽，千古风流人物', sender: 'them', timestamp: '09:45', type: 'text' },
    ]
  },
  {
    id: '3', name: '王维 (Wang Wei)', status: 'away', avatar: '王',
    lastMessage: '空山新雨后，天气晚来秋', lastTime: '昨天', unread: 0,
    messages: [
      { id: '1', content: '最近在终南山隐居作画', sender: 'them', timestamp: '昨天 15:30', type: 'text' },
      { id: '2', content: '空山新雨后，天气晚来秋', sender: 'them', timestamp: '昨天 15:32', type: 'text' },
    ]
  },
  {
    id: '4', name: '杜甫 (Du Fu)', status: 'offline', avatar: '杜',
    lastMessage: '会当凌绝顶，一览众山小', lastTime: '昨天', unread: 0,
    messages: [
      { id: '1', content: '安得广厦千万间', sender: 'them', timestamp: '昨天 08:00', type: 'text' },
      { id: '2', content: '大庇天下寒士俱欢颜', sender: 'them', timestamp: '昨天 08:01', type: 'text' },
    ]
  },
  {
    id: '5', name: '王羲之 (Wang Xizhi)', status: 'online', avatar: '羲',
    lastMessage: '书法练习今日完成了吗？', lastTime: '08:20', unread: 3,
    messages: [
      { id: '1', content: '书法练习今日完成了吗？', sender: 'them', timestamp: '08:20', type: 'text' },
      { id: '2', content: '我在写《兰亭集序》，有新的感悟', sender: 'them', timestamp: '08:21', type: 'text' },
      { id: '3', content: '永和九年，岁在癸丑...', sender: 'them', timestamp: '08:22', type: 'text' },
    ]
  },
  {
    id: '6', name: '技术支持 (Support)', status: 'online', avatar: '技',
    lastMessage: '您的问题已解决', lastTime: '周一', unread: 0,
    messages: [
      { id: '1', content: '您好，请问有什么可以帮您？', sender: 'them', timestamp: '周一 14:00', type: 'text' },
      { id: '2', content: '系统更新后字体显示异常', sender: 'me', timestamp: '周一 14:05', type: 'text' },
      { id: '3', content: '您的问题已解决，请重启应用', sender: 'them', timestamp: '周一 14:30', type: 'text' },
    ]
  },
  {
    id: '7', name: '墨友_小明', status: 'away', avatar: '明',
    lastMessage: '周末一起去美术馆？', lastTime: '周一', unread: 0,
    messages: [
      { id: '1', content: '周末一起去美术馆？', sender: 'them', timestamp: '周一 10:00', type: 'text' },
      { id: '2', content: '好啊，几点？', sender: 'me', timestamp: '周一 10:30', type: 'text' },
      { id: '3', content: '下午两点，在门口见', sender: 'them', timestamp: '周一 10:35', type: 'text' },
    ]
  },
];

const STATUS_CONFIG: Record<OnlineStatus, { color: string; label: string }> = {
  online: { color: '#4a7c59', label: '在线 (Online)' },
  away: { color: '#b8860b', label: '离开 (Away)' },
  offline: { color: '#bdbdbd', label: '离线 (Offline)' },
};

export default function ChatApp({ windowId: _windowId }: ChatAppProps) {
  const [contacts, setContacts] = useState<Contact[]>(INITIAL_CONTACTS);
  const [selectedContactId, setSelectedContactId] = useState('1');
  const [inputValue, setInputValue] = useState('');
  const [showEmoji, setShowEmoji] = useState(false);
  const [typingContactId, setTypingContactId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const selectedContact = contacts.find(c => c.id === selectedContactId);

  const filteredContacts = contacts.filter(c =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [selectedContact?.messages, typingContactId]);

  // Auto-resize textarea
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
      inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, 120) + 'px';
    }
  }, [inputValue]);

  // Simulate typing indicator
  useEffect(() => {
    if (!selectedContact) return;
    const timer = setTimeout(() => {
      setTypingContactId(selectedContact.id);
      setTimeout(() => setTypingContactId(null), 2000);
    }, 5000);
    return () => clearTimeout(timer);
  }, [selectedContactId, selectedContact?.messages]);

  const sendMessage = useCallback(() => {
    if (!inputValue.trim() || !selectedContact) return;

    const newMessage: Message = {
      id: `msg-${Date.now()}`,
      content: inputValue.trim(),
      sender: 'me',
      timestamp: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
      type: 'text',
    };

    setContacts(prev => prev.map(c => {
      if (c.id !== selectedContactId) return c;
      return {
        ...c,
        messages: [...c.messages, newMessage],
        lastMessage: inputValue.trim(),
        lastTime: newMessage.timestamp,
      };
    }));

    setInputValue('');
    if (inputRef.current) inputRef.current.style.height = 'auto';

    // Simulate reply after 2-4 seconds
    const replyDelay = 2000 + Math.random() * 2000;
    setTimeout(() => {
      const replies = [
        '说得真好！', '有意思，请继续。', '我也这么想。', '哈哈，确实如此。',
        '受教了。', '妙哉！', '此言甚是有理。', '妙笔生花！',
      ];
      const replyContent = replies[Math.floor(Math.random() * replies.length)];
      const replyMsg: Message = {
        id: `msg-${Date.now()}-reply`,
        content: replyContent,
        sender: 'them',
        timestamp: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
        type: 'text',
      };
      setContacts(prev => prev.map(c => {
        if (c.id !== selectedContactId) return c;
        return {
          ...c,
          messages: [...c.messages, replyMsg],
          lastMessage: replyContent,
          lastTime: replyMsg.timestamp,
          unread: c.unread + 1,
        };
      }));
    }, replyDelay);
  }, [inputValue, selectedContactId, selectedContact]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const selectContact = (id: string) => {
    setSelectedContactId(id);
    setContacts(prev => prev.map(c => c.id === id ? { ...c, unread: 0 } : c));
    setShowEmoji(false);
  };

  const insertEmoji = (emoji: string) => {
    setInputValue(prev => prev + emoji);
    setShowEmoji(false);
    inputRef.current?.focus();
  };

  if (!selectedContact) return null;

  return (
    <div className="w-full h-full flex" style={{ backgroundColor: 'var(--ink-50)' }}>
      {/* Contact list */}
      <div className="w-52 flex-shrink-0 flex flex-col" style={{ backgroundColor: 'var(--ink-100)', borderRight: '1px solid var(--ink-200)' }}>
        {/* Header */}
        <div className="p-3" style={{ borderBottom: '1px solid var(--ink-200)' }}>
          <h2 className="text-heading-sm mb-2" style={{ color: 'var(--ink-900)' }}>消息 (Messages)</h2>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full" style={{ backgroundColor: 'var(--ink-50)', border: '1px solid var(--ink-200)' }}>
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

        {/* Contacts */}
        <div className="flex-1 overflow-auto">
          {filteredContacts.map(contact => (
            <button
              key={contact.id}
              onClick={() => selectContact(contact.id)}
              className="w-full flex items-start gap-2.5 px-3 py-2.5 text-left transition-all duration-150"
              style={{
                backgroundColor: selectedContactId === contact.id ? 'var(--wash-light)' : 'transparent',
                borderLeft: selectedContactId === contact.id ? '3px solid var(--cinnabar)' : '3px solid transparent',
              }}
            >
              <div className="relative flex-shrink-0">
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center text-body-sm"
                  style={{ backgroundColor: 'var(--ink-300)', color: 'white' }}
                >
                  {contact.avatar}
                </div>
                <div
                  className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2"
                  style={{
                    backgroundColor: STATUS_CONFIG[contact.status].color,
                    borderColor: 'var(--ink-100)',
                  }}
                />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1">
                  <span className="text-body-sm truncate flex-1" style={{ color: 'var(--ink-800)', fontWeight: 500 }}>{contact.name}</span>
                  <span className="text-caption flex-shrink-0" style={{ color: 'var(--ink-400)' }}>{contact.lastTime}</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-caption truncate flex-1" style={{ color: 'var(--ink-500)' }}>{contact.lastMessage}</span>
                  {contact.unread > 0 && (
                    <span className="text-caption px-1.5 py-0.5 rounded-full flex-shrink-0" style={{ backgroundColor: 'var(--cinnabar)', color: 'white', fontSize: '10px' }}>
                      {contact.unread}
                    </span>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Chat area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Chat header */}
        <div className="flex items-center gap-3 px-4 py-2.5 flex-shrink-0" style={{ backgroundColor: 'var(--ink-100)', borderBottom: '1px solid var(--ink-200)' }}>
          <div className="w-8 h-8 rounded-full flex items-center justify-center text-body-sm flex-shrink-0" style={{ backgroundColor: 'var(--ink-300)', color: 'white' }}>
            {selectedContact.avatar}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-body-sm font-medium truncate" style={{ color: 'var(--ink-800)' }}>{selectedContact.name}</div>
            <div className="text-caption flex items-center gap-1" style={{ color: STATUS_CONFIG[selectedContact.status].color }}>
              <Circle size={8} fill="currentColor" />
              {STATUS_CONFIG[selectedContact.status].label}
            </div>
          </div>
          <button className="p-2 rounded transition-all duration-150 hover:bg-black/5" style={{ color: 'var(--ink-500)' }}>
            <Phone size={16} />
          </button>
          <button className="p-2 rounded transition-all duration-150 hover:bg-black/5" style={{ color: 'var(--ink-500)' }}>
            <Video size={16} />
          </button>
          <button className="p-2 rounded transition-all duration-150 hover:bg-black/5" style={{ color: 'var(--ink-500)' }}>
            <MoreVertical size={16} />
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-auto px-4 py-3 space-y-2">
          {selectedContact.messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.sender === 'me' ? 'justify-end' : 'justify-start'}`}
            >
              <div className="max-w-[70%]">
                <div
                  className="px-3.5 py-2 text-body-sm"
                  style={{
                    backgroundColor: msg.sender === 'me' ? 'var(--ink-800)' : 'var(--ink-100)',
                    color: msg.sender === 'me' ? 'var(--ink-50)' : 'var(--ink-900)',
                    borderRadius: msg.sender === 'me' ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                    wordBreak: 'break-word',
                  }}
                >
                  {msg.content}
                </div>
                <div className={`flex items-center gap-1 mt-0.5 ${msg.sender === 'me' ? 'justify-end' : 'justify-start'}`}>
                  <span className="text-caption" style={{ color: 'var(--ink-400)' }}>{msg.timestamp}</span>
                  {msg.sender === 'me' && <CheckCheck size={12} style={{ color: 'var(--success)' }} />}
                </div>
              </div>
            </div>
          ))}

          {/* Typing indicator */}
          {typingContactId === selectedContactId && (
            <div className="flex justify-start">
              <div
                className="px-4 py-3 flex items-center gap-1"
                style={{
                  backgroundColor: 'var(--ink-100)',
                  borderRadius: '12px 12px 12px 2px',
                }}
              >
                <div className="w-2 h-2 rounded-full animate-bounce" style={{ backgroundColor: 'var(--ink-400)', animationDelay: '0ms' }} />
                <div className="w-2 h-2 rounded-full animate-bounce" style={{ backgroundColor: 'var(--ink-400)', animationDelay: '150ms' }} />
                <div className="w-2 h-2 rounded-full animate-bounce" style={{ backgroundColor: 'var(--ink-400)', animationDelay: '300ms' }} />
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Emoji picker */}
        {showEmoji && (
          <div className="px-4 py-2 relative z-10">
            <div
              className="grid grid-cols-10 gap-1 p-2 rounded-lg max-h-40 overflow-auto"
              style={{ backgroundColor: 'var(--glass-active)', backdropFilter: 'blur(20px)', border: '1px solid var(--glass-border)' }}
            >
              {EMOJIS.map((emoji, i) => (
                <button
                  key={i}
                  onClick={() => insertEmoji(emoji)}
                  className="text-lg p-1 rounded transition-all duration-150 hover:bg-black/10 text-center"
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Input area */}
        <div className="flex-shrink-0 px-4 py-3" style={{ backgroundColor: 'var(--ink-100)', borderTop: '1px solid var(--ink-200)' }}>
          <div className="flex items-end gap-2">
            <button
              onClick={() => setShowEmoji(!showEmoji)}
              className="p-2 rounded transition-all duration-150 hover:bg-black/5 flex-shrink-0"
              style={{ color: showEmoji ? 'var(--cinnabar)' : 'var(--ink-500)' }}
            >
              <Smile size={20} />
            </button>
            <button className="p-2 rounded transition-all duration-150 hover:bg-black/5 flex-shrink-0" style={{ color: 'var(--ink-500)' }}>
              <Image size={20} />
            </button>
            <div className="flex-1 flex items-end" style={{ backgroundColor: 'var(--ink-50)', borderRadius: '20px', border: '1px solid var(--ink-200)' }}>
              <textarea
                ref={inputRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="输入消息... (Type a message)"
                className="flex-1 bg-transparent outline-none px-3 py-2 text-body-sm resize-none"
                style={{ color: 'var(--ink-900)', minHeight: '36px', maxHeight: '120px' }}
                rows={1}
              />
            </div>
            <button
              onClick={sendMessage}
              disabled={!inputValue.trim()}
              className="p-2.5 rounded-full transition-all duration-150 hover:scale-105 disabled:opacity-40 flex-shrink-0"
              style={{ backgroundColor: inputValue.trim() ? 'var(--ink-800)' : 'var(--ink-300)', color: 'white' }}
            >
              <Send size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

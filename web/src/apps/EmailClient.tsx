import { useState, useEffect, useRef } from 'react';
import {
  Inbox, Send, FileText, Trash2, Star, Search, X,
  ChevronLeft, Archive, Reply, User,
  CheckCircle, PenTool, Mail
} from 'lucide-react';

interface Contact {
  id: string;
  name: string;
  email: string;
}

interface Email {
  id: string;
  from: string;
  fromEmail: string;
  to: string;
  subject: string;
  body: string;
  preview: string;
  date: string;
  read: boolean;
  starred: boolean;
  folder: 'inbox' | 'sent' | 'drafts' | 'trash';
}

interface EmailClientProps {
  windowId?: string;
}

const CONTACTS: Contact[] = [
  { id: '1', name: '系统管理员', email: 'admin@ink-os.local' },
  { id: '2', name: '李白', email: 'libai@poetry.ink' },
  { id: '3', name: '墨友俱乐部', email: 'club@art.ink' },
  { id: '4', name: '技术支持', email: 'support@ink-os.local' },
  { id: '5', name: '苏轼', email: 'sushi@poetry.ink' },
  { id: '6', name: '新闻订阅', email: 'news@newsletter.ink' },
  { id: '7', name: '王羲之', email: 'wangxizhi@calligraphy.ink' },
  { id: '8', name: '王维', email: 'wangwei@art.ink' },
];

const INITIAL_EMAILS: Email[] = [
  { id: '1', from: '系统管理员', fromEmail: 'admin@ink-os.local', to: 'user@ink-os.local', subject: '欢迎使用墨操作系统', body: '亲爱的用户，\n\n欢迎来到墨操作系统！这是一个以中国传统水墨画美学为灵感设计的桌面环境。\n\n您可以在这里体验：\n- 传统水墨风格的用户界面\n- 50+ 款实用应用程序\n- 完整的文件管理系统\n- 多媒体娱乐体验\n\n祝您使用愉快！\n\n墨 OS 团队', preview: '亲爱的用户，欢迎来到墨操作系统...', date: '2024-01-15 09:00', read: false, starred: true, folder: 'inbox' },
  { id: '2', from: '李白', fromEmail: 'libai@poetry.ink', to: 'user@ink-os.local', subject: '月下独酌诗会邀请函', body: '挚友：\n\n花间一壶酒，独酌无相亲。举杯邀明月，对影成三人。\n\n本月十五月夜，将于庐山脚下举办诗会，诚邀君出席，共饮佳酿，吟诗作对。\n\n李白 敬上', preview: '花间一壶酒，独酌无相亲...', date: '2024-01-14 16:30', read: false, starred: false, folder: 'inbox' },
  { id: '3', from: '墨友俱乐部', fromEmail: 'club@art.ink', to: 'user@ink-os.local', subject: '本周水墨画工作坊活动通知', body: '各位墨友：\n\n本周六下午2点，我们将举办「山水入门」主题工作坊。\n\n活动内容包括：\n1. 山水构图基础讲解\n2. 皴法技法演示\n3. 现场创作指导\n\n请携带自己的笔墨纸砚。\n\n墨友俱乐部', preview: '本周六下午2点，我们将举办「山水入门」...', date: '2024-01-14 10:15', read: true, starred: true, folder: 'inbox' },
  { id: '4', from: '技术支持', fromEmail: 'support@ink-os.local', to: 'user@ink-os.local', subject: '系统更新完成通知', body: '您好，\n\n系统已自动完成版本更新。本次更新包含以下内容：\n- 修复了文件管理器中的若干问题\n- 优化了内存使用效率\n- 新增了两款桌面壁纸\n\n如有任何问题，请随时联系技术支持团队。', preview: '系统已自动完成版本更新...', date: '2024-01-13 08:00', read: true, starred: false, folder: 'inbox' },
  { id: '5', from: '苏轼', fromEmail: 'sushi@poetry.ink', to: 'user@ink-os.local', subject: '赤壁赋新解', body: '朋友：\n\n壬戌之秋，七月既望，苏子与客泛舟游于赤壁之下。清风徐来，水波不兴。\n\n近日重读旧作，略有新思。想与兄台探讨「逝者如斯，而未尝往也」之深意。\n\n盼回信。\n\n苏轼', preview: '壬戌之秋，七月既望，苏子与客泛舟...', date: '2024-01-12 20:45', read: true, starred: false, folder: 'inbox' },
  { id: '6', from: '新闻订阅', fromEmail: 'news@newsletter.ink', to: 'user@ink-os.local', subject: '每日艺术资讯 - 2024年1月12日', body: '今日艺术资讯：\n\n1. 故宫博物院推出数字文物展\n2. 苏州博物馆举办吴门画派特展\n3. 当代水墨艺术家王天德个展在上海开幕\n4. 敦煌研究院发布最新壁画数字化成果\n\n点击查看详情。', preview: '故宫博物院推出数字文物展...', date: '2024-01-12 07:00', read: true, starred: false, folder: 'inbox' },
  { id: '7', from: '王羲之', fromEmail: 'wangxizhi@calligraphy.ink', to: 'user@ink-os.local', subject: '兰亭集序书法讲座', body: '同道：\n\n永和九年，岁在癸丑，暮春之初，会于会稽山阴之兰亭，修禊事也。\n\n拟于下月初举办《兰亭集序》书法专题讲座，详解行书笔法之精妙。\n\n席位有限，请尽早报名。\n\n王羲之', preview: '永和九年，岁在癸丑，暮春之初...', date: '2024-01-11 14:20', read: true, starred: true, folder: 'inbox' },
  { id: '8', from: '王维', fromEmail: 'wangwei@art.ink', to: 'user@ink-os.local', subject: '山水画创作心得分享', body: '画友：\n\n空山不见人，但闻人语响。返景入深林，复照青苔上。\n\n近日在山中写生，对「诗中有画，画中有诗」又有新的体悟。\n\n附上近日所作几幅小品，请指正。\n\n王维', preview: '空山不见人，但闻人语响...', date: '2024-01-10 18:00', read: true, starred: false, folder: 'inbox' },
  { id: '9', from: '系统管理员', fromEmail: 'admin@ink-os.local', to: 'user@ink-os.local', subject: '账户安全提醒', body: '您好，\n\n我们检测到您的账户在新设备上登录。如非本人操作，请立即修改密码。\n\n登录信息：\n- 时间：2024-01-09 22:15\n- IP：192.168.1.100\n- 设备：Desktop / Chrome', preview: '我们检测到您的账户在新设备上登录...', date: '2024-01-09 22:20', read: true, starred: false, folder: 'inbox' },
  { id: '10', from: '杜甫', fromEmail: 'dufu@poetry.ink', to: 'user@ink-os.local', subject: '春望诗作交流', body: '友人：\n\n国破山河在，城春草木深。感时花溅泪，恨别鸟惊心。\n\n近日诗作数首，愿与君共赏。\n\n杜甫', preview: '国破山河在，城春草木深...', date: '2024-01-08 11:30', read: true, starred: false, folder: 'inbox' },
  { id: '11', from: '墨友俱乐部', fromEmail: 'club@art.ink', to: 'user@ink-os.local', subject: '年度会员续费提醒', body: '尊敬的会员：\n\n您的墨友俱乐部年度会员资格将于本月到期。\n\n续费可享9折优惠，并可获得限量版水墨画工具套装。\n\n感谢支持！', preview: '您的墨友俱乐部年度会员资格将于本月到期...', date: '2024-01-07 09:00', read: true, starred: false, folder: 'inbox' },
  { id: '12', from: '技术支持', fromEmail: 'support@ink-os.local', to: 'user@ink-os.local', subject: '反馈回复：关于夜间模式', body: '您好，\n\n感谢您提出的关于优化夜间模式的建议。我们已将其纳入开发计划，预计在下一个版本中推出。\n\n再次感谢您的宝贵意见！', preview: '感谢您提出的关于优化夜间模式的建议...', date: '2024-01-06 15:40', read: true, starred: false, folder: 'inbox' },
  { id: '13', from: 'user@ink-os.local', fromEmail: 'user@ink-os.local', to: 'libai@poetry.ink', subject: '回复：月下独酌诗会邀请函', body: '李兄：\n\n承蒙邀请，不胜荣幸。十五之夜，定当准时赴约。\n\n望与诸君共饮，不醉不归。', preview: '承蒙邀请，不胜荣幸...', date: '2024-01-14 17:00', read: true, starred: false, folder: 'sent' },
  { id: '14', from: 'user@ink-os.local', fromEmail: 'user@ink-os.local', to: 'support@ink-os.local', subject: '关于夜间模式的建议', body: '技术支持团队：\n\n建议增加更暗的夜间模式选项，目前的深色模式对比度还是略高。\n\n谢谢！', preview: '建议增加更暗的夜间模式选项...', date: '2024-01-05 10:20', read: true, starred: false, folder: 'sent' },
  { id: '15', from: 'user@ink-os.local', fromEmail: 'user@ink-os.local', to: '', subject: '（无主题）', body: '', preview: '', date: '2024-01-15 10:00', read: true, starred: false, folder: 'drafts' },
  { id: '16', from: '系统管理员', fromEmail: 'admin@ink-os.local', to: 'user@ink-os.local', subject: '已删除：测试邮件', body: '这是一封测试邮件。', preview: '这是一封测试邮件。', date: '2024-01-01 00:00', read: true, starred: false, folder: 'trash' },
];

export default function EmailClient({ windowId: _windowId }: EmailClientProps) {
  const [emails, setEmails] = useState<Email[]>(INITIAL_EMAILS);
  const [folder, setFolder] = useState<'inbox' | 'sent' | 'drafts' | 'trash'>('inbox');
  const [selectedEmailId, setSelectedEmailId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [composeOpen, setComposeOpen] = useState(false);
  const [showContacts, setShowContacts] = useState(false);
  const [composeTo, setComposeTo] = useState('');
  const [composeSubject, setComposeSubject] = useState('');
  const [composeBody, setComposeBody] = useState('');
  const [replyTo, setReplyTo] = useState<Email | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-save draft
  useEffect(() => {
    if (!composeOpen || folder !== 'drafts') return;
    const timer = setInterval(() => {
      if (composeBody || composeSubject) {
        showToast('草稿已自动保存 (Draft auto-saved)');
      }
    }, 10000);
    return () => clearInterval(timer);
  }, [composeOpen, composeBody, composeSubject, folder]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2000);
  };

  const filteredEmails = emails.filter(e => {
    const inFolder = e.folder === folder;
    const matchesSearch = !searchQuery ||
      e.from.toLowerCase().includes(searchQuery.toLowerCase()) ||
      e.subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
      e.body.toLowerCase().includes(searchQuery.toLowerCase()) ||
      e.preview.toLowerCase().includes(searchQuery.toLowerCase());
    return inFolder && matchesSearch;
  });

  const selectedEmail = emails.find(e => e.id === selectedEmailId);

  const unreadCount = emails.filter(e => e.folder === 'inbox' && !e.read).length;
  const starredCount = emails.filter(e => e.starred).length;

  const selectEmail = (id: string) => {
    setSelectedEmailId(id);
    setEmails(prev => prev.map(e => e.id === id ? { ...e, read: true } : e));
  };

  const toggleStar = (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setEmails(prev => prev.map(e => e.id === id ? { ...e, starred: !e.starred } : e));
  };

  const deleteEmail = (id: string) => {
    setEmails(prev => prev.map(e => {
      if (e.id === id) {
        return { ...e, folder: e.folder === 'trash' ? 'trash' : 'trash' as const };
      }
      return e;
    }));
    const email = emails.find(e => e.id === id);
    if (email?.folder === 'trash') {
      setEmails(prev => prev.filter(e => e.id !== id));
    } else {
      setEmails(prev => prev.map(e => e.id === id ? { ...e, folder: 'trash' } : e));
    }
    setSelectedEmailId(null);
    showToast('已移到废纸篓 (Moved to Trash)');
  };

  const restoreEmail = (id: string) => {
    setEmails(prev => prev.map(e => e.id === id ? { ...e, folder: 'inbox' } : e));
    showToast('已恢复 (Restored)');
  };

  const openCompose = (replyEmail?: Email) => {
    if (replyEmail) {
      setReplyTo(replyEmail);
      setComposeTo(replyEmail.fromEmail);
      setComposeSubject(`回复: ${replyEmail.subject}`);
      setComposeBody(`\n\n--- 原始邮件 ---\n发件人: ${replyEmail.from}\n主题: ${replyEmail.subject}\n日期: ${replyEmail.date}\n\n${replyEmail.body}`);
    } else {
      setReplyTo(null);
      setComposeTo('');
      setComposeSubject('');
      setComposeBody('');
    }
    setComposeOpen(true);
    setSelectedEmailId(null);
  };

  const sendEmail = () => {
    if (!composeTo.trim()) {
      showToast('请输入收件人 (Please enter recipient)');
      return;
    }
    const newEmail: Email = {
      id: `email-${Date.now()}`,
      from: '我 (Me)',
      fromEmail: 'user@ink-os.local',
      to: composeTo,
      subject: composeSubject || '（无主题）',
      body: composeBody,
      preview: composeBody.slice(0, 50) || '...',
      date: new Date().toISOString().slice(0, 16).replace('T', ' '),
      read: true,
      starred: false,
      folder: 'sent',
    };
    setEmails(prev => [newEmail, ...prev]);
    setComposeOpen(false);
    showToast('邮件已发送 (Email sent)');
  };

  const folders = [
    { id: 'inbox' as const, label: '收件箱 (Inbox)', icon: Inbox, badge: unreadCount },
    { id: 'sent' as const, label: '已发送 (Sent)', icon: Send, badge: 0 },
    { id: 'drafts' as const, label: '草稿箱 (Drafts)', icon: FileText, badge: 0 },
    { id: 'trash' as const, label: '废纸篓 (Trash)', icon: Trash2, badge: 0 },
  ];

  return (
    <div className="w-full h-full flex" style={{ backgroundColor: 'var(--ink-50)' }}>
      {/* Sidebar */}
      <div className="w-52 flex-shrink-0 flex flex-col" style={{ backgroundColor: 'var(--ink-100)', borderRight: '1px solid var(--ink-200)' }}>
        <button
          onClick={() => openCompose()}
          className="flex items-center gap-2 mx-3 mt-3 mb-2 px-4 py-2 rounded text-body-sm font-medium transition-all duration-150 hover:scale-[1.02]"
          style={{ backgroundColor: 'var(--ink-800)', color: 'var(--ink-50)' }}
        >
          <PenTool size={16} />
          写邮件 (Compose)
        </button>

        <div className="flex-1 overflow-auto">
          {folders.map(f => (
            <button
              key={f.id}
              onClick={() => { setFolder(f.id); setSelectedEmailId(null); }}
              className="w-full flex items-center gap-2.5 px-4 py-2 text-left text-body-sm transition-all duration-150"
              style={{
                backgroundColor: folder === f.id ? 'var(--wash-light)' : 'transparent',
                borderLeft: folder === f.id ? '3px solid var(--cinnabar)' : '3px solid transparent',
                color: folder === f.id ? 'var(--ink-900)' : 'var(--ink-600)',
              }}
            >
              <f.icon size={16} />
              <span className="flex-1">{f.label}</span>
              {f.badge > 0 && (
                <span className="text-caption px-1.5 py-0.5 rounded-full" style={{ backgroundColor: 'var(--cinnabar)', color: 'white' }}>
                  {f.badge}
                </span>
              )}
            </button>
          ))}

          <div className="mt-4 pt-3" style={{ borderTop: '1px solid var(--ink-200)' }}>
            <button
              onClick={() => setEmails(prev => prev.map(e => ({ ...e, folder: 'inbox' })))}
              className="w-full flex items-center gap-2.5 px-4 py-2 text-left text-body-sm transition-all duration-150 hover:bg-black/5"
              style={{ color: 'var(--ink-600)' }}
            >
              <Star size={16} />
              <span className="flex-1">星标 (Starred)</span>
              {starredCount > 0 && <span className="text-caption" style={{ color: 'var(--ink-400)' }}>{starredCount}</span>}
            </button>
          </div>

          <div className="mt-4 pt-3" style={{ borderTop: '1px solid var(--ink-200)' }}>
            <div className="px-4 mb-2">
              <button
                onClick={() => setShowContacts(!showContacts)}
                className="flex items-center gap-1 text-caption font-medium"
                style={{ color: 'var(--ink-500)' }}
              >
                <User size={12} />
                联系人 (Contacts)
              </button>
            </div>
            {showContacts && CONTACTS.map(c => (
              <button
                key={c.id}
                onClick={() => { setComposeTo(c.email); openCompose(); }}
                className="w-full flex items-center gap-2 px-6 py-1.5 text-left text-caption transition-all duration-150 hover:bg-black/5"
                style={{ color: 'var(--ink-600)' }}
              >
                <div className="w-5 h-5 rounded-full flex items-center justify-center text-[10px]" style={{ backgroundColor: 'var(--ink-300)', color: 'white' }}>
                  {c.name[0]}
                </div>
                {c.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Email list */}
      <div
        className="w-80 flex-shrink-0 flex flex-col overflow-hidden"
        style={{ backgroundColor: 'var(--ink-50)', borderRight: selectedEmailId ? '1px solid var(--ink-200)' : 'none' }}
      >
        {/* Search */}
        <div className="p-3" style={{ borderBottom: '1px solid var(--ink-200)' }}>
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
        </div>

        {/* Email list */}
        <div className="flex-1 overflow-auto">
          {filteredEmails.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-2">
              <Mail size={32} style={{ color: 'var(--ink-300)' }} />
              <span className="text-body-sm" style={{ color: 'var(--ink-400)' }}>暂无邮件 (No emails)</span>
            </div>
          ) : (
            filteredEmails.map(email => (
              <button
                key={email.id}
                onClick={() => selectEmail(email.id)}
                className="w-full text-left p-3 transition-all duration-150"
                style={{
                  backgroundColor: selectedEmailId === email.id ? 'var(--wash-light)' : email.read ? 'transparent' : 'var(--wash-faint)',
                  borderBottom: '1px solid var(--ink-200)',
                }}
              >
                <div className="flex items-center gap-2 mb-1">
                  {!email.read && <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: 'var(--cinnabar)' }} />}
                  <span className="text-body-sm font-medium flex-1 truncate" style={{ color: email.read ? 'var(--ink-600)' : 'var(--ink-900)', fontWeight: email.read ? 400 : 600 }}>
                    {email.from}
                  </span>
                  <button onClick={(e) => toggleStar(email.id, e)} className="flex-shrink-0 transition-transform duration-150 hover:scale-110">
                    <Star size={14} style={{ color: email.starred ? '#b8860b' : 'var(--ink-400)', fill: email.starred ? '#b8860b' : 'none' }} />
                  </button>
                </div>
                <div className="text-body-sm truncate mb-0.5" style={{ color: 'var(--ink-700)' }}>{email.subject}</div>
                <div className="text-caption truncate" style={{ color: 'var(--ink-400)' }}>{email.preview}</div>
                <div className="text-caption mt-1" style={{ color: 'var(--ink-400)' }}>{email.date}</div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Reading pane / Compose */}
      <div className="flex-1 overflow-hidden">
        {composeOpen ? (
          <div className="h-full flex flex-col p-6" style={{ backgroundColor: 'var(--ink-50)' }}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-heading-sm" style={{ color: 'var(--ink-900)' }}>
                {replyTo ? '回复 (Reply)' : '写邮件 (Compose)'}
              </h2>
              <button onClick={() => setComposeOpen(false)} className="p-1 rounded hover:bg-black/5">
                <X size={16} style={{ color: 'var(--ink-400)' }} />
              </button>
            </div>
            <div className="space-y-3 flex-1 flex flex-col">
              <div>
                <label className="text-caption block mb-1" style={{ color: 'var(--ink-500)' }}>收件人 (To)</label>
                <input
                  type="text"
                  value={composeTo}
                  onChange={(e) => setComposeTo(e.target.value)}
                  className="w-full px-3 py-2 rounded text-body-sm outline-none"
                  style={{ backgroundColor: 'var(--ink-100)', border: '1px solid var(--ink-200)', color: 'var(--ink-900)' }}
                  placeholder="输入邮箱地址..."
                />
              </div>
              <div>
                <label className="text-caption block mb-1" style={{ color: 'var(--ink-500)' }}>主题 (Subject)</label>
                <input
                  type="text"
                  value={composeSubject}
                  onChange={(e) => setComposeSubject(e.target.value)}
                  className="w-full px-3 py-2 rounded text-body-sm outline-none"
                  style={{ backgroundColor: 'var(--ink-100)', border: '1px solid var(--ink-200)', color: 'var(--ink-900)' }}
                  placeholder="邮件主题..."
                />
              </div>
              <div className="flex-1 flex flex-col">
                <label className="text-caption block mb-1" style={{ color: 'var(--ink-500)' }}>正文 (Body)</label>
                <textarea
                  ref={textareaRef}
                  value={composeBody}
                  onChange={(e) => setComposeBody(e.target.value)}
                  className="flex-1 w-full px-3 py-2 rounded text-body-sm outline-none resize-none"
                  style={{ backgroundColor: 'var(--ink-100)', border: '1px solid var(--ink-200)', color: 'var(--ink-900)', lineHeight: 1.8 }}
                  placeholder="输入邮件内容..."
                />
              </div>
              <div className="flex items-center gap-3 pt-2">
                <button
                  onClick={sendEmail}
                  className="flex items-center gap-2 px-4 py-2 rounded text-body-sm font-medium transition-all duration-150 hover:scale-[1.02]"
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
        ) : selectedEmail ? (
          <div className="h-full flex flex-col p-6 overflow-auto" style={{ backgroundColor: 'var(--ink-50)' }}>
            {/* Toolbar */}
            <div className="flex items-center gap-2 mb-4 pb-3" style={{ borderBottom: '1px solid var(--ink-200)' }}>
              <button onClick={() => setSelectedEmailId(null)} className="p-1.5 rounded hover:bg-black/5">
                <ChevronLeft size={16} style={{ color: 'var(--ink-600)' }} />
              </button>
              <button onClick={() => openCompose(selectedEmail)} className="flex items-center gap-1 px-3 py-1.5 rounded text-caption transition-all duration-150 hover:bg-black/5" style={{ color: 'var(--ink-600)' }}>
                <Reply size={14} /> 回复 (Reply)
              </button>
              <button onClick={() => toggleStar(selectedEmail.id)} className="flex items-center gap-1 px-3 py-1.5 rounded text-caption transition-all duration-150 hover:bg-black/5" style={{ color: 'var(--ink-600)' }}>
                <Star size={14} style={{ fill: selectedEmail.starred ? '#b8860b' : 'none', color: selectedEmail.starred ? '#b8860b' : 'var(--ink-600)' }} /> 星标 (Star)
              </button>
              {selectedEmail.folder === 'trash' ? (
                <button onClick={() => restoreEmail(selectedEmail.id)} className="flex items-center gap-1 px-3 py-1.5 rounded text-caption transition-all duration-150 hover:bg-black/5" style={{ color: 'var(--success)' }}>
                  <Archive size={14} /> 恢复 (Restore)
                </button>
              ) : (
                <button onClick={() => deleteEmail(selectedEmail.id)} className="flex items-center gap-1 px-3 py-1.5 rounded text-caption transition-all duration-150 hover:bg-black/5" style={{ color: 'var(--error)' }}>
                  <Trash2 size={14} /> 删除 (Delete)
                </button>
              )}
            </div>

            {/* Email header */}
            <div className="mb-4">
              <h2 className="text-heading-md mb-3" style={{ color: 'var(--ink-900)' }}>{selectedEmail.subject}</h2>
              <div className="flex items-center gap-3 mb-2">
                <div className="w-9 h-9 rounded-full flex items-center justify-center text-body-sm" style={{ backgroundColor: 'var(--ink-300)', color: 'white' }}>
                  {selectedEmail.from[0]}
                </div>
                <div>
                  <div className="text-body-sm font-medium" style={{ color: 'var(--ink-800)' }}>{selectedEmail.from}</div>
                  <div className="text-caption" style={{ color: 'var(--ink-500)' }}>{selectedEmail.fromEmail}</div>
                </div>
                <div className="ml-auto text-caption" style={{ color: 'var(--ink-400)' }}>{selectedEmail.date}</div>
              </div>
            </div>

            {/* Email body */}
            <div className="text-body-md whitespace-pre-line" style={{ color: 'var(--ink-800)', lineHeight: 1.8 }}>
              {selectedEmail.body}
            </div>
          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center gap-2" style={{ backgroundColor: 'var(--ink-50)' }}>
            <Mail size={48} style={{ color: 'var(--ink-300)' }} />
            <span className="text-body-md" style={{ color: 'var(--ink-400)' }}>选择邮件以阅读 (Select an email to read)</span>
          </div>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 px-4 py-2 rounded-lg text-body-sm flex items-center gap-2 z-50" style={{ backgroundColor: 'var(--ink-800)', color: 'var(--ink-50)', boxShadow: 'var(--shadow-xl)' }}>
          <CheckCircle size={16} />
          {toast}
        </div>
      )}
    </div>
  );
}

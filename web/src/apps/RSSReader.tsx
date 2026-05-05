import { useEffect, useMemo, useState } from 'react';
import type { MouseEvent } from 'react';
import {
  Rss, Plus, X, RefreshCw, Star, Search, CheckCircle,
  Globe, BookOpen, Newspaper, ExternalLink
} from 'lucide-react';
import { rssClient, type RSSArticle, type RSSFeed } from '../lib/rss';

interface RSSReaderProps {
  windowId?: string;
}

type FeedSelection = string | null | 'starred';

function formatDate(value?: string): string {
  if (!value) return '--';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '--';
  return d.toLocaleDateString();
}

function articleText(article: RSSArticle): string {
  return article.content || article.summary || '';
}

function messageFrom(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export default function RSSReader({ windowId: _windowId }: RSSReaderProps) {
  const [feeds, setFeeds] = useState<RSSFeed[]>([]);
  const [articles, setArticles] = useState<RSSArticle[]>([]);
  const [selectedFeedId, setSelectedFeedId] = useState<FeedSelection>(null);
  const [selectedArticleId, setSelectedArticleId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddFeed, setShowAddFeed] = useState(false);
  const [newFeedUrl, setNewFeedUrl] = useState('');
  const [newFeedCategory, setNewFeedCategory] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadData = async () => {
    try {
      const [nextFeeds, nextArticles] = await Promise.all([
        rssClient.feeds(),
        rssClient.articles(),
      ]);
      setFeeds(nextFeeds);
      setArticles(nextArticles);
      setError('');
    } catch (err) {
      setError(messageFrom(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const selectedArticle = articles.find((a) => a.id === selectedArticleId) ?? null;

  const filteredArticles = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return articles.filter((article) => {
      const matchesFeed =
        selectedFeedId === null ||
        (selectedFeedId === 'starred' && article.starred) ||
        article.feed_id === selectedFeedId;
      const text = `${article.title}\n${article.summary || ''}\n${article.content || ''}`.toLowerCase();
      return matchesFeed && (!q || text.includes(q));
    });
  }, [articles, searchQuery, selectedFeedId]);

  const totalUnread = feeds.reduce((sum, feed) => sum + feed.unread_count, 0);
  const starredCount = articles.filter((a) => a.starred).length;

  const selectArticle = async (id: string) => {
    setSelectedArticleId(id);
    const article = articles.find((a) => a.id === id);
    if (!article || article.read) return;
    setArticles((prev) => prev.map((a) => a.id === id ? { ...a, read: true } : a));
    setFeeds((prev) => prev.map((f) => f.id === article.feed_id ? { ...f, unread_count: Math.max(0, f.unread_count - 1) } : f));
    try {
      await rssClient.setRead(id, true);
    } catch (err) {
      setError(messageFrom(err));
      void loadData();
    }
  };

  const toggleStar = async (id: string, e?: MouseEvent) => {
    e?.stopPropagation();
    const article = articles.find((a) => a.id === id);
    if (!article) return;
    const next = !article.starred;
    setArticles((prev) => prev.map((a) => a.id === id ? { ...a, starred: next } : a));
    try {
      await rssClient.setStarred(id, next);
    } catch (err) {
      setError(messageFrom(err));
      void loadData();
    }
  };

  const markAllRead = async () => {
    const feedID = selectedFeedId && selectedFeedId !== 'starred' ? selectedFeedId : '';
    setArticles((prev) => prev.map((a) => (!feedID || a.feed_id === feedID) ? { ...a, read: true } : a));
    setFeeds((prev) => prev.map((f) => (!feedID || f.id === feedID) ? { ...f, unread_count: 0 } : f));
    try {
      await rssClient.markAllRead(feedID);
      await loadData();
    } catch (err) {
      setError(messageFrom(err));
    }
  };

  const refreshFeeds = async () => {
    setRefreshing(true);
    try {
      if (selectedFeedId && selectedFeedId !== 'starred') {
        await rssClient.refreshFeed(selectedFeedId);
      } else {
        const result = await rssClient.refreshAll();
        if (result.error) setError(result.error);
      }
      await loadData();
    } catch (err) {
      setError(messageFrom(err));
    } finally {
      setRefreshing(false);
    }
  };

  const addFeed = async () => {
    const url = newFeedUrl.trim();
    if (!url) return;
    setRefreshing(true);
    try {
      const feed = await rssClient.addFeed(url, newFeedCategory.trim());
      setSelectedFeedId(feed.id);
      setNewFeedUrl('');
      setNewFeedCategory('');
      setShowAddFeed(false);
      await loadData();
    } catch (err) {
      setError(messageFrom(err));
    } finally {
      setRefreshing(false);
    }
  };

  const removeFeed = async (feedId: string) => {
    try {
      await rssClient.deleteFeed(feedId);
      if (selectedFeedId === feedId) setSelectedFeedId(null);
      if (articles.some((a) => a.feed_id === feedId && a.id === selectedArticleId)) setSelectedArticleId(null);
      await loadData();
    } catch (err) {
      setError(messageFrom(err));
    }
  };

  return (
    <div className="w-full h-full flex" style={{ backgroundColor: 'var(--ink-50)' }}>
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
              onKeyDown={(e) => {
                if (e.key === 'Enter') void addFeed();
              }}
            />
            <input
              type="text"
              value={newFeedCategory}
              onChange={(e) => setNewFeedCategory(e.target.value)}
              placeholder="分类 (Category)"
              className="w-full px-2 py-1 rounded text-caption outline-none mb-2"
              style={{ backgroundColor: 'var(--ink-50)', border: '1px solid var(--ink-200)', color: 'var(--ink-700)' }}
            />
            <div className="flex gap-2">
              <button onClick={() => { void addFeed(); }} className="px-3 py-1 rounded text-caption" style={{ backgroundColor: 'var(--ink-800)', color: 'var(--ink-50)' }}>添加</button>
              <button onClick={() => setShowAddFeed(false)} className="px-3 py-1 rounded text-caption" style={{ color: 'var(--ink-500)' }}>取消</button>
            </div>
          </div>
        )}

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

        <div className="mt-2 pt-2 flex-1 overflow-auto" style={{ borderTop: '1px solid var(--ink-200)' }}>
          <span className="text-caption px-4 block mb-1" style={{ color: 'var(--ink-400)' }}>订阅源 (Feeds)</span>
          {feeds.map((feed) => (
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
              <Rss size={16} style={{ color: feed.last_error ? 'var(--cinnabar-light)' : undefined }} />
              <span className="flex-1 truncate">{feed.title || feed.url}</span>
              {feed.unread_count > 0 && (
                <span className="text-caption px-1.5 py-0.5 rounded-full" style={{ backgroundColor: 'var(--cinnabar)', color: 'white', fontSize: '10px' }}>
                  {feed.unread_count}
                </span>
              )}
              <button
                onClick={(e) => { e.stopPropagation(); void removeFeed(feed.id); }}
                className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-black/5"
              >
                <X size={10} style={{ color: 'var(--ink-400)' }} />
              </button>
            </button>
          ))}
        </div>
      </div>

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
            onClick={() => { void refreshFeeds(); }}
            className="p-1.5 rounded transition-all duration-150 hover:bg-black/5 ml-2"
            title="刷新 (Refresh)"
          >
            <RefreshCw size={14} style={{ color: 'var(--ink-500)' }} className={refreshing ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={() => { void markAllRead(); }}
            className="p-1.5 rounded transition-all duration-150 hover:bg-black/5 ml-1"
            title="全部标为已读 (Mark all read)"
          >
            <CheckCircle size={14} style={{ color: 'var(--success)' }} />
          </button>
        </div>

        {error && (
          <div className="px-3 py-2 text-caption" style={{ color: 'var(--cinnabar-light)', backgroundColor: 'rgba(201,74,63,0.08)', borderBottom: '1px solid rgba(201,74,63,0.16)' }}>
            {error}
          </div>
        )}

        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-full gap-2">
              <Newspaper size={32} style={{ color: 'var(--ink-300)' }} />
              <span className="text-body-sm" style={{ color: 'var(--ink-400)' }}>加载订阅...</span>
            </div>
          ) : filteredArticles.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-2">
              <Newspaper size={32} style={{ color: 'var(--ink-300)' }} />
              <span className="text-body-sm" style={{ color: 'var(--ink-400)' }}>暂无文章 (No articles)</span>
            </div>
          ) : (
            filteredArticles.map((article) => (
              <button
                key={article.id}
                onClick={() => { void selectArticle(article.id); }}
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
                    <p className="text-caption mb-1 line-clamp-2" style={{ color: 'var(--ink-500)' }}>{article.summary || article.content || article.link}</p>
                    <div className="flex items-center gap-2">
                      <span className="text-caption" style={{ color: 'var(--ink-400)' }}>{formatDate(article.published_at || article.created_at)}</span>
                      <button onClick={(e) => { void toggleStar(article.id, e); }} className="transition-transform duration-150 hover:scale-110">
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

      <div className="flex-1 overflow-auto">
        {selectedArticle ? (
          <div className="p-6 max-w-2xl">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-caption px-2 py-0.5 rounded" style={{ backgroundColor: 'var(--wash-light)', color: 'var(--ink-600)' }}>
                {feeds.find((f) => f.id === selectedArticle.feed_id)?.title || 'Feed'}
              </span>
              <span className="text-caption" style={{ color: 'var(--ink-400)' }}>{formatDate(selectedArticle.published_at || selectedArticle.created_at)}</span>
            </div>
            <h1 className="text-heading-lg mb-4" style={{ color: 'var(--ink-900)' }}>{selectedArticle.title}</h1>
            <div className="flex items-center gap-2 mb-6 pb-4" style={{ borderBottom: '1px solid var(--ink-200)' }}>
              <button
                onClick={() => { void toggleStar(selectedArticle.id); }}
                className="flex items-center gap-1 px-3 py-1 rounded text-caption transition-all duration-150 hover:bg-black/5"
                style={{ color: selectedArticle.starred ? '#b8860b' : 'var(--ink-500)' }}
              >
                <Star size={14} style={{ fill: selectedArticle.starred ? '#b8860b' : 'none' }} />
                {selectedArticle.starred ? '已星标 (Starred)' : '星标 (Star)'}
              </button>
              {selectedArticle.link && (
                <a
                  href={selectedArticle.link}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 px-3 py-1 rounded text-caption transition-all duration-150 hover:bg-black/5"
                  style={{ color: 'var(--ink-500)' }}
                >
                  <ExternalLink size={14} />
                  原文 (Open)
                </a>
              )}
            </div>
            <div className="text-body-lg whitespace-pre-line" style={{ color: 'var(--ink-800)', lineHeight: 1.8 }}>
              {articleText(selectedArticle)}
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

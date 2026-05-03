import { useState, useCallback, useMemo } from 'react';
import {
  GitBranch, GitCommit, GitMerge, Plus, Check, Circle,
  ChevronRight, ChevronDown, Copy, RotateCcw, Tag,
  FilePlus, FileMinus, FileEdit, GitFork, Bookmark
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface GitFile {
  name: string;
  status: 'staged' | 'unstaged' | 'untracked';
  change: 'added' | 'deleted' | 'modified';
  diff: string[];
}

interface GitCommit {
  id: string;
  message: string;
  author: string;
  date: string;
  branch: string;
  parents: string[];
}

const INITIAL_COMMITS: GitCommit[] = [
  { id: 'a1b2c3d', message: 'feat: add ink-wash theme system', author: '墨白', date: '2024-01-15 09:30', branch: 'main', parents: [] },
  { id: 'e4f5g6h', message: 'feat: implement window manager with drag/resize', author: '墨白', date: '2024-01-16 14:22', branch: 'main', parents: ['a1b2c3d'] },
  { id: 'i7j8k9l', message: 'fix: window resize boundary calculation', author: '子墨', date: '2024-01-17 11:45', branch: 'main', parents: ['e4f5g6h'] },
  { id: 'm0n1o2p', message: 'feat: add desktop icon grid system', author: '墨白', date: '2024-01-18 16:08', branch: 'main', parents: ['i7j8k9l'] },
  { id: 'q3r4s5t', message: 'feat: create app launcher menu', author: '丹青', date: '2024-01-20 08:55', branch: 'main', parents: ['m0n1o2p'] },
  { id: 'u6v7w8x', message: 'feat: add terminal application', author: '子墨', date: '2024-01-22 13:40', branch: 'main', parents: ['q3r4s5t'] },
  { id: 'y9z0a1b', message: 'refactor: extract common UI components', author: '墨白', date: '2024-01-23 17:12', branch: 'main', parents: ['u6v7w8x'] },
  { id: 'c2d3e4f', message: 'feat: add file manager with breadcrumbs', author: '丹青', date: '2024-01-25 10:25', branch: 'main', parents: ['y9z0a1b'] },
  { id: 'g5h6i7j', message: 'feat: develop calendar widget with lunar', author: '子墨', date: '2024-01-28 09:18', branch: 'feature/calendar-widget', parents: ['y9z0a1b'] },
  { id: 'k8l9m0n', message: 'feat: add system monitor charts', author: '墨白', date: '2024-01-30 15:33', branch: 'main', parents: ['c2d3e4f'] },
  { id: 'o1p2q3r', message: 'feat: add calculator and clock apps', author: '丹青', date: '2024-02-01 11:50', branch: 'main', parents: ['k8l9m0n'] },
  { id: 's4t5u6v', message: 'fix: calendar lunar date calculation', author: '子墨', date: '2024-02-02 14:05', branch: 'feature/calendar-widget', parents: ['g5h6i7j'] },
  { id: 'w7x8y9z', message: 'feat: add settings panel', author: '墨白', date: '2024-02-04 08:40', branch: 'main', parents: ['o1p2q3r'] },
  { id: 'a0b1c2d', message: 'feat: markdown editor with live preview', author: '丹青', date: '2024-02-06 16:22', branch: 'develop', parents: ['w7x8y9z'] },
  { id: 'e3f4g5h', message: 'feat: add paint and drawing canvas', author: '子墨', date: '2024-02-08 12:10', branch: 'develop', parents: ['a0b1c2d'] },
  { id: 'i6j7k8l', message: 'feat: implement QR code generator', author: '墨白', date: '2024-02-10 09:45', branch: 'main', parents: ['w7x8y9z'] },
  { id: 'm9n0o1p', message: 'fix: memory leak in window animations', author: '丹青', date: '2024-02-12 11:30', branch: 'develop', parents: ['e3f4g5h'] },
  { id: 'q2r3s4t', message: 'feat: add password generator tool', author: '子墨', date: '2024-02-14 13:55', branch: 'main', parents: ['i6j7k8l'] },
  { id: 'u5v6w7x', message: 'feat: add base64 encode/decode tool', author: '墨白', date: '2024-02-16 10:18', branch: 'main', parents: ['q2r3s4t'] },
  { id: 'y8z9a0b', message: 'feat: color picker with ink palette', author: '丹青', date: '2024-02-18 15:40', branch: 'main', parents: ['u5v6w7x'] },
];

const INITIAL_FILES: GitFile[] = [
  { name: 'src/apps/Calendar.tsx', status: 'unstaged', change: 'modified', diff: ['- import { useState } from "react";', '+ import { useState, useEffect } from "react";', '  export default function Calendar() {', '+   const [lunarDate, setLunarDate] = useState("");', '    return (', '      <div className="calendar">', '+       <LunarDisplay date={lunarDate} />', '      </div>', '    );', '  }'] },
  { name: 'src/styles/theme.css', status: 'staged', change: 'modified', diff: ['  :root {', '+   --wash-faint: rgba(45, 45, 45, 0.03);', '    --wash-light: rgba(26, 26, 26, 0.05);', '    --wash-medium: rgba(45, 45, 45, 0.10);', '  }'] },
  { name: 'src/components/Window.tsx', status: 'unstaged', change: 'modified', diff: ['- const MIN_WIDTH = 200;', '+ const MIN_WIDTH = 280;', '- const MIN_HEIGHT = 150;', '+ const MIN_HEIGHT = 200;', '  // Window resize bounds updated'] },
  { name: 'docs/api.md', status: 'untracked', change: 'added', diff: ['+ # Ink OS API Documentation', '+ ', '+ ## Overview', '+ This document describes the internal APIs...'] },
  { name: 'src/apps/Weather.tsx', status: 'staged', change: 'added', diff: ['+ import { useState } from "react";', '+ export default function Weather() {', '+   return <div>Weather App</div>;', '+ }'] },
  { name: 'package-lock.json', status: 'unstaged', change: 'modified', diff: ['- "version": "1.2.0"', '+ "version": "1.3.0"', '- "framer-motion": "^11.0.0"', '+ "framer-motion": "^11.5.0"'] },
];

const BRANCH_COLORS: Record<string, string> = {
  main: '#2d2d2d',
  develop: '#5a7a8a',
  'feature/calendar-widget': '#4a7c59',
};

type TabType = 'changes' | 'history' | 'graph';

export default function GitClient() {
  const [activeTab, setActiveTab] = useState<TabType>('changes');
  const [files, setFiles] = useState<GitFile[]>(INITIAL_FILES);
  const [commits, setCommits] = useState<GitCommit[]>(INITIAL_COMMITS);
  const [branches, setBranches] = useState<string[]>(['main', 'develop', 'feature/calendar-widget']);
  const [currentBranch, setCurrentBranch] = useState('main');
  const [selectedFile, setSelectedFile] = useState<GitFile | null>(INITIAL_FILES[0]);
  const [selectedCommit, setSelectedCommit] = useState<GitCommit | null>(null);
  const [commitMessage, setCommitMessage] = useState('');
  const [sidebarView, setSidebarView] = useState<'files' | 'branches'>('files');
  const [newBranchName, setNewBranchName] = useState('');
  const [showNewBranch, setShowNewBranch] = useState(false);

  const stagedFiles = useMemo(() => files.filter(f => f.status === 'staged'), [files]);
  const unstagedFiles = useMemo(() => files.filter(f => f.status === 'unstaged' || f.status === 'untracked'), [files]);

  const toggleStage = useCallback((fileName: string) => {
    setFiles(prev => prev.map(f => {
      if (f.name === fileName) {
        return { ...f, status: f.status === 'staged' ? 'unstaged' : 'staged' };
      }
      return f;
    }));
  }, []);

  const handleCommit = useCallback(() => {
    if (!commitMessage.trim() || stagedFiles.length === 0) return;
    const newCommit: GitCommit = {
      id: Math.random().toString(36).substring(2, 9),
      message: commitMessage,
      author: '墨白',
      date: new Date().toISOString().slice(0, 16).replace('T', ' '),
      branch: currentBranch,
      parents: [commits[commits.length - 1]?.id || ''],
    };
    setCommits(prev => [...prev, newCommit]);
    setFiles(prev => prev.filter(f => f.status !== 'staged'));
    setCommitMessage('');
  }, [commitMessage, stagedFiles, currentBranch, commits]);

  const createBranch = useCallback(() => {
    if (!newBranchName.trim()) return;
    setBranches(prev => [...prev, newBranchName]);
    setNewBranchName('');
    setShowNewBranch(false);
  }, [newBranchName]);

  const handleCheckout = useCallback((branch: string) => {
    setCurrentBranch(branch);
  }, []);

  const handleMerge = useCallback((branch: string) => {
    if (branch === currentBranch) return;
    const newCommit: GitCommit = {
      id: Math.random().toString(36).substring(2, 9),
      message: `merge: merge branch '${branch}' into ${currentBranch}`,
      author: '墨白',
      date: new Date().toISOString().slice(0, 16).replace('T', ' '),
      branch: currentBranch,
      parents: [commits[commits.length - 1]?.id || '', branch],
    };
    setCommits(prev => [...prev, newCommit]);
  }, [currentBranch, commits]);

  const getBranchCommits = useCallback((branch: string) => {
    return commits.filter(c => c.branch === branch || (branch === 'main' && c.branch !== 'feature/calendar-widget'));
  }, [commits]);

  const getStatusIcon = (change: string) => {
    switch (change) {
      case 'added': return <FilePlus size={12} style={{ color: 'var(--success)' }} />;
      case 'deleted': return <FileMinus size={12} style={{ color: 'var(--cinnabar)' }} />;
      case 'modified': return <FileEdit size={12} style={{ color: 'var(--warning)' }} />;
      default: return <Circle size={12} />;
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'staged': return '已暂存 (Staged)';
      case 'unstaged': return '未暂存 (Unstaged)';
      case 'untracked': return '未跟踪 (Untracked)';
      default: return status;
    }
  };

  return (
    <div className="w-full h-full flex flex-col" style={{ backgroundColor: 'var(--ink-50)', fontFamily: 'var(--font-body), "Noto Sans SC", sans-serif' }}>
      {/* Repository bar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b" style={{ borderColor: 'var(--ink-200)', backgroundColor: 'var(--ink-100)' }}>
        <GitBranch size={14} style={{ color: 'var(--ink-700)' }} />
        <span className="text-body-sm font-medium" style={{ color: 'var(--ink-900)' }}>ink-os</span>
        <div className="w-px h-4 mx-1" style={{ backgroundColor: 'var(--ink-300)' }} />
        <select
          value={currentBranch}
          onChange={e => handleCheckout(e.target.value)}
          className="text-body-sm px-2 py-1 rounded border"
          style={{ backgroundColor: 'var(--ink-50)', borderColor: 'var(--ink-300)', color: 'var(--ink-800)', fontFamily: 'var(--font-code)' }}
        >
          {branches.map(b => (
            <option key={b} value={b}>{b}</option>
          ))}
        </select>
        <div className="flex-1" />
        <div className="flex gap-1">
          {(['changes', 'history', 'graph'] as TabType[]).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                'px-3 py-1 text-body-sm rounded transition-colors',
                activeTab === tab ? 'font-medium' : ''
              )}
              style={{
                backgroundColor: activeTab === tab ? 'var(--ink-800)' : 'transparent',
                color: activeTab === tab ? 'var(--ink-50)' : 'var(--ink-600)',
              }}
            >
              {tab === 'changes' && '更改 (Changes)'}
              {tab === 'history' && '历史 (History)'}
              {tab === 'graph' && '图谱 (Graph)'}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <div className="w-48 flex flex-col border-r overflow-hidden" style={{ borderColor: 'var(--ink-200)', backgroundColor: 'var(--ink-100)' }}>
          <div className="flex border-b" style={{ borderColor: 'var(--ink-200)' }}>
            <button
              onClick={() => setSidebarView('files')}
              className="flex-1 py-1.5 text-body-sm text-center transition-colors"
              style={{ color: sidebarView === 'files' ? 'var(--ink-900)' : 'var(--ink-500)', borderBottom: sidebarView === 'files' ? '2px solid var(--cinnabar)' : '2px solid transparent' }}
            >
              文件 (Files)
            </button>
            <button
              onClick={() => setSidebarView('branches')}
              className="flex-1 py-1.5 text-body-sm text-center transition-colors"
              style={{ color: sidebarView === 'branches' ? 'var(--ink-900)' : 'var(--ink-500)', borderBottom: sidebarView === 'branches' ? '2px solid var(--cinnabar)' : '2px solid transparent' }}
            >
              分支 (Branches)
            </button>
          </div>

          {sidebarView === 'files' ? (
            <div className="flex-1 overflow-auto p-2">
              <div className="text-caption mb-1" style={{ color: 'var(--ink-500)' }}>暂存 (Staged) — {stagedFiles.length}</div>
              {stagedFiles.map(f => (
                <div key={f.name} className="flex items-center gap-1 py-0.5 px-1 rounded cursor-pointer" style={{ backgroundColor: 'var(--wash-faint)' }} onClick={() => toggleStage(f.name)}>
                  <Check size={12} style={{ color: 'var(--success)' }} />
                  <span className="text-caption truncate flex-1" style={{ color: 'var(--ink-700)' }}>{f.name.split('/').pop()}</span>
                </div>
              ))}
              <div className="text-caption mt-2 mb-1" style={{ color: 'var(--ink-500)' }}>未暂存 (Unstaged) — {unstagedFiles.length}</div>
              {unstagedFiles.map(f => (
                <div key={f.name} className="flex items-center gap-1 py-0.5 px-1 rounded cursor-pointer hover:bg-[rgba(26,26,26,0.05)]" onClick={() => { setSelectedFile(f); toggleStage(f.name); }}>
                  {f.status === 'untracked' ? <Circle size={12} style={{ color: 'var(--ink-400)' }} /> : getStatusIcon(f.change)}
                  <span className="text-caption truncate flex-1" style={{ color: 'var(--ink-700)' }}>{f.name.split('/').pop()}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex-1 overflow-auto p-2">
              {branches.map(b => (
                <div key={b} className="flex items-center gap-1.5 py-1 px-1.5 rounded mb-0.5 cursor-pointer" style={{ backgroundColor: currentBranch === b ? 'var(--wash-light)' : 'transparent' }} onClick={() => handleCheckout(b)}>
                  <GitBranch size={12} style={{ color: BRANCH_COLORS[b] || 'var(--ink-600)' }} />
                  <span className="text-caption flex-1" style={{ color: 'var(--ink-800)' }}>{b}</span>
                  {currentBranch === b && <Bookmark size={10} style={{ color: 'var(--cinnabar)' }} />}
                </div>
              ))}
              {!showNewBranch ? (
                <button onClick={() => setShowNewBranch(true)} className="flex items-center gap-1 mt-2 px-1.5 py-1 text-caption rounded" style={{ color: 'var(--ink-500)' }}>
                  <Plus size={12} /> 新建分支 (New)
                </button>
              ) : (
                <div className="mt-2 flex gap-1">
                  <input
                    value={newBranchName}
                    onChange={e => setNewBranchName(e.target.value)}
                    placeholder="分支名"
                    className="flex-1 text-caption px-1.5 py-1 rounded border"
                    style={{ borderColor: 'var(--ink-300)', backgroundColor: 'var(--ink-50)' }}
                    onKeyDown={e => e.key === 'Enter' && createBranch()}
                  />
                  <button onClick={createBranch} className="px-2 py-1 rounded text-caption" style={{ backgroundColor: 'var(--ink-800)', color: 'var(--ink-50)' }}>OK</button>
                </div>
              )}
              <div className="mt-4 border-t pt-2" style={{ borderColor: 'var(--ink-200)' }}>
                <div className="text-caption mb-1" style={{ color: 'var(--ink-500)' }}>操作 (Actions)</div>
                {branches.filter(b => b !== currentBranch).map(b => (
                  <button key={b} onClick={() => handleMerge(b)} className="flex items-center gap-1 w-full py-1 px-1.5 text-caption rounded hover:bg-[rgba(26,26,26,0.05)]" style={{ color: 'var(--ink-600)' }}>
                    <GitMerge size={10} /> 合并 {b} (Merge)
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Main area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {activeTab === 'changes' && (
            <>
              <div className="flex-1 flex overflow-hidden">
                <div className="flex-1 flex flex-col overflow-hidden">
                  {/* Commit message */}
                  <div className="p-3 border-b" style={{ borderColor: 'var(--ink-200)' }}>
                    <input
                      value={commitMessage}
                      onChange={e => setCommitMessage(e.target.value)}
                      placeholder="输入提交信息 (Enter commit message...)"
                      className="w-full px-3 py-2 rounded text-body-sm border"
                      style={{ backgroundColor: 'var(--ink-50)', borderColor: 'var(--ink-300)', color: 'var(--ink-900)', fontFamily: 'var(--font-body)' }}
                    />
                    <button
                      onClick={handleCommit}
                      disabled={!commitMessage.trim() || stagedFiles.length === 0}
                      className="mt-2 px-4 py-1.5 rounded text-body-sm transition-all disabled:opacity-40"
                      style={{ backgroundColor: 'var(--ink-800)', color: 'var(--ink-50)' }}
                    >
                      <GitCommit size={12} className="inline mr-1" />
                      提交 (Commit) {stagedFiles.length > 0 && `(${stagedFiles.length})`}
                    </button>
                  </div>
                  {/* File diff */}
                  <div className="flex-1 overflow-auto p-3">
                    {selectedFile ? (
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          {getStatusIcon(selectedFile.change)}
                          <span className="text-body-sm font-medium" style={{ color: 'var(--ink-800)' }}>{selectedFile.name}</span>
                          <span className="text-caption px-1.5 py-0.5 rounded" style={{ backgroundColor: selectedFile.status === 'staged' ? 'rgba(74,124,89,0.15)' : 'rgba(179,57,47,0.15)', color: selectedFile.status === 'staged' ? 'var(--success)' : 'var(--cinnabar)' }}>
                            {getStatusLabel(selectedFile.status)}
                          </span>
                        </div>
                        <div className="rounded border overflow-hidden" style={{ borderColor: 'var(--ink-200)', backgroundColor: 'var(--ink-50)' }}>
                          {selectedFile.diff.map((line, i) => (
                            <div key={i} className="flex text-mono-md px-2 py-0.5" style={{
                              fontSize: '12px',
                              lineHeight: '1.6',
                              backgroundColor: line.startsWith('+') ? 'rgba(74,124,89,0.08)' : line.startsWith('-') ? 'rgba(179,57,47,0.08)' : 'transparent',
                              color: line.startsWith('+') ? 'var(--success)' : line.startsWith('-') ? 'var(--cinnabar)' : 'var(--ink-600)',
                            }}>
                              <span className="w-6 text-right mr-3 select-none" style={{ color: 'var(--ink-400)', fontSize: '11px' }}>{i + 1}</span>
                              <span className="font-mono">{line}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-center h-full text-body-md" style={{ color: 'var(--ink-400)' }}>
                        选择文件查看差异 (Select a file to view diff)
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}

          {activeTab === 'history' && (
            <div className="flex-1 flex overflow-hidden">
              <div className="flex-1 overflow-auto">
                {commits.slice().reverse().map((commit, idx) => (
                  <div
                    key={commit.id}
                    className="flex items-start gap-3 px-4 py-2.5 border-b cursor-pointer transition-colors"
                    style={{
                      borderColor: 'var(--ink-200)',
                      backgroundColor: selectedCommit?.id === commit.id ? 'var(--wash-light)' : 'transparent',
                    }}
                    onClick={() => setSelectedCommit(selectedCommit?.id === commit.id ? null : commit)}
                  >
                    <div className="mt-0.5">
                      <GitCommit size={14} style={{ color: BRANCH_COLORS[commit.branch] || 'var(--ink-600)' }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-body-sm font-medium truncate" style={{ color: 'var(--ink-800)' }}>{commit.message}</div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-caption" style={{ color: 'var(--ink-500)' }}>{commit.author}</span>
                        <span className="text-caption" style={{ color: 'var(--ink-400)' }}>{commit.date}</span>
                        <span className="text-caption px-1 rounded" style={{ backgroundColor: 'var(--wash-faint)', color: 'var(--ink-600)', fontFamily: 'var(--font-code)', fontSize: '10px' }}>{commit.branch}</span>
                      </div>
                    </div>
                    <span className="text-caption font-mono mt-0.5" style={{ color: 'var(--ink-400)', fontSize: '11px' }}>{commit.id}</span>
                  </div>
                )).slice(0, 50)}
              </div>
              {selectedCommit && (
                <div className="w-72 border-l p-4 overflow-auto" style={{ borderColor: 'var(--ink-200)', backgroundColor: 'var(--ink-100)' }}>
                  <div className="text-heading-sm mb-2" style={{ color: 'var(--ink-800)' }}>提交详情 (Details)</div>
                  <div className="text-caption mb-1" style={{ color: 'var(--ink-500)' }}>哈希 (Hash)</div>
                  <div className="text-body-sm font-mono mb-3" style={{ color: 'var(--ink-700)', fontFamily: 'var(--font-code)' }}>{selectedCommit.id}</div>
                  <div className="text-caption mb-1" style={{ color: 'var(--ink-500)' }}>信息 (Message)</div>
                  <div className="text-body-sm mb-3" style={{ color: 'var(--ink-800)' }}>{selectedCommit.message}</div>
                  <div className="text-caption mb-1" style={{ color: 'var(--ink-500)' }}>作者 (Author)</div>
                  <div className="text-body-sm mb-3" style={{ color: 'var(--ink-700)' }}>{selectedCommit.author}</div>
                  <div className="text-caption mb-1" style={{ color: 'var(--ink-500)' }}>日期 (Date)</div>
                  <div className="text-body-sm mb-3" style={{ color: 'var(--ink-700)' }}>{selectedCommit.date}</div>
                  <div className="text-caption mb-1" style={{ color: 'var(--ink-500)' }}>分支 (Branch)</div>
                  <div className="text-body-sm mb-3" style={{ color: 'var(--ink-700)' }}>{selectedCommit.branch}</div>
                  {selectedCommit.parents.length > 0 && (
                    <>
                      <div className="text-caption mb-1" style={{ color: 'var(--ink-500)' }}>父提交 (Parents)</div>
                      {selectedCommit.parents.map(p => (
                        <div key={p} className="text-body-sm font-mono" style={{ color: 'var(--ink-600)', fontFamily: 'var(--font-code)', fontSize: '11px' }}>{p}</div>
                      ))}
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {activeTab === 'graph' && (
            <div className="flex-1 overflow-auto p-4">
              <svg width="100%" height={commits.length * 48 + 40} viewBox={`0 0 ${branches.length * 120 + 100} ${commits.length * 48 + 40}`}>
                {/* Branch lines */}
                {branches.map((branch, bi) => {
                  const branchCommits = commits.filter(c => c.branch === branch || (branch === 'main' && c.branch !== 'feature/calendar-widget' && c.branch !== 'develop'));
                  if (branchCommits.length === 0) return null;
                  return (
                    <g key={branch}>
                      {branchCommits.slice(0, -1).map((c, i) => {
                        const nextCommit = branchCommits[i + 1];
                        if (!nextCommit) return null;
                        const cIdx = commits.indexOf(c);
                        const nIdx = commits.indexOf(nextCommit);
                        return (
                          <line
                            key={`${c.id}-${nextCommit.id}`}
                            x1={60 + bi * 100}
                            y1={nIdx * 48 + 40}
                            x2={60 + bi * 100}
                            y2={cIdx * 48 + 40}
                            stroke={BRANCH_COLORS[branch] || 'var(--ink-600)'}
                            strokeWidth="2"
                          />
                        );
                      })}
                    </g>
                  );
                })}
                {/* Commit dots */}
                {commits.map((commit, i) => {
                  const bi = branches.indexOf(commit.branch);
                  const x = 60 + (bi >= 0 ? bi : 0) * 100;
                  const y = i * 48 + 40;
                  return (
                    <g key={commit.id}>
                      <circle
                        cx={x}
                        cy={y}
                        r="6"
                        fill={BRANCH_COLORS[commit.branch] || 'var(--ink-600)'}
                        stroke="var(--ink-50)"
                        strokeWidth="2"
                        style={{ cursor: 'pointer' }}
                        onClick={() => setSelectedCommit(commit)}
                      />
                      <text x={x + 14} y={y + 4} fontSize="11" fill="var(--ink-700)" fontFamily="var(--font-body)">
                        {commit.message.length > 30 ? commit.message.slice(0, 30) + '...' : commit.message}
                      </text>
                      <text x={x + 14} y={y + 16} fontSize="9" fill="var(--ink-400)" fontFamily="var(--font-code)">
                        {commit.author} • {commit.date}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

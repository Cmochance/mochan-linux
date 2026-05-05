import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle, Check, ChevronDown, FileEdit, FileMinus, FilePlus,
  GitBranch, GitCommit as GitCommitIcon, GitMerge, Plus, RefreshCw,
  RotateCcw, Trash2
} from 'lucide-react';
import { gitClient, type GitBranch as GitBranchInfo, type GitCommit, type GitRepo, type GitStatus, type GitStatusFile } from '@/lib/git';
import { cn } from '@/lib/utils';

type TabType = 'changes' | 'history' | 'branches';

function changeIcon(change: string) {
  if (change === 'added') return <FilePlus size={13} style={{ color: 'var(--success)' }} />;
  if (change === 'deleted') return <FileMinus size={13} style={{ color: 'var(--cinnabar)' }} />;
  return <FileEdit size={13} style={{ color: 'var(--warning)' }} />;
}

function shortError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export default function GitClient() {
  const [repos, setRepos] = useState<GitRepo[]>([]);
  const [repoId, setRepoId] = useState('');
  const [repoPath, setRepoPath] = useState('');
  const [repoName, setRepoName] = useState('');
  const [status, setStatus] = useState<GitStatus | null>(null);
  const [commits, setCommits] = useState<GitCommit[]>([]);
  const [branches, setBranches] = useState<GitBranchInfo[]>([]);
  const [selectedFile, setSelectedFile] = useState<GitStatusFile | null>(null);
  const [diff, setDiff] = useState('');
  const [commitMessage, setCommitMessage] = useState('');
  const [newBranchName, setNewBranchName] = useState('');
  const [activeTab, setActiveTab] = useState<TabType>('changes');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [lastOutput, setLastOutput] = useState('');

  const stagedFiles = useMemo(() => status?.files.filter(f => f.staged) ?? [], [status]);
  const unstagedFiles = useMemo(() => status?.files.filter(f => f.unstaged) ?? [], [status]);
  const currentBranch = branches.find(b => b.current)?.name || status?.branch || '';

  const refreshRepos = useCallback(async () => {
    const data = await gitClient.repos();
    setRepos(data.repos);
    setRepoId(prev => prev || data.repos[0]?.id || '');
  }, []);

  const refreshRepo = useCallback(async (id = repoId) => {
    if (!id) {
      setStatus(null);
      setCommits([]);
      setBranches([]);
      return;
    }
    setBusy(true);
    setError('');
    try {
      const [nextStatus, nextLog, nextBranches] = await Promise.all([
        gitClient.status(id),
        gitClient.log(id),
        gitClient.branches(id),
      ]);
      setStatus(nextStatus);
      setCommits(nextLog.commits);
      setBranches(nextBranches.branches);
      setSelectedFile(prev => prev ? nextStatus.files.find(f => f.path === prev.path) ?? nextStatus.files[0] ?? null : nextStatus.files[0] ?? null);
    } catch (err) {
      setError(shortError(err));
    } finally {
      setBusy(false);
    }
  }, [repoId]);

  useEffect(() => {
    refreshRepos().catch(err => setError(shortError(err)));
  }, [refreshRepos]);

  useEffect(() => {
    refreshRepo(repoId).catch(err => setError(shortError(err)));
  }, [repoId, refreshRepo]);

  useEffect(() => {
    if (!repoId || !selectedFile) {
      setDiff('');
      return;
    }
    gitClient.diff(repoId, selectedFile.path, selectedFile.staged && !selectedFile.unstaged)
      .then(res => setDiff(res.diff || '(no diff output)'))
      .catch(err => setDiff(shortError(err)));
  }, [repoId, selectedFile]);

  const runAction = async (action: () => Promise<{ output?: string } | void>) => {
    if (!repoId) return;
    setBusy(true);
    setError('');
    try {
      const result = await action();
      setLastOutput(result && 'output' in result ? result.output || '' : '');
      await refreshRepo(repoId);
    } catch (err) {
      setError(shortError(err));
    } finally {
      setBusy(false);
    }
  };

  const addRepo = async () => {
    if (!repoPath.trim()) return;
    setBusy(true);
    setError('');
    try {
      const repo = await gitClient.addRepo(repoPath.trim(), repoName.trim() || undefined);
      await refreshRepos();
      setRepoId(repo.id);
      setRepoPath('');
      setRepoName('');
    } catch (err) {
      setError(shortError(err));
    } finally {
      setBusy(false);
    }
  };

  const toggleStage = (file: GitStatusFile) => {
    runAction(() => file.staged && !file.unstaged ? gitClient.unstage(repoId, [file.path]) : gitClient.stage(repoId, [file.path]));
  };

  return (
    <div className="w-full h-full flex flex-col" style={{ backgroundColor: 'var(--ink-50)', fontFamily: 'var(--font-body), "Noto Sans SC", sans-serif' }}>
      <div className="flex items-center gap-2 px-3 py-2 border-b" style={{ borderColor: 'var(--ink-200)', backgroundColor: 'var(--ink-100)' }}>
        <GitBranch size={15} style={{ color: 'var(--ink-700)' }} />
        <select
          value={repoId}
          onChange={e => setRepoId(e.target.value)}
          className="text-body-sm px-2 py-1 rounded border min-w-48"
          style={{ backgroundColor: 'var(--ink-50)', borderColor: 'var(--ink-300)', color: 'var(--ink-800)' }}
        >
          <option value="">选择仓库 (Select repo)</option>
          {repos.map(repo => <option key={repo.id} value={repo.id}>{repo.name} - {repo.path}</option>)}
        </select>
        {status && (
          <div className="flex items-center gap-2 text-caption" style={{ color: 'var(--ink-500)' }}>
            <span>{status.branch || 'detached'}</span>
            <span>{status.head}</span>
            {status.upstream && <span>{status.ahead} ahead / {status.behind} behind</span>}
          </div>
        )}
        <div className="flex-1" />
        <button onClick={() => refreshRepo()} disabled={busy || !repoId} className="p-1.5 rounded hover:bg-black/5 disabled:opacity-40" title="刷新">
          <RefreshCw size={15} className={busy ? 'animate-spin' : ''} style={{ color: 'var(--ink-600)' }} />
        </button>
      </div>

      <div className="flex items-center gap-2 px-3 py-2 border-b" style={{ borderColor: 'var(--ink-200)', backgroundColor: 'var(--ink-50)' }}>
        <input value={repoPath} onChange={e => setRepoPath(e.target.value)} placeholder="服务器仓库绝对路径，例如 /root/project" className="flex-1 px-2 py-1 rounded border text-body-sm" style={{ borderColor: 'var(--ink-200)' }} />
        <input value={repoName} onChange={e => setRepoName(e.target.value)} placeholder="名称" className="w-28 px-2 py-1 rounded border text-body-sm" style={{ borderColor: 'var(--ink-200)' }} />
        <button onClick={addRepo} disabled={busy || !repoPath.trim()} className="flex items-center gap-1 px-3 py-1 rounded text-body-sm disabled:opacity-40" style={{ backgroundColor: 'var(--ink-800)', color: 'var(--ink-50)' }}>
          <Plus size={13} /> 登记仓库
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 px-3 py-2 text-caption" style={{ color: 'var(--cinnabar)', backgroundColor: 'rgba(179,57,47,0.08)' }}>
          <AlertCircle size={14} /> {error}
        </div>
      )}

      <div className="flex border-b" style={{ borderColor: 'var(--ink-200)', backgroundColor: 'var(--ink-100)' }}>
        {(['changes', 'history', 'branches'] as TabType[]).map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)} className={cn('px-4 py-2 text-body-sm', activeTab === tab && 'font-medium')} style={{ color: activeTab === tab ? 'var(--ink-900)' : 'var(--ink-500)', borderBottom: activeTab === tab ? '2px solid var(--cinnabar)' : '2px solid transparent' }}>
            {tab === 'changes' ? '更改 (Changes)' : tab === 'history' ? '历史 (History)' : '分支 (Branches)'}
          </button>
        ))}
      </div>

      {!repoId ? (
        <div className="flex-1 flex items-center justify-center text-body-sm" style={{ color: 'var(--ink-500)' }}>
          登记一个服务器上的真实 Git 仓库后开始操作。
        </div>
      ) : activeTab === 'changes' ? (
        <div className="flex-1 flex overflow-hidden">
          <div className="w-64 border-r overflow-auto" style={{ borderColor: 'var(--ink-200)', backgroundColor: 'var(--ink-100)' }}>
            <FileSection title={`暂存 (Staged) - ${stagedFiles.length}`} files={stagedFiles} selected={selectedFile} onSelect={setSelectedFile} onToggle={toggleStage} />
            <FileSection title={`未暂存 (Unstaged) - ${unstagedFiles.length}`} files={unstagedFiles} selected={selectedFile} onSelect={setSelectedFile} onToggle={toggleStage} />
          </div>
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="p-3 border-b" style={{ borderColor: 'var(--ink-200)' }}>
              <div className="flex gap-2">
                <input value={commitMessage} onChange={e => setCommitMessage(e.target.value)} placeholder="提交信息 (Commit message)" className="flex-1 px-3 py-2 rounded border text-body-sm" style={{ borderColor: 'var(--ink-300)' }} />
                <button onClick={() => runAction(async () => { const out = await gitClient.commit(repoId, commitMessage); setCommitMessage(''); return out; })} disabled={busy || !commitMessage.trim() || stagedFiles.length === 0} className="flex items-center gap-1 px-4 py-2 rounded text-body-sm disabled:opacity-40" style={{ backgroundColor: 'var(--ink-800)', color: 'var(--ink-50)' }}>
                  <GitCommitIcon size={14} /> 提交
                </button>
              </div>
            </div>
            <pre className="flex-1 overflow-auto p-3 text-mono-md" style={{ color: 'var(--ink-700)', backgroundColor: 'var(--ink-50)', fontSize: 12, whiteSpace: 'pre-wrap' }}>
              {selectedFile ? diff : '选择文件查看差异 (Select a file to view diff)'}
            </pre>
          </div>
        </div>
      ) : activeTab === 'history' ? (
        <div className="flex-1 overflow-auto">
          {commits.map(commit => (
            <div key={commit.hash} className="flex items-start gap-3 px-4 py-3 border-b" style={{ borderColor: 'var(--ink-200)' }}>
              <GitCommitIcon size={15} style={{ color: 'var(--ink-600)', marginTop: 2 }} />
              <div className="flex-1 min-w-0">
                <div className="text-body-sm font-medium truncate" style={{ color: 'var(--ink-800)' }}>{commit.subject}</div>
                <div className="text-caption mt-0.5" style={{ color: 'var(--ink-500)' }}>{commit.author} · {commit.date}</div>
              </div>
              <span className="text-caption font-mono" style={{ color: 'var(--ink-400)' }}>{commit.short}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex-1 overflow-auto p-3">
          <div className="flex gap-2 mb-3">
            <input value={newBranchName} onChange={e => setNewBranchName(e.target.value)} placeholder="新分支名" className="px-3 py-2 rounded border text-body-sm" style={{ borderColor: 'var(--ink-300)' }} />
            <button onClick={() => runAction(async () => { const out = await gitClient.createBranch(repoId, newBranchName, true); setNewBranchName(''); return out; })} disabled={!newBranchName.trim() || busy} className="flex items-center gap-1 px-3 py-2 rounded text-body-sm disabled:opacity-40" style={{ backgroundColor: 'var(--ink-800)', color: 'var(--ink-50)' }}>
              <Plus size={14} /> 创建并切换
            </button>
            <button onClick={() => runAction(() => gitClient.fetch(repoId))} disabled={busy} className="flex items-center gap-1 px-3 py-2 rounded text-body-sm" style={{ backgroundColor: 'var(--ink-100)', color: 'var(--ink-700)' }}>
              <RotateCcw size={14} /> Fetch
            </button>
            <button onClick={() => runAction(() => gitClient.pull(repoId))} disabled={busy} className="flex items-center gap-1 px-3 py-2 rounded text-body-sm" style={{ backgroundColor: 'var(--ink-100)', color: 'var(--ink-700)' }}>
              <ChevronDown size={14} /> Pull
            </button>
          </div>
          <div className="grid gap-2">
            {branches.map(branch => (
              <div key={branch.name} className="flex items-center gap-3 p-3 rounded border" style={{ borderColor: 'var(--ink-200)', backgroundColor: branch.current ? 'var(--wash-light)' : 'var(--ink-100)' }}>
                <GitBranch size={14} style={{ color: branch.current ? 'var(--cinnabar)' : 'var(--ink-500)' }} />
                <span className="flex-1 text-body-sm" style={{ color: 'var(--ink-800)' }}>{branch.name}</span>
                {!branch.current && (
                  <>
                    <button onClick={() => runAction(() => gitClient.checkout(repoId, branch.name))} className="px-2 py-1 rounded text-caption hover:bg-black/5" style={{ color: 'var(--ink-600)' }}>切换</button>
                    <button onClick={() => runAction(() => gitClient.merge(repoId, branch.name))} className="flex items-center gap-1 px-2 py-1 rounded text-caption hover:bg-black/5" style={{ color: 'var(--ink-600)' }}><GitMerge size={12} /> 合并</button>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {lastOutput && (
        <pre className="max-h-24 overflow-auto px-3 py-2 text-caption border-t" style={{ borderColor: 'var(--ink-200)', backgroundColor: 'var(--ink-100)', color: 'var(--ink-600)', whiteSpace: 'pre-wrap' }}>{lastOutput}</pre>
      )}
    </div>
  );
}

function FileSection({ title, files, selected, onSelect, onToggle }: {
  title: string;
  files: GitStatusFile[];
  selected: GitStatusFile | null;
  onSelect: (file: GitStatusFile) => void;
  onToggle: (file: GitStatusFile) => void;
}) {
  return (
    <div className="p-2">
      <div className="text-caption mb-1" style={{ color: 'var(--ink-500)' }}>{title}</div>
      {files.length === 0 && <div className="text-caption px-1 py-1" style={{ color: 'var(--ink-400)' }}>无</div>}
      {files.map(file => (
        <button key={`${title}-${file.path}`} onClick={() => onSelect(file)} className="w-full flex items-center gap-1.5 py-1 px-1 rounded text-left hover:bg-black/5" style={{ backgroundColor: selected?.path === file.path ? 'var(--wash-light)' : 'transparent' }}>
          <span onClick={(e) => { e.stopPropagation(); onToggle(file); }}>{file.staged && !file.unstaged ? <Check size={13} style={{ color: 'var(--success)' }} /> : changeIcon(file.change)}</span>
          <span className="text-caption truncate flex-1" style={{ color: 'var(--ink-700)' }}>{file.path}</span>
        </button>
      ))}
    </div>
  );
}

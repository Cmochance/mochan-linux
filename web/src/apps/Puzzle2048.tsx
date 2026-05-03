import { useState, useEffect, useCallback, useRef } from 'react';
import { RotateCcw, Undo2, Trophy, ArrowUp, ArrowDown, ArrowLeft, ArrowRight } from 'lucide-react';

type Board = (number | null)[][];
type HistoryEntry = { board: Board; score: number };

const GRID_SIZE = 4;
const BEST_SCORE_KEY = 'puzzle2048_best_score';

const TILE_COLORS: Record<number, { bg: string; text: string }> = {
  2: { bg: '#f0ebe4', text: '#2d2d2d' },
  4: { bg: '#e8e4df', text: '#2d2d2d' },
  8: { bg: '#9e9e9e', text: '#f0ebe4' },
  16: { bg: '#5c5c5c', text: '#f0ebe4' },
  32: { bg: '#c94a3f', text: 'white' },
  64: { bg: '#b3392f', text: 'white' },
  128: { bg: '#3d3d3d', text: '#c94a3f' },
  256: { bg: '#2d2d2d', text: '#b3392f' },
  512: { bg: '#5a7a8a', text: 'white' },
  1024: { bg: '#4a7c59', text: 'white' },
  2048: { bg: 'linear-gradient(135deg, #b8860b, #d4a574)', text: 'white' },
};

function getBestScore(): number {
  try { return Number(localStorage.getItem(BEST_SCORE_KEY)) || 0; } catch { return 0; }
}

function saveBestScore(score: number) {
  try { localStorage.setItem(BEST_SCORE_KEY, String(score)); } catch { /* noop */ }
}

function createEmptyBoard(): Board {
  return Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(null) as (number | null)[]);
}

function cloneBoard(board: Board): Board {
  return board.map(row => [...row]);
}

function addRandomTile(board: Board): Board {
  const empty: [number, number][] = [];
  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      if (board[r][c] === null) empty.push([r, c]);
    }
  }
  if (empty.length === 0) return board;
  const [row, col] = empty[Math.floor(Math.random() * empty.length)];
  const newBoard = cloneBoard(board);
  newBoard[row][col] = Math.random() < 0.9 ? 2 : 4;
  return newBoard;
}

function initBoard(): Board {
  let board = createEmptyBoard();
  board = addRandomTile(board);
  board = addRandomTile(board);
  return board;
}

function slideRowLeft(row: (number | null)[]): { row: (number | null)[]; score: number } {
  let score = 0;
  const filtered = row.filter(v => v !== null) as number[];
  const merged: (number | null)[] = [];
  let i = 0;
  while (i < filtered.length) {
    if (i + 1 < filtered.length && filtered[i] === filtered[i + 1]) {
      const val = filtered[i] * 2;
      merged.push(val);
      score += val;
      i += 2;
    } else {
      merged.push(filtered[i]);
      i++;
    }
  }
  while (merged.length < GRID_SIZE) merged.push(null);
  return { row: merged, score };
}

function moveLeft(board: Board): { board: Board; score: number; moved: boolean } {
  const newBoard = createEmptyBoard();
  let totalScore = 0;
  let moved = false;
  for (let r = 0; r < GRID_SIZE; r++) {
    const { row, score } = slideRowLeft(board[r]);
    newBoard[r] = row;
    totalScore += score;
    if (row.some((v, i) => v !== board[r][i])) moved = true;
  }
  return { board: newBoard, score: totalScore, moved };
}

function moveRight(board: Board): { board: Board; score: number; moved: boolean } {
  const reversed = board.map(row => [...row].reverse());
  const { board: movedBoard, score, moved: didMove } = moveLeft(reversed);
  return { board: movedBoard.map(row => row.reverse()), score, moved: didMove };
}

function moveUp(board: Board): { board: Board; score: number; moved: boolean } {
  const transposed = transpose(board);
  const { board: movedBoard, score, moved: didMove } = moveLeft(transposed);
  return { board: transpose(movedBoard), score, moved: didMove };
}

function moveDown(board: Board): { board: Board; score: number; moved: boolean } {
  const transposed = transpose(board);
  const { board: movedBoard, score, moved: didMove } = moveRight(transposed);
  return { board: transpose(movedBoard), score, moved: didMove };
}

function transpose(board: Board): Board {
  const result = createEmptyBoard();
  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      result[c][r] = board[r][c];
    }
  }
  return result;
}

function canMove(board: Board): boolean {
  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      if (board[r][c] === null) return true;
      if (c < GRID_SIZE - 1 && board[r][c] === board[r][c + 1]) return true;
      if (r < GRID_SIZE - 1 && board[r][c] === board[r + 1][c]) return true;
    }
  }
  return false;
}

function hasWon(board: Board): boolean {
  return board.some(row => row.some(v => v === 2048));
}

export default function Puzzle2048() {
  const [board, setBoard] = useState<Board>(initBoard);
  const [score, setScore] = useState(0);
  const [bestScore, setBestScore] = useState(getBestScore);
  const [gameOver, setGameOver] = useState(false);
  const [won, setWon] = useState(false);
  const [wonContinue, setWonContinue] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [touchStart, setTouchStart] = useState<{ x: number; y: number } | null>(null);
  const boardRef = useRef(board);
  boardRef.current = board;

  const saveToHistory = useCallback((currentBoard: Board, currentScore: number) => {
    setHistory(prev => [...prev.slice(-2), { board: cloneBoard(currentBoard), score: currentScore }]);
  }, []);

  const performMove = useCallback((moveFn: (b: Board) => { board: Board; score: number; moved: boolean }) => {
    if (gameOver) return;
    const currentBoard = boardRef.current;
    saveToHistory(currentBoard, score);
    const { board: newBoard, score: moveScore, moved } = moveFn(currentBoard);
    if (!moved) {
      // Remove the saved state since no move happened
      setHistory(prev => prev.slice(0, -1));
      return;
    }
    const finalBoard = addRandomTile(newBoard);
    setBoard(finalBoard);
    const newScore = score + moveScore;
    setScore(newScore);
    if (newScore > bestScore) {
      setBestScore(newScore);
      saveBestScore(newScore);
    }
    if (!wonContinue && hasWon(finalBoard)) {
      setWon(true);
    }
    if (!canMove(finalBoard)) {
      setGameOver(true);
    }
  }, [gameOver, score, bestScore, wonContinue, saveToHistory]);

  const handleMove = useCallback((direction: 'UP' | 'DOWN' | 'LEFT' | 'RIGHT') => {
    switch (direction) {
      case 'LEFT': performMove(moveLeft); break;
      case 'RIGHT': performMove(moveRight); break;
      case 'UP': performMove(moveUp); break;
      case 'DOWN': performMove(moveDown); break;
    }
  }, [performMove]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (gameOver || (won && !wonContinue)) return;
      switch (e.key) {
        case 'ArrowLeft': case 'a': case 'A': e.preventDefault(); handleMove('LEFT'); break;
        case 'ArrowRight': case 'd': case 'D': e.preventDefault(); handleMove('RIGHT'); break;
        case 'ArrowUp': case 'w': case 'W': e.preventDefault(); handleMove('UP'); break;
        case 'ArrowDown': case 's': case 'S': e.preventDefault(); handleMove('DOWN'); break;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleMove, gameOver, won, wonContinue]);

  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    setTouchStart({ x: touch.clientX, y: touch.clientY });
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchStart) return;
    const touch = e.changedTouches[0];
    const dx = touch.clientX - touchStart.x;
    const dy = touch.clientY - touchStart.y;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);
    if (Math.max(absDx, absDy) < 20) return;
    if (absDx > absDy) {
      handleMove(dx > 0 ? 'RIGHT' : 'LEFT');
    } else {
      handleMove(dy > 0 ? 'DOWN' : 'UP');
    }
    setTouchStart(null);
  };

  const handleUndo = useCallback(() => {
    if (history.length === 0 || gameOver) return;
    const prev = history[history.length - 1];
    setBoard(prev.board);
    setScore(prev.score);
    setHistory(h => h.slice(0, -1));
    setGameOver(false);
  }, [history, gameOver]);

  const handleNewGame = useCallback(() => {
    const newBoard = initBoard();
    setBoard(newBoard);
    setScore(0);
    setGameOver(false);
    setWon(false);
    setWonContinue(false);
    setHistory([]);
  }, []);

  const handleContinue = useCallback(() => {
    setWon(false);
    setWonContinue(true);
  }, []);

  const tileSize = 80;
  const gap = 8;

  return (
    <div className="w-full h-full flex flex-col items-center" style={{ backgroundColor: 'var(--ink-50)' }}
      onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
      {/* Header */}
      <div className="w-full max-w-md px-4 pt-4 pb-2">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-2xl font-bold" style={{ color: 'var(--ink-900)', fontFamily: '"Noto Serif SC", serif' }}>
              2048
            </div>
            <div className="text-xs" style={{ color: 'var(--ink-500)' }}>合并数字达到2048 (Merge tiles to 2048)</div>
          </div>
          <div className="flex items-center gap-3">
            <div className="px-3 py-1.5 rounded text-center" style={{ backgroundColor: 'var(--ink-100)' }}>
              <div className="text-[10px]" style={{ color: 'var(--ink-500)' }}>分数 (Score)</div>
              <div className="text-lg font-bold" style={{ color: 'var(--ink-800)' }}>{score}</div>
            </div>
            <div className="px-3 py-1.5 rounded text-center" style={{ backgroundColor: 'var(--ink-100)' }}>
              <div className="text-[10px]" style={{ color: 'var(--ink-500)' }}>最高 (Best)</div>
              <div className="text-lg font-bold" style={{ color: 'var(--ink-800)' }}>{bestScore}</div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 mb-3">
          <button onClick={handleNewGame}
            className="flex items-center gap-1 px-3 py-1.5 rounded text-sm transition-all hover:scale-[1.02]"
            style={{ backgroundColor: 'var(--ink-800)', color: 'var(--ink-50)' }}>
            <RotateCcw size={14} /> 新局 (New)
          </button>
          <button onClick={handleUndo} disabled={history.length === 0}
            className="flex items-center gap-1 px-3 py-1.5 rounded text-sm border transition-all hover:scale-[1.02] disabled:opacity-40"
            style={{ borderColor: 'var(--ink-400)', color: 'var(--ink-700)' }}>
            <Undo2 size={14} /> 撤销 (Undo) {history.length > 0 ? `(${Math.min(3, history.length)})` : ''}
          </button>
        </div>
      </div>

      {/* Board */}
      <div className="flex-1 flex items-start justify-center pt-2">
        <div className="relative" style={{
          width: GRID_SIZE * tileSize + (GRID_SIZE + 1) * gap,
          height: GRID_SIZE * tileSize + (GRID_SIZE + 1) * gap,
          backgroundColor: 'var(--ink-300)',
          borderRadius: '8px',
          padding: `${gap}px`,
        }}>
          {/* Empty cells */}
          {Array.from({ length: GRID_SIZE }, (_, r) =>
            Array.from({ length: GRID_SIZE }, (_, c) => (
              <div key={`bg-${r}-${c}`} className="absolute rounded-md"
                style={{
                  left: gap + c * (tileSize + gap),
                  top: gap + r * (tileSize + gap),
                  width: tileSize,
                  height: tileSize,
                  backgroundColor: 'var(--ink-200)',
                }} />
            ))
          )}

          {/* Tiles */}
          {board.map((row, r) =>
            row.map((val, c) => {
              if (val === null) return null;
              const colors = TILE_COLORS[val] || { bg: '#1a1a1a', text: 'white' };
              return (
                <div key={`tile-${r}-${c}-${val}`} className="absolute rounded-md flex items-center justify-center font-bold select-none"
                  style={{
                    left: gap + c * (tileSize + gap),
                    top: gap + r * (tileSize + gap),
                    width: tileSize,
                    height: tileSize,
                    background: colors.bg,
                    color: colors.text,
                    fontSize: val >= 1000 ? 22 : val >= 100 ? 26 : 30,
                    fontFamily: '"Noto Serif SC", serif',
                    transition: 'all 0.12s ease',
                    boxShadow: val >= 2048 ? '0 0 12px rgba(184,134,11,0.4)' : 'none',
                    zIndex: 5,
                  }}>
                  {val}
                </div>
              );
            })
          )}

          {/* Game Over Overlay */}
          {gameOver && (
            <div className="absolute inset-0 flex items-center justify-center z-20 rounded-lg" style={{ backgroundColor: 'rgba(26,26,26,0.75)' }}>
              <div className="text-center p-5 rounded-lg" style={{ backgroundColor: 'var(--ink-100)' }}>
                <div className="text-xl font-bold mb-2" style={{ color: 'var(--ink-800)' }}>游戏结束 (Game Over)</div>
                <div className="text-sm mb-3" style={{ color: 'var(--ink-600)' }}>分数: {score}</div>
                <button onClick={handleNewGame}
                  className="px-4 py-2 rounded text-sm transition-all hover:scale-[1.02]"
                  style={{ backgroundColor: 'var(--ink-800)', color: 'var(--ink-50)' }}>
                  再来一局 (Play Again)
                </button>
              </div>
            </div>
          )}

          {/* Win Overlay */}
          {won && !wonContinue && (
            <div className="absolute inset-0 flex items-center justify-center z-20 rounded-lg" style={{ backgroundColor: 'rgba(184,134,11,0.3)' }}>
              <div className="text-center p-5 rounded-lg" style={{ backgroundColor: 'var(--ink-100)', boxShadow: '0 12px 40px rgba(26,26,26,0.14)' }}>
                <Trophy size={32} style={{ color: 'var(--warning)' }} className="mx-auto mb-2" />
                <div className="text-xl font-bold mb-2" style={{ color: 'var(--warning)' }}>恭喜! 你达到了2048!</div>
                <div className="flex gap-2 justify-center">
                  <button onClick={handleContinue}
                    className="px-4 py-2 rounded text-sm transition-all hover:scale-[1.02]"
                    style={{ backgroundColor: 'var(--success)', color: 'white' }}>
                    继续 (Continue)
                  </button>
                  <button onClick={handleNewGame}
                    className="px-4 py-2 rounded text-sm border transition-all hover:scale-[1.02]"
                    style={{ borderColor: 'var(--ink-400)', color: 'var(--ink-700)' }}>
                    新局 (New)
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Controls hint */}
      <div className="pb-4 text-center">
        <div className="flex items-center justify-center gap-1 text-xs mb-1" style={{ color: 'var(--ink-400)' }}>
          <ArrowLeft size={12} /><ArrowRight size={12} /><ArrowUp size={12} /><ArrowDown size={12} />
          <span>方向键或滑动移动 (Arrow keys or swipe)</span>
        </div>
      </div>
    </div>
  );
}

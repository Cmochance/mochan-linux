import { useState, useCallback, useEffect, useRef } from 'react';
import { RotateCcw, Lightbulb, Check, Eraser, Pencil, Wand2, Pause, Play, Timer, Trophy } from 'lucide-react';

interface Cell {
  value: number | null;
  given: boolean;
  candidates: Set<number>;
  error: boolean;
}

type Board = Cell[][];
type Difficulty = 'easy' | 'medium' | 'hard';

const DIFFICULTY_GIVENS: Record<Difficulty, number> = { easy: 38, medium: 30, hard: 24 };

function createEmptyBoard(): Board {
  return Array.from({ length: 9 }, () =>
    Array.from({ length: 9 }, () => ({ value: null, given: false, candidates: new Set<number>(), error: false }))
  );
}

function cloneBoard(board: Board): Board {
  return board.map(row => row.map(cell => ({
    ...cell,
    candidates: new Set(cell.candidates),
  })));
}

function isValidPlacement(board: Board, row: number, col: number, num: number): boolean {
  for (let i = 0; i < 9; i++) {
    if (i !== col && board[row][i].value === num) return false;
    if (i !== row && board[i][col].value === num) return false;
  }
  const boxRow = Math.floor(row / 3) * 3;
  const boxCol = Math.floor(col / 3) * 3;
  for (let r = boxRow; r < boxRow + 3; r++) {
    for (let c = boxCol; c < boxCol + 3; c++) {
      if ((r !== row || c !== col) && board[r][c].value === num) return false;
    }
  }
  return true;
}

function solveBoard(board: Board): boolean {
  for (let row = 0; row < 9; row++) {
    for (let col = 0; col < 9; col++) {
      if (board[row][col].value === null) {
        const nums = [1, 2, 3, 4, 5, 6, 7, 8, 9].sort(() => Math.random() - 0.5);
        for (const num of nums) {
          if (isValidPlacement(board, row, col, num)) {
            board[row][col].value = num;
            if (solveBoard(board)) return true;
            board[row][col].value = null;
          }
        }
        return false;
      }
    }
  }
  return true;
}

function generateCompleteBoard(): Board {
  const board = createEmptyBoard();
  solveBoard(board);
  return board;
}

function removeCells(board: Board, count: number): Board {
  const newBoard = cloneBoard(board);
  const positions: [number, number][] = [];
  for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) positions.push([r, c]);
  const shuffled = positions.sort(() => Math.random() - 0.5);
  let removed = 0;
  for (const [r, c] of shuffled) {
    if (removed >= count) break;
    const backup = newBoard[r][c].value;
    newBoard[r][c].value = null;
    // Check if still has unique solution
    const testBoard = cloneBoard(newBoard);
    let solutions = 0;
    const countSolutions = (b: Board): boolean => {
      if (solutions > 1) return false;
      for (let row = 0; row < 9; row++) {
        for (let col = 0; col < 9; col++) {
          if (b[row][col].value === null) {
            for (let n = 1; n <= 9; n++) {
              if (isValidPlacement(b, row, col, n)) {
                b[row][col].value = n;
                if (!countSolutions(b)) { b[row][col].value = null; return false; }
                b[row][col].value = null;
              }
            }
            return true;
          }
        }
      }
      solutions++;
      return solutions <= 1;
    };
    countSolutions(cloneBoard(testBoard));
    if (solutions === 1) {
      removed++;
    } else {
      newBoard[r][c].value = backup;
    }
  }
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      if (newBoard[r][c].value !== null) {
        newBoard[r][c].given = true;
      }
    }
  }
  return newBoard;
}

function generatePuzzle(difficulty: Difficulty, seed?: number): Board {
  // Use seed for daily puzzle
  const originalRandom = Math.random;
  if (seed !== undefined) {
    let s = seed;
    const seededRandom = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
    (Math as unknown as { random: () => number }).random = seededRandom;
  }
  const complete = generateCompleteBoard();
  const toRemove = 81 - DIFFICULTY_GIVENS[difficulty];
  const puzzle = removeCells(complete, toRemove);
  if (seed !== undefined) {
    (Math as unknown as { random: () => number }).random = originalRandom;
  }
  return puzzle;
}

function solveWithBacktracking(board: Board): Board | null {
  const b = cloneBoard(board);
  for (let row = 0; row < 9; row++) {
    for (let col = 0; col < 9; col++) {
      if (b[row][col].value === null) {
        for (let n = 1; n <= 9; n++) {
          if (isValidPlacement(b, row, col, n)) {
            b[row][col].value = n;
            const result = solveWithBacktracking(b);
            if (result) return result;
            b[row][col].value = null;
          }
        }
        return null;
      }
    }
  }
  return b;
}

export default function Sudoku() {
  const [board, setBoard] = useState<Board>(() => generatePuzzle('easy'));
  const [difficulty, setDifficulty] = useState<Difficulty>('easy');
  const [selectedCell, setSelectedCell] = useState<{ row: number; col: number } | null>(null);
  const [pencilMode, setPencilMode] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [paused, setPaused] = useState(false);
  const [gameWon, setGameWon] = useState(false);
  const [mistakes, setMistakes] = useState(0);
  const [hintsLeft, setHintsLeft] = useState(5);
  const [showConflict, setShowConflict] = useState(true);
  const [dailyMode, setDailyMode] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!paused && !gameWon) {
      timerRef.current = setInterval(() => setElapsed(e => e + 1), 1000);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [paused, gameWon]);

  useEffect(() => {
    // Check win
    const isFull = board.every(row => row.every(cell => cell.value !== null));
    if (isFull) {
      const hasErrors = board.some(row => row.some(cell => {
        if (!cell.value) return false;
        return !isValidPlacement(board, board.indexOf(row), row.indexOf(cell), cell.value);
      }));
      if (!hasErrors) setGameWon(true);
    }
  }, [board]);

  const handleCellClick = useCallback((row: number, col: number) => {
    if (paused || gameWon || board[row][col].given) return;
    setSelectedCell({ row, col });
  }, [paused, gameWon, board]);

  const handleNumberInput = useCallback((num: number) => {
    if (!selectedCell || paused || gameWon) return;
    const { row, col } = selectedCell;
    if (board[row][col].given) return;
    setBoard(prev => {
      const newBoard = cloneBoard(prev);
      if (pencilMode) {
        if (newBoard[row][col].candidates.has(num)) {
          newBoard[row][col].candidates.delete(num);
        } else {
          newBoard[row][col].candidates.add(num);
        }
        newBoard[row][col].value = null;
      } else {
        newBoard[row][col].value = num;
        newBoard[row][col].candidates.clear();
        if (showConflict && !isValidPlacement(newBoard, row, col, num)) {
          newBoard[row][col].error = true;
          setMistakes(m => m + 1);
        } else {
          newBoard[row][col].error = false;
        }
      }
      return newBoard;
    });
  }, [selectedCell, pencilMode, paused, gameWon, showConflict, board]);

  const handleErase = useCallback(() => {
    if (!selectedCell || paused || gameWon) return;
    const { row, col } = selectedCell;
    if (board[row][col].given) return;
    setBoard(prev => {
      const newBoard = cloneBoard(prev);
      newBoard[row][col].value = null;
      newBoard[row][col].candidates.clear();
      newBoard[row][col].error = false;
      return newBoard;
    });
  }, [selectedCell, paused, gameWon, board]);

  const handleHint = useCallback(() => {
    if (hintsLeft <= 0 || paused || gameWon) return;
    const solution = solveWithBacktracking(board);
    if (!solution) return;
    const emptyCells: [number, number][] = [];
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (!board[r][c].given && board[r][c].value === null) {
          emptyCells.push([r, c]);
        }
      }
    }
    if (emptyCells.length === 0) return;
    const [hr, hc] = emptyCells[Math.floor(Math.random() * emptyCells.length)];
    setBoard(prev => {
      const newBoard = cloneBoard(prev);
      newBoard[hr][hc].value = solution[hr][hc].value;
      newBoard[hr][hc].candidates.clear();
      newBoard[hr][hc].error = false;
      return newBoard;
    });
    setHintsLeft(h => h - 1);
    setSelectedCell({ row: hr, col: hc });
  }, [board, hintsLeft, paused, gameWon]);

  const handleSolve = useCallback(() => {
    if (paused || gameWon) return;
    const solution = solveWithBacktracking(board);
    if (solution) {
      setBoard(prev => {
        const newBoard = cloneBoard(prev);
        for (let r = 0; r < 9; r++) {
          for (let c = 0; c < 9; c++) {
            if (!newBoard[r][c].given) {
              newBoard[r][c].value = solution[r][c].value;
              newBoard[r][c].candidates.clear();
              newBoard[r][c].error = false;
            }
          }
        }
        return newBoard;
      });
    }
  }, [board, paused, gameWon]);

  const handleNewGame = useCallback((diff?: Difficulty) => {
    const d = diff || difficulty;
    if (dailyMode) {
      const today = new Date();
      const seed = today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate();
      setBoard(generatePuzzle(d, seed + (d === 'easy' ? 0 : d === 'medium' ? 1000000 : 2000000)));
    } else {
      setBoard(generatePuzzle(d));
    }
    setSelectedCell(null);
    setElapsed(0);
    setPaused(false);
    setGameWon(false);
    setMistakes(0);
    setHintsLeft(5);
    setPencilMode(false);
  }, [difficulty, dailyMode]);

  const handleDifficultyChange = useCallback((d: Difficulty) => {
    setDifficulty(d);
    handleNewGame(d);
  }, [handleNewGame]);

  const handleDailyMode = useCallback(() => {
    setDailyMode(true);
    const today = new Date();
    const seed = today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate();
    setBoard(generatePuzzle(difficulty, seed + (difficulty === 'easy' ? 0 : difficulty === 'medium' ? 1000000 : 2000000)));
    setElapsed(0);
    setPaused(false);
    setGameWon(false);
    setMistakes(0);
    setHintsLeft(5);
    setPencilMode(false);
  }, [difficulty]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (paused || gameWon) return;
      const key = e.key;
      if (key >= '1' && key <= '9') {
        handleNumberInput(Number(key));
      } else if (key === 'Backspace' || key === 'Delete') {
        handleErase();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleNumberInput, handleErase, paused, gameWon]);

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  return (
    <div className="w-full h-full flex flex-col" style={{ backgroundColor: 'var(--ink-50)' }}>
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 border-b" style={{ borderColor: 'var(--ink-200)' }}>
        <div className="flex items-center gap-2">
          <button onClick={() => handleNewGame()} className="flex items-center gap-1 px-3 py-1.5 rounded text-sm transition-all hover:scale-[1.02]"
            style={{ backgroundColor: 'var(--ink-800)', color: 'var(--ink-50)' }}>
            <RotateCcw size={14} /> 新局 (New)
          </button>
          <button onClick={handleHint} disabled={hintsLeft <= 0}
            className="flex items-center gap-1 px-3 py-1.5 rounded text-sm border transition-all hover:scale-[1.02] disabled:opacity-40"
            style={{ borderColor: 'var(--ink-400)', color: 'var(--ink-700)' }}>
            <Lightbulb size={14} /> 提示 ({hintsLeft})
          </button>
          <button onClick={handleSolve}
            className="flex items-center gap-1 px-3 py-1.5 rounded text-sm border transition-all hover:scale-[1.02]"
            style={{ borderColor: 'var(--ink-400)', color: 'var(--ink-700)' }}>
            <Wand2 size={14} /> 解答 (Solve)
          </button>
          <button onClick={() => setPencilMode(p => !p)}
            className="flex items-center gap-1 px-3 py-1.5 rounded text-sm border transition-all hover:scale-[1.02]"
            style={{
              borderColor: pencilMode ? 'var(--cinnabar)' : 'var(--ink-400)',
              color: pencilMode ? 'var(--cinnabar)' : 'var(--ink-700)',
              backgroundColor: pencilMode ? 'rgba(179,57,47,0.08)' : 'transparent',
            }}>
            <Pencil size={14} /> 铅笔 (Pencil)
          </button>
          <button onClick={() => setPaused(p => !p)}
            className="flex items-center gap-1 px-3 py-1.5 rounded text-sm border transition-all hover:scale-[1.02]"
            style={{ borderColor: 'var(--ink-400)', color: 'var(--ink-700)' }}>
            {paused ? <Play size={14} /> : <Pause size={14} />}
          </button>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 text-sm" style={{ color: 'var(--ink-600)' }}>
            <Timer size={14} /> {formatTime(elapsed)}
          </div>
          <div className="text-sm" style={{ color: 'var(--ink-600)' }}>
            错误 (Mistakes): {mistakes}
          </div>
          <select value={difficulty} onChange={e => handleDifficultyChange(e.target.value as Difficulty)}
            className="text-sm rounded px-2 py-1 border" style={{ borderColor: 'var(--ink-300)', backgroundColor: 'var(--ink-50)' }}>
            <option value="easy">简单 (Easy)</option>
            <option value="medium">中等 (Medium)</option>
            <option value="hard">困难 (Hard)</option>
          </select>
          <button onClick={handleDailyMode}
            className="text-sm px-2 py-1 rounded border transition-all hover:scale-[1.02]"
            style={{ borderColor: dailyMode ? 'var(--cinnabar)' : 'var(--ink-300)', color: dailyMode ? 'var(--cinnabar)' : 'var(--ink-600)' }}>
            每日 (Daily)
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Board */}
        <div className="flex-1 flex items-center justify-center overflow-auto p-2">
          <div className="flex flex-col items-center gap-4">
            {paused && (
              <div className="absolute inset-0 flex items-center justify-center z-20" style={{ backgroundColor: 'rgba(26,26,26,0.5)' }}>
                <div className="text-xl font-medium" style={{ color: 'white' }}>暂停 (Paused)</div>
              </div>
            )}
            {gameWon && (
              <div className="absolute inset-0 flex items-center justify-center z-20" style={{ backgroundColor: 'rgba(26,26,26,0.5)' }}>
                <div className="text-center p-6 rounded-lg" style={{ backgroundColor: 'var(--ink-100)', boxShadow: '0 12px 40px rgba(26,26,26,0.14)' }}>
                  <Trophy size={40} style={{ color: 'var(--warning)' }} className="mx-auto mb-2" />
                  <div className="text-xl font-bold mb-2" style={{ color: 'var(--success)' }}>恭喜完成! (Solved!)</div>
                  <div className="text-sm" style={{ color: 'var(--ink-600)' }}>时间: {formatTime(elapsed)} | 错误: {mistakes}</div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-9 gap-0" style={{ border: '2px solid var(--ink-800)', borderRadius: '4px' }}>
              {Array.from({ length: 9 }, (_, row) =>
                Array.from({ length: 9 }, (_, col) => {
                  const cell = board[row][col];
                  const isSelected = selectedCell?.row === row && selectedCell?.col === col;
                  const isRelated = selectedCell && (selectedCell.row === row || selectedCell.col === col ||
                    (Math.floor(selectedCell.row / 3) === Math.floor(row / 3) && Math.floor(selectedCell.col / 3) === Math.floor(col / 3)));
                  const thickBorderRight = col === 2 || col === 5;
                  const thickBorderBottom = row === 2 || row === 5;
                  return (
                    <div key={`${row}-${col}`}
                      className="flex items-center justify-center cursor-pointer relative transition-colors"
                      style={{
                        width: 46,
                        height: 46,
                        borderRight: thickBorderRight ? '2px solid var(--ink-800)' : '1px solid var(--ink-300)',
                        borderBottom: thickBorderBottom ? '2px solid var(--ink-800)' : '1px solid var(--ink-300)',
                        backgroundColor: cell.error ? 'rgba(179,57,47,0.08)' : isSelected ? 'rgba(26,26,26,0.05)' : isRelated ? 'rgba(26,26,26,0.02)' : 'transparent',
                      }}
                      onClick={() => handleCellClick(row, col)}>
                      {cell.value !== null ? (
                        <span className="text-xl font-bold" style={{
                          color: cell.given ? 'var(--ink-900)' : cell.error ? 'var(--cinnabar)' : 'var(--cinnabar)',
                          fontFamily: '"Noto Serif SC", serif',
                        }}>
                          {cell.value}
                        </span>
                      ) : (
                        <div className="grid grid-cols-3 gap-0 w-full h-full p-0.5">
                          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => (
                            <div key={n} className="flex items-center justify-center">
                              {cell.candidates.has(n) && (
                                <span className="text-[8px]" style={{ color: 'var(--ink-500)' }}>{n}</span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* Number pad */}
            <div className="flex items-center gap-1">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
                <button key={num} onClick={() => handleNumberInput(num)}
                  className="w-10 h-10 rounded flex items-center justify-center text-base font-medium transition-all hover:scale-[1.05] active:scale-[0.95]"
                  style={{
                    backgroundColor: 'var(--ink-100)',
                    border: '1px solid var(--ink-300)',
                    color: 'var(--ink-800)',
                    fontFamily: '"Noto Serif SC", serif',
                  }}>
                  {num}
                </button>
              ))}
              <button onClick={handleErase}
                className="w-10 h-10 rounded flex items-center justify-center text-sm transition-all hover:scale-[1.05] active:scale-[0.95]"
                style={{ backgroundColor: 'var(--ink-100)', border: '1px solid var(--ink-300)', color: 'var(--ink-600)' }}>
                <Eraser size={16} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

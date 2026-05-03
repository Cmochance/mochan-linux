import { useState, useCallback, useEffect, useRef } from 'react';
import { RotateCcw, Undo2, Brain, Trophy, Circle, User } from 'lucide-react';

type Stone = 'black' | 'white' | null;
type Board = Stone[][];
type Position = { row: number; col: number };

const BOARD_SIZE = 15;

function createEmptyBoard(): Board {
  return Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(null) as Stone[]);
}

function cloneBoard(board: Board): Board {
  return board.map(row => [...row]);
}

function checkWin(board: Board, row: number, col: number, color: Stone): Position[] | null {
  if (!color) return null;
  const directions = [[0, 1], [1, 0], [1, 1], [1, -1]];
  for (const [dr, dc] of directions) {
    const line: Position[] = [{ row, col }];
    // Forward
    for (let i = 1; i < 5; i++) {
      const r = row + dr * i, c = col + dc * i;
      if (r < 0 || r >= BOARD_SIZE || c < 0 || c >= BOARD_SIZE || board[r][c] !== color) break;
      line.push({ row: r, col: c });
    }
    // Backward
    for (let i = 1; i < 5; i++) {
      const r = row - dr * i, c = col - dc * i;
      if (r < 0 || r >= BOARD_SIZE || c < 0 || c >= BOARD_SIZE || board[r][c] !== color) break;
      line.push({ row: r, col: c });
    }
    if (line.length >= 5) return line;
  }
  return null;
}

function evaluateDirection(board: Board, row: number, col: number, dr: number, dc: number, color: Stone): number {
  if (!color) return 0;
  const opponent = color === 'black' ? 'white' : 'black';
  let count = 0;
  let blocked = 0;
  let space = 0;
  for (let i = 1; i < 5; i++) {
    const r = row + dr * i, c = col + dc * i;
    if (r < 0 || r >= BOARD_SIZE || c < 0 || c >= BOARD_SIZE) { blocked++; break; }
    if (board[r][c] === color) count++;
    else if (board[r][c] === null) { space++; break; }
    else { blocked++; break; }
  }
  for (let i = 1; i < 5; i++) {
    const r = row - dr * i, c = col - dc * i;
    if (r < 0 || r >= BOARD_SIZE || c < 0 || c >= BOARD_SIZE) { blocked++; break; }
    if (board[r][c] === color) count++;
    else if (board[r][c] === null) { space++; break; }
    else { blocked++; break; }
  }
  if (count === 0) return 0;
  if (count >= 4) return 100000;
  if (blocked === 2) return 0;
  const baseScores = [0, 10, 100, 1000, 10000];
  return baseScores[count] * (blocked === 0 ? 2 : 1) * (space > 0 ? 1.5 : 1);
}

function evaluatePosition(board: Board, row: number, col: number, color: Stone): number {
  const directions = [[0, 1], [1, 0], [1, 1], [1, -1]];
  let score = 0;
  for (const [dr, dc] of directions) {
    score += evaluateDirection(board, row, col, dr, dc, color);
  }
  // Center bonus
  const center = Math.floor(BOARD_SIZE / 2);
  const dist = Math.abs(row - center) + Math.abs(col - center);
  score += Math.max(0, 10 - dist);
  return score;
}

function getEmptyPositions(board: Board): Position[] {
  const positions: Position[] = [];
  // Only consider positions near existing stones for efficiency
  const hasNeighbor = (r: number, c: number) => {
    for (let dr = -2; dr <= 2; dr++) {
      for (let dc = -2; dc <= 2; dc++) {
        if (dr === 0 && dc === 0) continue;
        const nr = r + dr, nc = c + dc;
        if (nr >= 0 && nr < BOARD_SIZE && nc >= 0 && nc < BOARD_SIZE && board[nr][nc]) return true;
      }
    }
    return false;
  };
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (!board[r][c] && hasNeighbor(r, c)) positions.push({ row: r, col: c });
    }
  }
  if (positions.length === 0) {
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        if (!board[r][c]) positions.push({ row: r, col: c });
      }
    }
  }
  return positions;
}

function minimax(board: Board, depth: number, alpha: number, beta: number, isMaximizing: boolean, aiColor: Stone): number {
  if (depth === 0) {
    let score = 0;
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        if (!board[r][c]) {
          score += evaluatePosition(board, r, c, aiColor) * 0.1;
          score -= evaluatePosition(board, r, c, aiColor === 'black' ? 'white' : 'black') * 0.08;
        }
      }
    }
    return score;
  }
  const color = isMaximizing ? aiColor : (aiColor === 'black' ? 'white' : 'black');
  const positions = getEmptyPositions(board);
  if (positions.length === 0) return 0;
  const scored = positions.map(p => ({
    ...p,
    score: evaluatePosition(board, p.row, p.col, color),
  })).sort((a, b) => b.score - a.score).slice(0, Math.min(12, positions.length));
  if (isMaximizing) {
    let maxEval = -Infinity;
    for (const p of scored) {
      board[p.row][p.col] = aiColor;
      const win = checkWin(board, p.row, p.col, aiColor);
      board[p.row][p.col] = null;
      if (win) return 999999;
      const eval_ = minimax(board, depth - 1, alpha, beta, false, aiColor);
      maxEval = Math.max(maxEval, eval_);
      alpha = Math.max(alpha, eval_);
      if (beta <= alpha) break;
    }
    return maxEval;
  } else {
    let minEval = Infinity;
    const opp = aiColor === 'black' ? 'white' : 'black';
    for (const p of scored) {
      board[p.row][p.col] = opp;
      const win = checkWin(board, p.row, p.col, opp);
      board[p.row][p.col] = null;
      if (win) return -999999;
      const eval_ = minimax(board, depth - 1, alpha, beta, true, aiColor);
      minEval = Math.min(minEval, eval_);
      beta = Math.min(beta, eval_);
      if (beta <= alpha) break;
    }
    return minEval;
  }
}

function getAIMove(board: Board, difficulty: number): Position | null {
  const empty = getEmptyPositions(board);
  if (empty.length === 0) return null;
  // Check for immediate win
  const aiColor = 'white';
  for (const p of empty) {
    board[p.row][p.col] = aiColor;
    const win = checkWin(board, p.row, p.col, aiColor);
    board[p.row][p.col] = null;
    if (win) return p;
  }
  // Block opponent win
  const oppColor = 'black';
  for (const p of empty) {
    board[p.row][p.col] = oppColor;
    const win = checkWin(board, p.row, p.col, oppColor);
    board[p.row][p.col] = null;
    if (win) return p;
  }
  if (difficulty === 1) {
    // Easy: mostly random near existing stones
    const scored = empty.map(p => ({
      ...p,
      score: evaluatePosition(board, p.row, p.col, aiColor),
    })).sort((a, b) => b.score - a.score);
    return scored[Math.floor(Math.random() * Math.min(5, scored.length))] || empty[Math.floor(Math.random() * empty.length)];
  }
  const depth = difficulty === 2 ? 2 : 3;
  let bestMove = empty[0];
  let bestScore = -Infinity;
  const scored = empty.map(p => ({
    ...p,
    score: evaluatePosition(board, p.row, p.col, aiColor),
  })).sort((a, b) => b.score - a.score).slice(0, Math.min(15, empty.length));
  for (const p of scored) {
    board[p.row][p.col] = aiColor;
    const score = minimax(board, depth - 1, -Infinity, Infinity, false, aiColor);
    board[p.row][p.col] = null;
    if (score > bestScore) {
      bestScore = score;
      bestMove = p;
    }
  }
  return bestMove;
}

function coordLabel(row: number, col: number): string {
  return `${String.fromCharCode(65 + col)}${BOARD_SIZE - row}`;
}

export default function Gomoku() {
  const [board, setBoard] = useState<Board>(createEmptyBoard);
  const [currentPlayer, setCurrentPlayer] = useState<'black' | 'white'>('black');
  const [winner, setWinner] = useState<string | null>(null);
  const [winningLine, setWinningLine] = useState<Position[] | null>(null);
  const [moveHistory, setMoveHistory] = useState<string[]>([]);
  const [vsAI, setVsAI] = useState(true);
  const [difficulty, setDifficulty] = useState(2);
  const [aiThinking, setAiThinking] = useState(false);
  const [scores, setScores] = useState({ black: 0, white: 0 });
  const [hoverCell, setHoverCell] = useState<Position | null>(null);
  const prevBoardsRef = useRef<{ board: Board; player: 'black' | 'white' }[]>([]);

  useEffect(() => {
    if (vsAI && currentPlayer === 'white' && !winner && !aiThinking) {
      setAiThinking(true);
      const timer = setTimeout(() => {
        const move = getAIMove(board, difficulty);
        if (move) {
          handleMove(move.row, move.col, true);
        }
        setAiThinking(false);
      }, 300 + Math.random() * 400);
      return () => clearTimeout(timer);
    }
  }, [currentPlayer, winner, vsAI, difficulty, board, aiThinking]);

  const handleMove = useCallback((row: number, col: number, fromAI = false) => {
    setBoard(prev => {
      if (prev[row][col] !== null || winner) return prev;
      const player = fromAI ? 'white' : currentPlayer;
      const newBoard = cloneBoard(prev);
      newBoard[row][col] = player;
      const win = checkWin(newBoard, row, col, player);
      if (win) {
        setWinningLine(win);
        setWinner(player === 'black' ? '黑棋 (Black)' : '白棋 (White)');
        setScores(s => ({ ...s, [player]: s[player as keyof typeof s] + 1 }));
      } else {
        const isFull = newBoard.every(r => r.every(c => c !== null));
        if (isFull) {
          setWinner('平局 (Draw)');
        } else {
          setCurrentPlayer(p => p === 'black' ? 'white' : 'black');
        }
      }
      setMoveHistory(h => [...h, `${player === 'black' ? '黑' : '白'} ${coordLabel(row, col)}`]);
      return newBoard;
    });
  }, [currentPlayer, winner]);

  const handleCellClick = useCallback((row: number, col: number) => {
    if (winner || aiThinking) return;
    if (vsAI && currentPlayer !== 'black') return;
    if (board[row][col] !== null) return;
    prevBoardsRef.current.push({ board: cloneBoard(board), player: currentPlayer });
    if (prevBoardsRef.current.length > 20) prevBoardsRef.current.shift();
    handleMove(row, col);
  }, [board, currentPlayer, winner, aiThinking, vsAI, handleMove]);

  const handleUndo = useCallback(() => {
    if (prevBoardsRef.current.length === 0) return;
    // Undo AI move too if playing vs AI
    if (vsAI && prevBoardsRef.current.length >= 2) {
      prevBoardsRef.current.pop();
    }
    const prev = prevBoardsRef.current.pop()!;
    setBoard(prev.board);
    setCurrentPlayer(prev.player);
    setWinner(null);
    setWinningLine(null);
  }, [vsAI]);

  const handleNewGame = useCallback(() => {
    setBoard(createEmptyBoard());
    setCurrentPlayer('black');
    setWinner(null);
    setWinningLine(null);
    setMoveHistory([]);
    setAiThinking(false);
    prevBoardsRef.current = [];
  }, []);

  const cellSize = 28;
  const padding = 18;
  const svgSize = cellSize * (BOARD_SIZE - 1) + padding * 2;

  return (
    <div className="w-full h-full flex flex-col" style={{ backgroundColor: 'var(--ink-50)' }}>
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 border-b" style={{ borderColor: 'var(--ink-200)' }}>
        <div className="flex items-center gap-2">
          <button onClick={handleNewGame} className="flex items-center gap-1 px-3 py-1.5 rounded text-sm transition-all hover:scale-[1.02]"
            style={{ backgroundColor: 'var(--ink-800)', color: 'var(--ink-50)' }}>
            <RotateCcw size={14} /> 新局 (New)
          </button>
          <button onClick={handleUndo} disabled={prevBoardsRef.current.length === 0}
            className="flex items-center gap-1 px-3 py-1.5 rounded text-sm border transition-all hover:scale-[1.02] disabled:opacity-40"
            style={{ borderColor: 'var(--ink-400)', color: 'var(--ink-700)' }}>
            <Undo2 size={14} /> 悔棋 (Undo)
          </button>
          <div className="flex items-center gap-1 px-3 py-1.5 rounded text-sm"
            style={{ backgroundColor: 'var(--ink-100)', color: 'var(--ink-700)' }}>
            {winner ? (
              <><Trophy size={14} /> {winner} 胜!</>
            ) : (
              <><Circle size={14} fill={currentPlayer === 'black' ? 'var(--ink-900)' : 'var(--ink-50)'} stroke="var(--ink-300)" />
                {currentPlayer === 'black' ? '黑棋 (Black)' : '白棋 (White)'}
                {aiThinking && <span className="ml-1 animate-pulse" style={{ color: 'var(--cinnabar)' }}>(思考中...)</span>}
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-3 text-sm" style={{ color: 'var(--ink-600)' }}>
            <span className="flex items-center gap-1">
              <Circle size={12} fill="var(--ink-900)" /> {scores.black}
            </span>
            <span className="flex items-center gap-1">
              <Circle size={12} fill="var(--ink-50)" stroke="var(--ink-300)" /> {scores.white}
            </span>
          </div>
          <label className="flex items-center gap-1 text-sm cursor-pointer" style={{ color: 'var(--ink-600)' }}>
            <input type="checkbox" checked={vsAI} onChange={e => { setVsAI(e.target.checked); handleNewGame(); }}
              className="cursor-pointer" />
            <Brain size={14} /> 对电脑 (vs AI)
          </label>
          {vsAI && (
            <select value={difficulty} onChange={e => { setDifficulty(Number(e.target.value)); handleNewGame(); }}
              className="text-sm rounded px-2 py-1 border" style={{ borderColor: 'var(--ink-300)', backgroundColor: 'var(--ink-50)' }}>
              <option value={1}>简单 (Easy)</option>
              <option value={2}>中等 (Medium)</option>
              <option value={3}>困难 (Hard)</option>
            </select>
          )}
          {!vsAI && (
            <label className="flex items-center gap-1 text-sm cursor-pointer" style={{ color: 'var(--ink-600)' }}>
              <User size={14} /> 双人对战 (PvP)
            </label>
          )}
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Board */}
        <div className="flex-1 flex items-center justify-center overflow-auto p-2">
          <div className="relative select-none" style={{ width: svgSize, height: svgSize }}>
            <svg width={svgSize} height={svgSize} className="absolute inset-0">
              <rect width={svgSize} height={svgSize} rx={4} fill="#e8e4df" fillOpacity={0.5} />
              {Array.from({ length: BOARD_SIZE }, (_, i) => (
                <g key={`grid-${i}`}>
                  <line x1={padding + i * cellSize} y1={padding} x2={padding + i * cellSize} y2={padding + (BOARD_SIZE - 1) * cellSize}
                    stroke="var(--ink-800)" strokeWidth={1} strokeOpacity={0.7} />
                  <line x1={padding} y1={padding + i * cellSize} x2={padding + (BOARD_SIZE - 1) * cellSize} y2={padding + i * cellSize}
                    stroke="var(--ink-800)" strokeWidth={1} strokeOpacity={0.7} />
                </g>
              ))}
            </svg>
            <svg width={svgSize} height={svgSize} className="absolute inset-0 pointer-events-auto">
              {Array.from({ length: BOARD_SIZE }, (_, row) =>
                Array.from({ length: BOARD_SIZE }, (_, col) => {
                  const cx = padding + col * cellSize;
                  const cy = padding + row * cellSize;
                  const stone = board[row][col];
                  const isWinCell = winningLine?.some(p => p.row === row && p.col === col);
                  return (
                    <g key={`cell-${row}-${col}`}>
                      <rect x={cx - cellSize / 2} y={cy - cellSize / 2} width={cellSize} height={cellSize}
                        fill="transparent" cursor="pointer"
                        onClick={() => handleCellClick(row, col)}
                        onMouseEnter={() => setHoverCell({ row, col })}
                        onMouseLeave={() => setHoverCell(null)} />
                      {stone && (
                        <circle cx={cx} cy={cy} r={cellSize * 0.42}
                          fill={stone === 'black' ? 'var(--ink-900)' : 'var(--ink-50)'}
                          stroke={isWinCell ? 'var(--cinnabar)' : stone === 'black' ? 'var(--ink-900)' : 'var(--ink-300)'}
                          strokeWidth={isWinCell ? 2.5 : 1}
                          style={{
                            filter: isWinCell ? 'drop-shadow(0 0 6px rgba(179,57,47,0.6))' : 'drop-shadow(0 1px 2px rgba(0,0,0,0.2))',
                            transition: 'all 0.15s ease',
                          }} />
                      )}
                      {!stone && hoverCell?.row === row && hoverCell?.col === col && !winner && !aiThinking && (
                        <circle cx={cx} cy={cy} r={cellSize * 0.42}
                          fill={currentPlayer === 'black' ? 'var(--ink-900)' : 'var(--ink-50)'}
                          fillOpacity={0.4}
                          stroke={currentPlayer === 'black' ? 'var(--ink-900)' : 'var(--ink-300)'}
                          strokeWidth={1}
                          pointerEvents="none" />
                      )}
                    </g>
                  );
                })
              )}
            </svg>
          </div>
        </div>

        {/* Info Panel */}
        <div className="w-40 border-l flex flex-col overflow-hidden" style={{ borderColor: 'var(--ink-200)', backgroundColor: 'var(--ink-100)' }}>
          <div className="p-3 space-y-3">
            <div className="text-center">
              <div className="text-xs mb-1" style={{ color: 'var(--ink-500)' }}>当前回合 (Turn)</div>
              {!winner ? (
                <div className="flex items-center justify-center gap-2">
                  <Circle size={18} fill={currentPlayer === 'black' ? 'var(--ink-900)' : 'var(--ink-50)'}
                    stroke={currentPlayer === 'black' ? 'var(--ink-900)' : 'var(--ink-300)'} strokeWidth={1.5} />
                  <span className="text-sm font-medium" style={{ color: 'var(--ink-800)' }}>
                    {currentPlayer === 'black' ? '黑棋' : '白棋'}
                  </span>
                </div>
              ) : (
                <div className="text-sm font-medium" style={{ color: 'var(--cinnabar)' }}>
                  {winner} 胜!
                </div>
              )}
            </div>
            <div className="space-y-1">
              <div className="flex justify-between text-sm" style={{ color: 'var(--ink-700)' }}>
                <span>黑胜 (Black)</span><span>{scores.black}</span>
              </div>
              <div className="flex justify-between text-sm" style={{ color: 'var(--ink-700)' }}>
                <span>白胜 (White)</span><span>{scores.white}</span>
              </div>
              <div className="flex justify-between text-sm" style={{ color: 'var(--ink-700)' }}>
                <span>手数 (Moves)</span><span>{moveHistory.length}</span>
              </div>
            </div>
            <div className="flex-1 overflow-hidden flex flex-col min-h-0">
              <div className="text-xs mb-1" style={{ color: 'var(--ink-500)' }}>棋谱 (History)</div>
              <div className="flex-1 overflow-y-auto text-xs space-y-0.5 max-h-48" style={{ color: 'var(--ink-600)' }}>
                {moveHistory.map((m, i) => (
                  <div key={i} className="flex justify-between">
                    <span>{i + 1}.</span><span>{m}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

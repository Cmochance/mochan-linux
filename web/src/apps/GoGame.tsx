import { useState, useCallback, useEffect, useRef } from 'react';
import { RotateCcw, Flag, SkipForward, Undo2, Trophy, Brain, Circle } from 'lucide-react';

type Stone = 'black' | 'white' | null;
type Board = Stone[][];
type Point = { x: number; y: number };
type GameState = {
  board: Board;
  currentPlayer: 'black' | 'white';
  blackCaptures: number;
  whiteCaptures: number;
  moveHistory: string[];
  lastMove: Point | null;
  koPoint: Point | null;
  moveCount: number;
  consecutivePasses: number;
  gameOver: boolean;
  winner: string | null;
  blackScore: number;
  whiteScore: number;
};

const BOARD_SIZE = 19;
const STAR_POINTS = [3, 9, 15];

function createEmptyBoard(size: number): Board {
  return Array.from({ length: size }, () => Array(size).fill(null) as Stone[]);
}

function cloneBoard(board: Board): Board {
  return board.map(row => [...row]);
}

function getNeighbors(x: number, y: number, size: number): Point[] {
  const neighbors: Point[] = [];
  if (x > 0) neighbors.push({ x: x - 1, y });
  if (x < size - 1) neighbors.push({ x: x + 1, y });
  if (y > 0) neighbors.push({ x, y: y - 1 });
  if (y < size - 1) neighbors.push({ x, y: y + 1 });
  return neighbors;
}

function getGroup(board: Board, x: number, y: number, size: number): { stones: Point[]; liberties: Point[] } {
  const color = board[y][x];
  if (!color) return { stones: [], liberties: [] };
  const visited = new Set<string>();
  const stones: Point[] = [];
  const liberties: Point[] = [];
  const stack = [{ x, y }];
  while (stack.length > 0) {
    const p = stack.pop()!;
    const key = `${p.x},${p.y}`;
    if (visited.has(key)) continue;
    visited.add(key);
    stones.push(p);
    for (const n of getNeighbors(p.x, p.y, size)) {
      if (board[n.y][n.x] === null) {
        const libKey = `${n.x},${n.y}`;
        if (!visited.has(libKey)) {
          visited.add(libKey);
          liberties.push(n);
        }
      } else if (board[n.y][n.x] === color) {
        stack.push(n);
      }
    }
  }
  return { stones, liberties };
}

function getCapturedStones(board: Board, x: number, y: number, size: number, color: 'black' | 'white'): Point[] {
  const opponent = color === 'black' ? 'white' : 'black';
  const captured: Point[] = [];
  const visited = new Set<string>();
  for (const n of getNeighbors(x, y, size)) {
    if (board[n.y][n.x] === opponent) {
      const key = `${n.x},${n.y}`;
      if (visited.has(key)) continue;
      const group = getGroup(board, n.x, n.y, size);
      group.stones.forEach(s => visited.add(`${s.x},${s.y}`));
      if (group.liberties.length === 0) {
        captured.push(...group.stones);
      }
    }
  }
  return captured;
}

function isValidMove(board: Board, x: number, y: number, color: 'black' | 'white', koPoint: Point | null, size: number): boolean {
  if (x < 0 || x >= size || y < 0 || y >= size) return false;
  if (board[y][x] !== null) return false;
  if (koPoint && koPoint.x === x && koPoint.y === y) return false;
  const temp = cloneBoard(board);
  temp[y][x] = color;
  const captured = getCapturedStones(temp, x, y, size, color);
  captured.forEach(c => { temp[c.y][c.x] = null; });
  if (captured.length > 0) return true;
  const group = getGroup(temp, x, y, size);
  if (group.liberties.length === 0) return false;
  return true;
}

function getAllValidMoves(board: Board, color: 'black' | 'white', koPoint: Point | null, size: number): Point[] {
  const moves: Point[] = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (isValidMove(board, x, y, color, koPoint, size)) {
        moves.push({ x, y });
      }
    }
  }
  return moves;
}

function calculateTerritory(board: Board, size: number): { blackTerritory: number; whiteTerritory: number } {
  const visited = new Set<string>();
  let blackTerritory = 0;
  let whiteTerritory = 0;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (board[y][x] !== null) {
        if (board[y][x] === 'black') blackTerritory++;
        else whiteTerritory++;
        continue;
      }
      const key = `${x},${y}`;
      if (visited.has(key)) continue;
      const region: Point[] = [];
      const borders = new Set<string>();
      const stack = [{ x, y }];
      while (stack.length > 0) {
        const p = stack.pop()!;
        const k = `${p.x},${p.y}`;
        if (visited.has(k)) continue;
        visited.add(k);
        region.push(p);
        for (const n of getNeighbors(p.x, p.y, size)) {
          if (board[n.y][n.x] === null) {
            stack.push(n);
          } else {
            borders.add(board[n.y][n.x]!);
          }
        }
      }
      if (borders.size === 1) {
        const owner = borders.values().next().value as string;
        if (owner === 'black') blackTerritory += region.length;
        else whiteTerritory += region.length;
      }
    }
  }
  return { blackTerritory, whiteTerritory };
}

function evaluatePosition(board: Board, size: number): number {
  let score = 0;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (board[y][x] === 'black') score += 1;
      else if (board[y][x] === 'white') score -= 1;
    }
  }
  const { blackTerritory, whiteTerritory } = calculateTerritory(board, size);
  score += (blackTerritory - whiteTerritory) * 0.5;
  return score;
}

function aiMove(board: Board, color: 'black' | 'white', koPoint: Point | null, size: number, difficulty: number): Point | null {
  const validMoves = getAllValidMoves(board, color, koPoint, size);
  if (validMoves.length === 0) return null;
  if (difficulty === 1) {
    return validMoves[Math.floor(Math.random() * validMoves.length)];
  }
  let bestMove = validMoves[0];
  let bestScore = color === 'black' ? -Infinity : Infinity;
  const opponent = color === 'black' ? 'white' : 'black';
  for (const move of validMoves.slice(0, Math.min(validMoves.length, 50))) {
    const temp = cloneBoard(board);
    temp[move.y][move.x] = color;
    const captured = getCapturedStones(temp, move.x, move.y, size, color);
    captured.forEach(c => { temp[c.y][c.x] = null; });
    const capBonus = captured.length * (color === 'black' ? 2 : -2);
    let score = evaluatePosition(temp, size) + capBonus;
    if (difficulty >= 3) {
      const opponentMoves = getAllValidMoves(temp, opponent, null, size);
      if (opponentMoves.length > 0) {
        let worstOppScore = color === 'black' ? Infinity : -Infinity;
        for (const om of opponentMoves.slice(0, Math.min(10, opponentMoves.length))) {
          const temp2 = cloneBoard(temp);
          temp2[om.y][om.x] = opponent;
          const cap2 = getCapturedStones(temp2, om.x, om.y, size, opponent);
          cap2.forEach(c => { temp2[c.y][c.x] = null; });
          const s = evaluatePosition(temp2, size);
          if (color === 'black' ? s < worstOppScore : s > worstOppScore) {
            worstOppScore = s;
          }
        }
        score = score * 0.7 + worstOppScore * 0.3;
      }
    }
    if (color === 'black' ? score > bestScore : score < bestScore) {
      bestScore = score;
      bestMove = move;
    }
  }
  const center = Math.floor(size / 2);
  const cornerMoves = validMoves.filter(m =>
    capturedStonesAtMove(board, m.x, m.y, size, color) > 0
  );
  if (cornerMoves.length > 0 && Math.random() < 0.3) {
    return cornerMoves[Math.floor(Math.random() * cornerMoves.length)];
  }
  return bestMove;
}

function capturedStonesAtMove(board: Board, x: number, y: number, size: number, color: 'black' | 'white'): number {
  const temp = cloneBoard(board);
  temp[y][x] = color;
  return getCapturedStones(temp, x, y, size, color).length;
}

function coordToNotation(x: number, y: number, size: number): string {
  const cols = 'ABCDEFGHJKLMNOPQRST';
  return `${cols[x]}${size - y}`;
}

export default function GoGame() {
  const [gameState, setGameState] = useState<GameState>({
    board: createEmptyBoard(BOARD_SIZE),
    currentPlayer: 'black',
    blackCaptures: 0,
    whiteCaptures: 0,
    moveHistory: [],
    lastMove: null,
    koPoint: null,
    moveCount: 0,
    consecutivePasses: 0,
    gameOver: false,
    winner: null,
    blackScore: 0,
    whiteScore: 0,
  });
  const [hoverCell, setHoverCell] = useState<Point | null>(null);
  const [aiDifficulty, setAiDifficulty] = useState(2);
  const [vsAI, setVsAI] = useState(true);
  const [aiThinking, setAiThinking] = useState(false);
  const [showScore, setShowScore] = useState(false);
  const prevStatesRef = useRef<GameState[]>([]);
  const [flashCell, setFlashCell] = useState<Point | null>(null);

  const handlePlaceStone = useCallback((x: number, y: number) => {
    setGameState(prev => {
      if (prev.gameOver || prev.board[y][x] !== null) return prev;
      if (!isValidMove(prev.board, x, y, prev.currentPlayer, prev.koPoint, BOARD_SIZE)) {
        setFlashCell({ x, y });
        setTimeout(() => setFlashCell(null), 300);
        return prev;
      }
      prevStatesRef.current.push({ ...prev, board: cloneBoard(prev.board) });
      if (prevStatesRef.current.length > 10) prevStatesRef.current.shift();
      const newBoard = cloneBoard(prev.board);
      newBoard[y][x] = prev.currentPlayer;
      const captured = getCapturedStones(newBoard, x, y, BOARD_SIZE, prev.currentPlayer);
      let newKo: Point | null = null;
      if (captured.length === 1) {
        newKo = captured[0];
      }
      captured.forEach(c => { newBoard[c.y][c.x] = null; });
      const notation = coordToNotation(x, y, BOARD_SIZE);
      const newState: GameState = {
        ...prev,
        board: newBoard,
        currentPlayer: prev.currentPlayer === 'black' ? 'white' : 'black',
        blackCaptures: prev.currentPlayer === 'black' ? prev.blackCaptures + captured.length : prev.blackCaptures,
        whiteCaptures: prev.currentPlayer === 'white' ? prev.whiteCaptures + captured.length : prev.whiteCaptures,
        moveHistory: [...prev.moveHistory, `${prev.currentPlayer === 'black' ? '黑' : '白'} ${notation}`],
        lastMove: { x, y },
        koPoint: newKo,
        moveCount: prev.moveCount + 1,
        consecutivePasses: 0,
      };
      return newState;
    });
  }, []);

  useEffect(() => {
    if (vsAI && gameState.currentPlayer === 'white' && !gameState.gameOver && !aiThinking) {
      setAiThinking(true);
      const timer = setTimeout(() => {
        const move = aiMove(gameState.board, 'white', gameState.koPoint, BOARD_SIZE, aiDifficulty);
        if (move) {
          setGameState(prev => {
            if (prev.gameOver) return prev;
            prevStatesRef.current.push({ ...prev, board: cloneBoard(prev.board) });
            if (prevStatesRef.current.length > 10) prevStatesRef.current.shift();
            const newBoard = cloneBoard(prev.board);
            newBoard[move.y][move.x] = 'white';
            const captured = getCapturedStones(newBoard, move.x, move.y, BOARD_SIZE, 'white');
            let newKo: Point | null = null;
            if (captured.length === 1) {
              newKo = captured[0];
            }
            captured.forEach(c => { newBoard[c.y][c.x] = null; });
            const notation = coordToNotation(move.x, move.y, BOARD_SIZE);
            return {
              ...prev,
              board: newBoard,
              currentPlayer: 'black',
              blackCaptures: prev.blackCaptures + captured.length,
              whiteCaptures: prev.whiteCaptures,
              moveHistory: [...prev.moveHistory, `白 ${notation}`],
              lastMove: move,
              koPoint: newKo,
              moveCount: prev.moveCount + 1,
              consecutivePasses: 0,
            };
          });
        } else {
          handlePass();
        }
        setAiThinking(false);
      }, 400 + Math.random() * 400);
      return () => clearTimeout(timer);
    }
  }, [gameState.currentPlayer, gameState.gameOver, vsAI, aiDifficulty]);

  const handlePass = useCallback(() => {
    setGameState(prev => {
      const newPasses = prev.consecutivePasses + 1;
      if (newPasses >= 2) {
        const { blackTerritory, whiteTerritory } = calculateTerritory(prev.board, BOARD_SIZE);
        const komi = 6.5;
        const bScore = blackTerritory;
        const wScore = whiteTerritory + komi;
        return {
          ...prev,
          currentPlayer: prev.currentPlayer === 'black' ? 'white' : 'black',
          consecutivePasses: newPasses,
          moveHistory: [...prev.moveHistory, `${prev.currentPlayer === 'black' ? '黑' : '白'} 停一手`],
          gameOver: true,
          winner: bScore > wScore ? '黑棋 (Black)' : '白棋 (White)',
          blackScore: bScore,
          whiteScore: wScore,
        };
      }
      return {
        ...prev,
        currentPlayer: prev.currentPlayer === 'black' ? 'white' : 'black',
        consecutivePasses: newPasses,
        moveHistory: [...prev.moveHistory, `${prev.currentPlayer === 'black' ? '黑' : '白'} 停一手`],
      };
    });
  }, []);

  const handleResign = useCallback(() => {
    setGameState(prev => ({
      ...prev,
      gameOver: true,
      winner: prev.currentPlayer === 'black' ? '白棋 (White)' : '黑棋 (Black)',
    }));
  }, []);

  const handleUndo = useCallback(() => {
    if (prevStatesRef.current.length === 0) return;
    const prev = prevStatesRef.current.pop()!;
    setGameState(prev);
  }, []);

  const handleNewGame = useCallback(() => {
    prevStatesRef.current = [];
    setGameState({
      board: createEmptyBoard(BOARD_SIZE),
      currentPlayer: 'black',
      blackCaptures: 0,
      whiteCaptures: 0,
      moveHistory: [],
      lastMove: null,
      koPoint: null,
      moveCount: 0,
      consecutivePasses: 0,
      gameOver: false,
      winner: null,
      blackScore: 0,
      whiteScore: 0,
    });
    setShowScore(false);
  }, []);

  const handleScore = useCallback(() => {
    const { blackTerritory, whiteTerritory } = calculateTerritory(gameState.board, BOARD_SIZE);
    const komi = 6.5;
    setGameState(prev => ({
      ...prev,
      blackScore: blackTerritory,
      whiteScore: whiteTerritory + komi,
    }));
    setShowScore(true);
  }, [gameState.board]);

  const cellSize = 28;
  const padding = 20;
  const boardSize = cellSize * (BOARD_SIZE - 1) + padding * 2;

  return (
    <div className="w-full h-full flex flex-col" style={{ backgroundColor: 'var(--ink-50)', fontFamily: '"Noto Sans SC", system-ui' }}>
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 border-b" style={{ borderColor: 'var(--ink-200)' }}>
        <div className="flex items-center gap-2">
          <button onClick={handleNewGame} className="flex items-center gap-1 px-3 py-1.5 rounded text-sm transition-all hover:scale-[1.02] active:scale-[0.97]"
            style={{ backgroundColor: 'var(--ink-800)', color: 'var(--ink-50)' }}>
            <RotateCcw size={14} /> 新局 (New)
          </button>
          <button onClick={handlePass} disabled={gameState.gameOver || aiThinking}
            className="flex items-center gap-1 px-3 py-1.5 rounded text-sm border transition-all hover:scale-[1.02] active:scale-[0.97] disabled:opacity-40"
            style={{ borderColor: 'var(--ink-400)', color: 'var(--ink-700)' }}>
            <SkipForward size={14} /> 停一手 (Pass)
          </button>
          <button onClick={handleResign} disabled={gameState.gameOver}
            className="flex items-center gap-1 px-3 py-1.5 rounded text-sm transition-all hover:scale-[1.02] active:scale-[0.97] disabled:opacity-40"
            style={{ backgroundColor: 'var(--cinnabar)', color: 'white' }}>
            <Flag size={14} /> 认输 (Resign)
          </button>
          <button onClick={handleUndo} disabled={prevStatesRef.current.length === 0}
            className="flex items-center gap-1 px-3 py-1.5 rounded text-sm border transition-all hover:scale-[1.02] active:scale-[0.97] disabled:opacity-40"
            style={{ borderColor: 'var(--ink-400)', color: 'var(--ink-700)' }}>
            <Undo2 size={14} /> 悔棋 (Undo)
          </button>
          <button onClick={handleScore}
            className="flex items-center gap-1 px-3 py-1.5 rounded text-sm border transition-all hover:scale-[1.02] active:scale-[0.97]"
            style={{ borderColor: 'var(--ink-400)', color: 'var(--ink-700)' }}>
            <Trophy size={14} /> 计分 (Score)
          </button>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1 text-sm cursor-pointer" style={{ color: 'var(--ink-600)' }}>
            <input type="checkbox" checked={vsAI} onChange={e => { setVsAI(e.target.checked); handleNewGame(); }}
              className="cursor-pointer" />
            <Brain size={14} /> 对电脑 (vs AI)
          </label>
          {vsAI && (
            <select value={aiDifficulty} onChange={e => setAiDifficulty(Number(e.target.value))}
              className="text-sm rounded px-2 py-1 border" style={{ borderColor: 'var(--ink-300)', backgroundColor: 'var(--ink-50)' }}>
              <option value={1}>简单 (Easy)</option>
              <option value={2}>中等 (Medium)</option>
              <option value={3}>困难 (Hard)</option>
            </select>
          )}
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Board */}
        <div className="flex-1 flex items-center justify-center overflow-auto p-2">
          <div className="relative select-none" style={{ width: boardSize, height: boardSize }}>
            <svg width={boardSize} height={boardSize} className="absolute inset-0">
              <rect x={0} y={0} width={boardSize} height={boardSize} rx={4}
                fill="#c4a265" fillOpacity={0.3} />
              {Array.from({ length: BOARD_SIZE }, (_, i) => (
                <g key={`grid-${i}`}>
                  <line x1={padding + i * cellSize} y1={padding} x2={padding + i * cellSize} y2={padding + (BOARD_SIZE - 1) * cellSize}
                    stroke="var(--ink-900)" strokeWidth={1} strokeOpacity={0.8} />
                  <line x1={padding} y1={padding + i * cellSize} x2={padding + (BOARD_SIZE - 1) * cellSize} y2={padding + i * cellSize}
                    stroke="var(--ink-900)" strokeWidth={1} strokeOpacity={0.8} />
                </g>
              ))}
              {STAR_POINTS.map(sx => STAR_POINTS.map(sy => (
                <circle key={`star-${sx}-${sy}`} cx={padding + sx * cellSize} cy={padding + sy * cellSize} r={3}
                  fill="var(--ink-900)" fillOpacity={0.8} />
              )))}
            </svg>
            <svg width={boardSize} height={boardSize} className="absolute inset-0 pointer-events-auto">
              {Array.from({ length: BOARD_SIZE }, (_, y) =>
                Array.from({ length: BOARD_SIZE }, (_, x) => {
                  const cx = padding + x * cellSize;
                  const cy = padding + y * cellSize;
                  const stone = gameState.board[y][x];
                  const isLastMove = gameState.lastMove?.x === x && gameState.lastMove?.y === y;
                  const isFlash = flashCell?.x === x && flashCell?.y === y;
                  return (
                    <g key={`cell-${x}-${y}`}>
                      <rect x={cx - cellSize / 2} y={cy - cellSize / 2} width={cellSize} height={cellSize}
                        fill="transparent" cursor="pointer"
                        onClick={() => handlePlaceStone(x, y)}
                        onMouseEnter={() => setHoverCell({ x, y })}
                        onMouseLeave={() => setHoverCell(null)} />
                      {stone && (
                        <g>
                          <circle cx={cx} cy={cy} r={cellSize * 0.42}
                            fill={stone === 'black' ? 'var(--ink-900)' : 'var(--ink-50)'}
                            stroke={stone === 'black' ? 'var(--ink-900)' : 'var(--ink-300)'}
                            strokeWidth={1}
                            style={{ filter: 'drop-shadow(0 2px 3px rgba(0,0,0,0.2))', transition: 'all 0.15s ease' }} />
                          {stone === 'black' && (
                            <circle cx={cx - 3} cy={cy - 3} r={cellSize * 0.15}
                              fill="white" fillOpacity={0.15} />
                          )}
                          {isLastMove && (
                            <circle cx={cx} cy={cy} r={3}
                              fill="var(--cinnabar)" />
                          )}
                        </g>
                      )}
                      {!stone && hoverCell?.x === x && hoverCell?.y === y && !gameState.gameOver && !aiThinking && (
                        <circle cx={cx} cy={cy} r={cellSize * 0.42}
                          fill={gameState.currentPlayer === 'black' ? 'var(--ink-900)' : 'var(--ink-50)'}
                          fillOpacity={0.4}
                          stroke={gameState.currentPlayer === 'black' ? 'var(--ink-900)' : 'var(--ink-300)'}
                          strokeWidth={1}
                          style={{ transition: 'all 0.1s ease' }} pointerEvents="none" />
                      )}
                      {isFlash && (
                        <circle cx={cx} cy={cy} r={cellSize * 0.42}
                          fill="var(--cinnabar)" fillOpacity={0.4} pointerEvents="none">
                          <animate attributeName="fill-opacity" values="0.4;0;0.4;0" dur="0.3s" repeatCount="1" />
                        </circle>
                      )}
                    </g>
                  );
                })
              )}
            </svg>
          </div>
        </div>

        {/* Info Panel */}
        <div className="w-44 border-l flex flex-col overflow-hidden" style={{ borderColor: 'var(--ink-200)', backgroundColor: 'var(--ink-100)' }}>
          <div className="p-3 space-y-3">
            {/* Turn indicator */}
            <div className="text-center">
              <div className="text-xs mb-1" style={{ color: 'var(--ink-500)' }}>当前回合 (Turn)</div>
              <div className="flex items-center justify-center gap-2">
                <Circle size={20} fill={gameState.currentPlayer === 'black' ? 'var(--ink-900)' : 'var(--ink-50)'}
                  stroke={gameState.currentPlayer === 'black' ? 'var(--ink-900)' : 'var(--ink-300)'} strokeWidth={1.5} />
                <span className="font-medium" style={{ color: 'var(--ink-800)' }}>
                  {gameState.currentPlayer === 'black' ? '黑棋 (Black)' : '白棋 (White)'}
                </span>
              </div>
              {aiThinking && (
                <div className="text-xs mt-1 animate-pulse" style={{ color: 'var(--cinnabar)' }}>
                  思考中... (Thinking...)
                </div>
              )}
            </div>

            {/* Score info */}
            <div className="space-y-1">
              <div className="flex justify-between text-sm" style={{ color: 'var(--ink-700)' }}>
                <span>黑提子 (Black caps)</span>
                <span className="font-medium">{gameState.blackCaptures}</span>
              </div>
              <div className="flex justify-between text-sm" style={{ color: 'var(--ink-700)' }}>
                <span>白提子 (White caps)</span>
                <span className="font-medium">{gameState.whiteCaptures}</span>
              </div>
              <div className="flex justify-between text-sm" style={{ color: 'var(--ink-700)' }}>
                <span>手数 (Moves)</span>
                <span className="font-medium">{gameState.moveCount}</span>
              </div>
            </div>

            {showScore && (
              <div className="p-2 rounded" style={{ backgroundColor: 'var(--ink-200)' }}>
                <div className="text-xs font-medium mb-1" style={{ color: 'var(--ink-700)' }}>领地估算 (Estimate)</div>
                <div className="flex justify-between text-xs" style={{ color: 'var(--ink-600)' }}>
                  <span>黑 (B)</span><span>{gameState.blackScore.toFixed(1)}</span>
                </div>
                <div className="flex justify-between text-xs" style={{ color: 'var(--ink-600)' }}>
                  <span>白 (W)</span><span>{gameState.whiteScore.toFixed(1)}</span>
                </div>
              </div>
            )}

            {/* Game over */}
            {gameState.gameOver && gameState.winner && (
              <div className="p-2 rounded text-center" style={{ backgroundColor: 'var(--cinnabar)' }}>
                <div className="text-sm font-medium" style={{ color: 'white' }}>
                  {gameState.winner} 胜!
                </div>
              </div>
            )}

            {/* Move history */}
            <div className="flex-1 overflow-hidden flex flex-col min-h-0">
              <div className="text-xs mb-1" style={{ color: 'var(--ink-500)' }}>棋谱 (History)</div>
              <div className="flex-1 overflow-y-auto text-xs space-y-0.5 max-h-64" style={{ color: 'var(--ink-600)' }}>
                {gameState.moveHistory.map((move, i) => (
                  <div key={i} className="flex justify-between">
                    <span>{i + 1}.</span>
                    <span>{move}</span>
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

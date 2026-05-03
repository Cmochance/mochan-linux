import { useState, useCallback, useEffect, useRef } from 'react';
import { RotateCcw, Flag, Undo2, Brain, AlertTriangle } from 'lucide-react';

type PieceColor = 'red' | 'black';
type PieceType = 'general' | 'advisor' | 'elephant' | 'horse' | 'chariot' | 'cannon' | 'soldier';
type Piece = { color: PieceColor; type: PieceType } | null;
type Board = Piece[][];
type Position = { row: number; col: number };

const BOARD_ROWS = 10;
const BOARD_COLS = 9;
const PIECE_NAMES: Record<PieceColor, Record<PieceType, string>> = {
  red: { general: '帅', advisor: '仕', elephant: '相', horse: '傌', chariot: '俥', cannon: '炮', soldier: '兵' },
  black: { general: '将', advisor: '士', elephant: '象', horse: '马', chariot: '车', cannon: '砲', soldier: '卒' },
};

const PIECE_VALUES: Record<PieceType, number> = {
  general: 10000, advisor: 20, elephant: 20, horse: 40, chariot: 90, cannon: 45, soldier: 10,
};

function initialBoard(): Board {
  const board: Board = Array.from({ length: BOARD_ROWS }, () => Array(BOARD_COLS).fill(null));
  const setup: [PieceColor, PieceType, number, number][] = [
    ['black', 'chariot', 0, 0], ['black', 'horse', 0, 1], ['black', 'elephant', 0, 2], ['black', 'advisor', 0, 3],
    ['black', 'general', 0, 4], ['black', 'advisor', 0, 5], ['black', 'elephant', 0, 6], ['black', 'horse', 0, 7], ['black', 'chariot', 0, 8],
    ['black', 'cannon', 2, 1], ['black', 'cannon', 2, 7],
    ['black', 'soldier', 3, 0], ['black', 'soldier', 3, 2], ['black', 'soldier', 3, 4], ['black', 'soldier', 3, 6], ['black', 'soldier', 3, 8],
    ['red', 'chariot', 9, 0], ['red', 'horse', 9, 1], ['red', 'elephant', 9, 2], ['red', 'advisor', 9, 3],
    ['red', 'general', 9, 4], ['red', 'advisor', 9, 5], ['red', 'elephant', 9, 6], ['red', 'horse', 9, 7], ['red', 'chariot', 9, 8],
    ['red', 'cannon', 7, 1], ['red', 'cannon', 7, 7],
    ['red', 'soldier', 6, 0], ['red', 'soldier', 6, 2], ['red', 'soldier', 6, 4], ['red', 'soldier', 6, 6], ['red', 'soldier', 6, 8],
  ];
  for (const [color, type, row, col] of setup) {
    board[row][col] = { color, type };
  }
  return board;
}

function cloneBoard(board: Board): Board {
  return board.map(row => row.map(p => p ? { ...p } : null));
}

function isInPalace(row: number, col: number, color: PieceColor): boolean {
  if (color === 'black') return row >= 0 && row <= 2 && col >= 3 && col <= 5;
  return row >= 7 && row <= 9 && col >= 3 && col <= 5;
}

function getValidMoves(board: Board, row: number, col: number): Position[] {
  const piece = board[row][col];
  if (!piece) return [];
  const moves: Position[] = [];
  const { color, type } = piece;

  const addIfValid = (r: number, c: number, extraCheck?: () => boolean) => {
    if (r < 0 || r >= BOARD_ROWS || c < 0 || c >= BOARD_COLS) return;
    const target = board[r][c];
    if (target && target.color === color) return;
    if (extraCheck && !extraCheck()) return;
    moves.push({ row: r, col: c });
  };

  switch (type) {
    case 'general': {
      const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];
      for (const [dr, dc] of dirs) {
        addIfValid(row + dr, col + dc, () => isInPalace(row + dr, col + dc, color));
      }
      // Flying general
      const oppRow = color === 'black' ? 9 : 0;
      let clear = true;
      const step = color === 'black' ? 1 : -1;
      for (let r = row + step; color === 'black' ? r <= 9 : r >= 0; r += step) {
        if (r === (color === 'black' ? 9 : 0)) break;
        if (board[r][col]) { clear = false; break; }
      }
      if (clear) {
        const opp = board[oppRow]?.[col];
        if (opp && opp.type === 'general') {
          moves.push({ row: oppRow, col });
        }
      }
      break;
    }
    case 'advisor': {
      const dirs = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
      for (const [dr, dc] of dirs) {
        addIfValid(row + dr, col + dc, () => isInPalace(row + dr, col + dc, color));
      }
      break;
    }
    case 'elephant': {
      const dirs = [[2, 2], [2, -2], [-2, 2], [-2, -2]];
      for (const [dr, dc] of dirs) {
        addIfValid(row + dr, col + dc, () => {
          if (color === 'black' && row + dr > 4) return false;
          if (color === 'red' && row + dr < 5) return false;
          return !board[row + dr / 2][col + dc / 2];
        });
      }
      break;
    }
    case 'horse': {
      const dirs = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
      for (const [dr, dc] of dirs) {
        addIfValid(row + dr, col + dc, () => {
          const blockRow = row + (Math.abs(dr) === 2 ? dr / 2 : 0);
          const blockCol = col + (Math.abs(dc) === 2 ? dc / 2 : 0);
          if (Math.abs(dr) === 2) return !board[row + dr / 2][col];
          return !board[row][col + dc / 2];
        });
      }
      break;
    }
    case 'chariot': {
      const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];
      for (const [dr, dc] of dirs) {
        for (let i = 1; i < 10; i++) {
          const r = row + dr * i, c = col + dc * i;
          if (r < 0 || r >= BOARD_ROWS || c < 0 || c >= BOARD_COLS) break;
          if (board[r][c]) {
            if (board[r][c]!.color !== color) moves.push({ row: r, col: c });
            break;
          }
          moves.push({ row: r, col: c });
        }
      }
      break;
    }
    case 'cannon': {
      const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];
      for (const [dr, dc] of dirs) {
        let jumped = false;
        for (let i = 1; i < 10; i++) {
          const r = row + dr * i, c = col + dc * i;
          if (r < 0 || r >= BOARD_ROWS || c < 0 || c >= BOARD_COLS) break;
          if (!jumped) {
            if (board[r][c]) { jumped = true; continue; }
            moves.push({ row: r, col: c });
          } else {
            if (board[r][c]) {
              if (board[r][c]!.color !== color) moves.push({ row: r, col: c });
              break;
            }
          }
        }
      }
      break;
    }
    case 'soldier': {
      const forward = color === 'black' ? 1 : -1;
      addIfValid(row + forward, col);
      if ((color === 'black' && row >= 5) || (color === 'red' && row <= 4)) {
        addIfValid(row, col + 1);
        addIfValid(row, col - 1);
      }
      break;
    }
  }
  return moves;
}

function findGeneral(board: Board, color: PieceColor): Position | null {
  for (let r = 0; r < BOARD_ROWS; r++) {
    for (let c = 0; c < BOARD_COLS; c++) {
      const p = board[r][c];
      if (p && p.type === 'general' && p.color === color) return { row: r, col: c };
    }
  }
  return null;
}

function isInCheck(board: Board, color: PieceColor): boolean {
  const gen = findGeneral(board, color);
  if (!gen) return false;
  const opponent = color === 'red' ? 'black' : 'red';
  for (let r = 0; r < BOARD_ROWS; r++) {
    for (let c = 0; c < BOARD_COLS; c++) {
      const p = board[r][c];
      if (p && p.color === opponent) {
        const moves = getValidMoves(board, r, c);
        if (moves.some(m => m.row === gen.row && m.col === gen.col)) return true;
      }
    }
  }
  return false;
}

function hasLegalMoves(board: Board, color: PieceColor): boolean {
  for (let r = 0; r < BOARD_ROWS; r++) {
    for (let c = 0; c < BOARD_COLS; c++) {
      const p = board[r][c];
      if (p && p.color === color) {
        const moves = getValidMoves(board, r, c);
        for (const m of moves) {
          const temp = cloneBoard(board);
          temp[m.row][m.col] = temp[r][c];
          temp[r][c] = null;
          if (!isInCheck(temp, color)) return true;
        }
      }
    }
  }
  return false;
}

function evaluateBoard(board: Board): number {
  let score = 0;
  for (let r = 0; r < BOARD_ROWS; r++) {
    for (let c = 0; c < BOARD_COLS; c++) {
      const p = board[r][c];
      if (p) {
        let val = PIECE_VALUES[p.type];
        if (p.type === 'soldier') {
          if (p.color === 'black' && r >= 5) val += 15;
          if (p.color === 'red' && r <= 4) val += 15;
        }
        if (p.type === 'horse') {
          val += (c >= 2 && c <= 6) ? 5 : 0;
        }
        score += p.color === 'red' ? val : -val;
      }
    }
  }
  return score;
}

function minimax(board: Board, depth: number, alpha: number, beta: number, maximizing: boolean): number {
  if (depth === 0) return evaluateBoard(board);
  const color = maximizing ? 'red' : 'black';
  if (!hasLegalMoves(board, color)) {
    if (isInCheck(board, color)) return maximizing ? -99999 : 99999;
    return 0;
  }
  if (maximizing) {
    let maxEval = -Infinity;
    for (let r = 0; r < BOARD_ROWS && maxEval < beta; r++) {
      for (let c = 0; c < BOARD_COLS && maxEval < beta; c++) {
        const p = board[r][c];
        if (p && p.color === 'red') {
          const moves = getValidMoves(board, r, c);
          for (const m of moves) {
            const temp = cloneBoard(board);
            temp[m.row][m.col] = temp[r][c];
            temp[r][c] = null;
            if (isInCheck(temp, 'red')) continue;
            const eval_ = minimax(temp, depth - 1, alpha, beta, false);
            maxEval = Math.max(maxEval, eval_);
            alpha = Math.max(alpha, eval_);
            if (beta <= alpha) break;
          }
        }
      }
    }
    return maxEval === -Infinity ? -99999 : maxEval;
  } else {
    let minEval = Infinity;
    for (let r = 0; r < BOARD_ROWS && minEval > alpha; r++) {
      for (let c = 0; c < BOARD_COLS && minEval > alpha; c++) {
        const p = board[r][c];
        if (p && p.color === 'black') {
          const moves = getValidMoves(board, r, c);
          for (const m of moves) {
            const temp = cloneBoard(board);
            temp[m.row][m.col] = temp[r][c];
            temp[r][c] = null;
            if (isInCheck(temp, 'black')) continue;
            const eval_ = minimax(temp, depth - 1, alpha, beta, true);
            minEval = Math.min(minEval, eval_);
            beta = Math.min(beta, eval_);
            if (beta <= alpha) break;
          }
        }
      }
    }
    return minEval === Infinity ? 99999 : minEval;
  }
}

function getAIMove(board: Board, depth: number): { from: Position; to: Position } | null {
  let bestScore = -Infinity;
  let bestMove: { from: Position; to: Position } | null = null;
  const moves: { from: Position; to: Position; score: number }[] = [];
  for (let r = 0; r < BOARD_ROWS; r++) {
    for (let c = 0; c < BOARD_COLS; c++) {
      const p = board[r][c];
      if (p && p.color === 'black') {
        const validMoves = getValidMoves(board, r, c);
        for (const m of validMoves) {
          const temp = cloneBoard(board);
          const captured = temp[m.row][m.col];
          temp[m.row][m.col] = temp[r][c];
          temp[r][c] = null;
          if (isInCheck(temp, 'black')) continue;
          let score = captured ? PIECE_VALUES[captured.type] * 10 : 0;
          if (depth > 1) {
            score += minimax(temp, depth - 1, -Infinity, Infinity, true);
          } else {
            score += evaluateBoard(temp) * -1;
          }
          moves.push({ from: { row: r, col: c }, to: m, score });
        }
      }
    }
  }
  if (moves.length === 0) return null;
  moves.sort((a, b) => b.score - a.score);
  const topMoves = moves.slice(0, Math.min(5, moves.length));
  return topMoves[Math.floor(Math.random() * topMoves.length)] || moves[0];
}

export default function ChineseChess() {
  const [board, setBoard] = useState<Board>(initialBoard);
  const [selected, setSelected] = useState<Position | null>(null);
  const [currentPlayer, setCurrentPlayer] = useState<PieceColor>('red');
  const [validMoves, setValidMoves] = useState<Position[]>([]);
  const [moveHistory, setMoveHistory] = useState<string[]>([]);
  const [gameOver, setGameOver] = useState(false);
  const [winner, setWinner] = useState<string | null>(null);
  const [inCheck, setInCheck] = useState<PieceColor | null>(null);
  const [lastMove, setLastMove] = useState<{ from: Position; to: Position } | null>(null);
  const [vsAI, setVsAI] = useState(true);
  const [aiDifficulty, setAiDifficulty] = useState(2);
  const [aiThinking, setAiThinking] = useState(false);
  const [capturedPieces, setCapturedPieces] = useState<{ red: Piece[]; black: Piece[] }>({ red: [], black: [] });
  const prevBoardsRef = useRef<{ board: Board; player: PieceColor; captured: typeof capturedPieces }[]>([]);

  useEffect(() => {
    if (inCheck && !gameOver) {
      const timer = setTimeout(() => setInCheck(null), 1500);
      return () => clearTimeout(timer);
    }
  }, [inCheck, gameOver]);

  const executeMove = useCallback((from: Position, to: Position) => {
    setBoard(prev => {
      const newBoard = cloneBoard(prev);
      const captured = newBoard[to.row][to.col];
      newBoard[to.row][to.col] = newBoard[from.row][from.col];
      newBoard[from.row][from.col] = null;

      const movedPiece = newBoard[to.row][to.col]!;
      const moveNotation = `${PIECE_NAMES[movedPiece.color][movedPiece.type]} ${String.fromCharCode(97 + from.col)}${BOARD_ROWS - from.row}-${String.fromCharCode(97 + to.col)}${BOARD_ROWS - to.row}`;

      if (captured) {
        setCapturedPieces(caps => ({
          ...caps,
          [movedPiece.color]: [...caps[movedPiece.color], captured],
        }));
      }

      const nextPlayer = currentPlayer === 'red' ? 'black' : 'red';
      setCurrentPlayer(nextPlayer);
      setMoveHistory(h => [...h, `${moveNotation} (${movedPiece.color === 'red' ? '红' : '黑'})`]);
      setLastMove({ from, to });
      setSelected(null);
      setValidMoves([]);

      setTimeout(() => {
        if (isInCheck(newBoard, nextPlayer)) {
          setInCheck(nextPlayer);
          if (!hasLegalMoves(newBoard, nextPlayer)) {
            setGameOver(true);
            setWinner(movedPiece.color === 'red' ? '红方 (Red)' : '黑方 (Black)');
          }
        } else if (!hasLegalMoves(newBoard, nextPlayer)) {
          setGameOver(true);
          setWinner('和棋 (Draw)');
        }
      }, 50);

      return newBoard;
    });
  }, [currentPlayer]);

  useEffect(() => {
    if (vsAI && currentPlayer === 'black' && !gameOver && !aiThinking) {
      setAiThinking(true);
      const timer = setTimeout(() => {
        const depth = aiDifficulty === 1 ? 1 : aiDifficulty === 2 ? 2 : 3;
        const move = getAIMove(board, depth);
        if (move) {
          prevBoardsRef.current.push({ board: cloneBoard(board), player: 'red', captured: { ...capturedPieces } });
          if (prevBoardsRef.current.length > 10) prevBoardsRef.current.shift();
          executeMove(move.from, move.to);
        }
        setAiThinking(false);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [currentPlayer, gameOver, vsAI, aiDifficulty, board, aiThinking, executeMove, capturedPieces]);

  const handleCellClick = useCallback((row: number, col: number) => {
    if (gameOver || aiThinking) return;
    if (vsAI && currentPlayer !== 'red') return;

    const piece = board[row][col];
    if (selected) {
      if (validMoves.some(m => m.row === row && m.col === col)) {
        prevBoardsRef.current.push({ board: cloneBoard(board), player: currentPlayer, captured: { ...capturedPieces } });
        if (prevBoardsRef.current.length > 10) prevBoardsRef.current.shift();
        executeMove(selected, { row, col });
        return;
      }
      if (piece && piece.color === currentPlayer) {
        setSelected({ row, col });
        const moves = getValidMoves(board, row, col);
        setValidMoves(moves.filter(m => {
          const temp = cloneBoard(board);
          temp[m.row][m.col] = temp[row][col];
          temp[row][col] = null;
          return !isInCheck(temp, currentPlayer);
        }));
        return;
      }
      setSelected(null);
      setValidMoves([]);
    } else if (piece && piece.color === currentPlayer) {
      setSelected({ row, col });
      const moves = getValidMoves(board, row, col);
      setValidMoves(moves.filter(m => {
        const temp = cloneBoard(board);
        temp[m.row][m.col] = temp[row][col];
        temp[row][col] = null;
        return !isInCheck(temp, currentPlayer);
      }));
    }
  }, [board, selected, validMoves, currentPlayer, gameOver, aiThinking, vsAI, executeMove, capturedPieces]);

  const handleUndo = useCallback(() => {
    if (prevBoardsRef.current.length === 0) return;
    const prev = prevBoardsRef.current.pop()!;
    setBoard(prev.board);
    setCurrentPlayer(prev.player);
    setCapturedPieces(prev.captured);
    setSelected(null);
    setValidMoves([]);
    setGameOver(false);
    setWinner(null);
    setInCheck(null);
  }, []);

  const handleNewGame = useCallback(() => {
    setBoard(initialBoard());
    setSelected(null);
    setCurrentPlayer('red');
    setValidMoves([]);
    setMoveHistory([]);
    setGameOver(false);
    setWinner(null);
    setInCheck(null);
    setLastMove(null);
    setCapturedPieces({ red: [], black: [] });
    prevBoardsRef.current = [];
  }, []);

  const isInPalaceCell = (row: number, col: number) => {
    return (row <= 2 && col >= 3 && col <= 5) || (row >= 7 && col >= 3 && col <= 5);
  };

  const getCellBg = (row: number, col: number) => {
    if (lastMove && (lastMove.from.row === row && lastMove.from.col === col || lastMove.to.row === row && lastMove.to.col === col)) {
      return 'rgba(26,26,26,0.05)';
    }
    return 'transparent';
  };

  return (
    <div className="w-full h-full flex flex-col" style={{ backgroundColor: 'var(--ink-50)' }}>
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 border-b" style={{ borderColor: 'var(--ink-200)' }}>
        <div className="flex items-center gap-2">
          <button onClick={handleNewGame} className="flex items-center gap-1 px-3 py-1.5 rounded text-sm transition-all hover:scale-[1.02] active:scale-[0.97]"
            style={{ backgroundColor: 'var(--ink-800)', color: 'var(--ink-50)' }}>
            <RotateCcw size={14} /> 新局 (New)
          </button>
          <button onClick={handleUndo} disabled={prevBoardsRef.current.length === 0}
            className="flex items-center gap-1 px-3 py-1.5 rounded text-sm border transition-all hover:scale-[1.02] disabled:opacity-40"
            style={{ borderColor: 'var(--ink-400)', color: 'var(--ink-700)' }}>
            <Undo2 size={14} /> 悔棋 (Undo)
          </button>
          <div className="flex items-center gap-1 px-3 py-1.5 rounded text-sm border"
            style={{ borderColor: 'var(--ink-300)', backgroundColor: 'var(--ink-100)' }}>
            {inCheck && <AlertTriangle size={14} style={{ color: 'var(--cinnabar)' }} />}
            <span style={{ color: 'var(--ink-700)' }}>
              {gameOver ? (winner ? '结束: ' + winner + ' 胜!' : '和棋') :
                aiThinking ? '电脑思考中... (AI thinking...)' :
                  (currentPlayer === 'red' ? '红方 (Red)' : '黑方 (Black)') + ' 走棋'}
            </span>
          </div>
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
        {/* Captured by Red */}
        <div className="w-16 border-r flex flex-col items-center py-2 overflow-y-auto" style={{ borderColor: 'var(--ink-200)', backgroundColor: 'var(--ink-100)' }}>
          <div className="text-[10px] mb-1" style={{ color: 'var(--ink-500)' }}>红方吃子</div>
          {capturedPieces.red.map((p, i) => p && (
            <div key={`rc-${i}`} className="w-8 h-8 rounded-full flex items-center justify-center text-xs mb-1 border"
              style={{ borderColor: 'var(--ink-800)', backgroundColor: 'var(--ink-50)', opacity: 0.7 }}>
              <span style={{ color: 'var(--ink-800)' }}>{PIECE_NAMES[p.color][p.type]}</span>
            </div>
          ))}
        </div>

        {/* Board */}
        <div className="flex-1 flex items-center justify-center overflow-auto p-2">
          <div className="relative" style={{ width: 414, height: 460 }}>
            {/* Grid lines */}
            <svg className="absolute inset-0" width={414} height={460}>
              <rect width={414} height={460} rx={4} fill="var(--ink-50)" />
              {/* Horizontal lines */}
              {Array.from({ length: 10 }, (_, i) => (
                <line key={`h-${i}`} x1={23} y1={23 + i * 46} x2={391} y2={23 + i * 46}
                  stroke="var(--ink-800)" strokeWidth={1.5} strokeOpacity={i === 4 || i === 5 ? 0.3 : 1}
                  strokeDasharray={i === 4 || i === 5 ? '4,4' : 'none'} />
              ))}
              {/* Vertical lines - top half */}
              {Array.from({ length: 9 }, (_, i) => (
                <g key={`v-${i}`}>
                  <line x1={23 + i * 46} y1={23} x2={23 + i * 46} y2={207}
                    stroke="var(--ink-800)" strokeWidth={1.5} />
                  <line x1={23 + i * 46} y1={253} x2={23 + i * 46} y2={437}
                    stroke="var(--ink-800)" strokeWidth={1.5} />
                </g>
              ))}
              {/* Palace diagonals */}
              <line x1={115} y1={23} x2={207} y2={115} stroke="var(--ink-800)" strokeWidth={1.5} />
              <line x1={299} y1={23} x2={207} y2={115} stroke="var(--ink-800)" strokeWidth={1.5} />
              <line x1={115} y1={115} x2={207} y2={23} stroke="var(--ink-800)" strokeWidth={1.5} />
              <line x1={299} y1={115} x2={207} y2={23} stroke="var(--ink-800)" strokeWidth={1.5} />
              <line x1={115} y1={345} x2={207} y2={437} stroke="var(--ink-800)" strokeWidth={1.5} />
              <line x1={299} y1={345} x2={207} y2={437} stroke="var(--ink-800)" strokeWidth={1.5} />
              <line x1={115} y1={437} x2={207} y2={345} stroke="var(--ink-800)" strokeWidth={1.5} />
              <line x1={299} y1={437} x2={207} y2={345} stroke="var(--ink-800)" strokeWidth={1.5} />
              {/* River text */}
              <text x={170} y={238} fontSize={14} fill="var(--ink-600)" fontFamily="Noto Serif SC">楚河</text>
              <text x={245} y={238} fontSize={14} fill="var(--ink-600)" fontFamily="Noto Serif SC" textAnchor="end">汉界</text>
            </svg>

            {/* Pieces */}
            <div className="absolute inset-0">
              {Array.from({ length: BOARD_ROWS }, (_, row) =>
                Array.from({ length: BOARD_COLS }, (_, col) => {
                  const piece = board[row][col];
                  const isSelected = selected?.row === row && selected?.col === col;
                  const isValidMove = validMoves.some(m => m.row === row && m.col === col);
                  const genCheck = inCheck && piece?.type === 'general' && piece?.color === inCheck;
                  return (
                    <div key={`cell-${row}-${col}`}
                      className="absolute flex items-center justify-center cursor-pointer"
                      style={{
                        left: 23 + col * 46 - 20,
                        top: 23 + row * 46 - 20,
                        width: 40,
                        height: 40,
                        zIndex: isSelected ? 10 : piece ? 5 : 1,
                      }}
                      onClick={() => handleCellClick(row, col)}>
                      {piece && (
                        <div className="w-9 h-9 rounded-full flex items-center justify-center text-base font-bold transition-all"
                          style={{
                            backgroundColor: 'var(--ink-50)',
                            border: genCheck ? '3px solid var(--cinnabar)' : piece.color === 'red' ? '2px solid var(--cinnabar)' : '2px solid var(--ink-800)',
                            color: piece.color === 'red' ? 'var(--cinnabar)' : 'var(--ink-900)',
                            transform: isSelected ? 'scale(1.1)' : 'scale(1)',
                            boxShadow: isSelected ? '0 4px 12px rgba(26,26,26,0.2)' : '0 1px 3px rgba(26,26,26,0.1)',
                            fontFamily: '"Noto Serif SC", serif',
                          }}>
                          {PIECE_NAMES[piece.color][piece.type]}
                        </div>
                      )}
                      {isValidMove && !piece && (
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: 'var(--ink-400)', opacity: 0.6 }} />
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Captured by Black */}
        <div className="w-16 border-l flex flex-col items-center py-2 overflow-y-auto" style={{ borderColor: 'var(--ink-200)', backgroundColor: 'var(--ink-100)' }}>
          <div className="text-[10px] mb-1" style={{ color: 'var(--ink-500)' }}>黑方吃子</div>
          {capturedPieces.black.map((p, i) => p && (
            <div key={`bc-${i}`} className="w-8 h-8 rounded-full flex items-center justify-center text-xs mb-1 border"
              style={{ borderColor: 'var(--cinnabar)', backgroundColor: 'var(--ink-50)', opacity: 0.7 }}>
              <span style={{ color: 'var(--cinnabar)' }}>{PIECE_NAMES[p.color][p.type]}</span>
            </div>
          ))}
        </div>

        {/* Move History */}
        <div className="w-36 border-l flex flex-col overflow-hidden" style={{ borderColor: 'var(--ink-200)', backgroundColor: 'var(--ink-100)' }}>
          <div className="p-2 text-xs font-medium border-b" style={{ borderColor: 'var(--ink-200)', color: 'var(--ink-600)' }}>
            棋谱 (History)
          </div>
          <div className="flex-1 overflow-y-auto p-2 text-xs space-y-1" style={{ color: 'var(--ink-600)' }}>
            {moveHistory.map((move, i) => (
              <div key={i} className="truncate">{i + 1}. {move}</div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

import { useState, useCallback, useEffect, useRef } from 'react';
import { RotateCcw, Shuffle, Lightbulb, Undo2, Pause, Play, Timer, Star } from 'lucide-react';

interface Tile {
  id: number;
  suit: string;
  value: number;
  layer: number;
  row: number;
  col: number;
  matched: boolean;
  selected: boolean;
  hinted: boolean;
}

type LayoutType = 'turtle' | 'pyramid' | 'spider';

const SUITS = ['bamboo', 'character', 'dot', 'wind', 'dragon'];
const WIND_NAMES = ['东', '南', '西', '北'];
const DRAGON_NAMES = ['中', '發', '白'];
const SUIT_SYMBOLS: Record<string, string[]> = {
  bamboo: ['一', '二', '三', '四', '五', '六', '七', '八', '九'],
  character: ['壹', '贰', '叁', '肆', '伍', '陆', '柒', '捌', '玖'],
  dot: ['1', '2', '3', '4', '5', '6', '7', '8', '9'],
};
const WIND_COLORS = { '东': '#1a1a1a', '南': '#1a1a1a', '西': '#1a1a1a', '北': '#1a1a1a' };
const DRAGON_COLORS: Record<string, string> = { '中': '#b3392f', '發': '#4a7c59', '白': '#9e9e9e' };

function generateTiles(): Omit<Tile, 'layer' | 'row' | 'col' | 'matched' | 'selected' | 'hinted'>[] {
  const tiles: Omit<Tile, 'layer' | 'row' | 'col' | 'matched' | 'selected' | 'hinted'>[] = [];
  let id = 0;
  // 3 suits × 9 values × 4 = 108
  for (const suit of ['bamboo', 'character', 'dot']) {
    for (let val = 1; val <= 9; val++) {
      for (let i = 0; i < 4; i++) {
        tiles.push({ id: id++, suit, value: val });
      }
    }
  }
  // 4 winds × 4 = 16
  for (const wind of ['东', '南', '西', '北']) {
    for (let i = 0; i < 4; i++) {
      tiles.push({ id: id++, suit: 'wind', value: WIND_NAMES.indexOf(wind) });
    }
  }
  // 3 dragons × 4 = 12 (use 2 sets = 8 for 136 total)
  for (const dragon of ['中', '發', '白']) {
    for (let i = 0; i < 4; i++) {
      tiles.push({ id: id++, suit: 'dragon', value: DRAGON_NAMES.indexOf(dragon) });
    }
  }
  // Trim or pad to 144
  while (tiles.length < 144) {
    const t = tiles[tiles.length % tiles.length];
    tiles.push({ id: id++, suit: t.suit, value: t.value });
  }
  return tiles.slice(0, 144);
}

function getTileName(tile: Tile): string {
  if (tile.suit === 'wind') return WIND_NAMES[tile.value];
  if (tile.suit === 'dragon') return DRAGON_NAMES[tile.value];
  return `${SUIT_SYMBOLS[tile.suit]?.[tile.value - 1] || tile.value}${tile.suit === 'bamboo' ? '条' : tile.suit === 'character' ? '万' : '筒'}`;
}

function tilesMatch(a: Tile, b: Tile): boolean {
  if (a.suit !== b.suit) return false;
  if (a.suit === 'wind' || a.suit === 'dragon') return a.value === b.value;
  return a.value === b.value;
}

function generateLayout(type: LayoutType): { layer: number; row: number; col: number }[] {
  const positions: { layer: number; row: number; col: number }[] = [];
  switch (type) {
    case 'turtle': {
      const layers = [
        { l: 0, rows: [[3, 11]], y: 3 },
        { l: 0, rows: [[2, 12]], y: 4 },
        { l: 0, rows: [[1, 13]], y: 5 },
        { l: 0, rows: [[0, 14], [0, 14], [0, 14], [0, 14], [0, 14]], y: 6 },
        { l: 0, rows: [[1, 13], [1, 13], [1, 13], [1, 13]], y: 7 },
        { l: 0, rows: [[2, 12], [2, 12], [2, 12], [2, 12]], y: 8 },
        { l: 0, rows: [[3, 11], [3, 11], [3, 11]], y: 9 },
        { l: 0, rows: [[2, 12], [2, 12], [2, 12], [2, 12]], y: 10 },
        { l: 0, rows: [[1, 13], [1, 13], [1, 13], [1, 13]], y: 11 },
        { l: 0, rows: [[0, 14], [0, 14], [0, 14], [0, 14], [0, 14]], y: 12 },
        { l: 0, rows: [[1, 13]], y: 13 },
        { l: 0, rows: [[2, 12]], y: 14 },
        { l: 0, rows: [[3, 11]], y: 15 },
        { l: 1, rows: [[4, 10], [4, 10], [4, 10], [4, 10]], y: 7 },
        { l: 1, rows: [[4, 10], [4, 10], [4, 10], [4, 10]], y: 8 },
        { l: 1, rows: [[4, 10], [4, 10], [4, 10], [4, 10]], y: 9 },
        { l: 1, rows: [[4, 10], [4, 10], [4, 10], [4, 10]], y: 10 },
        { l: 2, rows: [[5, 9], [5, 9], [5, 9]], y: 8 },
        { l: 2, rows: [[5, 9], [5, 9], [5, 9]], y: 9 },
        { l: 2, rows: [[5, 9], [5, 9], [5, 9]], y: 10 },
        { l: 3, rows: [[6, 8]], y: 8 },
        { l: 3, rows: [[6, 8]], y: 9 },
        { l: 3, rows: [[6, 8]], y: 10 },
        { l: 4, rows: [[7, 7]], y: 9 },
      ];
      let idx = 0;
      for (const layer of layers) {
        for (const [start, end] of layer.rows) {
          for (let c = start; c <= end; c++) {
            positions.push({ layer: layer.l, row: layer.y, col: c });
          }
        }
      }
      break;
    }
    case 'pyramid': {
      for (let l = 0; l < 5; l++) {
        const size = 9 - l * 2;
        const startRow = l + 4;
        const startCol = l;
        for (let r = 0; r < size; r++) {
          for (let c = 0; c < size; c++) {
            positions.push({ layer: l, row: startRow + r, col: startCol + c });
          }
        }
      }
      break;
    }
    case 'spider': {
      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 15; c++) {
          if ((r + c) % 3 !== 0) {
            positions.push({ layer: 0, row: r + 3, col: c });
          }
        }
      }
      for (let r = 0; r < 6; r++) {
        for (let c = 0; c < 11; c++) {
          if ((r + c) % 2 === 0) {
            positions.push({ layer: 1, row: r + 4, col: c + 2 });
          }
        }
      }
      for (let r = 0; r < 4; r++) {
        for (let c = 0; c < 7; c++) {
          positions.push({ layer: 2, row: r + 5, col: c + 4 });
        }
      }
      for (let r = 0; r < 2; r++) {
        for (let c = 0; c < 3; c++) {
          positions.push({ layer: 3, row: r + 6, col: c + 6 });
        }
      }
      break;
    }
  }
  return positions;
}

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function initGame(layout: LayoutType): Tile[] {
  const allTiles = shuffleArray(generateTiles());
  const positions = generateLayout(layout);
  const usedPositions = positions.slice(0, Math.min(allTiles.length, positions.length));
  return usedPositions.map((pos, i) => ({
    ...allTiles[i],
    ...pos,
    matched: false,
    selected: false,
    hinted: false,
  }));
}

function isTileFree(tiles: Tile[], tile: Tile): boolean {
  if (tile.matched) return false;
  // Check if tile on top
  const onTop = tiles.some(t => !t.matched && t.layer > tile.layer && t.row === tile.row && t.col === tile.col);
  if (onTop) return false;
  // Check if both long sides blocked
  const leftBlocked = tiles.some(t => !t.matched && t.layer === tile.layer && t.row === tile.row && t.col === tile.col - 1);
  const rightBlocked = tiles.some(t => !t.matched && t.layer === tile.layer && t.row === tile.row && t.col === tile.col + 1);
  return !(leftBlocked && rightBlocked);
}

export default function Mahjong() {
  const [tiles, setTiles] = useState<Tile[]>(() => initGame('turtle'));
  const [layout, setLayout] = useState<LayoutType>('turtle');
  const [selectedTile, setSelectedTile] = useState<Tile | null>(null);
  const [score, setScore] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [paused, setPaused] = useState(false);
  const [gameWon, setGameWon] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [shufflesLeft, setShufflesLeft] = useState(3);
  const [hintsLeft, setHintsLeft] = useState(5);
  const [undoStack, setUndoStack] = useState<Tile[][]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!paused && !gameWon && !gameOver) {
      timerRef.current = setInterval(() => setElapsed(e => e + 1), 1000);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [paused, gameWon, gameOver]);

  const freeTiles = tiles.filter(t => isTileFree(tiles, t));
  const hasMatches = freeTiles.some(a => freeTiles.some(b => a.id !== b.id && tilesMatch(a, b)));

  useEffect(() => {
    if (!gameWon && !gameOver && tiles.length > 0) {
      const remaining = tiles.filter(t => !t.matched);
      if (remaining.length === 0) {
        setGameWon(true);
        setScore(s => s + Math.max(0, 1000 - elapsed));
      } else if (!hasMatches && shufflesLeft === 0) {
        setGameOver(true);
      }
    }
  }, [tiles, hasMatches, shufflesLeft, gameWon, gameOver, elapsed]);

  const handleTileClick = useCallback((tile: Tile) => {
    if (paused || gameWon || gameOver || tile.matched) return;
    if (!isTileFree(tiles, tile)) return;

    if (!selectedTile) {
      setTiles(prev => prev.map(t => t.id === tile.id ? { ...t, selected: true } : { ...t, selected: false }));
      setSelectedTile(tile);
      return;
    }

    if (selectedTile.id === tile.id) {
      setTiles(prev => prev.map(t => ({ ...t, selected: false, hinted: false })));
      setSelectedTile(null);
      return;
    }

    if (tilesMatch(selectedTile, tile)) {
      setUndoStack(prev => [...prev.slice(-10), tiles]);
      setTiles(prev => prev.map(t =>
        t.id === selectedTile.id || t.id === tile.id
          ? { ...t, matched: true, selected: false, hinted: false }
          : { ...t, selected: false, hinted: false }
      ));
      setSelectedTile(null);
      setScore(s => s + 10 + Math.max(0, 20 - elapsed % 10));
    } else {
      setTiles(prev => prev.map(t => t.id === tile.id ? { ...t, selected: true } : { ...t, selected: false, hinted: false }));
      setSelectedTile(tile);
    }
  }, [selectedTile, tiles, paused, gameWon, gameOver, elapsed]);

  const handleShuffle = useCallback(() => {
    if (shufflesLeft <= 0) return;
    setUndoStack(prev => [...prev.slice(-10), tiles]);
    const remaining = tiles.filter(t => !t.matched);
    const shuffled = shuffleArray(remaining);
    let idx = 0;
    setTiles(prev => prev.map(t => {
      if (t.matched) return t;
      return { ...t, ...shuffled[idx++], selected: false, hinted: false };
    }));
    setShufflesLeft(s => s - 1);
    setSelectedTile(null);
  }, [tiles, shufflesLeft]);

  const handleHint = useCallback(() => {
    if (hintsLeft <= 0) return;
    setTiles(prev => prev.map(t => ({ ...t, hinted: false })));
    const free = tiles.filter(t => isTileFree(tiles, t) && !t.matched);
    for (const a of free) {
      for (const b of free) {
        if (a.id !== b.id && tilesMatch(a, b)) {
          setTiles(prev => prev.map(t => t.id === a.id || t.id === b.id ? { ...t, hinted: true } : t));
          setHintsLeft(s => s - 1);
          setTimeout(() => setTiles(prev => prev.map(t => ({ ...t, hinted: false }))), 3000);
          return;
        }
      }
    }
  }, [tiles, hintsLeft]);

  const handleUndo = useCallback(() => {
    if (undoStack.length === 0) return;
    const prev = undoStack[undoStack.length - 1];
    setTiles(prev);
    setUndoStack(s => s.slice(0, -1));
    setSelectedTile(null);
    setScore(s => Math.max(0, s - 5));
  }, [undoStack]);

  const handleNewGame = useCallback((l?: LayoutType) => {
    const newLayout = l || layout;
    setLayout(newLayout);
    setTiles(initGame(newLayout));
    setSelectedTile(null);
    setScore(0);
    setElapsed(0);
    setPaused(false);
    setGameWon(false);
    setGameOver(false);
    setShufflesLeft(3);
    setHintsLeft(5);
    setUndoStack([]);
  }, [layout]);

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  const remainingCount = tiles.filter(t => !t.matched).length;
  const maxRow = Math.max(...tiles.map(t => t.row), 0);
  const maxCol = Math.max(...tiles.map(t => t.col), 0);

  return (
    <div className="w-full h-full flex flex-col" style={{ backgroundColor: 'var(--ink-50)' }}>
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 border-b" style={{ borderColor: 'var(--ink-200)' }}>
        <div className="flex items-center gap-2">
          <button onClick={() => handleNewGame()} className="flex items-center gap-1 px-3 py-1.5 rounded text-sm transition-all hover:scale-[1.02]"
            style={{ backgroundColor: 'var(--ink-800)', color: 'var(--ink-50)' }}>
            <RotateCcw size={14} /> 新局 (New)
          </button>
          <button onClick={handleShuffle} disabled={shufflesLeft <= 0 || gameWon || gameOver}
            className="flex items-center gap-1 px-3 py-1.5 rounded text-sm border transition-all hover:scale-[1.02] disabled:opacity-40"
            style={{ borderColor: 'var(--ink-400)', color: 'var(--ink-700)' }}>
            <Shuffle size={14} /> 重洗 ({shufflesLeft})
          </button>
          <button onClick={handleHint} disabled={hintsLeft <= 0 || gameWon || gameOver}
            className="flex items-center gap-1 px-3 py-1.5 rounded text-sm border transition-all hover:scale-[1.02] disabled:opacity-40"
            style={{ borderColor: 'var(--ink-400)', color: 'var(--ink-700)' }}>
            <Lightbulb size={14} /> 提示 ({hintsLeft})
          </button>
          <button onClick={handleUndo} disabled={undoStack.length === 0}
            className="flex items-center gap-1 px-3 py-1.5 rounded text-sm border transition-all hover:scale-[1.02] disabled:opacity-40"
            style={{ borderColor: 'var(--ink-400)', color: 'var(--ink-700)' }}>
            <Undo2 size={14} /> 撤销 (Undo)
          </button>
          <button onClick={() => setPaused(p => !p)}
            className="flex items-center gap-1 px-3 py-1.5 rounded text-sm border transition-all hover:scale-[1.02]"
            style={{ borderColor: 'var(--ink-400)', color: 'var(--ink-700)' }}>
            {paused ? <Play size={14} /> : <Pause size={14} />}
            {paused ? '继续' : '暂停'}
          </button>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1 text-sm" style={{ color: 'var(--ink-600)' }}>
            <Star size={14} /> 分数 (Score): <span className="font-medium" style={{ color: 'var(--ink-800)' }}>{score}</span>
          </div>
          <div className="flex items-center gap-1 text-sm" style={{ color: 'var(--ink-600)' }}>
            <Timer size={14} /> {formatTime(elapsed)}
          </div>
          <div className="text-sm" style={{ color: 'var(--ink-600)' }}>
            剩余 (Left): {remainingCount / 2}对
          </div>
          <select value={layout} onChange={e => handleNewGame(e.target.value as LayoutType)}
            className="text-sm rounded px-2 py-1 border" style={{ borderColor: 'var(--ink-300)', backgroundColor: 'var(--ink-50)' }}>
            <option value="turtle">龟形 (Turtle)</option>
            <option value="pyramid">金字塔 (Pyramid)</option>
            <option value="spider">蜘蛛 (Spider)</option>
          </select>
        </div>
      </div>

      {/* Game area */}
      <div className="flex-1 overflow-auto flex items-center justify-center p-4 relative">
        {paused && (
          <div className="absolute inset-0 flex items-center justify-center z-20" style={{ backgroundColor: 'rgba(26,26,26,0.5)' }}>
            <div className="text-xl font-medium" style={{ color: 'white' }}>暂停 (Paused)</div>
          </div>
        )}
        {(gameWon || gameOver) && (
          <div className="absolute inset-0 flex items-center justify-center z-20" style={{ backgroundColor: 'rgba(26,26,26,0.6)' }}>
            <div className="text-center p-6 rounded-lg" style={{ backgroundColor: 'var(--ink-100)', boxShadow: '0 12px 40px rgba(26,26,26,0.14)' }}>
              <div className="text-2xl font-bold mb-2" style={{ color: gameWon ? 'var(--success)' : 'var(--cinnabar)' }}>
                {gameWon ? '恭喜过关! (Win!)' : '无法继续 (No Moves)'}
              </div>
              <div className="text-sm mb-4" style={{ color: 'var(--ink-600)' }}>
                分数 (Score): {score} | 时间 (Time): {formatTime(elapsed)}
              </div>
              <button onClick={() => handleNewGame()}
                className="px-4 py-2 rounded text-sm transition-all hover:scale-[1.02]"
                style={{ backgroundColor: 'var(--ink-800)', color: 'var(--ink-50)' }}>
                再来一局 (Play Again)
              </button>
            </div>
          </div>
        )}

        <div className="relative" style={{ width: (maxCol + 1) * 42 + 20, height: (maxRow + 1) * 52 + 20 }}>
          {tiles.map(tile => {
            if (tile.matched) return null;
            const isFree = isTileFree(tiles, tile);
            const name = getTileName(tile);
            const color = tile.suit === 'dragon' ? DRAGON_COLORS[name] || 'var(--ink-800)' :
              tile.suit === 'wind' ? 'var(--ink-800)' : 'var(--ink-800)';
            return (
              <div key={tile.id}
                onClick={() => handleTileClick(tile)}
                className="absolute flex flex-col items-center justify-center rounded cursor-pointer transition-all select-none"
                style={{
                  left: tile.col * 42,
                  top: tile.row * 52 - tile.layer * 4,
                  width: 40,
                  height: 50,
                  backgroundColor: tile.selected ? 'var(--ink-100)' : 'var(--ink-50)',
                  border: tile.selected ? '2px solid var(--cinnabar)' : tile.hinted ? '2px solid var(--warning)' : '1px solid var(--ink-300)',
                  boxShadow: tile.selected ? '0 4px 12px rgba(26,26,26,0.15)' : `0 ${2 + tile.layer}px ${4 + tile.layer * 2}px rgba(26,26,26,0.08)`,
                  transform: tile.selected ? 'scale(1.05)' : 'scale(1)',
                  opacity: isFree ? 1 : 0.6,
                  zIndex: tile.layer * 100 + tile.row * 10 + tile.col,
                  filter: isFree ? 'none' : 'brightness(0.85)',
                }}>
                <span className="text-lg font-bold" style={{ color, fontFamily: '"Noto Serif SC", serif' }}>
                  {name}
                </span>
                {tile.suit === 'bamboo' && <span className="text-[8px]" style={{ color: 'var(--ink-400)' }}>条</span>}
                {tile.suit === 'dot' && <span className="text-[8px]" style={{ color: 'var(--ink-400)' }}>筒</span>}
                {tile.suit === 'character' && <span className="text-[8px]" style={{ color: 'var(--ink-400)' }}>万</span>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

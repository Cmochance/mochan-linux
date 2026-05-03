import { useState, useCallback, useRef, useEffect } from 'react';
import { RotateCcw, Eye, EyeOff, Shuffle, ImagePlus, Trophy, Timer, Move, Lightbulb } from 'lucide-react';

type Difficulty = 'easy' | 'medium' | 'hard';

const DIFFICULTY_GRID: Record<Difficulty, number> = { easy: 4, medium: 6, hard: 8 };

interface Piece {
  id: number;
  correctRow: number;
  correctCol: number;
  currentX: number;
  currentY: number;
  placed: boolean;
}

function generateDefaultImage(width: number, height: number): string {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  // Create an ink-wash style gradient pattern
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, '#e8e4df');
  gradient.addColorStop(0.3, '#d9d9d9');
  gradient.addColorStop(0.6, '#c4b8a8');
  gradient.addColorStop(1, '#b8a89a');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  // Draw some ink wash mountain shapes
  ctx.fillStyle = 'rgba(26,26,26,0.15)';
  ctx.beginPath();
  ctx.moveTo(0, height * 0.7);
  for (let x = 0; x <= width; x += 10) {
    ctx.lineTo(x, height * 0.7 - Math.sin(x * 0.01) * 40 - Math.sin(x * 0.03) * 20);
  }
  ctx.lineTo(width, height);
  ctx.lineTo(0, height);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = 'rgba(26,26,26,0.25)';
  ctx.beginPath();
  ctx.moveTo(0, height * 0.8);
  for (let x = 0; x <= width; x += 10) {
    ctx.lineTo(x, height * 0.8 - Math.sin(x * 0.008 + 1) * 50 - Math.sin(x * 0.02) * 30);
  }
  ctx.lineTo(width, height);
  ctx.lineTo(0, height);
  ctx.closePath();
  ctx.fill();

  // Add some ink dots
  for (let i = 0; i < 30; i++) {
    const x = Math.random() * width;
    const y = Math.random() * height * 0.5;
    const r = 2 + Math.random() * 8;
    ctx.fillStyle = `rgba(26,26,26,${0.05 + Math.random() * 0.15})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Add a red seal stamp
  ctx.fillStyle = '#b3392f';
  ctx.font = 'bold 48px "Noto Serif SC", serif';
  ctx.globalAlpha = 0.3;
  ctx.fillText('墨', width * 0.75, height * 0.25);
  ctx.globalAlpha = 1;

  return canvas.toDataURL('image/png');
}

export default function JigsawPuzzle() {
  const [imageSrc, setImageSrc] = useState<string>('');
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [pieces, setPieces] = useState<Piece[]>([]);
  const [gridSize, setGridSize] = useState(6);
  const [preview, setPreview] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [moveCount, setMoveCount] = useState(0);
  const [gameWon, setGameWon] = useState(false);
  const [dragPiece, setDragPiece] = useState<number | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [hintMode, setHintMode] = useState(false);
  const boardRef = useRef<HTMLDivElement>(null);
  const trayRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const [boardSize, setBoardSize] = useState(480);
  const [imgLoaded, setImgLoaded] = useState(false);

  // Initialize with default image
  useEffect(() => {
    if (!imageSrc) {
      const defaultImg = generateDefaultImage(600, 600);
      setImageSrc(defaultImg);
    }
  }, [imageSrc]);

  useEffect(() => {
    if (imageSrc && imgLoaded && !gameWon) {
      timerRef.current = setInterval(() => setElapsed(e => e + 1), 1000);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [imageSrc, imgLoaded, gameWon]);

  // Check win
  useEffect(() => {
    if (pieces.length > 0 && pieces.every(p => p.placed)) {
      setGameWon(true);
      if (timerRef.current) clearInterval(timerRef.current);
    }
  }, [pieces]);

  const initPieces = useCallback((img: HTMLImageElement, gSize: number) => {
    const pieceW = img.naturalWidth / gSize;
    const pieceH = img.naturalHeight / gSize;
    const newPieces: Piece[] = [];
    const unplacedPositions: { x: number; y: number }[] = [];

    // Create grid positions in tray area
    const trayCols = Math.ceil(gSize * gSize / 4);
    for (let i = 0; i < gSize * gSize; i++) {
      unplacedPositions.push({
        x: (i % trayCols) * (pieceW + 4) + 10,
        y: Math.floor(i / trayCols) * (pieceH + 4) + 10,
      });
    }

    // Shuffle positions
    for (let i = unplacedPositions.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [unplacedPositions[i], unplacedPositions[j]] = [unplacedPositions[j], unplacedPositions[i]];
    }

    let idx = 0;
    for (let r = 0; r < gSize; r++) {
      for (let c = 0; c < gSize; c++) {
        newPieces.push({
          id: idx,
          correctRow: r,
          correctCol: c,
          currentX: unplacedPositions[idx].x,
          currentY: unplacedPositions[idx].y,
          placed: false,
        });
        idx++;
      }
    }
    setPieces(newPieces);
    setGameWon(false);
    setElapsed(0);
    setMoveCount(0);
    setHintMode(false);
  }, []);

  const handleImageLoad = useCallback((img: HTMLImageElement) => {
    imageRef.current = img;
    const gSize = DIFFICULTY_GRID[difficulty];
    setGridSize(gSize);
    const size = Math.min(480, img.naturalWidth, img.naturalHeight);
    setBoardSize(size);
    initPieces(img, gSize);
    setImgLoaded(true);
  }, [difficulty, initPieces]);

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const src = ev.target?.result as string;
      setImageSrc(src);
      setImgLoaded(false);
      const img = new Image();
      img.onload = () => handleImageLoad(img);
      img.src = src;
    };
    reader.readAsDataURL(file);
  }, [handleImageLoad]);

  // Load image when source changes
  useEffect(() => {
    if (!imageSrc) return;
    const img = new Image();
    img.onload = () => handleImageLoad(img);
    img.src = imageSrc;
  }, [imageSrc, handleImageLoad]);

  const pieceW = boardSize / gridSize;
  const pieceH = boardSize / gridSize;

  const getGridPosition = (row: number, col: number) => {
    if (!boardRef.current) return { x: 0, y: 0 };
    const rect = boardRef.current.getBoundingClientRect();
    return {
      x: rect.left + col * pieceW,
      y: rect.top + row * pieceH,
    };
  };

  const handleMouseDown = useCallback((e: React.MouseEvent, pieceId: number) => {
    const piece = pieces.find(p => p.id === pieceId);
    if (!piece || piece.placed) return;
    e.preventDefault();
    setDragPiece(pieceId);
    setDragOffset({ x: e.clientX - piece.currentX, y: e.clientY - piece.currentY });
  }, [pieces]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (dragPiece === null) return;
    setPieces(prev => prev.map(p =>
      p.id === dragPiece ? { ...p, currentX: e.clientX - dragOffset.x, currentY: e.clientY - dragOffset.y } : p
    ));
  }, [dragPiece, dragOffset]);

  const handleMouseUp = useCallback(() => {
    if (dragPiece === null) return;
    const piece = pieces.find(p => p.id === dragPiece);
    if (!piece) { setDragPiece(null); return; }

    // Check if dropped near correct position
    const correctPos = getGridPosition(piece.correctRow, piece.correctCol);
    const dist = Math.sqrt(
      Math.pow(piece.currentX - correctPos.x + pieceW / 2, 2) +
      Math.pow(piece.currentY - correctPos.y + pieceH / 2, 2)
    );

    if (dist < pieceW * 0.6) {
      // Snap to correct position
      setPieces(prev => prev.map(p =>
        p.id === dragPiece ? {
          ...p,
          currentX: correctPos.x - (boardRef.current?.getBoundingClientRect().left || 0),
          currentY: correctPos.y - (boardRef.current?.getBoundingClientRect().top || 0),
          placed: true,
        } : p
      ));
      setMoveCount(m => m + 1);
    }

    setDragPiece(null);
  }, [dragPiece, pieces, pieceW, pieceH]);

  const handleShuffle = useCallback(() => {
    if (!imageRef.current) return;
    initPieces(imageRef.current, gridSize);
  }, [gridSize, initPieces]);

  const handleDifficultyChange = useCallback((d: Difficulty) => {
    setDifficulty(d);
    const gSize = DIFFICULTY_GRID[d];
    setGridSize(gSize);
    if (imageRef.current) {
      initPieces(imageRef.current, gSize);
    }
  }, [initPieces]);

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  const placedCount = pieces.filter(p => p.placed).length;
  const totalCount = gridSize * gridSize;

  return (
    <div className="w-full h-full flex flex-col" style={{ backgroundColor: 'var(--ink-50)' }}
      onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}>
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 border-b" style={{ borderColor: 'var(--ink-200)' }}>
        <div className="flex items-center gap-2">
          <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileUpload} className="hidden" />
          <button onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1 px-3 py-1.5 rounded text-sm transition-all hover:scale-[1.02]"
            style={{ backgroundColor: 'var(--ink-800)', color: 'var(--ink-50)' }}>
            <ImagePlus size={14} /> 上传图片 (Upload)
          </button>
          <button onClick={handleShuffle}
            className="flex items-center gap-1 px-3 py-1.5 rounded text-sm border transition-all hover:scale-[1.02]"
            style={{ borderColor: 'var(--ink-400)', color: 'var(--ink-700)' }}>
            <Shuffle size={14} /> 重洗 (Shuffle)
          </button>
          <button onClick={() => setPreview(p => !p)}
            className="flex items-center gap-1 px-3 py-1.5 rounded text-sm border transition-all hover:scale-[1.02]"
            style={{ borderColor: 'var(--ink-400)', color: 'var(--ink-700)' }}>
            {preview ? <EyeOff size={14} /> : <Eye size={14} />}
            {preview ? '隐藏 (Hide)' : '预览 (Preview)'}
          </button>
          <button onClick={() => setHintMode(h => !h)}
            className="flex items-center gap-1 px-3 py-1.5 rounded text-sm border transition-all hover:scale-[1.02]"
            style={{
              borderColor: hintMode ? 'var(--cinnabar)' : 'var(--ink-400)',
              color: hintMode ? 'var(--cinnabar)' : 'var(--ink-700)',
              backgroundColor: hintMode ? 'rgba(179,57,47,0.08)' : 'transparent',
            }}>
            <Lightbulb size={14} /> 提示 (Hint)
          </button>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 text-sm" style={{ color: 'var(--ink-600)' }}>
            <Timer size={14} /> {formatTime(elapsed)}
          </div>
          <div className="flex items-center gap-1 text-sm" style={{ color: 'var(--ink-600)' }}>
            <Move size={14} /> {moveCount}
          </div>
          <div className="text-sm" style={{ color: 'var(--ink-600)' }}>
            {placedCount}/{totalCount}
          </div>
          <select value={difficulty} onChange={e => handleDifficultyChange(e.target.value as Difficulty)}
            className="text-sm rounded px-2 py-1 border" style={{ borderColor: 'var(--ink-300)', backgroundColor: 'var(--ink-50)' }}>
            <option value="easy">简单 4×4 (Easy)</option>
            <option value="medium">中等 6×6 (Medium)</option>
            <option value="hard">困难 8×8 (Hard)</option>
          </select>
        </div>
      </div>

      {/* Game area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Board */}
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="relative">
            {/* Board grid */}
            <div ref={boardRef} className="relative" style={{
              width: boardSize,
              height: boardSize,
              backgroundColor: 'var(--ink-200)',
              borderRadius: '4px',
            }}>
              {/* Grid cells */}
              {Array.from({ length: gridSize }, (_, r) =>
                Array.from({ length: gridSize }, (_, c) => (
                  <div key={`grid-${r}-${c}`} className="absolute"
                    style={{
                      left: c * pieceW,
                      top: r * pieceH,
                      width: pieceW,
                      height: pieceH,
                      border: '1px dashed var(--ink-300)',
                      backgroundColor: 'var(--ink-100)',
                    }}>
                    {hintMode && (
                      <div className="w-full h-full flex items-center justify-center text-xs"
                        style={{ color: 'var(--ink-400)', opacity: 0.4 }}>
                        {r * gridSize + c + 1}
                      </div>
                    )}
                  </div>
                ))
              )}

              {/* Preview overlay */}
              {preview && imageSrc && (
                <img src={imageSrc} alt="preview"
                  className="absolute inset-0 object-cover rounded"
                  style={{ width: boardSize, height: boardSize, opacity: 0.3, zIndex: 5, pointerEvents: 'none' }} />
              )}

              {/* Placed pieces on board */}
              {pieces.filter(p => p.placed).map(piece => (
                <div key={`placed-${piece.id}`} className="absolute"
                  style={{
                    left: piece.correctCol * pieceW,
                    top: piece.correctRow * pieceH,
                    width: pieceW,
                    height: pieceH,
                    backgroundImage: `url(${imageSrc})`,
                    backgroundSize: `${boardSize}px ${boardSize}px`,
                    backgroundPosition: `-${piece.correctCol * pieceW}px -${piece.correctRow * pieceH}px`,
                    zIndex: 10,
                    boxShadow: '0 0 4px rgba(74,124,89,0.3)',
                  }} />
              ))}

              {/* Win celebration */}
              {gameWon && (
                <div className="absolute inset-0 flex items-center justify-center z-30" style={{ backgroundColor: 'rgba(26,26,26,0.5)' }}>
                  <div className="text-center p-6 rounded-lg" style={{ backgroundColor: 'var(--ink-100)', boxShadow: '0 12px 40px rgba(26,26,26,0.14)' }}>
                    <Trophy size={40} style={{ color: 'var(--warning)' }} className="mx-auto mb-2" />
                    <div className="text-xl font-bold mb-2" style={{ color: 'var(--success)' }}>恭喜完成! (Completed!)</div>
                    <div className="text-sm" style={{ color: 'var(--ink-600)' }}>
                      时间: {formatTime(elapsed)} | 步数: {moveCount}
                    </div>
                    <button onClick={handleShuffle}
                      className="mt-3 px-4 py-2 rounded text-sm transition-all hover:scale-[1.02]"
                      style={{ backgroundColor: 'var(--ink-800)', color: 'var(--ink-50)' }}>
                      再来一局 (Play Again)
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Piece Tray */}
        {!gameWon && (
          <div ref={trayRef} className="w-48 border-l flex flex-col overflow-hidden" style={{ borderColor: 'var(--ink-200)', backgroundColor: 'var(--ink-100)' }}>
            <div className="p-2 text-xs font-medium border-b" style={{ borderColor: 'var(--ink-200)', color: 'var(--ink-600)' }}>
              拼图片 (Pieces) — 拖拽到正确位置 (Drag to board)
            </div>
            <div className="flex-1 overflow-y-auto p-2 relative" style={{ minHeight: 0 }}>
              {pieces.filter(p => !p.placed).map(piece => (
                <div key={`tray-${piece.id}`}
                  className="absolute cursor-grab active:cursor-grabbing select-none rounded-sm"
                  style={{
                    left: piece.currentX,
                    top: piece.currentY,
                    width: pieceW * 0.7,
                    height: pieceH * 0.7,
                    backgroundImage: `url(${imageSrc})`,
                    backgroundSize: `${boardSize * 0.7}px ${boardSize * 0.7}px`,
                    backgroundPosition: `-${piece.correctCol * pieceW * 0.7}px -${piece.correctRow * pieceH * 0.7}px`,
                    boxShadow: dragPiece === piece.id ? '0 4px 12px rgba(26,26,26,0.3)' : '0 1px 3px rgba(26,26,26,0.1)',
                    transform: dragPiece === piece.id ? 'scale(1.05)' : 'scale(1)',
                    zIndex: dragPiece === piece.id ? 100 : 1,
                    transition: dragPiece === piece.id ? 'none' : 'all 0.1s ease',
                    border: hintMode ? '1px solid var(--ink-400)' : 'none',
                  }}
                  onMouseDown={(e) => handleMouseDown(e, piece.id)}>
                  {hintMode && (
                    <div className="absolute inset-0 flex items-center justify-center text-xs font-bold"
                      style={{ color: 'var(--ink-50)', textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}>
                      {piece.correctRow * gridSize + piece.correctCol + 1}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

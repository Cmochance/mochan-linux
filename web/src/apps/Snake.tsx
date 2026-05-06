import { useState, useEffect, useCallback, useRef } from 'react';
import { RotateCcw, Pause, Play, Trophy, Zap, ArrowUp, ArrowDown, ArrowLeft, ArrowRight } from 'lucide-react';
import { appStateClient } from '@/lib/app-state';

type Direction = 'UP' | 'DOWN' | 'LEFT' | 'RIGHT';
type Position = { x: number; y: number };
type Difficulty = 'easy' | 'medium' | 'hard';

const GRID_SIZE = 20;
const DIFFICULTY_SPEED: Record<Difficulty, number> = { easy: 180, medium: 130, hard: 90 };
const HIGH_SCORE_KEY = 'snake_high_score';
const APP_ID = 'snake';

interface SnakeState {
  highScore: number;
}

function getHighScore(): number {
  try { return Number(localStorage.getItem(HIGH_SCORE_KEY)) || 0; } catch { return 0; }
}

function randomFood(exclude: Position[]): Position {
  let pos: Position;
  do {
    pos = { x: Math.floor(Math.random() * GRID_SIZE), y: Math.floor(Math.random() * GRID_SIZE) };
  } while (exclude.some(e => e.x === pos.x && e.y === pos.y));
  return pos;
}

export default function Snake() {
  const [snake, setSnake] = useState<Position[]>([{ x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 }]);
  const [direction, setDirection] = useState<Direction>('RIGHT');
  const [food, setFood] = useState<Position>(() => randomFood([{ x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 }]));
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [paused, setPaused] = useState(false);
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [speed, setSpeed] = useState(1);
  const directionRef = useRef<Direction>('RIGHT');
  const gameLoopRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const snakeRef = useRef<Position[]>(snake);
  const scoreRef = useRef(0);
  const highScoreRef = useRef(0);
  const loadedRef = useRef(false);

  snakeRef.current = snake;
  scoreRef.current = score;
  highScoreRef.current = highScore;

  useEffect(() => {
    let alive = true;
    appStateClient.getOrDefault<SnakeState>(APP_ID, { highScore: getHighScore() })
      .then(state => {
        if (!alive) return;
        setHighScore(Math.max(0, Number(state.highScore) || 0));
      })
      .catch(err => console.error('Failed to load snake state:', err))
      .finally(() => {
        if (alive) loadedRef.current = true;
      });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!loadedRef.current) return;
    appStateClient.put<SnakeState>(APP_ID, { highScore })
      .catch(err => console.error('Failed to save snake state:', err));
  }, [highScore]);

  const resetGame = useCallback(() => {
    const initialSnake = [{ x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 }];
    setSnake(initialSnake);
    setDirection('RIGHT');
    directionRef.current = 'RIGHT';
    setFood(randomFood(initialSnake));
    setScore(0);
    setGameOver(false);
    setPaused(false);
    setSpeed(1);
  }, []);

  const handleGameOver = useCallback(() => {
    setGameOver(true);
    if (scoreRef.current > highScoreRef.current) {
      setHighScore(scoreRef.current);
    }
  }, []);

  useEffect(() => {
    if (gameOver || paused) {
      if (gameLoopRef.current) clearInterval(gameLoopRef.current);
      return;
    }
    const baseSpeed = DIFFICULTY_SPEED[difficulty];
    const currentSpeed = Math.max(60, baseSpeed - (speed - 1) * 10);
    gameLoopRef.current = setInterval(() => {
      setSnake(prevSnake => {
        const head = prevSnake[0];
        const dir = directionRef.current;
        let newHead: Position;
        switch (dir) {
          case 'UP': newHead = { x: head.x, y: head.y - 1 }; break;
          case 'DOWN': newHead = { x: head.x, y: head.y + 1 }; break;
          case 'LEFT': newHead = { x: head.x - 1, y: head.y }; break;
          case 'RIGHT': newHead = { x: head.x + 1, y: head.y }; break;
        }
        // Wall collision
        if (newHead.x < 0 || newHead.x >= GRID_SIZE || newHead.y < 0 || newHead.y >= GRID_SIZE) {
          handleGameOver();
          return prevSnake;
        }
        // Self collision
        if (prevSnake.some(s => s.x === newHead.x && s.y === newHead.y)) {
          handleGameOver();
          return prevSnake;
        }
        const newSnake = [newHead, ...prevSnake];
        // Check food
        setFood(currentFood => {
          if (newHead.x === currentFood.x && newHead.y === currentFood.y) {
            setScore(s => {
              const newScore = s + 10 * speed;
              const newSpeed = Math.floor(newScore / 50) + 1;
              setSpeed(newSpeed);
              return newScore;
            });
            return randomFood(newSnake);
          }
          newSnake.pop();
          return currentFood;
        });
        return newSnake;
      });
    }, Math.max(60, DIFFICULTY_SPEED[difficulty] - (speed - 1) * 10));
    return () => { if (gameLoopRef.current) clearInterval(gameLoopRef.current); };
  }, [gameOver, paused, difficulty, speed, handleGameOver]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (gameOver) return;
      switch (e.key) {
        case 'ArrowUp': case 'w': case 'W':
          if (directionRef.current !== 'DOWN') {
            e.preventDefault();
            setDirection('UP');
            directionRef.current = 'UP';
          }
          break;
        case 'ArrowDown': case 's': case 'S':
          if (directionRef.current !== 'UP') {
            e.preventDefault();
            setDirection('DOWN');
            directionRef.current = 'DOWN';
          }
          break;
        case 'ArrowLeft': case 'a': case 'A':
          if (directionRef.current !== 'RIGHT') {
            e.preventDefault();
            setDirection('LEFT');
            directionRef.current = 'LEFT';
          }
          break;
        case 'ArrowRight': case 'd': case 'D':
          if (directionRef.current !== 'LEFT') {
            e.preventDefault();
            setDirection('RIGHT');
            directionRef.current = 'RIGHT';
          }
          break;
        case ' ':
          e.preventDefault();
          setPaused(p => !p);
          break;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [gameOver]);

  const cellSize = 22;
  const getSnakeOpacity = (index: number, total: number) => {
    return Math.max(0.5, 1 - (index / total) * 0.4);
  };

  return (
    <div className="w-full h-full flex flex-col" style={{ backgroundColor: 'var(--ink-50)' }} tabIndex={0}>
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 border-b" style={{ borderColor: 'var(--ink-200)' }}>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1 text-sm" style={{ color: 'var(--ink-700)' }}>
            <Zap size={14} /> 分数 (Score): <span className="font-medium">{score}</span>
          </div>
          <div className="flex items-center gap-1 text-sm" style={{ color: 'var(--ink-600)' }}>
            <Trophy size={14} /> 最高 (Best): <span className="font-medium">{highScore}</span>
          </div>
          <div className="text-sm" style={{ color: 'var(--ink-600)' }}>
            速度 (Speed): {speed}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select value={difficulty} onChange={e => { setDifficulty(e.target.value as Difficulty); resetGame(); }}
            className="text-sm rounded px-2 py-1 border" style={{ borderColor: 'var(--ink-300)', backgroundColor: 'var(--ink-50)' }}>
            <option value="easy">简单 (Easy)</option>
            <option value="medium">中等 (Medium)</option>
            <option value="hard">困难 (Hard)</option>
          </select>
          <button onClick={() => setPaused(p => !p)} disabled={gameOver}
            className="flex items-center gap-1 px-3 py-1.5 rounded text-sm border transition-all hover:scale-[1.02] disabled:opacity-40"
            style={{ borderColor: 'var(--ink-400)', color: 'var(--ink-700)' }}>
            {paused ? <Play size={14} /> : <Pause size={14} />}
          </button>
          <button onClick={resetGame}
            className="flex items-center gap-1 px-3 py-1.5 rounded text-sm transition-all hover:scale-[1.02]"
            style={{ backgroundColor: 'var(--ink-800)', color: 'var(--ink-50)' }}>
            <RotateCcw size={14} /> 重新开始 (Restart)
          </button>
        </div>
      </div>

      {/* Game area */}
      <div className="flex-1 flex items-center justify-center overflow-auto p-4">
        <div className="flex flex-col items-center gap-4">
          <div className="relative rounded" style={{
            width: GRID_SIZE * cellSize,
            height: GRID_SIZE * cellSize,
            border: '2px solid var(--ink-400)',
            backgroundColor: 'var(--ink-50)',
          }}>
            {/* Grid lines */}
            <svg className="absolute inset-0" width={GRID_SIZE * cellSize} height={GRID_SIZE * cellSize}>
              {Array.from({ length: GRID_SIZE + 1 }, (_, i) => (
                <g key={`grid-${i}`}>
                  <line x1={0} y1={i * cellSize} x2={GRID_SIZE * cellSize} y2={i * cellSize}
                    stroke="var(--ink-200)" strokeWidth={0.5} strokeOpacity={0.5} />
                  <line x1={i * cellSize} y1={0} x2={i * cellSize} y2={GRID_SIZE * cellSize}
                    stroke="var(--ink-200)" strokeWidth={0.5} strokeOpacity={0.5} />
                </g>
              ))}
            </svg>

            {/* Food */}
            <div className="absolute rounded-full animate-pulse"
              style={{
                left: food.x * cellSize + 3,
                top: food.y * cellSize + 3,
                width: cellSize - 6,
                height: cellSize - 6,
                backgroundColor: 'var(--cinnabar)',
                boxShadow: '0 0 6px rgba(179,57,47,0.4)',
              }} />

            {/* Snake */}
            {snake.map((segment, i) => {
              const isHead = i === 0;
              const opacity = getSnakeOpacity(i, snake.length);
              return (
                <div key={i} className="absolute"
                  style={{
                    left: segment.x * cellSize + (isHead ? 0 : 1),
                    top: segment.y * cellSize + (isHead ? 0 : 1),
                    width: isHead ? cellSize : cellSize - 2,
                    height: isHead ? cellSize : cellSize - 2,
                    backgroundColor: isHead ? 'var(--ink-900)' : 'var(--ink-800)',
                    opacity,
                    borderRadius: isHead ? '5px' : '4px',
                    transition: 'left 0.05s linear, top 0.05s linear',
                    zIndex: snake.length - i,
                  }}>
                  {isHead && (
                    <>
                      {/* Eyes */}
                      <div style={{
                        position: 'absolute',
                        width: 3, height: 3, borderRadius: '50%',
                        backgroundColor: 'var(--ink-50)',
                        top: direction === 'DOWN' ? 4 : direction === 'UP' ? 12 : 8,
                        left: direction === 'RIGHT' ? 12 : direction === 'LEFT' ? 4 : 6,
                      }} />
                      <div style={{
                        position: 'absolute',
                        width: 3, height: 3, borderRadius: '50%',
                        backgroundColor: 'var(--ink-50)',
                        top: direction === 'DOWN' ? 4 : direction === 'UP' ? 12 : 8,
                        left: direction === 'RIGHT' ? 12 : direction === 'LEFT' ? 4 : 13,
                      }} />
                    </>
                  )}
                </div>
              );
            })}

            {/* Game Over Overlay */}
            {gameOver && (
              <div className="absolute inset-0 flex items-center justify-center z-10" style={{ backgroundColor: 'rgba(26,26,26,0.75)', borderRadius: 'inherit' }}>
                <div className="text-center p-5 rounded-lg" style={{ backgroundColor: 'var(--ink-100)', boxShadow: '0 12px 40px rgba(26,26,26,0.14)' }}>
                  <div className="text-xl font-bold mb-2" style={{ color: 'var(--cinnabar)' }}>游戏结束 (Game Over)</div>
                  <div className="text-sm mb-1" style={{ color: 'var(--ink-700)' }}>分数 (Score): {score}</div>
                  {score >= highScore && score > 0 && (
                    <div className="text-sm mb-2 animate-pulse" style={{ color: 'var(--warning)' }}>
                      <Trophy size={14} className="inline mr-1" />新纪录! (New Record!)
                    </div>
                  )}
                  <button onClick={resetGame}
                    className="mt-2 px-4 py-2 rounded text-sm transition-all hover:scale-[1.02]"
                    style={{ backgroundColor: 'var(--ink-800)', color: 'var(--ink-50)' }}>
                    再来一局 (Play Again)
                  </button>
                </div>
              </div>
            )}

            {/* Paused overlay */}
            {paused && !gameOver && (
              <div className="absolute inset-0 flex items-center justify-center z-10" style={{ backgroundColor: 'rgba(26,26,26,0.5)', borderRadius: 'inherit' }}>
                <div className="text-lg font-medium" style={{ color: 'white' }}>暂停 (Paused)</div>
              </div>
            )}
          </div>

          {/* Controls hint */}
          <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--ink-400)' }}>
            <span>方向键 / WASD 移动</span>
            <span className="flex items-center gap-0.5">
              <ArrowUp size={12} /><ArrowDown size={12} /><ArrowLeft size={12} /><ArrowRight size={12} />
            </span>
            <span>| 空格 暂停</span>
          </div>
        </div>
      </div>
    </div>
  );
}

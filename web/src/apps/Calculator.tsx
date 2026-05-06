import { useState, useEffect, useCallback, useRef } from 'react';
import { History, Delete, Calculator as CalcIcon } from 'lucide-react';
import { appStateClient } from '@/lib/app-state';

interface CalcEntry {
  expression: string;
  result: string;
  timestamp: number;
}

const HISTORY_KEY = 'ink-os-calc-history';
const APP_ID = 'calculator';

interface CalculatorState {
  history: CalcEntry[];
}

function loadHistory(): CalcEntry[] {
  try {
    const saved = localStorage.getItem(HISTORY_KEY);
    return saved ? JSON.parse(saved).slice(-50) : [];
  } catch { return []; }
}

export default function Calculator() {
  const [display, setDisplay] = useState('0');
  const [expression, setExpression] = useState('');
  const [prevValue, setPrevValue] = useState<number | null>(null);
  const [operator, setOperator] = useState<string | null>(null);
  const [waitingForOperand, setWaitingForOperand] = useState(false);
  const [history, setHistory] = useState<CalcEntry[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [scientific, setScientific] = useState(false);
  const loadedRef = useRef(false);

  useEffect(() => {
    let alive = true;
    appStateClient.getOrDefault<CalculatorState>(APP_ID, { history: loadHistory() })
      .then(state => {
        if (!alive) return;
        setHistory(Array.isArray(state.history) ? state.history.slice(-50) : []);
      })
      .catch(err => console.error('Failed to load calculator history:', err))
      .finally(() => {
        if (alive) loadedRef.current = true;
      });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!loadedRef.current) return;
    const timer = window.setTimeout(() => {
      appStateClient.put<CalculatorState>(APP_ID, {
        history: history.slice(-50),
      }).catch(err => console.error('Failed to save calculator history:', err));
    }, 300);
    return () => window.clearTimeout(timer);
  }, [history]);

  const addToHistory = useCallback((expr: string, result: string) => {
    setHistory(prev => [...prev, { expression: expr, result, timestamp: Date.now() }]);
  }, []);

  const calculate = (a: number, b: number, op: string): number => {
    switch (op) {
      case '+': return a + b;
      case '-': return a - b;
      case '*': return a * b;
      case '/': return b === 0 ? NaN : a / b;
      case '^': return Math.pow(a, b);
      default: return b;
    }
  };

  const handleNumber = (num: string) => {
    if (waitingForOperand) {
      setDisplay(num);
      setWaitingForOperand(false);
    } else {
      setDisplay(display === '0' ? num : display + num);
    }
  };

  const handleOperator = (op: string) => {
    const current = parseFloat(display);
    if (prevValue !== null && operator && !waitingForOperand) {
      const result = calculate(prevValue, current, operator);
      const resultStr = isNaN(result) ? 'Error' : String(result);
      setDisplay(resultStr);
      setPrevValue(isNaN(result) ? null : result);
      if (!isNaN(result)) addToHistory(`${prevValue} ${operator} ${current}`, resultStr);
    } else {
      setPrevValue(current);
    }
    setOperator(op);
    setExpression(`${display} ${op}`);
    setWaitingForOperand(true);
  };

  const handleEquals = () => {
    if (prevValue === null || !operator) return;
    const current = parseFloat(display);
    const result = calculate(prevValue, current, operator);
    const resultStr = isNaN(result) ? 'Error' : String(result);
    addToHistory(`${prevValue} ${operator} ${current}`, resultStr);
    setDisplay(resultStr);
    setExpression(`${prevValue} ${operator} ${current} =`);
    setPrevValue(null);
    setOperator(null);
    setWaitingForOperand(true);
  };

  const handleClear = () => {
    setDisplay('0');
    setExpression('');
    setPrevValue(null);
    setOperator(null);
    setWaitingForOperand(false);
  };

  const handleClearEntry = () => {
    setDisplay('0');
  };

  const handleDecimal = () => {
    if (waitingForOperand) {
      setDisplay('0.');
      setWaitingForOperand(false);
    } else if (!display.includes('.')) {
      setDisplay(display + '.');
    }
  };

  const handleNegate = () => {
    setDisplay(String(parseFloat(display) * -1));
  };

  const handlePercent = () => {
    setDisplay(String(parseFloat(display) / 100));
  };

  const handleScientific = (fn: string) => {
    const current = parseFloat(display);
    let result = 0;
    switch (fn) {
      case 'sin': result = Math.sin(current); break;
      case 'cos': result = Math.cos(current); break;
      case 'tan': result = Math.tan(current); break;
      case 'log': result = Math.log10(current); break;
      case 'ln': result = Math.log(current); break;
      case 'sqrt': result = Math.sqrt(current); break;
      case '1/x': result = 1 / current; break;
      default: return;
    }
    const resultStr = isNaN(result) ? 'Error' : String(result);
    addToHistory(`${fn}(${current})`, resultStr);
    setDisplay(resultStr);
    setExpression(`${fn}(${current})`);
    setWaitingForOperand(true);
  };

  const handleConstant = (val: number) => {
    setDisplay(String(val));
    setWaitingForOperand(true);
  };

  const handleBackspace = () => {
    if (display.length > 1) {
      setDisplay(display.slice(0, -1));
    } else {
      setDisplay('0');
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key >= '0' && e.key <= '9') handleNumber(e.key);
      else if (e.key === '.') handleDecimal();
      else if (e.key === '+') handleOperator('+');
      else if (e.key === '-') handleOperator('-');
      else if (e.key === '*') handleOperator('*');
      else if (e.key === '/') { e.preventDefault(); handleOperator('/'); }
      else if (e.key === 'Enter' || e.key === '=') handleEquals();
      else if (e.key === 'Escape') handleClear();
      else if (e.key === 'Backspace') handleBackspace();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [display, prevValue, operator, waitingForOperand]);

  const Button = ({ label, onClick, className = '', colSpan = 1 }: { label: React.ReactNode; onClick: () => void; className?: string; colSpan?: number }) => (
    <button
      onClick={onClick}
      className={`h-11 rounded-md text-body-sm font-medium transition-all active:scale-95 flex items-center justify-center ${className}`}
      style={{ gridColumn: colSpan > 1 ? `span ${colSpan}` : undefined }}
    >
      {label}
    </button>
  );

  return (
    <div className="w-full h-full flex flex-col bg-ink-50 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-ink-200 bg-ink-100">
        <div className="flex items-center gap-2">
          <CalcIcon size={16} className="text-ink-600" />
          <span className="text-body-sm text-ink-700">Calculator (计算器)</span>
        </div>
        <button
          onClick={() => setScientific(!scientific)}
          className={`text-caption px-2 py-1 rounded transition-colors ${scientific ? 'bg-cinnabar text-white' : 'bg-ink-200 text-ink-600 hover:bg-ink-300'}`}
        >
          Scientific (科学)
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="flex flex-col flex-1">
          {/* Display */}
          <div className="bg-ink-100 p-4 border-b border-ink-200">
            <div className="text-body-sm text-ink-500 h-5 text-right truncate">{expression}</div>
            <div className="text-heading-lg text-ink-800 text-right truncate">{display}</div>
          </div>

          {/* Keypad */}
          <div className="flex-1 p-3 overflow-y-auto">
            {scientific && (
              <div className="grid grid-cols-4 gap-2 mb-2">
                <Button label="sin" onClick={() => handleScientific('sin')} className="bg-ink-200 text-ink-700 hover:bg-ink-300" />
                <Button label="cos" onClick={() => handleScientific('cos')} className="bg-ink-200 text-ink-700 hover:bg-ink-300" />
                <Button label="tan" onClick={() => handleScientific('tan')} className="bg-ink-200 text-ink-700 hover:bg-ink-300" />
                <Button label="log" onClick={() => handleScientific('log')} className="bg-ink-200 text-ink-700 hover:bg-ink-300" />
                <Button label="ln" onClick={() => handleScientific('ln')} className="bg-ink-200 text-ink-700 hover:bg-ink-300" />
                <Button label="sqrt" onClick={() => handleScientific('sqrt')} className="bg-ink-200 text-ink-700 hover:bg-ink-300" />
                <Button label="1/x" onClick={() => handleScientific('1/x')} className="bg-ink-200 text-ink-700 hover:bg-ink-300" />
                <Button label="x^y" onClick={() => handleOperator('^')} className="bg-ink-200 text-ink-700 hover:bg-ink-300" />
                <Button label="pi" onClick={() => handleConstant(Math.PI)} className="bg-ink-200 text-ink-700 hover:bg-ink-300" />
                <Button label="e" onClick={() => handleConstant(Math.E)} className="bg-ink-200 text-ink-700 hover:bg-ink-300" />
                <Button label="(" onClick={() => handleNumber('(')} className="bg-ink-200 text-ink-700 hover:bg-ink-300" />
                <Button label=")" onClick={() => handleNumber(')')} className="bg-ink-200 text-ink-700 hover:bg-ink-300" />
              </div>
            )}
            <div className="grid grid-cols-4 gap-2">
              <Button label="C" onClick={handleClear} className="bg-cinnabar-light text-white hover:bg-cinnabar" />
              <Button label="CE" onClick={handleClearEntry} className="bg-ink-200 text-ink-700 hover:bg-ink-300" />
              <Button label="+/-" onClick={handleNegate} className="bg-ink-200 text-ink-700 hover:bg-ink-300" />
              <Button label="/" onClick={() => handleOperator('/')} className="bg-ink-200 text-ink-700 hover:bg-ink-300" />

              <Button label="7" onClick={() => handleNumber('7')} className="bg-ink-50 text-ink-800 hover:bg-ink-100 border border-ink-200" />
              <Button label="8" onClick={() => handleNumber('8')} className="bg-ink-50 text-ink-800 hover:bg-ink-100 border border-ink-200" />
              <Button label="9" onClick={() => handleNumber('9')} className="bg-ink-50 text-ink-800 hover:bg-ink-100 border border-ink-200" />
              <Button label="x" onClick={() => handleOperator('*')} className="bg-ink-200 text-ink-700 hover:bg-ink-300" />

              <Button label="4" onClick={() => handleNumber('4')} className="bg-ink-50 text-ink-800 hover:bg-ink-100 border border-ink-200" />
              <Button label="5" onClick={() => handleNumber('5')} className="bg-ink-50 text-ink-800 hover:bg-ink-100 border border-ink-200" />
              <Button label="6" onClick={() => handleNumber('6')} className="bg-ink-50 text-ink-800 hover:bg-ink-100 border border-ink-200" />
              <Button label="-" onClick={() => handleOperator('-')} className="bg-ink-200 text-ink-700 hover:bg-ink-300" />

              <Button label="1" onClick={() => handleNumber('1')} className="bg-ink-50 text-ink-800 hover:bg-ink-100 border border-ink-200" />
              <Button label="2" onClick={() => handleNumber('2')} className="bg-ink-50 text-ink-800 hover:bg-ink-100 border border-ink-200" />
              <Button label="3" onClick={() => handleNumber('3')} className="bg-ink-50 text-ink-800 hover:bg-ink-100 border border-ink-200" />
              <Button label="+" onClick={() => handleOperator('+')} className="bg-ink-200 text-ink-700 hover:bg-ink-300" />

              <Button label="0" onClick={() => handleNumber('0')} colSpan={2} className="bg-ink-50 text-ink-800 hover:bg-ink-100 border border-ink-200" />
              <Button label="." onClick={handleDecimal} className="bg-ink-50 text-ink-800 hover:bg-ink-100 border border-ink-200" />
              <Button label="=" onClick={handleEquals} className="bg-ink-800 text-ink-50 hover:bg-ink-900" />
            </div>
          </div>
        </div>

        {/* History Panel */}
        {showHistory && (
          <div className="w-48 bg-ink-100 border-l border-ink-200 flex flex-col">
            <div className="flex items-center justify-between px-3 py-2 border-b border-ink-200">
              <span className="text-body-sm text-ink-700">History (历史)</span>
              <button onClick={() => { setHistory([]); setShowHistory(false); }} className="text-ink-500 hover:text-cinnabar">
                <Delete size={14} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              {history.length === 0 && (
                <div className="text-center text-caption text-ink-400 mt-4">No history (无记录)</div>
              )}
              {[...history].reverse().map((entry, i) => (
                <button
                  key={i}
                  onClick={() => { setDisplay(entry.result); setShowHistory(false); }}
                  className="w-full text-right p-2 rounded hover:bg-ink-200 transition-colors mb-1"
                >
                  <div className="text-caption text-ink-500 truncate">{entry.expression}</div>
                  <div className="text-body-sm text-ink-800">= {entry.result}</div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Bottom bar */}
      <div className="flex items-center justify-end px-3 py-1.5 border-t border-ink-200 bg-ink-100">
        <button
          onClick={() => setShowHistory(!showHistory)}
          className={`p-1.5 rounded transition-colors ${showHistory ? 'bg-ink-200 text-ink-800' : 'text-ink-500 hover:text-ink-700 hover:bg-ink-200'}`}
        >
          <History size={16} />
        </button>
      </div>
    </div>
  );
}

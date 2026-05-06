import { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import {
  Table2, Save, FolderOpen, Download, Bold, Italic,
  AlignLeft, AlignCenter, AlignRight, Plus, Trash2,
  Paintbrush, Hash
} from 'lucide-react';
import { appStateClient } from '../lib/app-state';

const COLS = Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i));
const ROWS = Array.from({ length: 50 }, (_, i) => i + 1);
const STORAGE_KEY = 'spreadsheet-data';
const SPREADSHEET_APP_ID = 'spreadsheet';

interface CellData {
  value: string;
  formula: string;
  bold?: boolean;
  italic?: boolean;
  align?: 'left' | 'center' | 'right';
  bgColor?: string;
}

interface SheetData {
  cells: Record<string, CellData>;
  colWidths: Record<string, number>;
  rowHeights: Record<string, number>;
}

function loadLocalSheet(): SheetData {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return { cells: saved ? JSON.parse(saved) : {}, colWidths: {}, rowHeights: {} };
  } catch {
    return { cells: {}, colWidths: {}, rowHeights: {} };
  }
}

function getCellRef(col: string, row: number): string {
  return `${col}${row}`;
}

function parseRange(range: string): string[] {
  const match = range.match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/);
  if (!match) return [];
  const [, c1, r1, c2, r2] = match;
  const cells: string[] = [];
  const startCol = COLS.indexOf(c1);
  const endCol = COLS.indexOf(c2);
  const startRow = parseInt(r1);
  const endRow = parseInt(r2);
  for (let c = startCol; c <= endCol; c++) {
    for (let r = startRow; r <= endRow; r++) {
      cells.push(getCellRef(COLS[c], r));
    }
  }
  return cells;
}

function evaluateFormula(formula: string, cells: Record<string, CellData>): string {
  if (!formula.startsWith('=')) return formula;
  const expr = formula.slice(1);

  try {
    // Functions: SUM, AVERAGE, COUNT, MAX, MIN
    const funcMatch = expr.match(/^(SUM|AVERAGE|COUNT|MAX|MIN)\(([A-Z]+\d+:[A-Z]+\d+)\)$/i);
    if (funcMatch) {
      const [, func, range] = funcMatch;
      const rangeCells = parseRange(range);
      const values = rangeCells.map(ref => {
        const cell = cells[ref];
        if (!cell) return 0;
        const val = cell.formula.startsWith('=') ? evaluateFormula(cell.formula, cells) : cell.value;
        return parseFloat(val) || 0;
      }).filter(v => !isNaN(v));

      switch (func.toUpperCase()) {
        case 'SUM': return String(values.reduce((a, b) => a + b, 0));
        case 'AVERAGE': return values.length ? String(values.reduce((a, b) => a + b, 0) / values.length) : '0';
        case 'COUNT': return String(values.filter(v => v !== 0).length);
        case 'MAX': return values.length ? String(Math.max(...values)) : '0';
        case 'MIN': return values.length ? String(Math.min(...values)) : '0';
      }
    }

    // Cell references and arithmetic
    let evalExpr = expr;
    evalExpr = evalExpr.replace(/([A-Z]+)(\d+)/g, (_, col, row) => {
      const ref = getCellRef(col, parseInt(row));
      const cell = cells[ref];
      if (!cell) return '0';
      const val = cell.formula.startsWith('=') ? evaluateFormula(cell.formula, cells) : cell.value;
      return isNaN(parseFloat(val)) ? '0' : String(parseFloat(val));
    });

    // eslint-disable-next-line no-new-func
    const result = new Function('return ' + evalExpr)();
    return String(result);
  } catch {
    return '#ERROR';
  }
}

export default function Spreadsheet() {
  const [cells, setCells] = useState<Record<string, CellData>>(() => loadLocalSheet().cells);
  const [selectedCell, setSelectedCell] = useState<string | null>(null);
  const [editingCell, setEditingCell] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [colWidths, setColWidths] = useState<Record<string, number>>({});
  const [rowHeights, setRowHeights] = useState<Record<string, number>>({});
  const [selectedRange, setSelectedRange] = useState<string[]>([]);
  const [clipboard, setClipboard] = useState<{ ref: string; data: CellData } | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const editRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  const resizeState = useRef<{ col?: string; row?: number; startX?: number; startY?: number; startWidth?: number; startHeight?: number }>({});

  useEffect(() => {
    let cancelled = false;
    async function loadState() {
      try {
        const fallback = loadLocalSheet();
        const state = await appStateClient.getOrDefault<SheetData>(SPREADSHEET_APP_ID, fallback);
        if (cancelled) return;
        setCells(state.cells && typeof state.cells === 'object' ? state.cells : fallback.cells);
        setColWidths(state.colWidths && typeof state.colWidths === 'object' ? state.colWidths : {});
        setRowHeights(state.rowHeights && typeof state.rowHeights === 'object' ? state.rowHeights : {});
        setSyncError(null);
      } catch (err) {
        if (!cancelled) setSyncError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoaded(true);
      }
    }
    loadState();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!loaded) return;
    const timer = setTimeout(() => {
      appStateClient.put<SheetData>(SPREADSHEET_APP_ID, { cells, colWidths, rowHeights })
        .then(() => setSyncError(null))
        .catch(err => setSyncError(err instanceof Error ? err.message : String(err)));
    }, 500);
    return () => clearTimeout(timer);
  }, [cells, colWidths, rowHeights, loaded]);

  const getCell = useCallback((ref: string): CellData => {
    return cells[ref] || { value: '', formula: '' };
  }, [cells]);

  const getDisplayValue = useCallback((ref: string): string => {
    const cell = cells[ref];
    if (!cell) return '';
    if (cell.formula.startsWith('=')) {
      return evaluateFormula(cell.formula, cells);
    }
    return cell.value;
  }, [cells]);

  const setCellData = useCallback((ref: string, data: Partial<CellData>) => {
    setCells(prev => ({
      ...prev,
      [ref]: { ...prev[ref], ...data },
    }));
  }, []);

  const handleCellClick = useCallback((col: string, row: number, e?: React.MouseEvent) => {
    const ref = getCellRef(col, row);
    if (e?.shiftKey && selectedCell) {
      // Range selection
      const [sc, sr] = [selectedCell.match(/[A-Z]+/)?.[0] || 'A', parseInt(selectedCell.match(/\d+/)?.[0] || '1')];
      const startColIdx = COLS.indexOf(sc);
      const endColIdx = COLS.indexOf(col);
      const startRow = sr;
      const endRow = row;
      const range: string[] = [];
      const c1 = Math.min(startColIdx, endColIdx);
      const c2 = Math.max(startColIdx, endColIdx);
      const r1 = Math.min(startRow, endRow);
      const r2 = Math.max(startRow, endRow);
      for (let c = c1; c <= c2; c++) {
        for (let r = r1; r <= r2; r++) {
          range.push(getCellRef(COLS[c], r));
        }
      }
      setSelectedRange(range);
      setSelectedCell(ref);
    } else {
      setSelectedCell(ref);
      setSelectedRange([ref]);
      setEditingCell(null);
      setEditValue('');
    }
  }, [selectedCell]);

  const handleCellDoubleClick = useCallback((col: string, row: number) => {
    const ref = getCellRef(col, row);
    const cell = getCell(ref);
    setEditingCell(ref);
    setEditValue(cell.formula || cell.value);
    requestAnimationFrame(() => editRef.current?.focus());
  }, [getCell]);

  const commitEdit = useCallback(() => {
    if (!editingCell) return;
    const value = editValue.trim();
    if (value.startsWith('=')) {
      setCellData(editingCell, { formula: value, value: evaluateFormula(value, cells) });
    } else {
      setCellData(editingCell, { value, formula: value });
    }
    setEditingCell(null);
    setEditValue('');
  }, [editingCell, editValue, cells, setCellData]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!selectedCell) return;
    const match = selectedCell.match(/([A-Z]+)(\d+)/);
    if (!match) return;
    const col = match[1];
    const row = parseInt(match[2]);
    const colIdx = COLS.indexOf(col);

    if (e.key === 'Enter') {
      e.preventDefault();
      if (editingCell) {
        commitEdit();
      } else {
        handleCellDoubleClick(col, row);
      }
    } else if (e.key === 'Escape' && editingCell) {
      setEditingCell(null);
      setEditValue('');
    } else if (!editingCell && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
      e.preventDefault();
      let newCol = col;
      let newRow = row;
      if (e.key === 'ArrowUp') newRow = Math.max(1, row - 1);
      else if (e.key === 'ArrowDown') newRow = Math.min(50, row + 1);
      else if (e.key === 'ArrowLeft') newCol = COLS[Math.max(0, colIdx - 1)];
      else if (e.key === 'ArrowRight') newCol = COLS[Math.min(25, colIdx + 1)];
      const ref = getCellRef(newCol, newRow);
      setSelectedCell(ref);
      setSelectedRange([ref]);
    } else if (!editingCell && e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
      setEditingCell(selectedCell);
      setEditValue(e.key);
      requestAnimationFrame(() => editRef.current?.focus());
    } else if ((e.ctrlKey || e.metaKey) && e.key === 'c' && selectedCell) {
      const cell = getCell(selectedCell);
      setClipboard({ ref: selectedCell, data: { ...cell } });
    } else if ((e.ctrlKey || e.metaKey) && e.key === 'v' && selectedCell && clipboard) {
      setCellData(selectedCell, clipboard.data);
    }
  }, [selectedCell, editingCell, commitEdit, handleCellDoubleClick, getCell, setCellData, clipboard]);

  const selectedFormula = useMemo(() => {
    if (!selectedCell) return '';
    const cell = getCell(selectedCell);
    return cell.formula || cell.value;
  }, [selectedCell, getCell]);

  // Column/Row resize
  const startColResize = (col: string, e: React.MouseEvent) => {
    e.preventDefault();
    const el = gridRef.current?.querySelector(`[data-col="${col}"]`) as HTMLElement;
    resizeState.current = { col, startX: e.clientX, startWidth: el?.offsetWidth || 80 };
    document.addEventListener('mousemove', handleColResizeMove);
    document.addEventListener('mouseup', stopColResize);
  };

  const handleColResizeMove = useCallback((e: MouseEvent) => {
    const { col, startX, startWidth } = resizeState.current;
    if (!col || startX === undefined || startWidth === undefined) return;
    const newWidth = Math.max(40, startWidth + e.clientX - startX);
    setColWidths(prev => ({ ...prev, [col]: newWidth }));
  }, []);

  const stopColResize = useCallback(() => {
    document.removeEventListener('mousemove', handleColResizeMove);
    document.removeEventListener('mouseup', stopColResize);
    resizeState.current = {};
  }, [handleColResizeMove]);

  // Formatting
  const toggleBold = () => {
    selectedRange.forEach(ref => {
      const cell = getCell(ref);
      setCellData(ref, { bold: !cell.bold });
    });
  };

  const toggleItalic = () => {
    selectedRange.forEach(ref => {
      const cell = getCell(ref);
      setCellData(ref, { italic: !cell.italic });
    });
  };

  const setAlign = (align: 'left' | 'center' | 'right') => {
    selectedRange.forEach(ref => setCellData(ref, { align }));
  };

  const setBgColor = (color: string) => {
    selectedRange.forEach(ref => setCellData(ref, { bgColor: color }));
  };

  // CSV Import/Export
  const exportCSV = () => {
    let csv = '';
    for (let r = 1; r <= 50; r++) {
      const row: string[] = [];
      for (let c = 0; c < 26; c++) {
        const ref = getCellRef(COLS[c], r);
        const cell = cells[ref];
        const val = cell ? (cell.formula.startsWith('=') ? evaluateFormula(cell.formula, cells) : cell.value) : '';
        row.push('"' + val.replace(/"/g, '""') + '"');
      }
      csv += row.join(',') + '\n';
    }
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'spreadsheet.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const importCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = String(ev.target?.result || '');
      const lines = text.split('\n');
      const newCells: Record<string, CellData> = {};
      lines.forEach((line, rowIdx) => {
        if (!line.trim() || rowIdx >= 50) return;
        const cols = line.split(',').map(v => v.trim().replace(/^"|"$/g, '').replace(/""/g, '"'));
        cols.forEach((val, colIdx) => {
          if (colIdx >= 26 || !val) return;
          const ref = getCellRef(COLS[colIdx], rowIdx + 1);
          newCells[ref] = { value: val, formula: val };
        });
      });
      setCells(newCells);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div className="w-full h-full flex flex-col" style={{ backgroundColor: 'var(--ink-50)' }}>
      {/* Toolbar */}
      <div className="flex items-center gap-1 px-2 py-1 border-b flex-shrink-0" style={{ borderColor: 'var(--ink-200)', backgroundColor: 'var(--ink-100)' }}>
        <button onClick={() => setCells({})} className="flex items-center gap-1 px-2 py-1 rounded text-body-sm hover:opacity-80" style={{ color: 'var(--ink-700)' }} title="新建 (New)">
          <Table2 size={14} /> 新建
        </button>
        <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-1 px-2 py-1 rounded text-body-sm hover:opacity-80" style={{ color: 'var(--ink-700)' }} title="导入 CSV (Import)">
          <FolderOpen size={14} /> 导入
        </button>
        <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={importCSV} />
        <button onClick={exportCSV} className="flex items-center gap-1 px-2 py-1 rounded text-body-sm hover:opacity-80" style={{ color: 'var(--ink-700)' }} title="导出 CSV (Export)">
          <Download size={14} /> 导出
        </button>

        <div className="w-px h-5 mx-1" style={{ backgroundColor: 'var(--ink-300)' }} />

        <button onClick={toggleBold} className="p-1 rounded hover:opacity-80" style={{ color: selectedRange.some(r => getCell(r).bold) ? 'var(--cinnabar)' : 'var(--ink-700)' }} title="粗体 (Bold)">
          <Bold size={14} />
        </button>
        <button onClick={toggleItalic} className="p-1 rounded hover:opacity-80" style={{ color: selectedRange.some(r => getCell(r).italic) ? 'var(--cinnabar)' : 'var(--ink-700)' }} title="斜体 (Italic)">
          <Italic size={14} />
        </button>
        <button onClick={() => setAlign('left')} className="p-1 rounded hover:opacity-80" style={{ color: 'var(--ink-700)' }} title="左对齐">
          <AlignLeft size={14} />
        </button>
        <button onClick={() => setAlign('center')} className="p-1 rounded hover:opacity-80" style={{ color: 'var(--ink-700)' }} title="居中">
          <AlignCenter size={14} />
        </button>
        <button onClick={() => setAlign('right')} className="p-1 rounded hover:opacity-80" style={{ color: 'var(--ink-700)' }} title="右对齐">
          <AlignRight size={14} />
        </button>

        <div className="w-px h-5 mx-1" style={{ backgroundColor: 'var(--ink-300)' }} />

        {['#f0ebe4', '#e8e4df', '#d9d9d9', '#bdbdbd', '#b3392f33', '#4a7c5933', '#5a7a8a33'].map(color => (
          <button
            key={color}
            onClick={() => setBgColor(color)}
            className="w-5 h-5 rounded border"
            style={{ backgroundColor: color, borderColor: 'var(--ink-300)' }}
            title="背景色"
          />
        ))}

        <div className="flex-1" />
        {syncError && (
          <span className="text-caption px-2 py-1 rounded" style={{ color: 'var(--error)', backgroundColor: 'rgba(179,57,47,0.08)' }}>
            {syncError}
          </span>
        )}
        {selectedCell && (
          <span className="text-caption" style={{ color: 'var(--ink-500)' }}>
            {selectedCell}: {selectedFormula}
          </span>
        )}
      </div>

      {/* Formula Bar */}
      <div className="flex items-center gap-2 px-2 py-1 border-b flex-shrink-0" style={{ borderColor: 'var(--ink-200)', backgroundColor: 'var(--ink-50)' }}>
        <Hash size={12} style={{ color: 'var(--ink-400)' }} />
        <span className="text-caption" style={{ color: 'var(--ink-500)', minWidth: 40 }}>{selectedCell || ''}</span>
        <input
          value={editingCell === selectedCell ? editValue : selectedFormula}
          onChange={e => {
            if (editingCell === selectedCell) {
              setEditValue(e.target.value);
            } else if (selectedCell) {
              setEditingCell(selectedCell);
              setEditValue(e.target.value);
            }
          }}
          onKeyDown={e => {
            if (e.key === 'Enter') commitEdit();
            else if (e.key === 'Escape') { setEditingCell(null); setEditValue(''); }
          }}
          onBlur={commitEdit}
          className="flex-1 px-2 py-0.5 text-body-sm outline-none rounded"
          style={{ border: '1px solid var(--ink-200)', backgroundColor: 'var(--ink-100)', color: 'var(--ink-900)' }}
        />
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-auto" ref={gridRef} onKeyDown={handleKeyDown} tabIndex={0}>
        <div className="inline-block min-w-full">
          {/* Header Row */}
          <div className="flex sticky top-0 z-10" style={{ backgroundColor: 'var(--ink-100)' }}>
            <div className="flex-shrink-0 sticky left-0 z-20" style={{ width: 50, backgroundColor: 'var(--ink-100)', borderRight: '1px solid var(--ink-200)', borderBottom: '1px solid var(--ink-200)' }} />
            {COLS.map(col => (
              <div
                key={col}
                data-col={col}
                className="flex-shrink-0 text-center text-caption font-medium relative select-none"
                style={{
                  width: colWidths[col] || 80,
                  color: 'var(--ink-700)',
                  borderRight: '1px solid var(--ink-200)',
                  borderBottom: '1px solid var(--ink-200)',
                  padding: '2px 0',
                }}
              >
                {col}
                <div
                  className="absolute right-0 top-0 bottom-0 cursor-col-resize"
                  style={{ width: 4 }}
                  onMouseDown={e => startColResize(col, e)}
                />
              </div>
            ))}
          </div>

          {/* Data Rows */}
          {ROWS.map(row => (
            <div key={row} className="flex">
              {/* Row Header */}
              <div
                className="flex-shrink-0 text-center text-caption sticky left-0 z-10 select-none"
                style={{
                  width: 50,
                  height: rowHeights[String(row)] || 24,
                  backgroundColor: 'var(--ink-100)',
                  color: 'var(--ink-700)',
                  borderRight: '1px solid var(--ink-200)',
                  borderBottom: '1px solid var(--ink-200)',
                  lineHeight: `${rowHeights[String(row)] || 24}px`,
                }}
              >
                {row}
              </div>

              {/* Cells */}
              {COLS.map(col => {
                const ref = getCellRef(col, row);
                const cell = getCell(ref);
                const displayValue = getDisplayValue(ref);
                const isSelected = selectedCell === ref;
                const inRange = selectedRange.includes(ref);
                const isEditing = editingCell === ref;

                return (
                  <div
                    key={ref}
                    data-cell={ref}
                    className="flex-shrink-0 relative"
                    style={{
                      width: colWidths[col] || 80,
                      height: rowHeights[String(row)] || 24,
                      borderRight: '1px solid var(--ink-200)',
                      borderBottom: '1px solid var(--ink-200)',
                      backgroundColor: isSelected ? 'rgba(179,57,47,0.08)' : inRange ? 'rgba(26,26,26,0.03)' : cell.bgColor || 'transparent',
                      cursor: 'cell',
                    }}
                    onClick={e => handleCellClick(col, row, e)}
                    onDoubleClick={() => handleCellDoubleClick(col, row)}
                  >
                    {isEditing ? (
                      <input
                        ref={editRef}
                        value={editValue}
                        onChange={e => setEditValue(e.target.value)}
                        onBlur={commitEdit}
                        onKeyDown={e => {
                          if (e.key === 'Enter') commitEdit();
                          else if (e.key === 'Escape') { setEditingCell(null); setEditValue(''); }
                        }}
                        className="w-full h-full px-1 outline-none text-body-sm"
                        style={{
                          fontFamily: '"Maple Mono CN", "Courier New", monospace',
                          color: 'var(--ink-900)',
                          backgroundColor: 'white',
                          fontSize: 12,
                        }}
                      />
                    ) : (
                      <div
                        className="w-full h-full px-1 overflow-hidden text-ellipsis whitespace-nowrap"
                        style={{
                          fontFamily: '"Maple Mono CN", "Courier New", monospace',
                          fontSize: 12,
                          fontWeight: cell.bold ? 600 : 400,
                          fontStyle: cell.italic ? 'italic' : 'normal',
                          textAlign: cell.align || 'left',
                          lineHeight: `${rowHeights[String(row)] || 24}px`,
                          color: cell.formula.startsWith('=') ? '#4a7c59' : 'var(--ink-900)',
                          border: isSelected ? '2px solid var(--cinnabar)' : '2px solid transparent',
                        }}
                      >
                        {displayValue}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Status Bar */}
      <div className="flex items-center justify-between px-2 py-0.5 border-t flex-shrink-0" style={{ borderColor: 'var(--ink-200)', backgroundColor: 'var(--ink-100)', color: 'var(--ink-500)' }}>
        <span className="text-caption">{selectedRange.length} 单元格</span>
        <span className="text-caption">支持公式: =SUM(A1:A5), =AVERAGE, =COUNT, =MAX, =MIN, =A1+B1</span>
      </div>
    </div>
  );
}

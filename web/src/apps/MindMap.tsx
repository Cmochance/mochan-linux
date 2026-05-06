import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import {
  Plus, Trash2, ZoomIn, ZoomOut, Maximize, Download,
  GitBranch, Move, Upload
} from 'lucide-react';
import { appStateClient } from '../lib/app-state';

interface MindNode {
  id: string;
  text: string;
  x: number;
  y: number;
  parentId: string | null;
  level: number;
  color: string;
  collapsed?: boolean;
}

interface Connection {
  from: string;
  to: string;
}

const STORAGE_KEY = 'mindmap-data';
const MINDMAP_APP_ID = 'mindmap';

const BRANCH_COLORS = [
  '#1a1a1a', '#b3392f', '#5a7a8a', '#4a7c59', '#b8860b', '#7a7a7a', '#5c5c5c',
];

const NODE_COLORS = [
  '#f0ebe4', '#e8e4df', '#d9d9d9', '#c94a3f22', '#5a7a8a22', '#4a7c5922', '#b8860b22',
];

function generateId() {
  return 'node_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
}

function defaultNodes(): MindNode[] {
  return [{
    id: 'root',
    text: '中心主题\n(Central Topic)',
    x: 400,
    y: 300,
    parentId: null,
    level: 0,
    color: BRANCH_COLORS[0],
  }];
}

function loadLocalMindMap(): MindMapState {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return { nodes: saved ? JSON.parse(saved) : defaultNodes() };
  } catch {
    return { nodes: defaultNodes() };
  }
}

interface MindMapState {
  nodes: MindNode[];
}

function getBezierPath(x1: number, y1: number, x2: number, y2: number): string {
  const midX = (x1 + x2) / 2;
  return `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`;
}

export default function MindMap() {
  const [nodes, setNodes] = useState<MindNode[]>(() => loadLocalMindMap().nodes);
  const [selectedNode, setSelectedNode] = useState<string | null>('root');
  const [editingNode, setEditingNode] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [dragNode, setDragNode] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const editRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const jsonInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadState() {
      try {
        const fallback = loadLocalMindMap();
        const state = await appStateClient.getOrDefault<MindMapState>(MINDMAP_APP_ID, fallback);
        if (cancelled) return;
        const nextNodes = Array.isArray(state.nodes) && state.nodes.length > 0 ? state.nodes : fallback.nodes;
        setNodes(nextNodes);
        setSelectedNode(nextNodes.some(n => n.id === 'root') ? 'root' : nextNodes[0]?.id ?? null);
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
      appStateClient.put<MindMapState>(MINDMAP_APP_ID, { nodes })
        .then(() => setSyncError(null))
        .catch(err => setSyncError(err instanceof Error ? err.message : String(err)));
    }, 500);
    return () => clearTimeout(timer);
  }, [nodes, loaded]);

  const connections = useMemo(() => {
    const conns: Connection[] = [];
    nodes.forEach(node => {
      if (node.parentId) {
        conns.push({ from: node.parentId, to: node.id });
      }
    });
    return conns;
  }, [nodes]);

  const addChildNode = useCallback((parentId?: string) => {
    const pid = parentId || selectedNode;
    if (!pid) return;
    const parent = nodes.find(n => n.id === pid);
    if (!parent) return;

    const siblings = nodes.filter(n => n.parentId === pid);
    const angle = (siblings.length * 45) * (Math.PI / 180);
    const distance = 120 + parent.level * 30;
    const newX = parent.x + Math.cos(angle) * distance;
    const newY = parent.y + Math.sin(angle) * distance;
    const newLevel = parent.level + 1;

    const newNode: MindNode = {
      id: generateId(),
      text: '新节点\n(New Node)',
      x: newX,
      y: newY,
      parentId: pid,
      level: newLevel,
      color: BRANCH_COLORS[Math.min(newLevel, BRANCH_COLORS.length - 1)],
    };

    setNodes(prev => [...prev, newNode]);
    setSelectedNode(newNode.id);
  }, [nodes, selectedNode]);

  const addSiblingNode = useCallback(() => {
    if (!selectedNode) return;
    const node = nodes.find(n => n.id === selectedNode);
    if (!node || !node.parentId) { addChildNode('root'); return; }
    addChildNode(node.parentId);
  }, [nodes, selectedNode, addChildNode]);

  const deleteNode = useCallback((nodeId?: string) => {
    const nid = nodeId || selectedNode;
    if (!nid || nid === 'root') return;

    const toDelete = new Set<string>();
    const collectChildren = (id: string) => {
      toDelete.add(id);
      nodes.filter(n => n.parentId === id).forEach(c => collectChildren(c.id));
    };
    collectChildren(nid);

    setNodes(prev => prev.filter(n => !toDelete.has(n.id)));
    setSelectedNode('root');
  }, [nodes, selectedNode]);

  const handleNodeDoubleClick = (node: MindNode) => {
    setEditingNode(node.id);
    setEditText(node.text);
    requestAnimationFrame(() => editRef.current?.focus());
  };

  const handleEditSubmit = () => {
    if (!editingNode) return;
    setNodes(prev => prev.map(n => n.id === editingNode ? { ...n, text: editText } : n));
    setEditingNode(null);
  };

  // Drag node
  const handleNodeMouseDown = (e: React.MouseEvent, node: MindNode) => {
    e.stopPropagation();
    if (e.button === 2) {
      setContextMenu({ x: e.clientX, y: e.clientY });
      setSelectedNode(node.id);
      return;
    }
    setSelectedNode(node.id);
    setIsDragging(true);
    setDragNode(node.id);
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const scaleX = 800 / rect.width;
    const scaleY = 600 / rect.height;
    setDragOffset({
      x: (e.clientX - rect.left) * scaleX - node.x,
      y: (e.clientY - rect.top) * scaleY - node.y,
    });
  };

  // Pan canvas
  const handleSvgMouseDown = (e: React.MouseEvent) => {
    if (e.target === svgRef.current || (e.target as HTMLElement).tagName === 'svg') {
      setIsPanning(true);
    }
  };

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isDragging && dragNode) {
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const scaleX = 800 / rect.width;
      const scaleY = 600 / rect.height;
      const newX = (e.clientX - rect.left) * scaleX - dragOffset.x;
      const newY = (e.clientY - rect.top) * scaleY - dragOffset.y;
      setNodes(prev => prev.map(n => n.id === dragNode ? { ...n, x: newX, y: newY } : n));
    }
  }, [isDragging, dragNode, dragOffset]);

  const handleMouseUp = () => {
    if (isDragging) {
      setIsDragging(false);
      setDragNode(null);
    }
    setIsPanning(false);
  };

  // Keyboard shortcuts
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Tab') { e.preventDefault(); addChildNode(); }
    else if (e.key === 'Enter' && selectedNode) { addSiblingNode(); }
    else if (e.key === 'Delete' || e.key === 'Backspace') {
      if (selectedNode && selectedNode !== 'root') deleteNode();
    }
  }, [selectedNode, addChildNode, addSiblingNode, deleteNode]);

  const handleExport = () => {
    const svg = svgRef.current;
    if (!svg) return;
    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement('canvas');
    canvas.width = 1600;
    canvas.height = 1200;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    img.onload = () => {
      ctx.fillStyle = '#f0ebe4';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      const url = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = url;
      a.download = 'mindmap.png';
      a.click();
    };
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
  };

  const exportJSON = () => {
    const blob = new Blob([JSON.stringify({ nodes }, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'mindmap.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const importJSON = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const parsed = JSON.parse(String(ev.target?.result || '{}'));
        const nextNodes = Array.isArray(parsed) ? parsed : parsed.nodes;
        if (!Array.isArray(nextNodes) || nextNodes.length === 0) throw new Error('Invalid mind map JSON');
        setNodes(nextNodes);
        setSelectedNode(nextNodes.some((n: MindNode) => n.id === 'root') ? 'root' : nextNodes[0]?.id ?? null);
        setSyncError(null);
      } catch (err) {
        setSyncError(err instanceof Error ? err.message : String(err));
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleAutoLayout = () => {
    const root = nodes.find(n => n.id === 'root');
    if (!root) return;

    const positioned = new Set<string>();
    const newNodes = [...nodes];

    const layoutNode = (nodeId: string, startAngle: number, arcSize: number) => {
      positioned.add(nodeId);
      const children = newNodes.filter(n => n.parentId === nodeId);
      const angleStep = children.length > 1 ? arcSize / (children.length - 1) : 0;

      children.forEach((child, i) => {
        const angle = (startAngle + angleStep * i) * (Math.PI / 180);
        const distance = 140 + child.level * 50;
        const parent = newNodes.find(n => n.id === nodeId);
        if (parent) {
          child.x = parent.x + Math.cos(angle) * distance;
          child.y = parent.y + Math.sin(angle) * distance;
        }
        positioned.add(child.id);
        layoutNode(child.id, startAngle + angleStep * i - 30, 60);
      });
    };

    // Root in center
    const rootIdx = newNodes.findIndex(n => n.id === 'root');
    if (rootIdx >= 0) { newNodes[rootIdx].x = 400; newNodes[rootIdx].y = 300; }
    layoutNode('root', 0, 360);
    setNodes(newNodes);
  };

  return (
    <div className="w-full h-full flex flex-col" style={{ backgroundColor: 'var(--ink-50)' }} onKeyDown={handleKeyDown} tabIndex={0}>
      {/* Toolbar */}
      <div className="flex items-center gap-1 px-2 py-1 border-b flex-shrink-0" style={{ borderColor: 'var(--ink-200)', backgroundColor: 'var(--ink-100)' }}>
        <button onClick={() => addChildNode()} className="flex items-center gap-1 px-2 py-1 rounded text-body-sm hover:opacity-80" style={{ color: 'var(--ink-700)' }} title="添加子节点 (Add Child)">
          <Plus size={14} /> 子节点
        </button>
        <button onClick={addSiblingNode} className="flex items-center gap-1 px-2 py-1 rounded text-body-sm hover:opacity-80" style={{ color: 'var(--ink-700)' }} title="添加兄弟节点 (Add Sibling)">
          <GitBranch size={14} /> 兄弟节点
        </button>
        <button onClick={() => deleteNode()} disabled={!selectedNode || selectedNode === 'root'} className="flex items-center gap-1 px-2 py-1 rounded text-body-sm hover:opacity-80 disabled:opacity-30" style={{ color: 'var(--cinnabar)' }} title="删除节点 (Delete)">
          <Trash2 size={14} /> 删除
        </button>

        <div className="w-px h-5 mx-1" style={{ backgroundColor: 'var(--ink-300)' }} />

        <button onClick={() => setZoom(z => Math.min(2, z + 0.1))} className="p-1 rounded hover:opacity-80" style={{ color: 'var(--ink-700)' }} title="放大">
          <ZoomIn size={14} />
        </button>
        <span className="text-caption" style={{ color: 'var(--ink-500)', minWidth: 32, textAlign: 'center' }}>{Math.round(zoom * 100)}%</span>
        <button onClick={() => setZoom(z => Math.max(0.5, z - 0.1))} className="p-1 rounded hover:opacity-80" style={{ color: 'var(--ink-700)' }} title="缩小">
          <ZoomOut size={14} />
        </button>
        <button onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }} className="p-1 rounded hover:opacity-80" style={{ color: 'var(--ink-700)' }} title="重置 (Reset)">
          <Maximize size={14} />
        </button>

        <div className="w-px h-5 mx-1" style={{ backgroundColor: 'var(--ink-300)' }} />

        <button onClick={handleAutoLayout} className="flex items-center gap-1 px-2 py-1 rounded text-body-sm hover:opacity-80" style={{ color: 'var(--ink-700)' }} title="自动布局 (Auto Layout)">
          <Move size={14} /> 自动布局
        </button>
        <button onClick={() => jsonInputRef.current?.click()} className="flex items-center gap-1 px-2 py-1 rounded text-body-sm hover:opacity-80" style={{ color: 'var(--ink-700)' }} title="导入 JSON (Import JSON)">
          <Upload size={14} /> 导入
        </button>
        <input ref={jsonInputRef} type="file" accept="application/json,.json" className="hidden" onChange={importJSON} />
        <button onClick={exportJSON} className="flex items-center gap-1 px-2 py-1 rounded text-body-sm hover:opacity-80" style={{ color: 'var(--ink-700)' }} title="导出 JSON (Export JSON)">
          <Download size={14} /> JSON
        </button>
        <button onClick={handleExport} className="flex items-center gap-1 px-2 py-1 rounded text-body-sm hover:opacity-80" style={{ color: 'var(--ink-700)' }} title="导出 PNG (Export PNG)">
          <Download size={14} /> PNG
        </button>
        {syncError && (
          <span className="text-caption px-2 py-1 rounded" style={{ color: 'var(--error)', backgroundColor: 'rgba(179,57,47,0.08)' }}>
            {syncError}
          </span>
        )}
      </div>

      {/* Canvas */}
      <div className="flex-1 overflow-hidden relative" style={{ backgroundColor: 'var(--ink-50)' }} ref={containerRef}>
        <svg
          ref={svgRef}
          viewBox="0 0 800 600"
          className="w-full h-full cursor-grab"
          style={{
            cursor: isDragging ? 'grabbing' : isPanning ? 'grab' : 'default',
          }}
          onMouseDown={handleSvgMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onContextMenu={e => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY }); }}
          onClick={() => setContextMenu(null)}
        >
          {/* Background dot grid */}
          <defs>
            <pattern id="dotgrid" x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
              <circle cx="10" cy="10" r="1" fill="#d9d9d9" />
            </pattern>
          </defs>
          <rect width="800" height="600" fill="url(#dotgrid)" />

          {/* Connections */}
          {connections.map(conn => {
            const from = nodes.find(n => n.id === conn.from);
            const to = nodes.find(n => n.id === conn.to);
            if (!from || !to) return null;
            return (
              <path
                key={`${conn.from}-${conn.to}`}
                d={getBezierPath(from.x, from.y, to.x, to.y)}
                fill="none"
                stroke={to.color || 'var(--ink-400)'}
                strokeWidth={2}
                opacity={0.6}
              />
            );
          })}

          {/* Nodes */}
          {nodes.map(node => {
            const isSelected = selectedNode === node.id;
            const isEditing = editingNode === node.id;
            const lines = node.text.split('\n');
            const maxLineWidth = Math.max(...lines.map(l => l.length));
            const nodeW = Math.max(80, maxLineWidth * 7 + 20);
            const nodeH = Math.max(32, lines.length * 18 + 10);

            return (
              <g
                key={node.id}
                transform={`translate(${node.x}, ${node.y})`}
                onMouseDown={e => handleNodeMouseDown(e, node)}
                style={{ cursor: 'pointer' }}
              >
                <rect
                  x={-nodeW / 2}
                  y={-nodeH / 2}
                  width={nodeW}
                  height={nodeH}
                  rx={6}
                  fill={node.level === 0 ? 'var(--ink-800)' : NODE_COLORS[node.level % NODE_COLORS.length]}
                  stroke={isSelected ? 'var(--cinnabar)' : 'var(--ink-300)'}
                  strokeWidth={isSelected ? 2 : 1}
                  style={{
                    filter: isSelected ? 'drop-shadow(0 4px 8px rgba(26,26,26,0.15))' : 'drop-shadow(0 1px 3px rgba(26,26,26,0.06))',
                  }}
                />
                {isEditing ? (
                  <foreignObject x={-nodeW / 2 + 2} y={-nodeH / 2 + 2} width={nodeW - 4} height={nodeH - 4}>
                    <input
                      ref={editRef}
                      value={editText}
                      onChange={e => setEditText(e.target.value)}
                      onBlur={handleEditSubmit}
                      onKeyDown={e => { if (e.key === 'Enter') handleEditSubmit(); }}
                      style={{
                        width: '100%',
                        height: '100%',
                        border: 'none',
                        outline: 'none',
                        fontSize: 12,
                        textAlign: 'center',
                        background: 'transparent',
                      }}
                    />
                  </foreignObject>
                ) : (
                  <text
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fill={node.level === 0 ? 'var(--ink-50)' : 'var(--ink-900)'}
                    fontSize={node.level === 0 ? 13 : 11}
                    fontFamily="'Noto Sans SC', system-ui, sans-serif"
                    fontWeight={node.level <= 1 ? 600 : 400}
                  >
                    {lines.map((line, i) => (
                      <tspan key={i} x={0} dy={i === 0 ? -(lines.length - 1) * 9 : 18}>
                        {line}
                      </tspan>
                    ))}
                  </text>
                )}
                {/* Add child button on hover */}
                {isSelected && (
                  <>
                    <circle cx={nodeW / 2} cy={0} r={8} fill="var(--cinnabar)" onClick={e => { e.stopPropagation(); addChildNode(node.id); }} cursor="pointer" />
                    <text x={nodeW / 2} y={0} textAnchor="middle" dominantBaseline="central" fill="white" fontSize={12} fontWeight="bold" onClick={e => { e.stopPropagation(); addChildNode(node.id); }} cursor="pointer">+</text>
                  </>
                )}
              </g>
            );
          })}
        </svg>

        {/* Context Menu */}
        {contextMenu && (
          <div
            className="absolute z-50 rounded border overflow-hidden"
            style={{
              left: contextMenu.x - (containerRef.current?.getBoundingClientRect().left || 0),
              top: contextMenu.y - (containerRef.current?.getBoundingClientRect().top || 0),
              backgroundColor: 'var(--glass-active)',
              borderColor: 'var(--glass-border)',
              boxShadow: 'var(--shadow-md)',
            }}
          >
            <button
              onClick={() => { addChildNode(); setContextMenu(null); }}
              className="block w-full text-left px-3 py-1.5 text-body-sm hover:opacity-80"
              style={{ color: 'var(--ink-700)' }}
            >
              添加子节点 (Add Child)
            </button>
            <button
              onClick={() => { addSiblingNode(); setContextMenu(null); }}
              className="block w-full text-left px-3 py-1.5 text-body-sm hover:opacity-80"
              style={{ color: 'var(--ink-700)' }}
            >
              添加兄弟节点 (Add Sibling)
            </button>
            {selectedNode && selectedNode !== 'root' && (
              <button
                onClick={() => { deleteNode(); setContextMenu(null); }}
                className="block w-full text-left px-3 py-1.5 text-body-sm hover:opacity-80"
                style={{ color: 'var(--cinnabar)' }}
              >
                删除 (Delete)
              </button>
            )}
          </div>
        )}
      </div>

      {/* Status bar */}
      <div className="flex items-center justify-between px-2 py-0.5 border-t flex-shrink-0" style={{ borderColor: 'var(--ink-200)', backgroundColor: 'var(--ink-100)', color: 'var(--ink-500)' }}>
        <span className="text-caption">{nodes.length} 节点 | Tab: 添加子节点 | Enter: 添加兄弟 | Delete: 删除 | 双击编辑</span>
        <span className="text-caption">拖拽移动节点 (Drag to move)</span>
      </div>
    </div>
  );
}

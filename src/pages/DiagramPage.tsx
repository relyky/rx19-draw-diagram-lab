import { useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, MouseEvent as ReactMouseEvent } from 'react'

export interface DiagramNode {
  id: string
  name: string
  value: number
  x: number
  y: number
}

export interface TransferLine {
  id: string
  sourceId: string
  targetId: string
}

interface DiagramState {
  nodes: DiagramNode[]
  lines: TransferLine[]
}

const NODE_RADIUS = 45
const VIEW_W = 600
const VIEW_H = 440
const STORAGE_KEY = 'diagram-lab-state-v1'
const CLICK_DELAY_MS = 250

/** 同一 tick 依移轉線建立順序逐條結算;來源為 0 該條略過,數值不為負。 */
export function settleTick(nodes: DiagramNode[], lines: TransferLine[]): DiagramNode[] {
  const values = new Map(nodes.map((n) => [n.id, n.value]))
  for (const line of lines) {
    const src = values.get(line.sourceId)
    const dst = values.get(line.targetId)
    if (src === undefined || dst === undefined || src <= 0) continue
    values.set(line.sourceId, src - 1)
    values.set(line.targetId, dst + 1)
  }
  return nodes.map((n) => (values.get(n.id) === n.value ? n : { ...n, value: values.get(n.id)! }))
}

function defaultState(): DiagramState {
  return {
    nodes: [
      { id: 'A', name: 'A', value: 1000, x: 300, y: 95 },
      { id: 'B', name: 'B', value: 1000, x: 495, y: 345 },
      { id: 'C', name: 'C', value: 1000, x: 105, y: 345 },
    ],
    lines: [
      { id: 'A-B', sourceId: 'A', targetId: 'B' },
      { id: 'B-C', sourceId: 'B', targetId: 'C' },
      { id: 'C-A', sourceId: 'C', targetId: 'A' },
    ],
  }
}

function isValidState(s: unknown): s is DiagramState {
  if (typeof s !== 'object' || s === null) return false
  const { nodes, lines } = s as DiagramState
  if (!Array.isArray(nodes) || !Array.isArray(lines)) return false
  const nodeOk = nodes.every(
    (n) =>
      typeof n?.id === 'string' &&
      typeof n.name === 'string' &&
      Number.isFinite(n.value) &&
      n.value >= 0 &&
      Number.isFinite(n.x) &&
      Number.isFinite(n.y),
  )
  if (!nodeOk) return false
  const ids = new Set(nodes.map((n) => n.id))
  return lines.every(
    (l) => typeof l?.id === 'string' && ids.has(l.sourceId) && ids.has(l.targetId),
  )
}

function loadState(): DiagramState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return defaultState()
    const parsed: unknown = JSON.parse(raw)
    return isValidState(parsed) ? parsed : defaultState()
  } catch {
    return defaultState()
  }
}

function nextNodeName(nodes: DiagramNode[]): string {
  const used = new Set(nodes.map((n) => n.name))
  for (let i = 0; i < 26; i++) {
    const name = String.fromCharCode(65 + i)
    if (!used.has(name)) return name
  }
  let n = 1
  while (used.has(`N${n}`)) n++
  return `N${n}`
}

/** 兩節點中心連線,裁到圓邊的可視線段端點。 */
function edgePoints(s: DiagramNode, t: DiagramNode) {
  const dx = t.x - s.x
  const dy = t.y - s.y
  const dist = Math.hypot(dx, dy) || 1
  const ux = dx / dist
  const uy = dy / dist
  return {
    x1: s.x + ux * NODE_RADIUS,
    y1: s.y + uy * NODE_RADIUS,
    x2: t.x - ux * NODE_RADIUS,
    y2: t.y - uy * NODE_RADIUS,
  }
}

function DiagramPage() {
  const [state, setState] = useState<DiagramState>(loadState)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [linkSourceId, setLinkSourceId] = useState<string | null>(null)
  const [mouse, setMouse] = useState<{ x: number; y: number } | null>(null)
  const [viewSize, setViewSize] = useState({ w: VIEW_W, h: VIEW_H })

  const svgRef = useRef<SVGSVGElement>(null)
  const clickTimerRef = useRef<number | null>(null)
  const dragRef = useRef<{ nodeId: string; moved: boolean; dx: number; dy: number } | null>(null)
  const justLinkedRef = useRef(false)

  const { nodes, lines } = state

  // viewBox 隨 svg 實際渲染尺寸調整(1 SVG 單位 = 1 CSS px,節點大小恆定)
  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      if (width > 0 && height > 0) {
        setViewSize({ w: Math.round(width), h: Math.round(height) })
      }
    })
    observer.observe(svg)
    return () => observer.disconnect()
  }, [])

  // 全域 1 秒 tick 結算所有移轉線
  useEffect(() => {
    const timer = window.setInterval(() => {
      setState((s) => ({ ...s, nodes: settleTick(s.nodes, s.lines) }))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [])

  // 狀態變更即存 localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  }, [state])

  // Esc 取消連線;Delete 刪除選取節點(連帶其移轉線)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setLinkSourceId(null)
      } else if (e.key === 'Delete' && selectedId) {
        setState((s) => ({
          nodes: s.nodes.filter((n) => n.id !== selectedId),
          lines: s.lines.filter((l) => l.sourceId !== selectedId && l.targetId !== selectedId),
        }))
        setSelectedId(null)
        setLinkSourceId((src) => (src === selectedId ? null : src))
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [selectedId])

  const clearClickTimer = () => {
    if (clickTimerRef.current !== null) {
      window.clearTimeout(clickTimerRef.current)
      clickTimerRef.current = null
    }
  }

  const toSvgPoint = (e: { clientX: number; clientY: number }) => {
    const svg = svgRef.current!
    const rect = svg.getBoundingClientRect()
    return {
      x: ((e.clientX - rect.left) / rect.width) * viewSize.w,
      y: ((e.clientY - rect.top) / rect.height) * viewSize.h,
    }
  }

  const addLine = (sourceId: string, targetId: string) => {
    setState((s) => {
      if (sourceId === targetId) return s
      if (s.lines.some((l) => l.sourceId === sourceId && l.targetId === targetId)) return s
      return { ...s, lines: [...s.lines, { id: `${sourceId}-${targetId}`, sourceId, targetId }] }
    })
  }

  const handleNodeClick = (e: ReactMouseEvent, nodeId: string) => {
    e.stopPropagation()
    if (dragRef.current?.moved) return
    if (linkSourceId) {
      // 連線模式中:點目標節點立即完成;短暫抑制緊接的雙擊,避免同時建線+切換選取
      addLine(linkSourceId, nodeId)
      setLinkSourceId(null)
      justLinkedRef.current = true
      window.setTimeout(() => {
        justLinkedRef.current = false
      }, CLICK_DELAY_MS * 2)
      return
    }
    // 延遲判定,避免雙擊誤入連線模式
    const p = toSvgPoint(e)
    clearClickTimer()
    clickTimerRef.current = window.setTimeout(() => {
      clickTimerRef.current = null
      setMouse(p)
      setLinkSourceId(nodeId)
    }, CLICK_DELAY_MS)
  }

  const handleNodeDoubleClick = (e: ReactMouseEvent, nodeId: string) => {
    e.stopPropagation()
    clearClickTimer()
    if (justLinkedRef.current) return
    setSelectedId((cur) => (cur === nodeId ? null : nodeId))
  }

  const handleNodePointerDown = (e: ReactPointerEvent, nodeId: string) => {
    if (selectedId !== nodeId) return
    const node = nodes.find((n) => n.id === nodeId)
    if (!node) return
    // 保留按下點與節點中心的偏移,拖拉起始不跳動
    const p = toSvgPoint(e)
    dragRef.current = { nodeId, moved: false, dx: node.x - p.x, dy: node.y - p.y }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const handleNodePointerMove = (e: ReactPointerEvent) => {
    const drag = dragRef.current
    if (!drag) return
    drag.moved = true
    const p = toSvgPoint(e)
    setState((s) => ({
      ...s,
      nodes: s.nodes.map((n) =>
        n.id === drag.nodeId ? { ...n, x: p.x + drag.dx, y: p.y + drag.dy } : n,
      ),
    }))
  }

  const handleNodePointerUp = () => {
    const drag = dragRef.current
    if (drag?.moved) {
      // 拖拉結束後,click 事件緊接觸發;下一輪再清除 moved 標記
      window.setTimeout(() => {
        dragRef.current = null
      }, 0)
    } else {
      dragRef.current = null
    }
  }

  const handleSvgClick = () => {
    // 點空白處:取消連線模式
    setLinkSourceId(null)
  }

  const handleSvgDoubleClick = (e: ReactMouseEvent) => {
    if (e.target !== e.currentTarget) return
    const p = toSvgPoint(e)
    setState((s) => ({
      ...s,
      nodes: [
        ...s.nodes,
        { id: crypto.randomUUID(), name: nextNodeName(s.nodes), value: 1000, x: p.x, y: p.y },
      ],
    }))
  }

  const handleSvgPointerMove = (e: ReactPointerEvent) => {
    if (linkSourceId) setMouse(toSvgPoint(e))
  }

  const handleReset = () => {
    setState(defaultState())
    setSelectedId(null)
    setLinkSourceId(null)
  }

  const nodeById = new Map(nodes.map((n) => [n.id, n]))
  const linkSource = linkSourceId ? nodeById.get(linkSourceId) : undefined

  return (
    <section style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <h1>Diagram Lab</h1>
      <p>
        雙擊空白新增節點;單擊節點開始連線(Esc 取消);雙擊節點選取後可拖拉、按 Delete 刪除。
      </p>
      <p>
        <button onClick={handleReset}>重置</button>
      </p>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${viewSize.w} ${viewSize.h}`}
        style={{
          flex: 1,
          width: '100%',
          minHeight: 300,
          border: '1px solid var(--accent-border)',
          borderRadius: 8,
          boxSizing: 'border-box',
          touchAction: 'none',
          cursor: 'default',
        }}
        onClick={handleSvgClick}
        onDoubleClick={handleSvgDoubleClick}
        onPointerMove={handleSvgPointerMove}
      >
        <defs>
          <marker
            id="arrow"
            markerWidth="10"
            markerHeight="10"
            refX="10"
            refY="5"
            orient="auto"
            markerUnits="userSpaceOnUse"
          >
            <path d="M0,0 L10,5 L0,10 z" fill="#2b7a9e" />
          </marker>
        </defs>

        {lines.map((line) => {
          const s = nodeById.get(line.sourceId)
          const t = nodeById.get(line.targetId)
          if (!s || !t) return null
          const p = edgePoints(s, t)
          const active = s.value > 0
          return (
            <g key={line.id}>
              <line
                x1={p.x1}
                y1={p.y1}
                x2={p.x2}
                y2={p.y2}
                stroke="#2b7a9e"
                strokeWidth={1.5}
                markerEnd="url(#arrow)"
                opacity={active ? 1 : 0.35}
              />
              {active && (
                <circle r={4} fill="#2b7a9e">
                  <animateMotion
                    dur="1s"
                    repeatCount="indefinite"
                    path={`M${p.x1},${p.y1} L${p.x2},${p.y2}`}
                  />
                </circle>
              )}
            </g>
          )
        })}

        {linkSource && mouse && (
          <line
            x1={linkSource.x}
            y1={linkSource.y}
            x2={mouse.x}
            y2={mouse.y}
            stroke="#2b7a9e"
            strokeWidth={1.5}
            strokeDasharray="6 4"
            pointerEvents="none"
          />
        )}

        {nodes.map((node) => (
          <g
            key={node.id}
            onClick={(e) => handleNodeClick(e, node.id)}
            onDoubleClick={(e) => handleNodeDoubleClick(e, node.id)}
            onPointerDown={(e) => handleNodePointerDown(e, node.id)}
            onPointerMove={handleNodePointerMove}
            onPointerUp={handleNodePointerUp}
            style={{ cursor: selectedId === node.id ? 'move' : 'pointer' }}
          >
            <circle
              cx={node.x}
              cy={node.y}
              r={NODE_RADIUS}
              fill="var(--bg)"
              stroke={selectedId === node.id ? 'var(--accent)' : '#2b7a9e'}
              strokeWidth={selectedId === node.id ? 3 : 1.5}
            />
            <text
              x={node.x}
              y={node.y}
              textAnchor="middle"
              fill="var(--text-h)"
              fontSize={16}
              style={{ userSelect: 'none' }}
            >
              <tspan x={node.x} dy={-4}>
                {node.name}
              </tspan>
              <tspan x={node.x} dy={20}>
                {node.value}
              </tspan>
            </text>
          </g>
        ))}
      </svg>
    </section>
  )
}

export default DiagramPage

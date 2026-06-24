import React, { useEffect, useState, useCallback, useRef } from 'react'

interface DrawInstruction {
  type: 'point' | 'rect' | 'circle' | 'arrow' | 'line'
  x?: number
  y?: number
  cx?: number
  cy?: number
  r?: number
  x1?: number
  y1?: number
  x2?: number
  y2?: number
  width?: number
  height?: number
  label?: string
  props?: Record<string, string | number | boolean>
}

const GREEN = '#10b981'
const GREEN_LIGHT = '#6ee7b7'
const GREEN_FILL = 'rgba(16, 185, 129, 0.08)'

// Per-shape timing
const CURSOR_TRAVEL_MS = 500 // cursor flies to start point
const DRAW_MS = 600 // drag-create animation
const SETTLE_MS = 900 // pause after settle before moving to next
const STEP_DURATION_MS = CURSOR_TRAVEL_MS + DRAW_MS + SETTLE_MS

// SVG <animate> uses seconds
const DRAW_DUR = `${DRAW_MS / 1000}s`
const SETTLE_DELAY = `${DRAW_MS / 1000}s`
const FADE_DUR = '0.2s'

/**
 * Floating label bubble rendered near a shape.
 * Fades in after the shape finishes drawing.
 */
function Label({ x, y, text }: { x: number; y: number; text: string }): React.JSX.Element {
  const estimatedWidth = Math.max(60, text.length * 7.5 + 24)
  const halfWidth = estimatedWidth / 2

  return (
    <g opacity="0">
      <animate
        attributeName="opacity"
        from="0"
        to="1"
        begin={SETTLE_DELAY}
        dur={FADE_DUR}
        fill="freeze"
      />
      <rect
        x={x - halfWidth}
        y={y - 14}
        width={estimatedWidth}
        height={28}
        rx="14"
        fill={GREEN}
        fillOpacity="0.95"
      />
      <text
        x={x}
        y={y + 5}
        textAnchor="middle"
        fill="white"
        fontSize="13"
        fontFamily="system-ui, -apple-system, sans-serif"
        fontWeight="600"
      >
        {text}
      </text>
    </g>
  )
}

/**
 * Returns the drag start point — where the virtual cursor lands before drawing begins.
 */
function getStartPoint(inst: DrawInstruction): { x: number; y: number } {
  switch (inst.type) {
    case 'point':
      return { x: inst.x ?? 0, y: inst.y ?? 0 }
    case 'rect': {
      const rx = Number(inst.props?.x ?? inst.x ?? 0)
      const ry = Number(inst.props?.y ?? inst.y ?? 0)
      return { x: rx, y: ry }
    }
    case 'circle': {
      const ccx = Number(inst.props?.cx ?? inst.cx ?? 0)
      const ccy = Number(inst.props?.cy ?? inst.cy ?? 0)
      return { x: ccx, y: ccy }
    }
    case 'line':
    case 'arrow': {
      const x1 = Number(inst.props?.x1 ?? inst.x1 ?? 0)
      const y1 = Number(inst.props?.y1 ?? inst.y1 ?? 0)
      return { x: x1, y: y1 }
    }
  }
}

/**
 * Returns the drag end point — where the cursor moves as the shape is drawn.
 */
function getEndPoint(inst: DrawInstruction): { x: number; y: number } {
  switch (inst.type) {
    case 'point':
      return { x: inst.x ?? 0, y: inst.y ?? 0 }
    case 'rect': {
      const rx = Number(inst.props?.x ?? inst.x ?? 0)
      const ry = Number(inst.props?.y ?? inst.y ?? 0)
      const rw = Number(inst.props?.width ?? inst.width ?? 100)
      const rh = Number(inst.props?.height ?? inst.height ?? 50)
      return { x: rx + rw, y: ry + rh }
    }
    case 'circle': {
      const ccx = Number(inst.props?.cx ?? inst.cx ?? 0)
      const ccy = Number(inst.props?.cy ?? inst.cy ?? 0)
      const cr = Number(inst.props?.r ?? inst.r ?? 20)
      return { x: ccx + cr, y: ccy }
    }
    case 'line':
    case 'arrow': {
      const x2 = Number(inst.props?.x2 ?? inst.x2 ?? 0)
      const y2 = Number(inst.props?.y2 ?? inst.y2 ?? 0)
      return { x: x2, y: y2 }
    }
  }
}

/**
 * Renders a shape with a drag-to-create animation. A dashed preview grows
 * from the start point to the end point, then fades into a solid styled shape.
 */
function renderInstruction(inst: DrawInstruction, key: number): React.JSX.Element | null {
  const label = inst.label || (inst.props as Record<string, string | number> | undefined)?.label

  switch (inst.type) {
    case 'point': {
      const px = inst.x ?? 0
      const py = inst.y ?? 0
      return (
        <g key={key}>
          {/* Pulsing outer ring, fades in after the cursor "clicks" */}
          <circle cx={px} cy={py} r="0" fill="none" stroke={GREEN} strokeWidth="2" opacity="0.7">
            <animate attributeName="r" from="0" to="14" dur={DRAW_DUR} fill="freeze" />
            <animate
              attributeName="r"
              values="14;22;14"
              begin={SETTLE_DELAY}
              dur="1.5s"
              repeatCount="indefinite"
            />
            <animate
              attributeName="opacity"
              values="0.8;0;0.8"
              begin={SETTLE_DELAY}
              dur="1.5s"
              repeatCount="indefinite"
            />
          </circle>
          {/* Solid inner dot, pops in */}
          <circle cx={px} cy={py} r="0" fill={GREEN} stroke="white" strokeWidth="2">
            <animate attributeName="r" from="0" to="6" dur={DRAW_DUR} fill="freeze" />
          </circle>
          {label && <Label x={px + 20} y={py - 20} text={String(label)} />}
        </g>
      )
    }

    case 'rect': {
      const rx = Number(inst.props?.x ?? inst.x ?? 0)
      const ry = Number(inst.props?.y ?? inst.y ?? 0)
      const rw = Number(inst.props?.width ?? inst.width ?? 100)
      const rh = Number(inst.props?.height ?? inst.height ?? 50)
      return (
        <g key={key}>
          {/* Dashed drag-preview: grows from start corner */}
          <rect
            x={rx}
            y={ry}
            width="0"
            height="0"
            fill="none"
            stroke={GREEN_LIGHT}
            strokeWidth="2"
            strokeDasharray="6 4"
            rx="4"
          >
            <animate attributeName="width" from="0" to={rw} dur={DRAW_DUR} fill="freeze" />
            <animate attributeName="height" from="0" to={rh} dur={DRAW_DUR} fill="freeze" />
            <animate
              attributeName="opacity"
              from="1"
              to="0"
              begin={SETTLE_DELAY}
              dur={FADE_DUR}
              fill="freeze"
            />
          </rect>
          {/* Settled solid rect: fades in after drag finishes */}
          <rect
            x={rx}
            y={ry}
            width={rw}
            height={rh}
            fill={GREEN_FILL}
            stroke={GREEN}
            strokeWidth="3"
            rx="4"
            opacity="0"
          >
            <animate
              attributeName="opacity"
              from="0"
              to="1"
              begin={SETTLE_DELAY}
              dur={FADE_DUR}
              fill="freeze"
            />
          </rect>
          {label && <Label x={rx + rw / 2} y={ry - 20} text={String(label)} />}
        </g>
      )
    }

    case 'circle': {
      const ccx = Number(inst.props?.cx ?? inst.cx ?? 0)
      const ccy = Number(inst.props?.cy ?? inst.cy ?? 0)
      const cr = Number(inst.props?.r ?? inst.r ?? 20)
      return (
        <g key={key}>
          {/* Dashed drag-preview: radius grows from 0 */}
          <circle
            cx={ccx}
            cy={ccy}
            r="0"
            fill="none"
            stroke={GREEN_LIGHT}
            strokeWidth="2"
            strokeDasharray="6 4"
          >
            <animate attributeName="r" from="0" to={cr} dur={DRAW_DUR} fill="freeze" />
            <animate
              attributeName="opacity"
              from="1"
              to="0"
              begin={SETTLE_DELAY}
              dur={FADE_DUR}
              fill="freeze"
            />
          </circle>
          {/* Settled solid circle */}
          <circle
            cx={ccx}
            cy={ccy}
            r={cr}
            fill={GREEN_FILL}
            stroke={GREEN}
            strokeWidth="3"
            opacity="0"
          >
            <animate
              attributeName="opacity"
              from="0"
              to="1"
              begin={SETTLE_DELAY}
              dur={FADE_DUR}
              fill="freeze"
            />
          </circle>
          {label && <Label x={ccx} y={ccy - cr - 20} text={String(label)} />}
        </g>
      )
    }

    case 'line': {
      const lx1 = Number(inst.props?.x1 ?? inst.x1 ?? 0)
      const ly1 = Number(inst.props?.y1 ?? inst.y1 ?? 0)
      const lx2 = Number(inst.props?.x2 ?? inst.x2 ?? 0)
      const ly2 = Number(inst.props?.y2 ?? inst.y2 ?? 0)
      const dashed =
        inst.props?.dashed === true || inst.props?.dashed === 'true' || inst.props?.dashed === 1
      const midX = (lx1 + lx2) / 2
      const midY = (ly1 + ly2) / 2
      return (
        <g key={key}>
          <line
            x1={lx1}
            y1={ly1}
            x2={lx1}
            y2={ly1}
            stroke={GREEN}
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={dashed ? '8 6' : undefined}
          >
            <animate attributeName="x2" from={lx1} to={lx2} dur={DRAW_DUR} fill="freeze" />
            <animate attributeName="y2" from={ly1} to={ly2} dur={DRAW_DUR} fill="freeze" />
          </line>
          {label && <Label x={midX} y={midY - 18} text={String(label)} />}
        </g>
      )
    }

    case 'arrow': {
      const ax1 = Number(inst.props?.x1 ?? inst.x1 ?? 0)
      const ay1 = Number(inst.props?.y1 ?? inst.y1 ?? 0)
      const ax2 = Number(inst.props?.x2 ?? inst.x2 ?? 0)
      const ay2 = Number(inst.props?.y2 ?? inst.y2 ?? 0)

      const angle = Math.atan2(ay2 - ay1, ax2 - ax1)
      const headLength = 14
      const arrowP1x = ax2 - headLength * Math.cos(angle - Math.PI / 6)
      const arrowP1y = ay2 - headLength * Math.sin(angle - Math.PI / 6)
      const arrowP2x = ax2 - headLength * Math.cos(angle + Math.PI / 6)
      const arrowP2y = ay2 - headLength * Math.sin(angle + Math.PI / 6)

      const midX = (ax1 + ax2) / 2
      const midY = (ay1 + ay2) / 2

      return (
        <g key={key}>
          {/* Arrow shaft draws from origin to tip */}
          <line
            x1={ax1}
            y1={ay1}
            x2={ax1}
            y2={ay1}
            stroke={GREEN}
            strokeWidth="3"
            strokeLinecap="round"
          >
            <animate attributeName="x2" from={ax1} to={ax2} dur={DRAW_DUR} fill="freeze" />
            <animate attributeName="y2" from={ay1} to={ay2} dur={DRAW_DUR} fill="freeze" />
          </line>
          {/* Arrowhead pops in after shaft reaches the tip */}
          <polygon
            points={`${ax2},${ay2} ${arrowP1x},${arrowP1y} ${arrowP2x},${arrowP2y}`}
            fill={GREEN}
            opacity="0"
          >
            <animate
              attributeName="opacity"
              from="0"
              to="1"
              begin={SETTLE_DELAY}
              dur={FADE_DUR}
              fill="freeze"
            />
          </polygon>
          {label && <Label x={midX} y={midY - 20} text={String(label)} />}
        </g>
      )
    }

    default:
      return null
  }
}

/**
 * Macky-style virtual cursor — a small arrow that glides between shape
 * positions to mimic a real pointer driving the drawing.
 */
function VirtualCursor({ x, y }: { x: number; y: number }): React.JSX.Element {
  return (
    <g
      style={{
        transform: `translate(${x}px, ${y}px)`,
        transition: `transform ${CURSOR_TRAVEL_MS}ms cubic-bezier(0.4, 0, 0.2, 1)`
      }}
    >
      {/* macOS-style pointer; slight drop shadow for visibility on any bg */}
      <path
        d="M 0 0 L 0 18 L 4.5 13.5 L 7.5 20.5 L 10 19.5 L 7 12.5 L 12.5 12.5 Z"
        fill="white"
        stroke="black"
        strokeWidth="1.2"
        strokeLinejoin="round"
        filter="drop-shadow(0 1px 2px rgba(0,0,0,0.4))"
      />
    </g>
  )
}

/**
 * Full-screen transparent SVG overlay that renders draw instructions
 * one at a time, mimicking a presenter drawing each shape in turn with a
 * visible virtual cursor. Click-through is handled at the BrowserWindow level.
 */
export default function OverlayCanvas(): React.JSX.Element {
  const [allInstructions, setAllInstructions] = useState<DrawInstruction[]>([])
  const [shownCount, setShownCount] = useState(0)
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(null)
  const [visible, setVisible] = useState(false)
  const clearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const stepTimersRef = useRef<ReturnType<typeof setTimeout>[]>([])

  const clearStepTimers = (): void => {
    stepTimersRef.current.forEach((t) => clearTimeout(t))
    stepTimersRef.current = []
  }

  const handleDrawInstructions = useCallback((_event: unknown, rawData: unknown[]) => {
    const data = rawData as DrawInstruction[]

    if (clearTimerRef.current) {
      clearTimeout(clearTimerRef.current)
      clearTimerRef.current = null
    }
    clearStepTimers()

    setAllInstructions(data)
    setShownCount(0)
    setVisible(true)

    if (data.length === 0) return

    // Pre-position cursor at the first shape's start so the first move feels intentional
    setCursorPos(getStartPoint(data[0]))

    data.forEach((inst, i) => {
      const stepStart = i * STEP_DURATION_MS

      // 1. Cursor glides to the shape's start corner
      stepTimersRef.current.push(setTimeout(() => setCursorPos(getStartPoint(inst)), stepStart))

      // 2. After cursor arrives, reveal the shape (its <animate> handles drag-create)
      //    and slide cursor toward the end corner over the draw duration
      stepTimersRef.current.push(
        setTimeout(() => {
          setShownCount(i + 1)
          setCursorPos(getEndPoint(inst))
        }, stepStart + CURSOR_TRAVEL_MS)
      )
    })

    // Auto-clear well after the last shape settles
    const totalDuration = data.length * STEP_DURATION_MS + 4000
    clearTimerRef.current = setTimeout(() => {
      setVisible(false)
      setTimeout(() => {
        setAllInstructions([])
        setShownCount(0)
        setCursorPos(null)
      }, 500)
    }, totalDuration)
  }, [])

  useEffect(() => {
    const cleanup = window.electronAPI.onDrawInstructions(handleDrawInstructions)

    return () => {
      cleanup?.()
      if (clearTimerRef.current) clearTimeout(clearTimerRef.current)
      clearStepTimers()
    }
  }, [handleDrawInstructions])

  if (allInstructions.length === 0) return <></>

  const visibleInstructions = allInstructions.slice(0, shownCount)

  return (
    <svg
      width="100%"
      height="100%"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        pointerEvents: 'none',
        overflow: 'visible',
        opacity: visible ? 1 : 0,
        transition: 'opacity 0.5s ease-out'
      }}
    >
      {visibleInstructions.map((inst, i) => renderInstruction(inst, i))}
      {cursorPos && <VirtualCursor x={cursorPos.x} y={cursorPos.y} />}
    </svg>
  )
}

import { root, useState, useCallback, useRef, useMainThreadRef, runOnMainThread, runOnBackground } from '@lynx-js/react'
import type { MainThread } from '@lynx-js/types'
import { DevPanel, useDevPanelFPS, DevPanelFPS } from '@lynx-pretext/devtools'
import {
  layoutNextLine,
  layoutWithLines,
  prepareWithSegments,
  walkLineRanges,
  type LayoutCursor,
  type PreparedTextWithSegments,
} from 'lynx-pretext'


// ── Constants ──────────────────────────────────────────────

const BODY_FONT_SIZE = 16
const BODY_FONT = `${BODY_FONT_SIZE}px "Palatino Linotype", Palatino, serif`
const BODY_LINE_HEIGHT = 26
const HEADLINE_FONT_FAMILY = '"Palatino Linotype", Palatino, serif'
const HEADLINE_TEXT = 'LYNX PRETEXT'
const PQ_FONT_SIZE = 15
const PQ_FONT = `italic ${PQ_FONT_SIZE}px ${HEADLINE_FONT_FAMILY}`
const PQ_LINE_HEIGHT = 22
const GUTTER = 24
const COL_GAP = 24
const BOTTOM_GAP = 16
const DROP_CAP_LINES = 3
const MIN_SLOT_WIDTH = 40
const NARROW_BREAKPOINT = 500

const BG_COLOR = '#0c0c10'
const TEXT_COLOR = '#e8e4dc'
const HEADLINE_COLOR = '#ffffff'
const DROP_CAP_COLOR = '#c4a35a'
const PQ_TEXT_COLOR = '#b8a070'
const PQ_BORDER_COLOR = '#6b5a3d'

// ── Types ──────────────────────────────────────────────────

type Interval = { left: number; right: number }
type PositionedLine = { x: number; y: number; width: number; text: string }
type CircleObstacle = { cx: number; cy: number; r: number; hPad: number; vPad: number }
type RectObstacle = { x: number; y: number; w: number; h: number }
type OrbColor = [number, number, number]

type Orb = {
  x: number; y: number; r: number
  vx: number; vy: number
  color: OrbColor
}

type PullquoteRect = RectObstacle & { lines: PositionedLine[]; colIdx: number }

// ── Pure layout helpers ────────────────────────────────────

function carveTextLineSlots(base: Interval, blocked: Interval[]): Interval[] {
  let slots = [base]
  for (let i = 0; i < blocked.length; i++) {
    const interval = blocked[i]!
    const next: Interval[] = []
    for (let j = 0; j < slots.length; j++) {
      const slot = slots[j]!
      if (interval.right <= slot.left || interval.left >= slot.right) {
        next.push(slot)
        continue
      }
      if (interval.left > slot.left) next.push({ left: slot.left, right: interval.left })
      if (interval.right < slot.right) next.push({ left: interval.right, right: slot.right })
    }
    slots = next
  }
  return slots.filter(s => s.right - s.left >= MIN_SLOT_WIDTH)
}

function circleIntervalForBand(
  cx: number, cy: number, r: number,
  bandTop: number, bandBottom: number,
  hPad: number, vPad: number,
): Interval | null {
  const top = bandTop - vPad
  const bottom = bandBottom + vPad
  if (top >= cy + r || bottom <= cy - r) return null
  const minDy = cy >= top && cy <= bottom ? 0 : cy < top ? top - cy : cy - bottom
  if (minDy >= r) return null
  const maxDx = Math.sqrt(r * r - minDy * minDy)
  return { left: cx - maxDx - hPad, right: cx + maxDx + hPad }
}

let cachedHeadlineWidth = -1
let cachedHeadlineHeight = -1
let cachedHeadlineMaxSize = -1
let cachedHeadlineFontSize = 16
let cachedHeadlineLines: PositionedLine[] = []

function fitHeadline(
  maxWidth: number,
  maxHeight: number,
  maxSize: number,
  getPrepared: (text: string, font: string) => PreparedTextWithSegments,
): { fontSize: number; lines: PositionedLine[] } {
  if (
    maxWidth === cachedHeadlineWidth &&
    maxHeight === cachedHeadlineHeight &&
    maxSize === cachedHeadlineMaxSize
  ) {
    return { fontSize: cachedHeadlineFontSize, lines: cachedHeadlineLines }
  }
  cachedHeadlineWidth = maxWidth
  cachedHeadlineHeight = maxHeight
  cachedHeadlineMaxSize = maxSize

  let lo = 16
  let hi = maxSize
  let best = lo
  let bestLines: PositionedLine[] = []

  while (lo <= hi) {
    const size = Math.floor((lo + hi) / 2)
    const font = `700 ${size}px ${HEADLINE_FONT_FAMILY}`
    const lineHeight = Math.round(size * 0.93)
    const prepared = getPrepared(HEADLINE_TEXT, font)
    let breaksWord = false
    let lineCount = 0
    walkLineRanges(prepared, maxWidth, line => {
      lineCount++
      if (line.end.graphemeIndex !== 0) breaksWord = true
    })
    const totalHeight = lineCount * lineHeight
    if (!breaksWord && totalHeight <= maxHeight) {
      best = size
      const result = layoutWithLines(prepared, maxWidth, lineHeight)
      bestLines = result.lines.map((line, i) => ({
        x: 0, y: i * lineHeight, text: line.text, width: line.width,
      }))
      lo = size + 1
    } else {
      hi = size - 1
    }
  }

  cachedHeadlineFontSize = best
  cachedHeadlineLines = bestLines
  return { fontSize: best, lines: bestLines }
}

function layoutColumn(
  prepared: PreparedTextWithSegments,
  startCursor: LayoutCursor,
  regionX: number,
  regionY: number,
  regionW: number,
  regionH: number,
  lineHeight: number,
  circleObstacles: CircleObstacle[],
  rectObstacles: RectObstacle[],
  singleSlotOnly = false,
): { lines: PositionedLine[]; cursor: LayoutCursor } {
  let cursor: LayoutCursor = startCursor
  let lineTop = regionY
  const lines: PositionedLine[] = []
  let textExhausted = false

  while (lineTop + lineHeight <= regionY + regionH && !textExhausted) {
    const bandTop = lineTop
    const bandBottom = lineTop + lineHeight
    const blocked: Interval[] = []

    for (let i = 0; i < circleObstacles.length; i++) {
      const obs = circleObstacles[i]!
      const interval = circleIntervalForBand(
        obs.cx, obs.cy, obs.r, bandTop, bandBottom, obs.hPad, obs.vPad,
      )
      if (interval !== null) blocked.push(interval)
    }

    for (let i = 0; i < rectObstacles.length; i++) {
      const rect = rectObstacles[i]!
      if (bandBottom <= rect.y || bandTop >= rect.y + rect.h) continue
      blocked.push({ left: rect.x, right: rect.x + rect.w })
    }

    const slots = carveTextLineSlots({ left: regionX, right: regionX + regionW }, blocked)
    if (slots.length === 0) {
      lineTop += lineHeight
      continue
    }

    const orderedSlots = singleSlotOnly
      ? [slots.reduce((best, slot) => {
          const bestW = best.right - best.left
          const slotW = slot.right - slot.left
          if (slotW > bestW) return slot
          if (slotW < bestW) return best
          return slot.left < best.left ? slot : best
        })]
      : [...slots].sort((a, b) => a.left - b.left)

    for (let i = 0; i < orderedSlots.length; i++) {
      const slot = orderedSlots[i]!
      const slotWidth = slot.right - slot.left
      const line = layoutNextLine(prepared, cursor, slotWidth)
      if (line === null) {
        textExhausted = true
        break
      }
      lines.push({
        x: Math.round(slot.left),
        y: Math.round(lineTop),
        text: line.text,
        width: line.width,
      })
      cursor = line.end
    }

    lineTop += lineHeight
  }

  return { lines, cursor }
}

// ── Content ────────────────────────────────────────────────

const BODY_TEXT = `The web renders text through a pipeline that was designed thirty years ago for static documents. A browser loads a font, shapes the text into glyphs, measures their combined width, determines where lines break, and positions each line vertically. Every step depends on the previous one. Every step requires the rendering engine to consult its internal layout tree \u2014 a structure so expensive to maintain that browsers guard access to it behind synchronous reflow barriers that can freeze the main thread for tens of milliseconds at a time.

For a paragraph in a blog post, this pipeline is invisible. The browser loads, lays out, and paints before the reader\u2019s eye has traveled from the address bar to the first word. But the web is no longer a collection of static documents. It is a platform for applications, and those applications need to know about text in ways the original pipeline never anticipated.

A messaging application needs to know the exact height of every message bubble before rendering a virtualized list. A masonry layout needs the height of every card to position them without overlap. An editorial page needs text to flow around images, advertisements, and interactive elements. A responsive dashboard needs to resize and reflow text in real time as the user drags a panel divider.

Every one of these operations requires text measurement. And every text measurement on the web today requires a synchronous layout reflow. The cost is devastating. Measuring the height of a single text block forces the browser to recalculate the position of every element on the page. When you measure five hundred text blocks in sequence, you trigger five hundred full layout passes. This pattern, known as layout thrashing, is the single largest source of jank on the modern web.

Chrome DevTools will flag it with angry red bars. Lighthouse will dock your performance score. But the developer has no alternative \u2014 CSS provides no API for computing text height without rendering it. The information is locked behind the DOM, and the DOM makes you pay for every answer.

Developers have invented increasingly desperate workarounds. Estimated heights replace real measurements with guesses, causing content to visibly jump when the guess is wrong. ResizeObserver watches elements for size changes, but it fires asynchronously and always at least one frame too late. IntersectionObserver tracks visibility but says nothing about dimensions. Content-visibility allows the browser to skip rendering off-screen elements, but it breaks scroll position and accessibility. Each workaround addresses one symptom while introducing new problems.

The CSS Shapes specification, finalized in 2014, was supposed to bring magazine-style text wrap to the web. It allows text to flow around a defined shape \u2014 a circle, an ellipse, a polygon, even an image alpha channel. On paper, it was the answer. In practice, it is remarkably limited. CSS Shapes only works with floated elements. Text can only wrap on one side of the shape. The shape must be defined statically in CSS \u2014 you cannot animate it or change it dynamically without triggering a full layout reflow. And because it operates within the browser\u2019s layout engine, you have no access to the resulting line geometry. You cannot determine where each line of text starts and ends, how many lines were generated, or what the total height of the shaped text block is.

The editorial layouts we see in print magazines \u2014 text flowing around photographs, pull quotes interrupting the column, multiple columns with seamless text handoff \u2014 have remained out of reach for the web. Not because they are conceptually difficult, but because the performance cost of implementing them with DOM measurement makes them impractical. A two-column editorial layout that reflows text around three obstacle shapes requires measuring and positioning hundreds of text lines. At thirty milliseconds per measurement, this would take seconds \u2014 an eternity for a render frame.

What if text measurement did not require the DOM at all? What if you could compute exactly where every line of text would break, exactly how wide each line would be, and exactly how tall the entire text block would be, using nothing but arithmetic?

This is the core insight of pretext. The browser\u2019s canvas API includes a measureText method that returns the width of any string in any font without triggering a layout reflow. Canvas measurement uses the same font engine as DOM rendering \u2014 the results are identical. But because it operates outside the layout tree, it carries no reflow penalty.

Pretext exploits this asymmetry. When text first appears, pretext measures every word once via canvas and caches the widths. After this preparation phase, layout is pure arithmetic: walk the cached widths, track the running line width, insert line breaks when the width exceeds the maximum, and sum the line heights. No DOM. No reflow. No layout tree access.

The performance improvement is not incremental. Measuring five hundred text blocks with DOM methods costs fifteen to thirty milliseconds and triggers five hundred layout reflows. With pretext, the same operation costs 0.05 milliseconds and triggers zero reflows. This is a three hundred to six hundred times improvement. But even that number understates the impact, because pretext\u2019s cost does not scale with page complexity \u2014 it is independent of how many other elements exist on the page.

With DOM-free text measurement, an entire class of previously impractical interfaces becomes trivial. Text can flow around arbitrary shapes, not because the browser\u2019s layout engine supports it, but because you control the line widths directly. For each line of text, you compute which horizontal intervals are blocked by obstacles, subtract them from the available width, and pass the remaining width to the layout engine. The engine returns the text that fits, and you position the line at the correct offset.

This is exactly what CSS Shapes tried to accomplish, but with none of its limitations. Obstacles can be any shape \u2014 rectangles, circles, arbitrary polygons, even the alpha channel of an image. Text wraps on both sides simultaneously. Obstacles can move, animate, or be dragged by the user, and the text reflows instantly because the layout computation takes less than a millisecond.

Shrinkwrap is another capability that CSS cannot express. Given a block of multiline text, what is the narrowest width that preserves the current line count? CSS offers fit-content, which works for single lines but always leaves dead space for multiline text. Pretext solves this with a binary search over widths: narrow until the line count increases, then back off. The result is the tightest possible bounding box \u2014 perfect for chat message bubbles, image captions, and tooltip text.

Virtualized text rendering becomes exact rather than estimated. A virtual list needs to know the height of items before they enter the viewport, so it can position them correctly and calculate scroll extent. Without pretext, you must either render items off-screen to measure them or estimate heights and accept visual jumping when items enter the viewport with different heights than predicted. Pretext computes exact heights without creating any DOM elements, enabling perfect virtualization with zero visual artifacts.

Multi-column text flow with cursor handoff is perhaps the most striking capability. The left column consumes text until it reaches the bottom, then hands its cursor to the right column. The right column picks up exactly where the left column stopped, with no duplication, no gap, and perfect line breaking at the column boundary. This is how newspapers and magazines work on paper, but it has never been achievable on the web without extreme hacks involving multiple elements, hidden overflow, and JavaScript-managed content splitting.

Pretext makes it trivial. Call layoutNextLine in a loop for the first column, using the column width. When the column is full, take the returned cursor and start a new loop for the second column. The cursor carries the exact position in the prepared text \u2014 which segment, which grapheme within that segment. The second column continues seamlessly from the first.

Real-time text reflow around animated obstacles is the ultimate stress test. The demonstration you are reading right now renders text that flows around multiple moving objects simultaneously, every frame, at sixty frames per second. Each frame, the layout engine computes obstacle intersections for every line of text, determines the available horizontal slots, lays out each line at the correct width and position, and updates the display with the results. The total computation time is typically under half a millisecond.

The glowing orbs drifting across this page are not decorative \u2014 they are the demonstration. Each orb is a circular obstacle. For every line of text, the engine checks whether the line\u2019s vertical band intersects each orb. If it does, it computes the blocked horizontal interval and subtracts it from the available width. The remaining width might be split into two or more segments \u2014 and the engine fills every viable slot, flowing text on both sides of the obstacle simultaneously. This is something CSS Shapes cannot do at all.

All of this runs without a single DOM measurement. The line positions, widths, and text contents are computed entirely in JavaScript using cached font metrics. The only writes are setting the position and text of each line element \u2014 the absolute minimum required to show text on screen.

The open web deserves typography that matches its ambition. We build applications that rival native software in every dimension except text. Our animations are smooth, our interactions are responsive, our graphics are stunning \u2014 but our text sits in rigid boxes, unable to flow around obstacles, unable to adapt to dynamic layouts, unable to participate in the fluid compositions that define modern interface design.

This is what changes when text measurement becomes free. Not slightly better \u2014 categorically different. The interfaces that were too expensive to build become trivial. The layouts that existed only in print become interactive. The text that sat in boxes begins to flow.

Fifteen kilobytes. Zero dependencies. Zero DOM reads. And the text flows.`

const PULLQUOTE_TEXTS = [
  '\u201CThe performance improvement is not incremental \u2014 it is categorical. 0.05ms versus 30ms. Zero reflows versus five hundred.\u201D',
  '\u201CText becomes a first-class participant in the visual composition \u2014 not a static block, but a fluid material that adapts in real time.\u201D',
]

const PQ_PLACEMENTS: Array<{ colIdx: number; yFrac: number; wFrac: number; side: 'left' | 'right' }> = [
  { colIdx: 0, yFrac: 0.45, wFrac: 0.52, side: 'right' },
  { colIdx: 1, yFrac: 0.32, wFrac: 0.5, side: 'left' },
]

// ── Orb definitions (4 glowing orbs) ──────────────────────

const ORB_DEFS = [
  { fx: 0.50, fy: 0.25, r: 65, vx: 22, vy: 14, color: [196, 163, 90] as OrbColor },
  { fx: 0.20, fy: 0.50, r: 50, vx: -17, vy: 22, color: [100, 140, 255] as OrbColor },
  { fx: 0.75, fy: 0.55, r: 55, vx: 14, vy: -18, color: [232, 100, 130] as OrbColor },
  { fx: 0.35, fy: 0.75, r: 45, vx: -22, vy: -12, color: [80, 200, 140] as OrbColor },
]

// ── Component ──────────────────────────────────────────────

function EditorialEnginePage() {

  const [viewportW, setViewportW] = useState(0)
  const [viewportH, setViewportH] = useState(0)
  const [orbs, setOrbs] = useState<Orb[]>([]) // BTS render copy

  // DevPanel FPS hook - hybrid mode with MTS direct update
  const { mtsFpsTick, btsFpsTick, mtsFpsDisplay, btsFpsDisplay, mtsFpsTextRef } = useDevPanelFPS(true)

  const initRef = useRef(false)
  const preparedCacheRef = useRef(new Map<string, PreparedTextWithSegments>())

  // ── Main Thread State (single source of truth for animation/physics) ──
  const orbsMT = useMainThreadRef<Orb[]>([])
  const viewportWMT = useMainThreadRef(0)
  const viewportHMT = useMainThreadRef(0)
  const lastFrameTimeMT = useMainThreadRef(0)
  const animatingMT = useMainThreadRef(false)
  // Drag state
  const dragOrbIndexMT = useMainThreadRef(-1)
  const dragStartXMT = useMainThreadRef(0)
  const dragStartYMT = useMainThreadRef(0)
  const dragStartOrbXMT = useMainThreadRef(0)
  const dragStartOrbYMT = useMainThreadRef(0)

  // Cached text preparation
  const getPrepared = useCallback((text: string, font: string): PreparedTextWithSegments => {
    const key = `${font}::${text}`
    let cached = preparedCacheRef.current.get(key)
    if (cached) return cached
    cached = prepareWithSegments(text, font)
    preparedCacheRef.current.set(key, cached)
    return cached
  }, [])

  // Layout change handler — initializes viewport and orbs
  const handleLayout = useCallback((e: any) => {
    const { width, height } = e.detail
    if (width <= 0 || height <= 0) return

    setViewportW(width)
    setViewportH(height)

    if (!initRef.current) {
      initRef.current = true
      const initialOrbs = ORB_DEFS.map(d => ({
        x: d.fx * width, y: d.fy * height,
        r: d.r, vx: d.vx, vy: d.vy, color: d.color,
      }))
      setOrbs(initialOrbs)
      // Initialize MTS state and start animation
      void runOnMainThread(initAndStartMT)(width, height, initialOrbs)
    }
  }, [])

  // ── Main Thread Animation Loop ──
  // NOTE: MTS functions must be declared in callee-before-caller order (TDZ)

  function gameTickMT(): void {
    'main thread'
    if (!animatingMT.current) return

    // MTS FPS tick
    mtsFpsTick()

    const now = Date.now()
    const dt = Math.min((now - lastFrameTimeMT.current) / 1000, 0.05)
    lastFrameTimeMT.current = now

    const orbs = orbsMT.current
    const draggedIdx = dragOrbIndexMT.current
    const w = viewportWMT.current
    const h = viewportHMT.current

    // Physics update
    for (let i = 0; i < orbs.length; i++) {
      const orb = orbs[i]!
      if (i === draggedIdx) continue
      orb.x += orb.vx * dt
      orb.y += orb.vy * dt
      if (orb.x - orb.r < 0) { orb.x = orb.r; orb.vx = Math.abs(orb.vx) }
      if (orb.x + orb.r > w) { orb.x = w - orb.r; orb.vx = -Math.abs(orb.vx) }
      if (orb.y - orb.r < GUTTER * 0.5) { orb.y = orb.r + GUTTER * 0.5; orb.vy = Math.abs(orb.vy) }
      if (orb.y + orb.r > h - BOTTOM_GAP) { orb.y = h - BOTTOM_GAP - orb.r; orb.vy = -Math.abs(orb.vy) }
    }

    // Inter-orb repulsion
    for (let i = 0; i < orbs.length; i++) {
      const a = orbs[i]!
      for (let j = i + 1; j < orbs.length; j++) {
        const b = orbs[j]!
        const dx = b.x - a.x
        const dy = b.y - a.y
        const dist = Math.sqrt(dx * dx + dy * dy)
        const minDist = a.r + b.r + 16
        if (dist >= minDist || dist <= 0.1) continue
        const force = (minDist - dist) * 0.8
        const nx = dx / dist
        const ny = dy / dist
        if (i !== draggedIdx) { a.vx -= nx * force * dt; a.vy -= ny * force * dt }
        if (j !== draggedIdx) { b.vx += nx * force * dt; b.vy += ny * force * dt }
      }
    }

    // Sync to BTS for rendering (once per frame)
    runOnBackground(setOrbs)(orbs.map(o => ({ ...o })))

    requestAnimationFrame(gameTickMT)
  }

  function initAndStartMT(w: number, h: number, initialOrbs: Orb[]): void {
    'main thread'
    console.log('[MTS] initAndStartMT', w, h, 'orbs:', initialOrbs.length)
    viewportWMT.current = w
    viewportHMT.current = h
    orbsMT.current = initialOrbs.map(o => ({ ...o }))
    console.log('[MTS] orbsMT.current set, first orb:', orbsMT.current[0])
    lastFrameTimeMT.current = Date.now()
    animatingMT.current = true
    requestAnimationFrame(gameTickMT)
  }

  // ── Main Thread Touch Handlers (zero-latency drag) ──

  function handleTouchStartMT(event: MainThread.TouchEvent): void {
    'main thread'
    const touch = event.touches.length > 0 ? event.touches[0]! : null
    if (touch === null) return

    const orbs = orbsMT.current
    console.log('[MTS] touchstart at', touch.clientX.toFixed(0), touch.clientY.toFixed(0))
    for (let i = 0; i < orbs.length; i++) {
      const orb = orbs[i]!
      console.log(`  orb ${i}: pos=(${orb.x.toFixed(0)}, ${orb.y.toFixed(0)}) r=${orb.r}`)
    }

    for (let i = orbs.length - 1; i >= 0; i--) {
      const orb = orbs[i]!
      const dx = touch.clientX - orb.x
      const dy = touch.clientY - orb.y
      const grabR = orb.r + 20
      if (dx * dx + dy * dy <= grabR * grabR) {
        console.log('[MTS] DRAG START on orb', i)
        dragOrbIndexMT.current = i
        dragStartXMT.current = touch.clientX
        dragStartYMT.current = touch.clientY
        dragStartOrbXMT.current = orb.x
        dragStartOrbYMT.current = orb.y
        return
      }
    }
    console.log('[MTS] no orb hit')
  }

  function handleTouchMoveMT(event: MainThread.TouchEvent): void {
    'main thread'
    const dragIndex = dragOrbIndexMT.current
    console.log('[MTS] touchmove, dragIndex:', dragIndex, 'touches:', event.touches.length)
    if (dragIndex === -1) return

    // Just use first touch for single-finger drag
    const touch = event.touches.length > 0 ? event.touches[0]! : null
    if (touch === null) {
      console.log('[MTS] no touch in event')
      return
    }

    const orb = orbsMT.current[dragIndex]
    if (!orb) return
    orb.x = dragStartOrbXMT.current + (touch.clientX - dragStartXMT.current)
    orb.y = dragStartOrbYMT.current + (touch.clientY - dragStartYMT.current)
    console.log('[MTS] DRAG MOVE orb', dragIndex, '->', orb.x, orb.y)
  }

  function handleTouchEndMT(_event: MainThread.TouchEvent): void {
    'main thread'
    console.log('[MTS] touchend, was dragging:', dragOrbIndexMT.current)
    dragOrbIndexMT.current = -1
  }

  // ── Render ──

  if (viewportW <= 0 || viewportH <= 0) {
    return (
      <view
        style={{ flex: 1, height: '100%', backgroundColor: BG_COLOR }}
        bindlayoutchange={handleLayout}
      />
    )
  }

  // ── Layout computation ──

  // BTS FPS tick (called on every render)
  btsFpsTick()

  const isNarrow = viewportW < NARROW_BREAKPOINT
  const gutter = isNarrow ? 20 : GUTTER
  const colGap = isNarrow ? 16 : COL_GAP
  const bottomGap = isNarrow ? 12 : BOTTOM_GAP

  const circleObstacles: CircleObstacle[] = orbs.map(orb => ({
    cx: orb.x, cy: orb.y, r: orb.r,
    hPad: isNarrow ? 8 : 12,
    vPad: isNarrow ? 2 : 3,
  }))

  // Headline
  const headlineWidth = viewportW - gutter * 2
  const maxHeadlineHeight = Math.floor(viewportH * (isNarrow ? 0.18 : 0.22))
  const { fontSize: headlineSize, lines: headlineLines } = fitHeadline(
    headlineWidth, maxHeadlineHeight, isNarrow ? 36 : 60, getPrepared,
  )
  const headlineLineHeight = Math.round(headlineSize * 0.93)
  const headlineHeight = headlineLines.length * headlineLineHeight

  // Body region
  const bodyTop = gutter + headlineHeight + (isNarrow ? 10 : 16)
  const bodyHeight = viewportH - bodyTop - bottomGap
  const columnCount = isNarrow ? 1 : 2
  const totalGutter = gutter * 2 + colGap * (columnCount - 1)
  const columnWidth = Math.floor((viewportW - totalGutter) / columnCount)
  const contentLeft = Math.round(
    (viewportW - (columnCount * columnWidth + (columnCount - 1) * colGap)) / 2,
  )

  // Drop cap
  const dropCapSize = BODY_LINE_HEIGHT * DROP_CAP_LINES - 4
  const dropCapFont = `700 ${dropCapSize}px ${HEADLINE_FONT_FAMILY}`
  const dropCapChar = BODY_TEXT[0]!
  const preparedDropCap = getPrepared(dropCapChar, dropCapFont)
  let dropCapWidth = 0
  walkLineRanges(preparedDropCap, 9999, line => { dropCapWidth = line.width })
  const dropCapTotalW = Math.ceil(dropCapWidth) + 8
  const dropCapRect: RectObstacle = {
    x: contentLeft - 2,
    y: bodyTop - 2,
    w: dropCapTotalW,
    h: DROP_CAP_LINES * BODY_LINE_HEIGHT + 2,
  }

  // Pullquotes (only in two-column mode)
  const pullquoteRects: PullquoteRect[] = []
  if (!isNarrow) {
    for (let i = 0; i < PULLQUOTE_TEXTS.length; i++) {
      const placement = PQ_PLACEMENTS[i]!
      if (placement.colIdx >= columnCount) continue
      const prepPQ = getPrepared(PULLQUOTE_TEXTS[i]!, PQ_FONT)
      const pqWidth = Math.round(columnWidth * placement.wFrac)
      const pqLines = layoutWithLines(prepPQ, pqWidth - 20, PQ_LINE_HEIGHT).lines
      const pqHeight = pqLines.length * PQ_LINE_HEIGHT + 16
      const colX = contentLeft + placement.colIdx * (columnWidth + colGap)
      const pqX = placement.side === 'right' ? colX + columnWidth - pqWidth : colX
      const pqY = Math.round(bodyTop + bodyHeight * placement.yFrac)
      const posLines = pqLines.map((line, lineIdx) => ({
        x: pqX + 20,
        y: pqY + 8 + lineIdx * PQ_LINE_HEIGHT,
        text: line.text,
        width: line.width,
      }))
      pullquoteRects.push({
        x: pqX, y: pqY, w: pqWidth, h: pqHeight,
        lines: posLines, colIdx: placement.colIdx,
      })
    }
  }

  // Body columns — text flows left → right with cursor handoff
  const preparedBody = getPrepared(BODY_TEXT, BODY_FONT)
  const allBodyLines: PositionedLine[] = []
  let cursor: LayoutCursor = { segmentIndex: 0, graphemeIndex: 1 } // skip drop cap letter

  for (let colIdx = 0; colIdx < columnCount; colIdx++) {
    const colX = contentLeft + colIdx * (columnWidth + colGap)
    const rects: RectObstacle[] = []
    if (colIdx === 0) rects.push(dropCapRect)
    for (let p = 0; p < pullquoteRects.length; p++) {
      const pq = pullquoteRects[p]!
      if (pq.colIdx !== colIdx) continue
      rects.push({ x: pq.x, y: pq.y, w: pq.w, h: pq.h })
    }
    const result = layoutColumn(
      preparedBody, cursor,
      colX, bodyTop, columnWidth, bodyHeight,
      BODY_LINE_HEIGHT, circleObstacles, rects, isNarrow,
    )
    allBodyLines.push(...result.lines)
    cursor = result.cursor
  }

  // ── JSX ──

  return (
    <view
      style={{ flex: 1, height: '100%', backgroundColor: BG_COLOR, overflow: 'hidden' }}
      bindlayoutchange={handleLayout}
      main-thread:bindtouchstart={handleTouchStartMT}
      main-thread:bindtouchmove={handleTouchMoveMT}
      main-thread:bindtouchend={handleTouchEndMT}
    >
      {/* Orb glow layers (behind text) */}
      {orbs.map((orb, i) => {
        const [r, g, b] = orb.color
        return (
          <view key={`orb-${i}`}>
            <view style={{
              position: 'absolute',
              left: `${orb.x - orb.r * 1.6}px`,
              top: `${orb.y - orb.r * 1.6}px`,
              width: `${orb.r * 3.2}px`,
              height: `${orb.r * 3.2}px`,
              borderRadius: `${orb.r * 1.6}px`,
              backgroundColor: `rgba(${r}, ${g}, ${b}, 0.06)`,
            }} />
            <view style={{
              position: 'absolute',
              left: `${orb.x - orb.r}px`,
              top: `${orb.y - orb.r}px`,
              width: `${orb.r * 2}px`,
              height: `${orb.r * 2}px`,
              borderRadius: `${orb.r}px`,
              backgroundColor: `rgba(${r}, ${g}, ${b}, 0.20)`,
            }} />
            <view style={{
              position: 'absolute',
              left: `${orb.x - orb.r * 0.45}px`,
              top: `${orb.y - orb.r * 0.55}px`,
              width: `${orb.r * 0.9}px`,
              height: `${orb.r * 0.9}px`,
              borderRadius: `${orb.r * 0.45}px`,
              backgroundColor: `rgba(${r}, ${g}, ${b}, 0.30)`,
            }} />
          </view>
        )
      })}

      {/* Headline */}
      {headlineLines.map((line, i) => (
        <view key={`hl-${i}`} style={{
          position: 'absolute',
          left: `${gutter + line.x}px`,
          top: `${gutter + line.y}px`,
          height: `${headlineLineHeight}px`,
        }}>
          <text style={{
            fontWeight: 'bold',
            fontSize: `${headlineSize}px`,
            color: HEADLINE_COLOR,
            letterSpacing: '-0.5px',
          }}>
            {line.text}
          </text>
        </view>
      ))}

      {/* Drop cap */}
      <view style={{
        position: 'absolute',
        left: `${contentLeft}px`,
        top: `${bodyTop}px`,
      }}>
        <text style={{
          fontWeight: 'bold',
          fontSize: `${dropCapSize}px`,
          lineHeight: `${dropCapSize}px`,
          color: DROP_CAP_COLOR,
        }}>
          {dropCapChar}
        </text>
      </view>

      {/* Body text lines */}
      {allBodyLines.map((line, i) => (
        <view key={`b-${i}`} style={{
          position: 'absolute',
          left: `${line.x}px`,
          top: `${line.y}px`,
          height: `${BODY_LINE_HEIGHT}px`,
        }}>
          <text style={{ fontSize: `${BODY_FONT_SIZE}px`, color: TEXT_COLOR }}>
            {line.text}
          </text>
        </view>
      ))}

      {/* Pullquote boxes */}
      {pullquoteRects.map((pq, i) => (
        <view key={`pqb-${i}`} style={{
          position: 'absolute',
          left: `${pq.x}px`,
          top: `${pq.y}px`,
          width: `${pq.w}px`,
          height: `${pq.h}px`,
          borderLeftWidth: '3px',
          borderLeftColor: PQ_BORDER_COLOR,
          paddingLeft: '14px',
        }} />
      ))}

      {/* Pullquote text lines */}
      {pullquoteRects.map((pq, pi) =>
        pq.lines.map((line, li) => (
          <view key={`pql-${pi}-${li}`} style={{
            position: 'absolute',
            left: `${line.x}px`,
            top: `${line.y}px`,
            height: `${PQ_LINE_HEIGHT}px`,
          }}>
            <text style={{
              fontStyle: 'italic',
              fontSize: `${PQ_FONT_SIZE}px`,
              color: PQ_TEXT_COLOR,
            }}>
              {line.text}
            </text>
          </view>
        )),
      )}

      {/* DevPanel */}
      <DevPanel.Root>
        <DevPanel.Trigger />
        <DevPanel.Content
          title="Editorial Engine (Hybrid)"
          description="MTS animation + touch, BTS text layout. Orbs animate on MTS, text reflows on BTS via runOnBackground sync. 1-2 frame delay."
        >
          <DevPanelFPS
            mtsFpsDisplay={mtsFpsDisplay}
            btsFpsDisplay={btsFpsDisplay}
            mtsFpsTextRef={mtsFpsTextRef}
          />
          <DevPanel.Stats>
            <DevPanel.Stat label="Mode" value={isNarrow ? 'Single' : 'Two-col'} />
            <DevPanel.Stat label="Orbs" value={`${orbs.length}`} />
            <DevPanel.Stat label="Lines" value={`${allBodyLines.length}`} />
          </DevPanel.Stats>
        </DevPanel.Content>
      </DevPanel.Root>
    </view>
  )
}

root.render(<EditorialEnginePage />)

if (import.meta.webpackHot) {
  import.meta.webpackHot.accept()
}

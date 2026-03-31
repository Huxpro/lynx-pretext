import { root, runOnMainThread, runOnBackground, useCallback, useMainThreadRef, useState } from '@lynx-js/react'
import type { MainThread } from '@lynx-js/types'
import { DevPanel, useDevPanelFPS, DevPanelFPS } from 'lynx-pretext-devtools'
import {
  layoutNextLine,
  layoutWithLines,
  prepareWithSegments,
  walkLineRanges,
} from 'lynx-pretext' with { runtime: 'shared' }
import type { LayoutCursor, PreparedTextWithSegments } from 'lynx-pretext'

// Inlined from wrap-geometry.ts (avoids cross-example dependency)
type Rect = { x: number; y: number; width: number; height: number }
type Interval = { left: number; right: number }

function carveTextLineSlots(base: Interval, blocked: Interval[]): Interval[] {
  'main thread'
  let slots: Interval[] = [base]
  for (let bi = 0; bi < blocked.length; bi++) {
    const interval = blocked[bi]!
    const next: Interval[] = []
    for (let si = 0; si < slots.length; si++) {
      const slot = slots[si]!
      if (interval.right <= slot.left || interval.left >= slot.right) { next.push(slot); continue }
      if (interval.left > slot.left) next.push({ left: slot.left, right: interval.left })
      if (interval.right < slot.right) next.push({ left: interval.right, right: slot.right })
    }
    slots = next
  }
  return slots.filter(s => s.right - s.left >= 24)
}

const BG_COLOR = '#0c0c10'
const TEXT_COLOR = '#e8e4dc'
const HEADLINE_COLOR = '#ffffff'
const CREDIT_COLOR = 'rgba(255,255,255,0.36)'
const INTRO_COLOR = 'rgba(232,228,220,0.82)'

const BODY_FONT_SIZE = 16
const BODY_FONT = `${BODY_FONT_SIZE}px "Palatino Linotype", Palatino, serif`
const BODY_LINE_HEIGHT = 26
const HEADLINE_FONT_FAMILY = '"Palatino Linotype", Palatino, serif'
const CREDIT_TEXT = 'Zero DOM reads · Main thread text flow'
const CREDIT_LINE_HEIGHT = 16
const INTRO_TEXT =
  'A fixed editorial header sits above a live body-text field. Drag the glowing circles to force the body text to route around them in real time.'
const INTRO_FONT_SIZE = 14
const INTRO_FONT = `${INTRO_FONT_SIZE}px ${HEADLINE_FONT_FAMILY}`
const INTRO_LINE_HEIGHT = 22
const HEADLINE_TEXT = 'THE EDITORIAL ENGINE'

const HEADER_TOP = 28
const MIN_SLOT_WIDTH = 44
const MULTI_SLOT_WIDTH = 68
const BODY_POOL = 84
const HEADLINE_POOL = 4
const INTRO_POOL = 8
const DRAG_TAP_THRESHOLD = 12
const ORB_GRAB_PADDING = 20
const DEBUG_TOUCH_LOGS = true

const BODY_TEXT = `The web renders text through a pipeline that was designed thirty years ago for static documents. A browser loads a font, shapes the text into glyphs, measures their combined width, determines where lines break, and positions each line vertically. Every step depends on the previous one. Every step requires the rendering engine to consult its internal layout tree — a structure so expensive to maintain that browsers guard access to it behind synchronous reflow barriers that can freeze the main thread for tens of milliseconds at a time.

For a paragraph in a blog post, this pipeline is invisible. The browser loads, lays out, and paints before the reader’s eye has traveled from the address bar to the first word. But the web is no longer a collection of static documents. It is a platform for applications, and those applications need to know about text in ways the original pipeline never anticipated.

A messaging application needs to know the exact height of every message bubble before rendering a virtualized list. A masonry layout needs the height of every card to position them without overlap. An editorial page needs text to flow around images, advertisements, and interactive elements. A responsive dashboard needs to resize and reflow text in real time as the user drags a panel divider.

Every one of these operations requires text measurement. And every text measurement on the web today requires a synchronous layout reflow. The cost is devastating. Measuring the height of a single text block forces the browser to recalculate the position of every element on the page. When you measure five hundred text blocks in sequence, you trigger five hundred full layout passes. This pattern, known as layout thrashing, is the single largest source of jank on the modern web.

Developers have invented increasingly desperate workarounds. Estimated heights replace real measurements with guesses, causing content to visibly jump when the guess is wrong. ResizeObserver watches elements for size changes, but it fires asynchronously and always at least one frame too late. IntersectionObserver tracks visibility but says nothing about dimensions. Content-visibility allows the browser to skip rendering off-screen elements, but it breaks scroll position and accessibility.

The glowing circles drifting through this page are not decorative — they are the demonstration. For every line of text, the engine checks whether the line’s vertical band intersects an orb. If it does, it computes the blocked horizontal interval and subtracts it from the available width. The remaining width might split into two smaller slots, and the engine can fill both when they are wide enough.

All of this runs without a single DOM measurement. The line positions, widths, and text contents are computed entirely in JavaScript using cached font metrics. The only writes are setting the position and text of each line element — the absolute minimum required to show text on screen.

This is what changes when text measurement becomes free. Not slightly better — categorically different. The interfaces that were too expensive to build become trivial. The layouts that existed only in print become interactive. The text that sat in boxes begins to flow.`

const ORB_DEFS = [
  {
    fx: 0.72, fy: 0.16, r: 46, vx: 18, vy: 14,
    glowColor: 'rgba(196, 163, 90, 0.18)', coreColor: 'rgba(196, 163, 90, 0.52)',
  },
  {
    fx: 0.24, fy: 0.36, r: 38, vx: -16, vy: 20,
    glowColor: 'rgba(100, 140, 255, 0.16)', coreColor: 'rgba(100, 140, 255, 0.48)',
  },
  {
    fx: 0.58, fy: 0.62, r: 42, vx: 14, vy: -18,
    glowColor: 'rgba(232, 100, 130, 0.16)', coreColor: 'rgba(232, 100, 130, 0.5)',
  },
] as const

type PositionedLine = { x: number; y: number; width: number; text: string }

type CircleObstacle = {
  cx: number
  cy: number
  r: number
  hPad: number
  vPad: number
}

type OrbState = {
  x: number
  y: number
  r: number
  vx: number
  vy: number
  paused: boolean
  glowColor: string
  coreColor: string
}

type PageLayout = {
  gutter: number
  headlineLeft: number
  headlineTop: number
  headlineWidth: number
  headlineMaxHeight: number
  creditTop: number
  introTop: number
  bodyRect: Rect
}

function circleIntervalForBand(
  cx: number,
  cy: number,
  r: number,
  bandTop: number,
  bandBottom: number,
  hPad: number,
  vPad: number,
): Interval | null {
  'main thread'
  const top = bandTop - vPad
  const bottom = bandBottom + vPad
  if (top >= cy + r || bottom <= cy - r) return null
  const minDy = cy >= top && cy <= bottom ? 0 : cy < top ? top - cy : cy - bottom
  if (minDy >= r) return null
  const maxDx = Math.sqrt(r * r - minDy * minDy)
  return { left: cx - maxDx - hPad, right: cx + maxDx + hPad }
}

function fitHeadline(
  maxWidth: number,
  maxHeight: number,
): { fontSize: number; lineHeight: number; lines: PositionedLine[] } {
  'main thread'
  let low = 24
  let high = 42
  let best = low
  let bestLineHeight = Math.round(low * 0.93)
  let bestLines: PositionedLine[] = []

  while (low <= high) {
    const size = Math.floor((low + high) / 2)
    const lineHeight = Math.round(size * 0.93)
    const font = `700 ${size}px ${HEADLINE_FONT_FAMILY}`
    const prepared = prepareWithSegments(HEADLINE_TEXT, font)
    let breaksWord = false
    let lineCount = 0

    walkLineRanges(prepared, maxWidth, line => {
      lineCount++
      if (line.end.graphemeIndex !== 0) breaksWord = true
    })

    const totalHeight = lineCount * lineHeight
    if (!breaksWord && totalHeight <= maxHeight) {
      const result = layoutWithLines(prepared, maxWidth, lineHeight)
      best = size
      bestLineHeight = lineHeight
      bestLines = result.lines.map((line, index) => ({
        x: 0,
        y: index * lineHeight,
        width: line.width,
        text: line.text,
      }))
      low = size + 1
    } else {
      high = size - 1
    }
  }

  return { fontSize: best, lineHeight: bestLineHeight, lines: bestLines }
}

function buildPageLayout(pageWidth: number, pageHeight: number): PageLayout {
  'main thread'
  const gutter = Math.round(Math.max(18, Math.min(28, pageWidth * 0.06)))
  const headlineWidth = pageWidth - gutter * 2
  return {
    gutter,
    headlineLeft: gutter,
    headlineTop: HEADER_TOP,
    headlineWidth,
    headlineMaxHeight: Math.max(72, Math.floor(pageHeight * 0.18)),
    creditTop: 0,
    introTop: 0,
    bodyRect: {
      x: gutter,
      y: 0,
      width: headlineWidth,
      height: Math.max(120, pageHeight - gutter),
    },
  }
}

function clampOrbToBody(orb: OrbState, bodyRect: Rect): void {
  'main thread'
  const minX = bodyRect.x + orb.r
  const maxX = bodyRect.x + bodyRect.width - orb.r
  const minY = bodyRect.y + orb.r
  const maxY = bodyRect.y + bodyRect.height - orb.r
  orb.x = Math.max(minX, Math.min(maxX, orb.x))
  orb.y = Math.max(minY, Math.min(maxY, orb.y))
}

function createInitialOrbs(bodyRect: Rect): OrbState[] {
  'main thread'
  return [
    {
      x: bodyRect.x + bodyRect.width * 0.72,
      y: bodyRect.y + bodyRect.height * 0.16,
      r: 46,
      vx: 18,
      vy: 14,
      paused: false,
      glowColor: 'rgba(196, 163, 90, 0.18)',
      coreColor: 'rgba(196, 163, 90, 0.52)',
    },
    {
      x: bodyRect.x + bodyRect.width * 0.24,
      y: bodyRect.y + bodyRect.height * 0.36,
      r: 38,
      vx: -16,
      vy: 20,
      paused: false,
      glowColor: 'rgba(100, 140, 255, 0.16)',
      coreColor: 'rgba(100, 140, 255, 0.48)',
    },
    {
      x: bodyRect.x + bodyRect.width * 0.58,
      y: bodyRect.y + bodyRect.height * 0.62,
      r: 42,
      vx: 14,
      vy: -18,
      paused: false,
      glowColor: 'rgba(232, 100, 130, 0.16)',
      coreColor: 'rgba(232, 100, 130, 0.5)',
    },
  ]
}

function EditorialEngineMTSPage() {
  // DevPanel FPS hook - MTS direct update mode
  const { mtsFpsTick, mtsFpsDisplay, btsFpsDisplay, mtsFpsTextRef } = useDevPanelFPS(true)

  // State for DevPanel stats (cannot read MainThreadRef.current in BTS render)
  const [orbsCount, setOrbsCount] = useState(0)

  const onLayout = useCallback((e: any) => {
    const width = Math.floor(e.detail.width)
    const height = Math.floor(e.detail.height)
    if (width <= 0 || height <= 0) return
    void runOnMainThread(syncViewportMT)(width, height)
  }, [])

  const hView0 = useMainThreadRef<MainThread.Element>(null)
  const hView1 = useMainThreadRef<MainThread.Element>(null)
  const hView2 = useMainThreadRef<MainThread.Element>(null)
  const hView3 = useMainThreadRef<MainThread.Element>(null)
  const hViewRefs = [hView0, hView1, hView2, hView3]
  const hText0 = useMainThreadRef<MainThread.Element>(null)
  const hText1 = useMainThreadRef<MainThread.Element>(null)
  const hText2 = useMainThreadRef<MainThread.Element>(null)
  const hText3 = useMainThreadRef<MainThread.Element>(null)
  const hTextRefs = [hText0, hText1, hText2, hText3]

  const creditViewRef = useMainThreadRef<MainThread.Element>(null)

  const introViewRefs: Array<any> = []
  const introTextRefs: Array<any> = []
  for (let index = 0; index < INTRO_POOL; index++) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    introViewRefs.push(useMainThreadRef<MainThread.Element>(null))
    // eslint-disable-next-line react-hooks/rules-of-hooks
    introTextRefs.push(useMainThreadRef<MainThread.Element>(null))
  }

  const bodyViewRefs: Array<any> = []
  const bodyTextRefs: Array<any> = []
  for (let index = 0; index < BODY_POOL; index++) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    bodyViewRefs.push(useMainThreadRef<MainThread.Element>(null))
    // eslint-disable-next-line react-hooks/rules-of-hooks
    bodyTextRefs.push(useMainThreadRef<MainThread.Element>(null))
  }

  const orbGlowRefs: Array<any> = []
  const orbCoreRefs: Array<any> = []
  for (let index = 0; index < ORB_DEFS.length; index++) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    orbGlowRefs.push(useMainThreadRef<MainThread.Element>(null))
    // eslint-disable-next-line react-hooks/rules-of-hooks
    orbCoreRefs.push(useMainThreadRef<MainThread.Element>(null))
  }

  const preparedCacheMT = useMainThreadRef<Map<string, PreparedTextWithSegments> | null>(null)
  const orbsMT = useMainThreadRef<OrbState[]>([])
  const bodyRectMT = useMainThreadRef<Rect>({ x: 0, y: 0, width: 0, height: 0 })
  const pageWidthMT = useMainThreadRef(390)
  const pageHeightMT = useMainThreadRef(780)
  const animatingMT = useMainThreadRef(false)
  const lastFrameMT = useMainThreadRef(0)
  const touchIdMT = useMainThreadRef<number | null>(null)
  const dragOrbIndexMT = useMainThreadRef(-1)
  const dragStartXMT = useMainThreadRef(0)
  const dragStartYMT = useMainThreadRef(0)
  const dragStartOrbXMT = useMainThreadRef(0)
  const dragStartOrbYMT = useMainThreadRef(0)
  const dragMoveCountMT = useMainThreadRef(0)

  function getPreparedMTS(text: string, font: string): PreparedTextWithSegments {
    'main thread'
    if (preparedCacheMT.current === null) preparedCacheMT.current = new Map()
    const cache = preparedCacheMT.current
    const key = `${font}::${text}`
    const cached = cache.get(key)
    if (cached !== undefined) return cached
    const prepared = prepareWithSegments(text, font)
    cache.set(key, prepared)
    return prepared
  }

  function positionTextLine(
    viewRef: any,
    textRef: any,
    line: PositionedLine | null,
    height: number,
    fontSize?: number,
  ): void {
    'main thread'
    const view = viewRef.current
    if (!view) return
    if (line === null) {
      view.setStyleProperty('display', 'none')
      return
    }

    view.setStyleProperties({
      display: 'flex',
      left: `${line.x}px`,
      top: `${line.y}px`,
      height: `${height}px`,
    })

    const text = textRef.current
    if (!text) return
    if (fontSize !== undefined) {
      text.setStyleProperty('font-size', `${fontSize}px`)
    }
    text.setAttribute('text', line.text)
  }

  function positionOrb(ref: any, left: number, top: number, size: number, radius: number, color: string, opacity: string): void {
    'main thread'
    ref.current?.setStyleProperties({
      display: 'flex',
      left: `${left}px`,
      top: `${top}px`,
      width: `${size}px`,
      height: `${size}px`,
      'border-radius': `${radius}px`,
      'background-color': color,
      opacity,
    })
  }

  function logTouchMT(message: string): void {
    'main thread'
    if (!DEBUG_TOUCH_LOGS) return
    console.info(`[editorial-mts touch] ${message}`)
  }

  function summarizeOrbsMT(): string {
    'main thread'
    const parts: string[] = []
    for (let index = 0; index < orbsMT.current.length; index++) {
      const orb = orbsMT.current[index]
      if (!orb) continue
      parts.push(
        `#${index}@(${Math.round(orb.x)},${Math.round(orb.y)}) r=${orb.r} paused=${orb.paused ? '1' : '0'}`,
      )
    }
    return parts.join(' | ')
  }

  function hitTestOrbIndex(x: number, y: number): number {
    'main thread'
    const orbs = orbsMT.current
    for (let index = orbs.length - 1; index >= 0; index--) {
      const orb = orbs[index]!
      const dx = x - orb.x
      const dy = y - orb.y
      const grabRadius = orb.r + ORB_GRAB_PADDING
      if (dx * dx + dy * dy <= grabRadius * grabRadius) return index
    }
    return -1
  }

  function layoutEditorialBodyMTS(
    prepared: PreparedTextWithSegments,
    bodyRect: Rect,
    obstacles: CircleObstacle[],
  ): PositionedLine[] {
    'main thread'
    const lines: PositionedLine[] = []
    let cursor: LayoutCursor = { segmentIndex: 0, graphemeIndex: 0 }
    let lineTop = bodyRect.y
    let exhausted = false

    while (lineTop + BODY_LINE_HEIGHT <= bodyRect.y + bodyRect.height && !exhausted) {
      const bandTop = lineTop
      const bandBottom = lineTop + BODY_LINE_HEIGHT
      const blocked: Interval[] = []

      for (let index = 0; index < obstacles.length; index++) {
        const obstacle = obstacles[index]!
        const interval = circleIntervalForBand(
          obstacle.cx,
          obstacle.cy,
          obstacle.r,
          bandTop,
          bandBottom,
          obstacle.hPad,
          obstacle.vPad,
        )
        if (interval !== null) blocked.push(interval)
      }

      const slots = carveTextLineSlots(
        { left: bodyRect.x, right: bodyRect.x + bodyRect.width },
        blocked,
      ).filter(slot => slot.right - slot.left >= MIN_SLOT_WIDTH)

      if (slots.length === 0) {
        lineTop += BODY_LINE_HEIGHT
        continue
      }

      const orderedSlots = [...slots].sort((a, b) => a.left - b.left)
      const useAllSlots = orderedSlots.length > 1 &&
        orderedSlots.every(slot => slot.right - slot.left >= MULTI_SLOT_WIDTH)

      const lineSlots = useAllSlots
        ? orderedSlots
        : [orderedSlots.reduce((best, slot) => {
            const bestWidth = best.right - best.left
            const slotWidth = slot.right - slot.left
            return slotWidth > bestWidth ? slot : best
          })]

      for (let slotIndex = 0; slotIndex < lineSlots.length; slotIndex++) {
        const slot = lineSlots[slotIndex]!
        const line = layoutNextLine(prepared, cursor, slot.right - slot.left)
        if (line === null) {
          exhausted = true
          break
        }
        lines.push({
          x: Math.round(slot.left),
          y: Math.round(lineTop),
          width: line.width,
          text: line.text,
        })
        cursor = line.end
      }

      lineTop += BODY_LINE_HEIGHT
    }

    return lines
  }

  function seedOrbsMTS(bodyRect: Rect): void {
    'main thread'
    if (orbsMT.current.length > 0) return
    orbsMT.current = createInitialOrbs(bodyRect)
    for (let index = 0; index < orbsMT.current.length; index++) {
      clampOrbToBody(orbsMT.current[index]!, bodyRect)
    }
    // Notify BTS of orbs count
    runOnBackground(setOrbsCount)(orbsMT.current.length)
  }

  function applyEditorialLayoutMT(): void {
    'main thread'
    const layout = buildPageLayout(pageWidthMT.current, pageHeightMT.current)
    const headlineFit = fitHeadline(layout.headlineWidth, layout.headlineMaxHeight)
    const creditTop = layout.headlineTop + headlineFit.lines.length * headlineFit.lineHeight + 8
    const introTop = creditTop + CREDIT_LINE_HEIGHT + 10
    const introPrepared = getPreparedMTS(INTRO_TEXT, INTRO_FONT)
    const introResult = layoutWithLines(introPrepared, layout.headlineWidth, INTRO_LINE_HEIGHT)
    const introLines = introResult.lines.map((line, index) => ({
      x: layout.headlineLeft,
      y: introTop + index * INTRO_LINE_HEIGHT,
      width: line.width,
      text: line.text,
    }))

    const bodyTop = introTop + introResult.height + 22
    layout.bodyRect = {
      x: layout.gutter,
      y: bodyTop,
      width: layout.headlineWidth,
      height: Math.max(140, pageHeightMT.current - bodyTop - layout.gutter),
    }
    bodyRectMT.current = layout.bodyRect

    seedOrbsMTS(layout.bodyRect)
    for (let index = 0; index < orbsMT.current.length; index++) {
      clampOrbToBody(orbsMT.current[index]!, layout.bodyRect)
    }

    const bodyPrepared = getPreparedMTS(BODY_TEXT, BODY_FONT)
    const bodyLines = layoutEditorialBodyMTS(
      bodyPrepared,
      layout.bodyRect,
      orbsMT.current.map(orb => ({
        cx: orb.x,
        cy: orb.y,
        r: orb.r,
        hPad: 10,
        vPad: 2,
      })),
    )

    for (let index = 0; index < HEADLINE_POOL; index++) {
      const source = index < headlineFit.lines.length
        ? {
            x: layout.headlineLeft + headlineFit.lines[index]!.x,
            y: layout.headlineTop + headlineFit.lines[index]!.y,
            width: headlineFit.lines[index]!.width,
            text: headlineFit.lines[index]!.text,
          }
        : null
      positionTextLine(hViewRefs[index], hTextRefs[index], source, headlineFit.lineHeight, headlineFit.fontSize)
    }

    creditViewRef.current?.setStyleProperties({
      left: `${layout.headlineLeft}px`,
      top: `${creditTop}px`,
      height: `${CREDIT_LINE_HEIGHT}px`,
    })

    for (let index = 0; index < INTRO_POOL; index++) {
      positionTextLine(
        introViewRefs[index],
        introTextRefs[index],
        index < introLines.length ? introLines[index]! : null,
        INTRO_LINE_HEIGHT,
      )
    }

    for (let index = 0; index < BODY_POOL; index++) {
      positionTextLine(
        bodyViewRefs[index],
        bodyTextRefs[index],
        index < bodyLines.length ? bodyLines[index]! : null,
        BODY_LINE_HEIGHT,
      )
    }

    for (let index = 0; index < orbsMT.current.length; index++) {
      const orb = orbsMT.current[index]!
      positionOrb(
        orbGlowRefs[index],
        orb.x - orb.r * 1.55,
        orb.y - orb.r * 1.55,
        orb.r * 3.1,
        orb.r * 1.55,
        orb.glowColor,
        orb.paused ? '0.12' : '0.3',
      )
      positionOrb(
        orbCoreRefs[index],
        orb.x - orb.r,
        orb.y - orb.r,
        orb.r * 2,
        orb.r,
        orb.coreColor,
        orb.paused ? '0.34' : '0.92',
      )
    }
  }

  function tickMT(timestamp: number): void {
    'main thread'
    // MTS FPS tick
    mtsFpsTick()

    const last = lastFrameMT.current === 0 ? timestamp : lastFrameMT.current
    const dt = Math.min((timestamp - last) / 1000, 0.05)
    lastFrameMT.current = timestamp

    const bodyRect = bodyRectMT.current
    const draggedIndex = dragOrbIndexMT.current

    for (let index = 0; index < orbsMT.current.length; index++) {
      const orb = orbsMT.current[index]!
      if (index === draggedIndex || orb.paused) continue

      orb.x += orb.vx * dt
      orb.y += orb.vy * dt

      const minX = bodyRect.x + orb.r
      const maxX = bodyRect.x + bodyRect.width - orb.r
      const minY = bodyRect.y + orb.r
      const maxY = bodyRect.y + bodyRect.height - orb.r

      if (orb.x < minX) {
        orb.x = minX
        orb.vx = Math.abs(orb.vx)
      } else if (orb.x > maxX) {
        orb.x = maxX
        orb.vx = -Math.abs(orb.vx)
      }

      if (orb.y < minY) {
        orb.y = minY
        orb.vy = Math.abs(orb.vy)
      } else if (orb.y > maxY) {
        orb.y = maxY
        orb.vy = -Math.abs(orb.vy)
      }
    }

    for (let index = 0; index < orbsMT.current.length; index++) {
      const a = orbsMT.current[index]!
      for (let otherIndex = index + 1; otherIndex < orbsMT.current.length; otherIndex++) {
        const b = orbsMT.current[otherIndex]!
        const dx = b.x - a.x
        const dy = b.y - a.y
        const dist = Math.sqrt(dx * dx + dy * dy)
        const minDist = a.r + b.r + 16
        if (dist >= minDist || dist <= 0.1) continue

        const force = (minDist - dist) * 0.75
        const nx = dx / dist
        const ny = dy / dist

        if (!a.paused && index !== draggedIndex) {
          a.vx -= nx * force * dt
          a.vy -= ny * force * dt
        }
        if (!b.paused && otherIndex !== draggedIndex) {
          b.vx += nx * force * dt
          b.vy += ny * force * dt
        }
      }
    }

    applyEditorialLayoutMT()
    requestAnimationFrame(tickMT)
  }

  function ensureAnimationMT(): void {
    'main thread'
    if (animatingMT.current) return
    animatingMT.current = true
    lastFrameMT.current = 0
    requestAnimationFrame(tickMT)
  }

  function syncViewportMT(width: number, height: number): void {
    'main thread'
    pageWidthMT.current = width
    pageHeightMT.current = height
    applyEditorialLayoutMT()
    logTouchMT(
      `viewport=${width}x${height} body=(${Math.round(bodyRectMT.current.x)},${Math.round(bodyRectMT.current.y)},${Math.round(bodyRectMT.current.width)},${Math.round(bodyRectMT.current.height)}) orbs=${summarizeOrbsMT()}`,
    )
    ensureAnimationMT()
  }

  function getTouchPoint(event: MainThread.TouchEvent): { identifier: number; pageX: number; pageY: number } | null {
    'main thread'
    if (event.touches.length > 0) return event.touches[0]!
    if (event.changedTouches.length > 0) return event.changedTouches[0]!
    return null
  }

  function handleTouchStartMT(event: MainThread.TouchEvent): void {
    'main thread'
    const touch = getTouchPoint(event)
    if (touch === null) return

    const hitIndex = hitTestOrbIndex(touch.pageX, touch.pageY)
    if (hitIndex === -1) {
      logTouchMT(
        `start miss touch=${touch.identifier}@(${Math.round(touch.pageX)},${Math.round(touch.pageY)}) body=(${Math.round(bodyRectMT.current.x)},${Math.round(bodyRectMT.current.y)},${Math.round(bodyRectMT.current.width)},${Math.round(bodyRectMT.current.height)}) orbs=${summarizeOrbsMT()}`,
      )
      return
    }

    const orb = orbsMT.current[hitIndex]!
    touchIdMT.current = touch.identifier
    dragOrbIndexMT.current = hitIndex
    dragStartXMT.current = touch.pageX
    dragStartYMT.current = touch.pageY
    dragStartOrbXMT.current = orb.x
    dragStartOrbYMT.current = orb.y
    dragMoveCountMT.current = 0
    orb.paused = true // 暂停物理模拟，确保拖拽过程中不受干扰
    logTouchMT(
      `start hit orb=${hitIndex} touch=${touch.identifier}@(${Math.round(touch.pageX)},${Math.round(touch.pageY)}) orb=(${Math.round(orb.x)},${Math.round(orb.y)}) r=${orb.r} paused=${orb.paused ? '1' : '0'}`,
    )
  }

  function handleTouchMoveMT(event: MainThread.TouchEvent): void {
    'main thread'
    const dragIndex = dragOrbIndexMT.current
    if (dragIndex === -1) return

    // 直接用第一个 touch，单指拖拽足够
    const touch = event.touches.length > 0 ? event.touches[0]! : null
    if (touch === null) {
      logTouchMT(`move no touch in event`)
      return
    }

    const orb = orbsMT.current[dragIndex]
    if (!orb) return
    orb.x = dragStartOrbXMT.current + (touch.pageX - dragStartXMT.current)
    orb.y = dragStartOrbYMT.current + (touch.pageY - dragStartYMT.current)
    clampOrbToBody(orb, bodyRectMT.current)
    dragMoveCountMT.current += 1
    if (dragMoveCountMT.current === 1 || dragMoveCountMT.current % 4 === 0) {
      logTouchMT(
        `move orb=${dragIndex} step=${dragMoveCountMT.current} touch@(${Math.round(touch.pageX)},${Math.round(touch.pageY)}) orb=(${Math.round(orb.x)},${Math.round(orb.y)})`,
      )
    }
    // 实时更新 orb 元素位置，确保拖拽过程可见
    positionOrb(
      orbGlowRefs[dragIndex],
      orb.x - orb.r * 1.55,
      orb.y - orb.r * 1.55,
      orb.r * 3.1,
      orb.r * 1.55,
      orb.glowColor,
      orb.paused ? '0.12' : '0.3',
    )
    positionOrb(
      orbCoreRefs[dragIndex],
      orb.x - orb.r,
      orb.y - orb.r,
      orb.r * 2,
      orb.r,
      orb.coreColor,
      orb.paused ? '0.34' : '0.92',
    )
    applyEditorialLayoutMT()
  }

  function handleTouchEndMT(event: MainThread.TouchEvent): void {
    'main thread'
    const dragIndex = dragOrbIndexMT.current
    if (dragIndex === -1) return

    let touch = null as null | { identifier: number; pageX: number; pageY: number }
    for (let index = 0; index < event.changedTouches.length; index++) {
      const candidate = event.changedTouches[index]!
      if (candidate.identifier === touchIdMT.current) {
        touch = candidate
        break
      }
    }
    if (touch === null) touch = getTouchPoint(event)

    const orb = orbsMT.current[dragIndex]
    if (!orb || touch === null) {
      logTouchMT(`end missing orbOrTouch activeOrb=${dragIndex} trackedTouch=${touchIdMT.current}`)
      dragOrbIndexMT.current = -1
      touchIdMT.current = null
      dragMoveCountMT.current = 0
      return
    }

    const dx = touch.pageX - dragStartXMT.current
    const dy = touch.pageY - dragStartYMT.current
    orb.x = dragStartOrbXMT.current + dx
    orb.y = dragStartOrbYMT.current + dy
    clampOrbToBody(orb, bodyRectMT.current)

    if (dx * dx + dy * dy <= DRAG_TAP_THRESHOLD * DRAG_TAP_THRESHOLD) {
      orb.paused = !orb.paused
    } else {
      orb.paused = false
    }

    logTouchMT(
      `end orb=${dragIndex} touch=${touch.identifier}@(${Math.round(touch.pageX)},${Math.round(touch.pageY)}) delta=(${Math.round(dx)},${Math.round(dy)}) orb=(${Math.round(orb.x)},${Math.round(orb.y)}) mode=${dx * dx + dy * dy <= DRAG_TAP_THRESHOLD * DRAG_TAP_THRESHOLD ? 'tap' : 'drag'} paused=${orb.paused ? '1' : '0'}`,
    )

    dragOrbIndexMT.current = -1
    touchIdMT.current = null
    dragMoveCountMT.current = 0
    applyEditorialLayoutMT()
  }

  return (
    <view
      style={{ flex: 1, height: '100%', backgroundColor: BG_COLOR, overflow: 'hidden' }}
      bindlayoutchange={onLayout}
    >
      {Array.from({ length: HEADLINE_POOL }, (_, index) => (
        <view
          key={`headline-${index}`}
          main-thread:ref={hViewRefs[index]}
          style={{ position: 'absolute', display: 'none' }}
        >
          <text
            main-thread:ref={hTextRefs[index]}
            style={{ fontWeight: 'bold', color: HEADLINE_COLOR, letterSpacing: '-0.5px' }}
          >
            {' '}
          </text>
        </view>
      ))}

      <view
        main-thread:ref={creditViewRef}
        style={{ position: 'absolute', left: '0px', top: '0px', height: `${CREDIT_LINE_HEIGHT}px` }}
      >
        <text style={{ fontSize: '11px', color: CREDIT_COLOR, letterSpacing: '1.6px' }}>{CREDIT_TEXT}</text>
      </view>

      {Array.from({ length: INTRO_POOL }, (_, index) => (
        <view
          key={`intro-${index}`}
          main-thread:ref={introViewRefs[index]}
          style={{ position: 'absolute', display: 'none' }}
        >
          <text
            main-thread:ref={introTextRefs[index]}
            style={{ fontSize: `${INTRO_FONT_SIZE}px`, color: INTRO_COLOR, lineHeight: `${INTRO_LINE_HEIGHT}px` }}
          >
            {' '}
          </text>
        </view>
      ))}

      {Array.from({ length: BODY_POOL }, (_, index) => (
        <view
          key={`body-${index}`}
          main-thread:ref={bodyViewRefs[index]}
          style={{ position: 'absolute', display: 'none' }}
        >
          <text
            main-thread:ref={bodyTextRefs[index]}
            style={{ fontSize: `${BODY_FONT_SIZE}px`, color: TEXT_COLOR, lineHeight: `${BODY_LINE_HEIGHT}px` }}
          >
            {' '}
          </text>
        </view>
      ))}

      {Array.from({ length: ORB_DEFS.length }, (_, index) => (
        <view key={`orb-layer-${index}`}>
          <view main-thread:ref={orbGlowRefs[index]} style={{ position: 'absolute', display: 'none' }} />
          <view main-thread:ref={orbCoreRefs[index]} style={{ position: 'absolute', display: 'none' }} />
        </view>
      ))}

      <view
        key="touch-surface"
        style={{
          position: 'absolute',
          left: '0px',
          top: '0px',
          width: '100%',
          height: '100%',
          backgroundColor: 'rgba(0,0,0,0)',
        }}
        main-thread:bindtouchstart={handleTouchStartMT}
        main-thread:bindtouchmove={handleTouchMoveMT}
        main-thread:bindtouchend={handleTouchEndMT}
        main-thread:bindtouchcancel={handleTouchEndMT}
      />

      {/* DevPanel */}
      <DevPanel.Root>
        <DevPanel.Trigger />
        <DevPanel.Content title="MTS Only">
          <DevPanelFPS
            mtsFpsDisplay={mtsFpsDisplay}
            btsFpsDisplay={btsFpsDisplay}
            mtsFpsTextRef={mtsFpsTextRef}
          />
          <DevPanel.Stats>
            <DevPanel.Stat label="Orbs" value={`${orbsCount}`} />
            <DevPanel.Stat label="Lines" value={`${BODY_POOL}`} />
          </DevPanel.Stats>
        </DevPanel.Content>
      </DevPanel.Root>
    </view>
  )
}

root.render(<EditorialEngineMTSPage />)

if (import.meta.webpackHot) {
  import.meta.webpackHot.accept()
}

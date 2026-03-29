import { root, useState, useCallback, useMemo, useRef, useEffect } from '@lynx-js/react'
import {
  layoutNextLine,
  prepareWithSegments,
  walkLineRanges,
  type LayoutCursor,
  type PreparedTextWithSegments,
} from '../../src/layout'
import { BODY_COPY } from './dynamic-layout-text'
import {
  openaiLayout as openaiLayoutHull,
  claudeLayout as claudeLayoutHull,
  openaiHit as openaiHitHull,
  claudeHit as claudeHitHull,
} from './hull-data'
import {
  carveTextLineSlots,
  getPolygonIntervalForBand,
  getRectIntervalsForBand,
  transformWrapPoints,
  type Interval,
  type Point,
  type Rect,
} from './wrap-geometry'

// --- Constants ---

const BODY_FONT = '20px "Iowan Old Style", "Palatino Linotype", "Book Antiqua", Palatino, serif'
const BODY_FONT_SIZE = 20
const BODY_LINE_HEIGHT = 32
const CREDIT_TEXT = 'Leopold Aschenbrenner'
const CREDIT_FONT = '12px "Helvetica Neue", Helvetica, Arial, sans-serif'
const CREDIT_LINE_HEIGHT = 16
const HEADLINE_TEXT = 'SITUATIONAL AWARENESS: THE DECADE AHEAD'
const HEADLINE_FONT_FAMILY = '"Iowan Old Style", "Palatino Linotype", "Book Antiqua", Palatino, serif'
const HINT_PILL_SAFE_TOP = 72
const NARROW_BREAKPOINT = 760
const NARROW_COLUMN_MAX_WIDTH = 430

const MIN_PAGE_WIDTH = 360
const MAX_PAGE_WIDTH = 1100
const WIDTH_STEP = 40
const MIN_PAGE_HEIGHT = 400
const MAX_PAGE_HEIGHT = 1000
const HEIGHT_STEP = 40

// --- Types ---

type PositionedLine = { x: number; y: number; width: number; text: string }

type BandObstacle =
  | { kind: 'polygon'; points: Point[]; horizontalPadding: number; verticalPadding: number }
  | { kind: 'rects'; rects: Rect[]; horizontalPadding: number; verticalPadding: number }

type PageLayout = {
  isNarrow: boolean
  gutter: number
  pageWidth: number
  pageHeight: number
  centerGap: number
  columnWidth: number
  headlineRegion: Rect
  headlineFont: string
  headlineLineHeight: number
  headlineFontSize: number
  creditGap: number
  copyGap: number
  openaiRect: Rect
  claudeRect: Rect
}

type SpinState = {
  from: number
  to: number
  start: number
  duration: number
}

// Precomputed hull data (replaces runtime SVG rasterization)
const wrapHulls = {
  openaiLayout: openaiLayoutHull,
  claudeLayout: claudeLayoutHull,
  openaiHit: openaiHitHull,
  claudeHit: claudeHitHull,
}

// --- Pure layout functions (ported 1:1 from reference) ---

function getObstacleIntervals(obstacle: BandObstacle, bandTop: number, bandBottom: number): Interval[] {
  switch (obstacle.kind) {
    case 'polygon': {
      const interval = getPolygonIntervalForBand(
        obstacle.points, bandTop, bandBottom,
        obstacle.horizontalPadding, obstacle.verticalPadding,
      )
      return interval === null ? [] : [interval]
    }
    case 'rects':
      return getRectIntervalsForBand(
        obstacle.rects, bandTop, bandBottom,
        obstacle.horizontalPadding, obstacle.verticalPadding,
      )
  }
}

function layoutColumn(
  prepared: PreparedTextWithSegments,
  startCursor: LayoutCursor,
  region: Rect,
  lineHeight: number,
  obstacles: BandObstacle[],
  side: 'left' | 'right',
): { lines: PositionedLine[]; cursor: LayoutCursor } {
  let cursor: LayoutCursor = startCursor
  let lineTop = region.y
  const lines: PositionedLine[] = []
  while (true) {
    if (lineTop + lineHeight > region.y + region.height) break

    const bandTop = lineTop
    const bandBottom = lineTop + lineHeight
    const blocked: Interval[] = []
    for (let obstacleIndex = 0; obstacleIndex < obstacles.length; obstacleIndex++) {
      const obstacle = obstacles[obstacleIndex]!
      const intervals = getObstacleIntervals(obstacle, bandTop, bandBottom)
      for (let intervalIndex = 0; intervalIndex < intervals.length; intervalIndex++) {
        blocked.push(intervals[intervalIndex]!)
      }
    }

    const slots = carveTextLineSlots(
      { left: region.x, right: region.x + region.width },
      blocked,
    )
    if (slots.length === 0) {
      lineTop += lineHeight
      continue
    }

    let slot = slots[0]!
    for (let slotIndex = 1; slotIndex < slots.length; slotIndex++) {
      const candidate = slots[slotIndex]!
      const bestWidth = slot.right - slot.left
      const candidateWidth = candidate.right - candidate.left
      if (candidateWidth > bestWidth) {
        slot = candidate
        continue
      }
      if (candidateWidth < bestWidth) continue
      if (side === 'left') {
        if (candidate.left > slot.left) slot = candidate
        continue
      }
      if (candidate.left < slot.left) slot = candidate
    }
    const width = slot.right - slot.left
    const line = layoutNextLine(prepared, cursor, width)
    if (line === null) break

    lines.push({
      x: Math.round(slot.left),
      y: Math.round(lineTop),
      width: line.width,
      text: line.text,
    })

    cursor = line.end
    lineTop += lineHeight
  }

  return { lines, cursor }
}

function headlineBreaksInsideWord(prepared: PreparedTextWithSegments, maxWidth: number): boolean {
  let breaksInsideWord = false
  walkLineRanges(prepared, maxWidth, line => {
    if (line.end.graphemeIndex !== 0) breaksInsideWord = true
  })
  return breaksInsideWord
}

function getPreparedSingleLineWidth(prepared: PreparedTextWithSegments): number {
  let width = 0
  walkLineRanges(prepared, 100_000, line => { width = line.width })
  return width
}

function fitHeadlineFontSize(
  headlineWidth: number,
  pageWidth: number,
  getPrepared: (text: string, font: string) => PreparedTextWithSegments,
): number {
  let low = Math.ceil(Math.max(22, pageWidth * 0.026))
  let high = Math.floor(Math.min(94.4, Math.max(55.2, pageWidth * 0.055)))
  let best = low

  while (low <= high) {
    const size = Math.floor((low + high) / 2)
    const font = `700 ${size}px ${HEADLINE_FONT_FAMILY}`
    const headlinePrepared = getPrepared(HEADLINE_TEXT, font)
    if (!headlineBreaksInsideWord(headlinePrepared, headlineWidth)) {
      best = size
      low = size + 1
    } else {
      high = size - 1
    }
  }

  return best
}

function easeSpin(t: number): number {
  const oneMinusT = 1 - t
  return 1 - oneMinusT * oneMinusT * oneMinusT
}

function getLogoProjection(
  layout: PageLayout,
  lineHeight: number,
  openaiAngle: number,
  claudeAngle: number,
): {
  openaiObstacle: BandObstacle
  claudeObstacle: BandObstacle
} {
  const openaiWrap = transformWrapPoints(wrapHulls.openaiLayout, layout.openaiRect, openaiAngle)
  const claudeWrap = transformWrapPoints(wrapHulls.claudeLayout, layout.claudeRect, claudeAngle)
  return {
    openaiObstacle: {
      kind: 'polygon',
      points: openaiWrap,
      horizontalPadding: Math.round(lineHeight * 0.82),
      verticalPadding: Math.round(lineHeight * 0.26),
    },
    claudeObstacle: {
      kind: 'polygon',
      points: claudeWrap,
      horizontalPadding: Math.round(lineHeight * 0.28),
      verticalPadding: Math.round(lineHeight * 0.12),
    },
  }
}

function buildLayout(
  pageWidth: number,
  pageHeight: number,
  lineHeight: number,
  getPrepared: (text: string, font: string) => PreparedTextWithSegments,
): PageLayout {
  const isNarrow = pageWidth < NARROW_BREAKPOINT
  if (isNarrow) {
    const gutter = Math.round(Math.max(18, Math.min(28, pageWidth * 0.06)))
    const centerGap = 0
    const columnWidth = Math.round(Math.min(pageWidth - gutter * 2, NARROW_COLUMN_MAX_WIDTH))
    const headlineTop = 28
    const headlineWidth = pageWidth - gutter * 2
    const headlineFontSize = Math.min(48, fitHeadlineFontSize(headlineWidth, pageWidth, getPrepared))
    const headlineLineHeight = Math.round(headlineFontSize * 0.92)
    const headlineFont = `700 ${headlineFontSize}px ${HEADLINE_FONT_FAMILY}`
    const creditGap = Math.round(Math.max(12, lineHeight * 0.5))
    const copyGap = Math.round(Math.max(18, lineHeight * 0.7))
    const claudeSize = Math.round(Math.min(92, pageWidth * 0.23, pageHeight * 0.11))
    const openaiSize = Math.round(Math.min(138, pageWidth * 0.34))
    const headlineRegion: Rect = {
      x: gutter,
      y: headlineTop,
      width: headlineWidth,
      height: Math.max(320, pageHeight - headlineTop - gutter),
    }
    const openaiRect: Rect = {
      x: gutter - Math.round(openaiSize * 0.22),
      y: pageHeight - gutter - openaiSize + Math.round(openaiSize * 0.08),
      width: openaiSize,
      height: openaiSize,
    }
    const claudeRect: Rect = {
      x: pageWidth - gutter - Math.round(claudeSize * 0.88),
      y: 4,
      width: claudeSize,
      height: claudeSize,
    }

    return {
      isNarrow, gutter, pageWidth, pageHeight, centerGap, columnWidth,
      headlineRegion, headlineFont, headlineLineHeight, headlineFontSize,
      creditGap, copyGap, openaiRect, claudeRect,
    }
  }

  const gutter = Math.round(Math.max(52, pageWidth * 0.048))
  const centerGap = Math.round(Math.max(28, pageWidth * 0.025))
  const columnWidth = Math.round((pageWidth - gutter * 2 - centerGap) / 2)
  const headlineTop = Math.round(Math.max(42, pageWidth * 0.04, HINT_PILL_SAFE_TOP))
  const headlineWidth = Math.round(Math.min(pageWidth - gutter * 2, Math.max(columnWidth, pageWidth * 0.5)))
  const headlineFontSize = fitHeadlineFontSize(headlineWidth, pageWidth, getPrepared)
  const headlineLineHeight = Math.round(headlineFontSize * 0.92)
  const headlineFont = `700 ${headlineFontSize}px ${HEADLINE_FONT_FAMILY}`
  const creditGap = Math.round(Math.max(14, lineHeight * 0.6))
  const copyGap = Math.round(Math.max(20, lineHeight * 0.9))
  const openaiShrinkT = Math.max(0, Math.min(1, (960 - pageWidth) / 260))
  const OPENAI_SIZE = 400 - openaiShrinkT * 56
  const openaiSize = Math.round(Math.min(OPENAI_SIZE, pageHeight * 0.43))
  const claudeSize = Math.round(Math.max(276, Math.min(500, pageWidth * 0.355, pageHeight * 0.45)))
  const headlineRegion: Rect = {
    x: gutter,
    y: headlineTop,
    width: headlineWidth,
    height: pageHeight - headlineTop - gutter,
  }
  const openaiRect: Rect = {
    x: gutter - Math.round(openaiSize * 0.3),
    y: pageHeight - gutter - openaiSize + Math.round(openaiSize * 0.2),
    width: openaiSize,
    height: openaiSize,
  }
  const claudeRect: Rect = {
    x: pageWidth - Math.round(claudeSize * 0.69),
    y: -Math.round(claudeSize * 0.22),
    width: claudeSize,
    height: claudeSize,
  }

  return {
    isNarrow, gutter, pageWidth, pageHeight, centerGap, columnWidth,
    headlineRegion, headlineFont, headlineLineHeight, headlineFontSize,
    creditGap, copyGap, openaiRect, claudeRect,
  }
}

function evaluateLayout(
  layout: PageLayout,
  lineHeight: number,
  preparedBody: PreparedTextWithSegments,
  creditWidth: number,
  openaiAngle: number,
  claudeAngle: number,
  getPrepared: (text: string, font: string) => PreparedTextWithSegments,
): {
  headlineLines: PositionedLine[]
  creditLeft: number
  creditTop: number
  leftLines: PositionedLine[]
  rightLines: PositionedLine[]
} {
  const { openaiObstacle, claudeObstacle } = getLogoProjection(layout, lineHeight, openaiAngle, claudeAngle)

  const headlinePrepared = getPrepared(HEADLINE_TEXT, layout.headlineFont)
  const headlineResult = layoutColumn(
    headlinePrepared,
    { segmentIndex: 0, graphemeIndex: 0 },
    layout.headlineRegion,
    layout.headlineLineHeight,
    [openaiObstacle],
    'left',
  )
  const headlineLines = headlineResult.lines
  const headlineRects = headlineLines.map(line => ({
    x: line.x,
    y: line.y,
    width: Math.ceil(line.width),
    height: layout.headlineLineHeight,
  }))
  const headlineBottom = headlineLines.length === 0
    ? layout.headlineRegion.y
    : Math.max(...headlineLines.map(line => line.y + layout.headlineLineHeight))
  const creditTop = headlineBottom + layout.creditGap
  const creditRegion: Rect = {
    x: layout.gutter + 4,
    y: creditTop,
    width: layout.headlineRegion.width,
    height: CREDIT_LINE_HEIGHT,
  }
  const copyTop = creditTop + CREDIT_LINE_HEIGHT + layout.copyGap

  // Credit positioning — carve out obstacle space
  const creditBlocked = getObstacleIntervals(
    openaiObstacle,
    creditRegion.y,
    creditRegion.y + creditRegion.height,
  )
  const claudeCreditBlocked = getObstacleIntervals(
    claudeObstacle,
    creditRegion.y,
    creditRegion.y + creditRegion.height,
  )
  const creditSlots = carveTextLineSlots(
    { left: creditRegion.x, right: creditRegion.x + creditRegion.width },
    layout.isNarrow ? creditBlocked.concat(claudeCreditBlocked) : creditBlocked,
  )
  let creditLeft = creditRegion.x
  for (let index = 0; index < creditSlots.length; index++) {
    const slot = creditSlots[index]!
    if (slot.right - slot.left >= creditWidth) {
      creditLeft = Math.round(slot.left)
      break
    }
  }

  if (layout.isNarrow) {
    const bodyRegion: Rect = {
      x: Math.round((layout.pageWidth - layout.columnWidth) / 2),
      y: copyTop,
      width: layout.columnWidth,
      height: Math.max(0, layout.pageHeight - copyTop - layout.gutter),
    }

    const bodyResult = layoutColumn(
      preparedBody,
      { segmentIndex: 0, graphemeIndex: 0 },
      bodyRegion,
      lineHeight,
      [claudeObstacle, openaiObstacle],
      'left',
    )

    return {
      headlineLines,
      creditLeft,
      creditTop,
      leftLines: bodyResult.lines,
      rightLines: [],
    }
  }

  // Two-column layout
  const leftRegion: Rect = {
    x: layout.gutter,
    y: copyTop,
    width: layout.columnWidth,
    height: layout.pageHeight - copyTop - layout.gutter,
  }
  const rightRegion: Rect = {
    x: layout.gutter + layout.columnWidth + layout.centerGap,
    y: layout.headlineRegion.y,
    width: layout.columnWidth,
    height: layout.pageHeight - layout.headlineRegion.y - layout.gutter,
  }
  const titleObstacle: BandObstacle = {
    kind: 'rects',
    rects: headlineRects,
    horizontalPadding: Math.round(lineHeight * 0.95),
    verticalPadding: Math.round(lineHeight * 0.3),
  }

  const leftResult = layoutColumn(
    preparedBody,
    { segmentIndex: 0, graphemeIndex: 0 },
    leftRegion,
    lineHeight,
    [openaiObstacle],
    'left',
  )

  const rightResult = layoutColumn(
    preparedBody,
    leftResult.cursor,
    rightRegion,
    lineHeight,
    [titleObstacle, claudeObstacle, openaiObstacle],
    'right',
  )

  return {
    headlineLines,
    creditLeft,
    creditTop,
    leftLines: leftResult.lines,
    rightLines: rightResult.lines,
  }
}

// --- Component ---

export function DynamicLayoutPage() {
  const [pageWidth, setPageWidth] = useState(400)
  const [pageHeight, setPageHeight] = useState(700)
  // renderTick triggers re-renders during animation
  const [renderTick, setRenderTick] = useState(0)

  const openaiAngleRef = useRef(0)
  const claudeAngleRef = useRef(0)
  const openaiSpinRef = useRef<SpinState | null>(null)
  const claudeSpinRef = useRef<SpinState | null>(null)
  const animTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const preparedCacheRef = useRef(new Map<string, PreparedTextWithSegments>())
  // Ref to hold the latest animation tick function
  const animateFnRef = useRef<() => void>(() => {})

  // Animation tick — updates angle refs and triggers re-render
  animateFnRef.current = () => {
    const now = Date.now()
    let stillAnimating = false

    if (openaiSpinRef.current) {
      const spin = openaiSpinRef.current
      const progress = Math.min(1, (now - spin.start) / spin.duration)
      openaiAngleRef.current = spin.from + (spin.to - spin.from) * easeSpin(progress)
      if (progress >= 1) {
        openaiAngleRef.current = spin.to
        openaiSpinRef.current = null
      } else {
        stillAnimating = true
      }
    }

    if (claudeSpinRef.current) {
      const spin = claudeSpinRef.current
      const progress = Math.min(1, (now - spin.start) / spin.duration)
      claudeAngleRef.current = spin.from + (spin.to - spin.from) * easeSpin(progress)
      if (progress >= 1) {
        claudeAngleRef.current = spin.to
        claudeSpinRef.current = null
      } else {
        stillAnimating = true
      }
    }

    setRenderTick(n => n + 1)

    if (stillAnimating) {
      animTimerRef.current = setTimeout(() => animateFnRef.current(), 16)
    } else {
      animTimerRef.current = null
    }
  }

  // Cleanup animation timer on unmount
  useEffect(() => {
    return () => {
      if (animTimerRef.current !== null) {
        clearTimeout(animTimerRef.current)
      }
    }
  }, [])

  // Start a logo spin animation
  const startSpin = useCallback((kind: 'openai' | 'claude', direction: 1 | -1) => {
    const angleRef = kind === 'openai' ? openaiAngleRef : claudeAngleRef
    const spinRef = kind === 'openai' ? openaiSpinRef : claudeSpinRef
    spinRef.current = {
      from: angleRef.current,
      to: angleRef.current + direction * Math.PI,
      start: Date.now(),
      duration: 900,
    }
    if (animTimerRef.current === null) {
      animateFnRef.current()
    }
  }, [])

  const handleOpenaiTap = useCallback(() => startSpin('openai', -1), [startSpin])
  const handleClaudeTap = useCallback(() => startSpin('claude', 1), [startSpin])

  // Width/height controls
  const decreaseWidth = useCallback(() => setPageWidth(w => Math.max(MIN_PAGE_WIDTH, w - WIDTH_STEP)), [])
  const increaseWidth = useCallback(() => setPageWidth(w => Math.min(MAX_PAGE_WIDTH, w + WIDTH_STEP)), [])
  const decreaseHeight = useCallback(() => setPageHeight(h => Math.max(MIN_PAGE_HEIGHT, h - HEIGHT_STEP)), [])
  const increaseHeight = useCallback(() => setPageHeight(h => Math.min(MAX_PAGE_HEIGHT, h + HEIGHT_STEP)), [])

  // Prepared text cache accessor
  const getPreparedCached = useCallback((text: string, font: string): PreparedTextWithSegments => {
    const key = `${font}::${text}`
    const cached = preparedCacheRef.current.get(key)
    if (cached !== undefined) return cached
    const prepared = prepareWithSegments(text, font)
    preparedCacheRef.current.set(key, prepared)
    return prepared
  }, [])

  const preparedBody = useMemo(() => getPreparedCached(BODY_COPY, BODY_FONT), [getPreparedCached])
  const preparedCredit = useMemo(() => getPreparedCached(CREDIT_TEXT, CREDIT_FONT), [getPreparedCached])
  const creditWidth = useMemo(() => Math.ceil(getPreparedSingleLineWidth(preparedCredit)), [preparedCredit])

  // Compute layout — re-runs on every render (dimensions or angle change)
  const openaiAngle = openaiAngleRef.current
  const claudeAngle = claudeAngleRef.current
  void renderTick // used to trigger re-render during animation

  const layout = buildLayout(pageWidth, pageHeight, BODY_LINE_HEIGHT, getPreparedCached)
  const { headlineLines, creditLeft, creditTop, leftLines, rightLines } = evaluateLayout(
    layout, BODY_LINE_HEIGHT, preparedBody, creditWidth,
    openaiAngle, claudeAngle, getPreparedCached,
  )

  const totalBodyLines = leftLines.length + rightLines.length
  const openaiRotDeg = openaiAngle * 180 / Math.PI
  const claudeRotDeg = claudeAngle * 180 / Math.PI

  return (
    <scroll-view style={{ flex: 1, backgroundColor: '#f6f0e6' }}>
      <view style={{ padding: 16 }}>
        {/* Header */}
        <text style={{ fontSize: 11, color: '#955f3b', letterSpacing: 1 }}>
          DEMO
        </text>
        <text style={{ fontSize: 22, fontWeight: 'bold', color: '#201b18', marginTop: 4 }}>
          Dynamic Editorial Layout
        </text>
        <text style={{ fontSize: 13, color: '#6d645d', marginTop: 6, lineHeight: 18 }}>
          {'Two-column text flows around rotatable logo obstacles. ' +
           'Headline font size is binary-search fitted. Tap logos to rotate.'}
        </text>

        {/* Width control */}
        <view style={{
          flexDirection: 'row', alignItems: 'center', marginTop: 14, gap: 10,
          padding: 10, borderRadius: 12, backgroundColor: '#fffdf8',
          borderWidth: 1, borderColor: '#d8cec3',
        }}>
          <text style={{ fontSize: 12, color: '#6d645d' }}>W:</text>
          <view
            style={{
              width: 32, height: 32, borderRadius: 16,
              backgroundColor: pageWidth <= MIN_PAGE_WIDTH ? '#ccc' : '#955f3b',
              alignItems: 'center', justifyContent: 'center',
            }}
            bindtap={decreaseWidth}
          >
            <text style={{ fontSize: 16, color: '#fff', fontWeight: 'bold' }}>{'\u2212'}</text>
          </view>
          <text style={{ fontSize: 14, fontWeight: 'bold', color: '#201b18', minWidth: 55, textAlign: 'center' }}>
            {`${pageWidth}px`}
          </text>
          <view
            style={{
              width: 32, height: 32, borderRadius: 16,
              backgroundColor: pageWidth >= MAX_PAGE_WIDTH ? '#ccc' : '#955f3b',
              alignItems: 'center', justifyContent: 'center',
            }}
            bindtap={increaseWidth}
          >
            <text style={{ fontSize: 16, color: '#fff', fontWeight: 'bold' }}>+</text>
          </view>

          <view style={{ width: 1, height: 20, backgroundColor: '#d8cec3', marginLeft: 4, marginRight: 4 }} />

          <text style={{ fontSize: 12, color: '#6d645d' }}>H:</text>
          <view
            style={{
              width: 32, height: 32, borderRadius: 16,
              backgroundColor: pageHeight <= MIN_PAGE_HEIGHT ? '#ccc' : '#955f3b',
              alignItems: 'center', justifyContent: 'center',
            }}
            bindtap={decreaseHeight}
          >
            <text style={{ fontSize: 16, color: '#fff', fontWeight: 'bold' }}>{'\u2212'}</text>
          </view>
          <text style={{ fontSize: 14, fontWeight: 'bold', color: '#201b18', minWidth: 55, textAlign: 'center' }}>
            {`${pageHeight}px`}
          </text>
          <view
            style={{
              width: 32, height: 32, borderRadius: 16,
              backgroundColor: pageHeight >= MAX_PAGE_HEIGHT ? '#ccc' : '#955f3b',
              alignItems: 'center', justifyContent: 'center',
            }}
            bindtap={increaseHeight}
          >
            <text style={{ fontSize: 16, color: '#fff', fontWeight: 'bold' }}>+</text>
          </view>
        </view>

        {/* Summary stats */}
        <view style={{
          marginTop: 10, padding: 10, borderRadius: 10, backgroundColor: '#fffdf8',
          borderWidth: 1, borderColor: '#d8cec3',
          flexDirection: 'row', gap: 16,
        }}>
          <view>
            <text style={{ fontSize: 11, color: '#955f3b' }}>Mode</text>
            <text style={{ fontSize: 15, fontWeight: 'bold', color: '#201b18' }}>
              {layout.isNarrow ? 'Single' : 'Two-col'}
            </text>
          </view>
          <view>
            <text style={{ fontSize: 11, color: '#955f3b' }}>Headline</text>
            <text style={{ fontSize: 15, fontWeight: 'bold', color: '#201b18' }}>
              {`${layout.headlineFontSize}px`}
            </text>
          </view>
          <view>
            <text style={{ fontSize: 11, color: '#955f3b' }}>Left</text>
            <text style={{ fontSize: 15, fontWeight: 'bold', color: '#201b18' }}>
              {`${leftLines.length}`}
            </text>
          </view>
          {rightLines.length > 0 && (
            <view>
              <text style={{ fontSize: 11, color: '#955f3b' }}>Right</text>
              <text style={{ fontSize: 15, fontWeight: 'bold', color: '#201b18' }}>
                {`${rightLines.length}`}
              </text>
            </view>
          )}
          <view>
            <text style={{ fontSize: 11, color: '#955f3b' }}>Total</text>
            <text style={{ fontSize: 15, fontWeight: 'bold', color: '#201b18' }}>
              {`${headlineLines.length + totalBodyLines}`}
            </text>
          </view>
        </view>

        {/* The editorial page */}
        <view style={{
          width: pageWidth,
          height: pageHeight,
          marginTop: 12,
          overflow: 'hidden',
          backgroundColor: '#f6f0e6',
          borderWidth: 1,
          borderColor: '#b8a99a',
          borderRadius: 4,
        }}>
          {/* Headline lines */}
          {headlineLines.map((line, i) => (
            <text
              key={`h-${i}`}
              style={{
                position: 'absolute',
                left: line.x,
                top: line.y,
                fontWeight: 'bold',
                fontSize: layout.headlineFontSize,
                lineHeight: layout.headlineLineHeight,
                color: '#11100d',
              }}
            >
              {line.text}
            </text>
          ))}

          {/* Credit line */}
          <text style={{
            position: 'absolute',
            left: creditLeft,
            top: creditTop,
            fontSize: 12,
            lineHeight: CREDIT_LINE_HEIGHT,
            color: 'rgba(17, 16, 13, 0.58)',
            letterSpacing: 2,
          }}>
            {CREDIT_TEXT}
          </text>

          {/* Left column body lines */}
          {leftLines.map((line, i) => (
            <text
              key={`l-${i}`}
              style={{
                position: 'absolute',
                left: line.x,
                top: line.y,
                fontSize: BODY_FONT_SIZE,
                lineHeight: BODY_LINE_HEIGHT,
                color: '#11100d',
              }}
            >
              {line.text}
            </text>
          ))}

          {/* Right column body lines */}
          {rightLines.map((line, i) => (
            <text
              key={`r-${i}`}
              style={{
                position: 'absolute',
                left: line.x,
                top: line.y,
                fontSize: BODY_FONT_SIZE,
                lineHeight: BODY_LINE_HEIGHT,
                color: '#11100d',
              }}
            >
              {line.text}
            </text>
          ))}

          {/* OpenAI logo placeholder */}
          <view
            bindtap={handleOpenaiTap}
            style={{
              position: 'absolute',
              left: layout.openaiRect.x,
              top: layout.openaiRect.y,
              width: layout.openaiRect.width,
              height: layout.openaiRect.height,
              borderRadius: layout.openaiRect.width / 2,
              backgroundColor: 'rgba(45, 88, 128, 0.18)',
              transform: `rotate(${openaiRotDeg}deg)`,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <text style={{ fontSize: Math.round(layout.openaiRect.width * 0.18), color: '#2d5880', fontWeight: 'bold' }}>
              OpenAI
            </text>
          </view>

          {/* Claude logo placeholder */}
          <view
            bindtap={handleClaudeTap}
            style={{
              position: 'absolute',
              left: layout.claudeRect.x,
              top: layout.claudeRect.y,
              width: layout.claudeRect.width,
              height: layout.claudeRect.height,
              borderRadius: layout.claudeRect.width / 2,
              backgroundColor: 'rgba(217, 119, 87, 0.22)',
              transform: `rotate(${claudeRotDeg}deg)`,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <text style={{ fontSize: Math.round(layout.claudeRect.width * 0.14), color: '#d97757', fontWeight: 'bold' }}>
              Claude
            </text>
          </view>
        </view>

        {/* Explanation */}
        <view style={{
          marginTop: 12, padding: 14, borderRadius: 14,
          backgroundColor: '#fffdf8', borderWidth: 1, borderColor: '#d8cec3',
        }}>
          <text style={{ fontSize: 15, fontWeight: 'bold', color: '#201b18' }}>
            How it works
          </text>
          <text style={{ fontSize: 13, color: '#6d645d', marginTop: 6, lineHeight: 20 }}>
            {'Everything is laid out in JS. The headline font size is binary-search ' +
             'fitted so no word breaks mid-line. Body text flows left column then right column ' +
             'via layoutNextLine cursor continuity. Both columns route around rotatable logo ' +
             'obstacles using polygon interval carving. Tap a logo to rotate it \u2014 text reflows ' +
             'live around the new geometry. Increase width past 760px to see the two-column spread.'}
          </text>
        </view>
      </view>
    </scroll-view>
  )
}

root.render(<DynamicLayoutPage />)

if (import.meta.webpackHot) {
  import.meta.webpackHot.accept()
}

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
  const [showControls, setShowControls] = useState(false)
  const [renderTick, setRenderTick] = useState(0)

  const openaiAngleRef = useRef(0)
  const claudeAngleRef = useRef(0)
  const openaiSpinRef = useRef<SpinState | null>(null)
  const claudeSpinRef = useRef<SpinState | null>(null)
  const animTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const preparedCacheRef = useRef(new Map<string, PreparedTextWithSegments>())
  const animateFnRef = useRef<() => void>(() => {})

  const onLayout = useCallback((e: any) => {
    setPageWidth(Math.floor(e.detail.width))
    setPageHeight(Math.floor(e.detail.height))
  }, [])
  const toggleControls = useCallback(() => setShowControls(v => !v), [])
  const decreaseWidth = useCallback(() => setPageWidth(w => Math.max(360, w - 40)), [])
  const increaseWidth = useCallback(() => setPageWidth(w => Math.min(1200, w + 40)), [])
  const decreaseHeight = useCallback(() => setPageHeight(h => Math.max(400, h - 40)), [])
  const increaseHeight = useCallback(() => setPageHeight(h => Math.min(1200, h + 40)), [])

  // Animation tick
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

  useEffect(() => {
    return () => {
      if (animTimerRef.current !== null) {
        clearTimeout(animTimerRef.current)
      }
    }
  }, [])

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

  const openaiAngle = openaiAngleRef.current
  const claudeAngle = claudeAngleRef.current
  void renderTick

  const pageLayout = buildLayout(pageWidth, pageHeight, BODY_LINE_HEIGHT, getPreparedCached)
  const { headlineLines, creditLeft, creditTop, leftLines, rightLines } = evaluateLayout(
    pageLayout, BODY_LINE_HEIGHT, preparedBody, creditWidth,
    openaiAngle, claudeAngle, getPreparedCached,
  )

  const totalBodyLines = leftLines.length + rightLines.length
  const openaiRotDeg = openaiAngle * 180 / Math.PI
  const claudeRotDeg = claudeAngle * 180 / Math.PI

  return (
    <view style={{ flex: 1, backgroundColor: '#f6f0e6' }} bindlayoutchange={onLayout}>
      {/* Editorial page — fills entire viewport */}
      <view style={{
        width: pageWidth,
        height: pageHeight,
        overflow: 'hidden',
        backgroundColor: '#f6f0e6',
      }}>
        {/* Headline lines */}
        {headlineLines.map((line, i) => (
          <view key={`h-${i}`} style={{
            position: 'absolute', left: line.x, top: line.y,
            height: pageLayout.headlineLineHeight,
          }}>
            <text style={{
              fontWeight: 'bold',
              fontSize: pageLayout.headlineFontSize,
              color: '#11100d',
            }}>
              {line.text}
            </text>
          </view>
        ))}

        {/* Credit line */}
        <view style={{
          position: 'absolute', left: creditLeft, top: creditTop,
          height: CREDIT_LINE_HEIGHT,
        }}>
          <text style={{
            fontSize: 12,
            color: 'rgba(17, 16, 13, 0.58)',
            letterSpacing: 2,
          }}>
            {CREDIT_TEXT}
          </text>
        </view>

        {/* Left column body lines */}
        {leftLines.map((line, i) => (
          <view key={`l-${i}`} style={{
            position: 'absolute', left: line.x, top: line.y,
            height: BODY_LINE_HEIGHT,
          }}>
            <text style={{ fontSize: BODY_FONT_SIZE, color: '#11100d' }}>
              {line.text}
            </text>
          </view>
        ))}

        {/* Right column body lines */}
        {rightLines.map((line, i) => (
          <view key={`r-${i}`} style={{
            position: 'absolute', left: line.x, top: line.y,
            height: BODY_LINE_HEIGHT,
          }}>
            <text style={{ fontSize: BODY_FONT_SIZE, color: '#11100d' }}>
              {line.text}
            </text>
          </view>
        ))}

        {/* OpenAI logo placeholder */}
        <view
          bindtap={handleOpenaiTap}
          style={{
            position: 'absolute',
            left: pageLayout.openaiRect.x,
            top: pageLayout.openaiRect.y,
            width: pageLayout.openaiRect.width,
            height: pageLayout.openaiRect.height,
            borderRadius: pageLayout.openaiRect.width / 2,
            backgroundColor: 'rgba(45, 88, 128, 0.18)',
            transform: `rotate(${openaiRotDeg}deg)`,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <text style={{ fontSize: Math.round(pageLayout.openaiRect.width * 0.18), color: '#2d5880', fontWeight: 'bold' }}>
            OpenAI
          </text>
        </view>

        {/* Claude logo placeholder */}
        <view
          bindtap={handleClaudeTap}
          style={{
            position: 'absolute',
            left: pageLayout.claudeRect.x,
            top: pageLayout.claudeRect.y,
            width: pageLayout.claudeRect.width,
            height: pageLayout.claudeRect.height,
            borderRadius: pageLayout.claudeRect.width / 2,
            backgroundColor: 'rgba(217, 119, 87, 0.22)',
            transform: `rotate(${claudeRotDeg}deg)`,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <text style={{ fontSize: Math.round(pageLayout.claudeRect.width * 0.14), color: '#d97757', fontWeight: 'bold' }}>
            Claude
          </text>
        </view>
      </view>

      {/* Toggle button */}
      <view
        bindtap={toggleControls}
        style={{
          position: 'absolute',
          top: 12,
          right: 12,
          width: 36,
          height: 36,
          borderRadius: 18,
          backgroundColor: showControls ? 'rgba(255,255,255,0.92)' : 'rgba(0,0,0,0.25)',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <text style={{
          fontSize: 20,
          color: showControls ? '#333' : '#fff',
          fontWeight: 'bold',
        }}>
          {showControls ? '\u00D7' : '\u2261'}
        </text>
      </view>

      {/* Controls overlay */}
      {showControls && (
        <view style={{
          position: 'absolute',
          top: 56,
          left: 12,
          right: 12,
          backgroundColor: 'rgba(0,0,0,0.88)',
          borderRadius: 12,
          padding: 16,
        }}>
          <text style={{ fontSize: 18, fontWeight: 'bold', color: '#fff' }}>
            Dynamic Editorial Layout
          </text>
          <text style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', marginTop: 4, lineHeight: '18px' }}>
            {'Two-column text flows around rotatable logo obstacles. ' +
             'Tap logos to rotate. Width >760px shows two-column spread.'}
          </text>

          {/* W/H steppers */}
          <view style={{ flexDirection: 'row', alignItems: 'center', marginTop: 12, gap: 8 }}>
            <text style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>W:</text>
            <view
              bindtap={decreaseWidth}
              style={{
                width: 28, height: 28, borderRadius: 14,
                backgroundColor: 'rgba(255,255,255,0.2)',
                alignItems: 'center', justifyContent: 'center',
              }}
            >
              <text style={{ fontSize: 16, color: '#fff', fontWeight: 'bold' }}>{'\u2212'}</text>
            </view>
            <text style={{ fontSize: 13, color: '#fff', minWidth: 55, textAlign: 'center' }}>
              {`${pageWidth}px`}
            </text>
            <view
              bindtap={increaseWidth}
              style={{
                width: 28, height: 28, borderRadius: 14,
                backgroundColor: 'rgba(255,255,255,0.2)',
                alignItems: 'center', justifyContent: 'center',
              }}
            >
              <text style={{ fontSize: 16, color: '#fff', fontWeight: 'bold' }}>+</text>
            </view>

            <view style={{ width: 1, height: 16, backgroundColor: 'rgba(255,255,255,0.2)', marginLeft: 4, marginRight: 4 }} />

            <text style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>H:</text>
            <view
              bindtap={decreaseHeight}
              style={{
                width: 28, height: 28, borderRadius: 14,
                backgroundColor: 'rgba(255,255,255,0.2)',
                alignItems: 'center', justifyContent: 'center',
              }}
            >
              <text style={{ fontSize: 16, color: '#fff', fontWeight: 'bold' }}>{'\u2212'}</text>
            </view>
            <text style={{ fontSize: 13, color: '#fff', minWidth: 55, textAlign: 'center' }}>
              {`${pageHeight}px`}
            </text>
            <view
              bindtap={increaseHeight}
              style={{
                width: 28, height: 28, borderRadius: 14,
                backgroundColor: 'rgba(255,255,255,0.2)',
                alignItems: 'center', justifyContent: 'center',
              }}
            >
              <text style={{ fontSize: 16, color: '#fff', fontWeight: 'bold' }}>+</text>
            </view>
          </view>

          {/* Stats */}
          <view style={{ flexDirection: 'row', gap: 16, marginTop: 12 }}>
            <view>
              <text style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>Mode</text>
              <text style={{ fontSize: 14, fontWeight: 'bold', color: '#fff' }}>
                {pageLayout.isNarrow ? 'Single' : 'Two-col'}
              </text>
            </view>
            <view>
              <text style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>Headline</text>
              <text style={{ fontSize: 14, fontWeight: 'bold', color: '#fff' }}>
                {`${pageLayout.headlineFontSize}px`}
              </text>
            </view>
            <view>
              <text style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>Left</text>
              <text style={{ fontSize: 14, fontWeight: 'bold', color: '#fff' }}>
                {`${leftLines.length}`}
              </text>
            </view>
            {rightLines.length > 0 && (
              <view>
                <text style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>Right</text>
                <text style={{ fontSize: 14, fontWeight: 'bold', color: '#fff' }}>
                  {`${rightLines.length}`}
                </text>
              </view>
            )}
            <view>
              <text style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>Total</text>
              <text style={{ fontSize: 14, fontWeight: 'bold', color: '#fff' }}>
                {`${headlineLines.length + totalBodyLines}`}
              </text>
            </view>
          </view>
        </view>
      )}
    </view>
  )
}

root.render(<DynamicLayoutPage />)

if (import.meta.webpackHot) {
  import.meta.webpackHot.accept()
}

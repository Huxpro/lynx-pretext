// Pure Background Thread (React) version of the dynamic editorial layout.
// No Main Thread Script — animation loop runs via requestAnimationFrame in BTS.
// in BTS. Every frame triggers React re-render for both logo rotation and text reflow.
// This tests whether Lynx's React reconciliation pipeline is fast enough for 60fps.

import { root, useState, useCallback, useMemo, useRef, useEffect } from '@lynx-js/react'
import {
  layoutNextLine,
  prepareWithSegments,
  walkLineRanges,
  type LayoutCursor,
  type PreparedTextWithSegments,
} from 'lynx-pretext'
import { BODY_COPY } from './dynamic-layout-text'
import {
  openaiLayout as openaiLayoutHull,
  claudeLayout as claudeLayoutHull,
} from './hull-data'
import openaiLogoSrc from '../assets/openai-symbol.png'
import claudeLogoSrc from '../assets/claude-symbol.png'
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

const BODY_FONT = '20px'
const BODY_FONT_SIZE = 20
const BODY_LINE_HEIGHT = 32
const CREDIT_TEXT = 'Leopold Aschenbrenner'
const CREDIT_FONT = '12px'
const CREDIT_LINE_HEIGHT = 16
const HEADLINE_TEXT = 'LYNX PRETEXT'
const HINT_PILL_SAFE_TOP = 72
const NARROW_BREAKPOINT = 760
const NARROW_COLUMN_MAX_WIDTH = 430
const SPIN_DURATION = 900

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
}

const wrapHulls = {
  openaiLayout: openaiLayoutHull,
  claudeLayout: claudeLayoutHull,
}

// --- Pure layout functions (identical to dynamic-layout.tsx) ---

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
    for (let i = 0; i < obstacles.length; i++) {
      const intervals = getObstacleIntervals(obstacles[i]!, bandTop, bandBottom)
      for (let j = 0; j < intervals.length; j++) blocked.push(intervals[j]!)
    }
    const slots = carveTextLineSlots({ left: region.x, right: region.x + region.width }, blocked)
    if (slots.length === 0) { lineTop += lineHeight; continue }
    let slot = slots[0]!
    for (let si = 1; si < slots.length; si++) {
      const c = slots[si]!
      const bw = slot.right - slot.left
      const cw = c.right - c.left
      if (cw > bw) { slot = c; continue }
      if (cw < bw) continue
      if (side === 'left') { if (c.left > slot.left) slot = c; continue }
      if (c.left < slot.left) slot = c
    }
    const line = layoutNextLine(prepared, cursor, slot.right - slot.left)
    if (line === null) break
    lines.push({ x: Math.round(slot.left), y: Math.round(lineTop), width: line.width, text: line.text })
    cursor = line.end
    lineTop += lineHeight
  }
  return { lines, cursor }
}

function headlineBreaksInsideWord(prepared: PreparedTextWithSegments, maxWidth: number): boolean {
  let breaks = false
  walkLineRanges(prepared, maxWidth, line => { if (line.end.graphemeIndex !== 0) breaks = true })
  return breaks
}

function getPreparedSingleLineWidth(prepared: PreparedTextWithSegments): number {
  let w = 0
  walkLineRanges(prepared, 100_000, line => { w = line.width })
  return w
}

function fitHeadlineFontSize(
  headlineWidth: number,
  pageWidth: number,
  getPrepared: (text: string, font: string) => PreparedTextWithSegments,
): number {
  let low = Math.ceil(Math.max(22, pageWidth * 0.026))
  let high = Math.floor(Math.min(32, Math.max(24, pageWidth * 0.03)))
  let best = low
  while (low <= high) {
    const size = Math.floor((low + high) / 2)
    const font = `${size}px`
    if (!headlineBreaksInsideWord(getPrepared(HEADLINE_TEXT, font), headlineWidth)) { best = size; low = size + 1 }
    else { high = size - 1 }
  }
  return best
}

function easeSpin(t: number): number {
  const r = 1 - t
  return 1 - r * r * r
}

function getLogoProjection(layout: PageLayout, lineHeight: number, openaiAngle: number, claudeAngle: number) {
  return {
    openaiObstacle: { kind: 'polygon' as const, points: transformWrapPoints(wrapHulls.openaiLayout, layout.openaiRect, openaiAngle), horizontalPadding: Math.round(lineHeight * 0.82), verticalPadding: Math.round(lineHeight * 0.26) },
    claudeObstacle: { kind: 'polygon' as const, points: transformWrapPoints(wrapHulls.claudeLayout, layout.claudeRect, claudeAngle), horizontalPadding: Math.round(lineHeight * 0.28), verticalPadding: Math.round(lineHeight * 0.12) },
  }
}

function buildLayout(pageWidth: number, pageHeight: number, lineHeight: number, getPrepared: (t: string, f: string) => PreparedTextWithSegments): PageLayout {
  const isNarrow = pageWidth < NARROW_BREAKPOINT
  if (isNarrow) {
    const gutter = Math.round(Math.max(18, Math.min(28, pageWidth * 0.06)))
    const columnWidth = Math.round(Math.min(pageWidth - gutter * 2, NARROW_COLUMN_MAX_WIDTH))
    const headlineWidth = pageWidth - gutter * 2
    const headlineFontSize = Math.min(32, fitHeadlineFontSize(headlineWidth, pageWidth, getPrepared))
    const headlineLineHeight = Math.round(headlineFontSize * 0.92)
    const claudeSize = Math.round(Math.min(184, pageWidth * 0.46, pageHeight * 0.22))
    const openaiSize = Math.round(Math.min(138, pageWidth * 0.34))
    return {
      isNarrow, gutter, pageWidth, pageHeight, centerGap: 0, columnWidth,
      headlineRegion: { x: gutter, y: 28, width: headlineWidth, height: Math.max(320, pageHeight - 28 - gutter) },
      headlineFont: `${headlineFontSize}px`, headlineLineHeight, headlineFontSize,
      creditGap: Math.round(Math.max(12, lineHeight * 0.5)), copyGap: Math.round(Math.max(18, lineHeight * 0.7)),
      openaiRect: { x: gutter - Math.round(openaiSize * 0.22), y: pageHeight - gutter - openaiSize + Math.round(openaiSize * 0.08), width: openaiSize, height: openaiSize },
      claudeRect: { x: pageWidth - gutter - Math.round(claudeSize * 0.88), y: 4, width: claudeSize, height: claudeSize },
    }
  }
  const gutter = Math.round(Math.max(52, pageWidth * 0.048))
  const centerGap = Math.round(Math.max(28, pageWidth * 0.025))
  const columnWidth = Math.round((pageWidth - gutter * 2 - centerGap) / 2)
  const headlineTop = Math.round(Math.max(42, pageWidth * 0.04, HINT_PILL_SAFE_TOP))
  const headlineWidth = Math.round(Math.min(pageWidth - gutter * 2, Math.max(columnWidth, pageWidth * 0.5)))
  const headlineFontSize = fitHeadlineFontSize(headlineWidth, pageWidth, getPrepared)
  const headlineLineHeight = Math.round(headlineFontSize * 0.92)
  const openaiShrinkT = Math.max(0, Math.min(1, (960 - pageWidth) / 260))
  const openaiSize = Math.round(Math.min(400 - openaiShrinkT * 56, pageHeight * 0.43))
  const claudeSize = Math.round(Math.max(552, Math.min(1000, pageWidth * 0.71, pageHeight * 0.9)))
  return {
    isNarrow, gutter, pageWidth, pageHeight, centerGap, columnWidth,
    headlineRegion: { x: gutter, y: headlineTop, width: headlineWidth, height: pageHeight - headlineTop - gutter },
    headlineFont: `${headlineFontSize}px`, headlineLineHeight, headlineFontSize,
    creditGap: Math.round(Math.max(14, lineHeight * 0.6)), copyGap: Math.round(Math.max(20, lineHeight * 0.9)),
    openaiRect: { x: gutter - Math.round(openaiSize * 0.3), y: pageHeight - gutter - openaiSize + Math.round(openaiSize * 0.2), width: openaiSize, height: openaiSize },
    claudeRect: { x: pageWidth - Math.round(claudeSize * 0.69), y: -Math.round(claudeSize * 0.22), width: claudeSize, height: claudeSize },
  }
}

function evaluateLayout(
  layout: PageLayout, lineHeight: number, preparedBody: PreparedTextWithSegments,
  creditWidth: number, openaiAngle: number, claudeAngle: number,
  getPrepared: (t: string, f: string) => PreparedTextWithSegments,
) {
  const { openaiObstacle, claudeObstacle } = getLogoProjection(layout, lineHeight, openaiAngle, claudeAngle)
  const headlineResult = layoutColumn(getPrepared(HEADLINE_TEXT, layout.headlineFont), { segmentIndex: 0, graphemeIndex: 0 }, layout.headlineRegion, layout.headlineLineHeight, [openaiObstacle], 'left')
  const headlineLines = headlineResult.lines
  const headlineRects = headlineLines.map(l => ({ x: l.x, y: l.y, width: Math.ceil(l.width), height: layout.headlineLineHeight }))
  const headlineBottom = headlineLines.length === 0 ? layout.headlineRegion.y : Math.max(...headlineLines.map(l => l.y + layout.headlineLineHeight))
  const creditTop = headlineBottom + layout.creditGap
  const creditRegion: Rect = { x: layout.gutter + 4, y: creditTop, width: layout.headlineRegion.width, height: CREDIT_LINE_HEIGHT }
  const copyTop = creditTop + CREDIT_LINE_HEIGHT + layout.copyGap

  const creditBlocked = getObstacleIntervals(openaiObstacle, creditRegion.y, creditRegion.y + creditRegion.height)
  const claudeCreditBlocked = getObstacleIntervals(claudeObstacle, creditRegion.y, creditRegion.y + creditRegion.height)
  const creditSlots = carveTextLineSlots({ left: creditRegion.x, right: creditRegion.x + creditRegion.width }, layout.isNarrow ? creditBlocked.concat(claudeCreditBlocked) : creditBlocked)
  let creditLeft = creditRegion.x
  for (let i = 0; i < creditSlots.length; i++) { if (creditSlots[i]!.right - creditSlots[i]!.left >= creditWidth) { creditLeft = Math.round(creditSlots[i]!.left); break } }

  if (layout.isNarrow) {
    const bodyRegion: Rect = { x: Math.round((layout.pageWidth - layout.columnWidth) / 2), y: copyTop, width: layout.columnWidth, height: Math.max(0, layout.pageHeight - copyTop - layout.gutter) }
    const bodyResult = layoutColumn(preparedBody, { segmentIndex: 0, graphemeIndex: 0 }, bodyRegion, lineHeight, [claudeObstacle, openaiObstacle], 'left')
    return { headlineLines, creditLeft, creditTop, leftLines: bodyResult.lines, rightLines: [] as PositionedLine[] }
  }

  const leftRegion: Rect = { x: layout.gutter, y: copyTop, width: layout.columnWidth, height: layout.pageHeight - copyTop - layout.gutter }
  const rightRegion: Rect = { x: layout.gutter + layout.columnWidth + layout.centerGap, y: layout.headlineRegion.y, width: layout.columnWidth, height: layout.pageHeight - layout.headlineRegion.y - layout.gutter }
  const titleObstacle: BandObstacle = { kind: 'rects', rects: headlineRects, horizontalPadding: Math.round(lineHeight * 0.95), verticalPadding: Math.round(lineHeight * 0.3) }
  const leftResult = layoutColumn(preparedBody, { segmentIndex: 0, graphemeIndex: 0 }, leftRegion, lineHeight, [openaiObstacle], 'left')
  const rightResult = layoutColumn(preparedBody, leftResult.cursor, rightRegion, lineHeight, [titleObstacle, claudeObstacle, openaiObstacle], 'right')
  return { headlineLines, creditLeft, creditTop, leftLines: leftResult.lines, rightLines: rightResult.lines }
}

// --- Component (pure BTS) ---

export function DynamicLayoutBTSPage() {
  const [pageWidth, setPageWidth] = useState(400)
  const [pageHeight, setPageHeight] = useState(700)
  const [showControls, setShowControls] = useState(false)
  const [openaiAngle, setOpenaiAngle] = useState(0)
  const [claudeAngle, setClaudeAngle] = useState(0)
  const [fpsDisplay, setFpsDisplay] = useState(0)

  const preparedCacheRef = useRef(new Map<string, PreparedTextWithSegments>())
  const fpsFrameCountRef = useRef(0)
  const fpsLastTimeRef = useRef(0)
  const fpsValueRef = useRef(0)
  const openaiSpinRef = useRef<SpinState | null>(null)
  const claudeSpinRef = useRef<SpinState | null>(null)
  const rafRef = useRef<number | null>(null)

  const onLayout = useCallback((e: any) => {
    setPageWidth(Math.floor(e.detail.width))
    setPageHeight(Math.floor(e.detail.height))
  }, [])
  const toggleControls = useCallback(() => setShowControls(v => !v), [])
  const decreaseWidth = useCallback(() => setPageWidth(w => Math.max(360, w - 40)), [])
  const increaseWidth = useCallback(() => setPageWidth(w => Math.min(1200, w + 40)), [])
  const decreaseHeight = useCallback(() => setPageHeight(h => Math.max(400, h - 40)), [])
  const increaseHeight = useCallback(() => setPageHeight(h => Math.min(1200, h + 40)), [])

  // Pure BTS animation loop — requestAnimationFrame + setState every frame
  const tick = useCallback(() => {
    const now = Date.now()

    // FPS measurement
    fpsFrameCountRef.current++
    if (fpsLastTimeRef.current === 0) fpsLastTimeRef.current = now
    const fpsElapsed = now - fpsLastTimeRef.current
    if (fpsElapsed >= 500) {
      fpsValueRef.current = Math.round((fpsFrameCountRef.current / fpsElapsed) * 1000)
      fpsFrameCountRef.current = 0
      fpsLastTimeRef.current = now
      setFpsDisplay(fpsValueRef.current)
    }

    let still = false
    let nextOpenai = openaiAngle
    let nextClaude = claudeAngle

    if (openaiSpinRef.current) {
      const s = openaiSpinRef.current
      const p = Math.min(1, (now - s.start) / SPIN_DURATION)
      nextOpenai = s.from + (s.to - s.from) * easeSpin(p)
      if (p >= 1) { nextOpenai = s.to; openaiSpinRef.current = null }
      else { still = true }
    }

    if (claudeSpinRef.current) {
      const s = claudeSpinRef.current
      const p = Math.min(1, (now - s.start) / SPIN_DURATION)
      nextClaude = s.from + (s.to - s.from) * easeSpin(p)
      if (p >= 1) { nextClaude = s.to; claudeSpinRef.current = null }
      else { still = true }
    }

    setOpenaiAngle(nextOpenai)
    setClaudeAngle(nextClaude)

    if (still) {
      rafRef.current = requestAnimationFrame(tick)
    } else {
      rafRef.current = null
    }
  }, [openaiAngle, claudeAngle])

  // Cleanup
  useEffect(() => {
    return () => { if (rafRef.current !== null) cancelAnimationFrame(rafRef.current) }
  }, [])

  const startSpin = useCallback((kind: 'openai' | 'claude', direction: 1 | -1) => {
    const currentAngle = kind === 'openai' ? openaiAngle : claudeAngle
    const spinRef = kind === 'openai' ? openaiSpinRef : claudeSpinRef
    spinRef.current = { from: currentAngle, to: currentAngle + direction * Math.PI, start: Date.now() }
    if (rafRef.current === null) {
      rafRef.current = requestAnimationFrame(tick)
    }
  }, [openaiAngle, claudeAngle, tick])

  const handleOpenaiTap = useCallback(() => startSpin('openai', -1), [startSpin])
  const handleClaudeTap = useCallback(() => startSpin('claude', 1), [startSpin])

  // Prepared text cache
  const getPreparedCached = useCallback((text: string, font: string): PreparedTextWithSegments => {
    const key = `${font}::${text}`
    let cached = preparedCacheRef.current.get(key)
    if (cached !== undefined) return cached
    cached = prepareWithSegments(text, font)
    preparedCacheRef.current.set(key, cached)
    return cached
  }, [])

  const preparedBody = useMemo(() => getPreparedCached(BODY_COPY, BODY_FONT), [getPreparedCached])
  const preparedCredit = useMemo(() => getPreparedCached(CREDIT_TEXT, CREDIT_FONT), [getPreparedCached])
  const creditWidth = useMemo(() => Math.ceil(getPreparedSingleLineWidth(preparedCredit)), [preparedCredit])

  // Layout — recomputed on every render (including during animation)
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
      <view style={{
        width: `${pageWidth}px`,
        height: `${pageHeight}px`,
        overflow: 'hidden',
        backgroundColor: '#f6f0e6',
      }}>
        {/* Headline */}
        {headlineLines.map((line, i) => (
          <view key={`h-${i}`} style={{ position: 'absolute', left: `${line.x}px`, top: `${line.y}px`, height: `${pageLayout.headlineLineHeight}px` }}>
            <text style={{ fontWeight: 'bold', fontSize: `${pageLayout.headlineFontSize}px`, color: '#11100d' }}>{line.text}</text>
          </view>
        ))}

        {/* Credit */}
        <view style={{ position: 'absolute', left: `${creditLeft}px`, top: `${creditTop}px`, height: `${CREDIT_LINE_HEIGHT}px` }}>
          <text style={{ fontSize: '12px', color: 'rgba(17, 16, 13, 0.58)', letterSpacing: '2px' }}>{CREDIT_TEXT}</text>
        </view>

        {/* Left body */}
        {leftLines.map((line, i) => (
          <view key={`l-${i}`} style={{ position: 'absolute', left: `${line.x}px`, top: `${line.y}px`, height: `${BODY_LINE_HEIGHT}px` }}>
            <text style={{ fontSize: `${BODY_FONT_SIZE}px`, color: '#11100d' }}>{line.text}</text>
          </view>
        ))}

        {/* Right body */}
        {rightLines.map((line, i) => (
          <view key={`r-${i}`} style={{ position: 'absolute', left: `${line.x}px`, top: `${line.y}px`, height: `${BODY_LINE_HEIGHT}px` }}>
            <text style={{ fontSize: `${BODY_FONT_SIZE}px`, color: '#11100d' }}>{line.text}</text>
          </view>
        ))}

        {/* OpenAI logo */}
        <view bindtap={handleOpenaiTap} style={{
          position: 'absolute',
          left: `${pageLayout.openaiRect.x}px`, top: `${pageLayout.openaiRect.y}px`,
          width: `${pageLayout.openaiRect.width}px`, height: `${pageLayout.openaiRect.height}px`,
          transform: `rotate(${openaiRotDeg}deg)`,
        }}>
          <image src={openaiLogoSrc} style={{ width: `${pageLayout.openaiRect.width}px`, height: `${pageLayout.openaiRect.height}px` }} />
        </view>

        {/* Claude logo */}
        <view bindtap={handleClaudeTap} style={{
          position: 'absolute',
          left: `${pageLayout.claudeRect.x}px`, top: `${pageLayout.claudeRect.y}px`,
          width: `${pageLayout.claudeRect.width}px`, height: `${pageLayout.claudeRect.height}px`,
          transform: `rotate(${claudeRotDeg}deg)`,
        }}>
          <image src={claudeLogoSrc} style={{ width: `${pageLayout.claudeRect.width}px`, height: `${pageLayout.claudeRect.height}px` }} />
        </view>
      </view>

      {/* Toggle */}
      <view bindtap={toggleControls} style={{
        position: 'absolute', top: '12px', right: '12px', width: '36px', height: '36px',
        borderRadius: '18px', backgroundColor: showControls ? 'rgba(255,255,255,0.92)' : 'rgba(0,0,0,0.25)',
        alignItems: 'center', justifyContent: 'center',
      }}>
        <text style={{ fontSize: '20px', color: showControls ? '#333' : '#fff', fontWeight: 'bold' }}>
          {showControls ? '\u00D7' : '\u2261'}
        </text>
      </view>

      {/* Controls */}
      {showControls && (
        <view style={{ position: 'absolute', top: '56px', left: '12px', right: '12px', backgroundColor: 'rgba(0,0,0,0.88)', borderRadius: '12px', padding: '16px' }}>
          <text style={{ fontSize: '18px', fontWeight: 'bold', color: '#fff' }}>Dynamic Layout (BTS)</text>
          <text style={{ fontSize: '13px', color: 'rgba(255,255,255,0.6)', marginTop: '4px', lineHeight: '18px' }}>
            {'Pure React animation — no Main Thread Script. ' +
             'Every frame: rAF → setState → React render → reconcile → commit. ' +
             'Compare with MTS version for performance difference.'}
          </text>

          <view style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', marginTop: '12px', gap: '8px' }}>
            <text style={{ fontSize: '13px', color: 'rgba(255,255,255,0.6)' }}>W:</text>
            <view bindtap={decreaseWidth} style={{ width: '28px', height: '28px', borderRadius: '14px', backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' }}>
              <text style={{ fontSize: '16px', color: '#fff', fontWeight: 'bold' }}>{'\u2212'}</text>
            </view>
            <text style={{ fontSize: '13px', color: '#fff', minWidth: '55px', textAlign: 'center' }}>{`${pageWidth}px`}</text>
            <view bindtap={increaseWidth} style={{ width: '28px', height: '28px', borderRadius: '14px', backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' }}>
              <text style={{ fontSize: '16px', color: '#fff', fontWeight: 'bold' }}>+</text>
            </view>
            <view style={{ width: '1px', height: '16px', backgroundColor: 'rgba(255,255,255,0.2)', marginLeft: '4px', marginRight: '4px' }} />
            <text style={{ fontSize: '13px', color: 'rgba(255,255,255,0.6)' }}>H:</text>
            <view bindtap={decreaseHeight} style={{ width: '28px', height: '28px', borderRadius: '14px', backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' }}>
              <text style={{ fontSize: '16px', color: '#fff', fontWeight: 'bold' }}>{'\u2212'}</text>
            </view>
            <text style={{ fontSize: '13px', color: '#fff', minWidth: '55px', textAlign: 'center' }}>{`${pageHeight}px`}</text>
            <view bindtap={increaseHeight} style={{ width: '28px', height: '28px', borderRadius: '14px', backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' }}>
              <text style={{ fontSize: '16px', color: '#fff', fontWeight: 'bold' }}>+</text>
            </view>
          </view>

          <view style={{ display: 'flex', flexDirection: 'row', gap: '16px', marginTop: '12px' }}>
            <view>
              <text style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)' }}>Mode</text>
              <text style={{ fontSize: '14px', fontWeight: 'bold', color: '#fff' }}>{pageLayout.isNarrow ? 'Single' : 'Two-col'}</text>
            </view>
            <view>
              <text style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)' }}>Lines</text>
              <text style={{ fontSize: '14px', fontWeight: 'bold', color: '#fff' }}>{`${headlineLines.length + totalBodyLines}`}</text>
            </view>
            <view>
              <text style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)' }}>FPS</text>
              <text style={{ fontSize: '14px', fontWeight: 'bold', color: fpsDisplay >= 50 ? '#4caf50' : fpsDisplay >= 30 ? '#ff9800' : '#f44336' }}>
                {`${fpsDisplay}`}
              </text>
            </view>
          </view>
        </view>
      )}
    </view>
  )
}

root.render(<DynamicLayoutBTSPage />)

if (import.meta.webpackHot) {
  import.meta.webpackHot.accept()
}

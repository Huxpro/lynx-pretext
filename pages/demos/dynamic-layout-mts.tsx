// Hybrid MTS/BTS dynamic editorial layout.
//
// MTS: Smooth logo rotation at 60fps via requestAnimationFrame
// BTS: Full text reflow every frame via pretext engine
// Bridge: MTS sends angles to BTS per frame → BTS computes layout → MTS applies positions
//
// Note: `with { runtime: 'shared' }` is not yet supported in @lynx-js/react-rsbuild-plugin@0.13.0,
// so we cannot run pretext layout on MTS directly. Instead we use a per-frame BTS→MTS bridge.

import { root, useState, useCallback, useRef, useEffect, useMemo, useMainThreadRef, runOnMainThread, runOnBackground } from '@lynx-js/react'
import type { MainThread } from '@lynx-js/types'
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

const MAX_HEADLINE_LINES = 5
const MAX_BODY_LINES = 60
const HEADLINE_POOL = MAX_HEADLINE_LINES
const BODY_POOL = MAX_BODY_LINES

// --- Types ---
type PositionedLine = { x: number; y: number; width: number; text: string }
type BandObstacle =
  | { kind: 'polygon'; points: Point[]; horizontalPadding: number; verticalPadding: number }
  | { kind: 'rects'; rects: Rect[]; horizontalPadding: number; verticalPadding: number }
type PageLayout = {
  isNarrow: boolean; gutter: number; pageWidth: number; pageHeight: number
  centerGap: number; columnWidth: number; headlineRegion: Rect
  headlineFont: string; headlineLineHeight: number; headlineFontSize: number
  creditGap: number; copyGap: number; openaiRect: Rect; claudeRect: Rect
}

// --- Pure layout functions (BTS only, ported from dynamic-layout.tsx) ---

function getObstacleIntervals(obstacle: BandObstacle, bandTop: number, bandBottom: number): Interval[] {
  switch (obstacle.kind) {
    case 'polygon': {
      const interval = getPolygonIntervalForBand(obstacle.points, bandTop, bandBottom, obstacle.horizontalPadding, obstacle.verticalPadding)
      return interval === null ? [] : [interval]
    }
    case 'rects':
      return getRectIntervalsForBand(obstacle.rects, bandTop, bandBottom, obstacle.horizontalPadding, obstacle.verticalPadding)
  }
}

function layoutColumn(
  prepared: PreparedTextWithSegments, startCursor: LayoutCursor, region: Rect,
  lineHeight: number, obstacles: BandObstacle[], side: 'left' | 'right',
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
      if (side === 'left') { if (c.left > slot.left) slot = c }
      else { if (c.left < slot.left) slot = c }
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
  let breaksInsideWord = false
  walkLineRanges(prepared, maxWidth, line => { if (line.end.graphemeIndex !== 0) breaksInsideWord = true })
  return breaksInsideWord
}

function getPreparedSingleLineWidth(prepared: PreparedTextWithSegments): number {
  let width = 0
  walkLineRanges(prepared, 100_000, line => { width = line.width })
  return width
}

function fitHeadlineFontSize(
  headlineWidth: number, pageWidth: number,
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

function getLogoProjection(layout: PageLayout, lineHeight: number, openaiAngle: number, claudeAngle: number) {
  const openaiWrap = transformWrapPoints(openaiLayoutHull, layout.openaiRect, openaiAngle)
  const claudeWrap = transformWrapPoints(claudeLayoutHull, layout.claudeRect, claudeAngle)
  return {
    openaiObstacle: { kind: 'polygon' as const, points: openaiWrap, horizontalPadding: Math.round(lineHeight * 0.82), verticalPadding: Math.round(lineHeight * 0.26) },
    claudeObstacle: { kind: 'polygon' as const, points: claudeWrap, horizontalPadding: Math.round(lineHeight * 0.28), verticalPadding: Math.round(lineHeight * 0.12) },
  }
}

function buildLayout(
  pageWidth: number, pageHeight: number, lineHeight: number,
  getPrepared: (text: string, font: string) => PreparedTextWithSegments,
): PageLayout {
  const isNarrow = pageWidth < NARROW_BREAKPOINT
  if (isNarrow) {
    const gutter = Math.round(Math.max(18, Math.min(28, pageWidth * 0.06)))
    const columnWidth = Math.round(Math.min(pageWidth - gutter * 2, NARROW_COLUMN_MAX_WIDTH))
    const headlineWidth = pageWidth - gutter * 2
    const headlineFontSize = Math.min(32, fitHeadlineFontSize(headlineWidth, pageWidth, getPrepared))
    const headlineLineHeight = Math.round(headlineFontSize * 0.92)
    const openaiSize = Math.round(Math.min(138, pageWidth * 0.34))
    const claudeSize = Math.round(Math.min(92, pageWidth * 0.23, pageHeight * 0.11))
    return {
      isNarrow, gutter, pageWidth, pageHeight, centerGap: 0, columnWidth,
      headlineRegion: { x: gutter, y: 28, width: headlineWidth, height: Math.max(320, pageHeight - 28 - gutter) },
      headlineFont: `${headlineFontSize}px`, headlineLineHeight, headlineFontSize,
      creditGap: Math.round(Math.max(12, lineHeight * 0.5)),
      copyGap: Math.round(Math.max(18, lineHeight * 0.7)),
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
  const claudeSize = Math.round(Math.max(276, Math.min(500, pageWidth * 0.355, pageHeight * 0.45)))
  return {
    isNarrow, gutter, pageWidth, pageHeight, centerGap, columnWidth,
    headlineRegion: { x: gutter, y: headlineTop, width: headlineWidth, height: pageHeight - headlineTop - gutter },
    headlineFont: `${headlineFontSize}px`, headlineLineHeight, headlineFontSize,
    creditGap: Math.round(Math.max(14, BODY_LINE_HEIGHT * 0.6)),
    copyGap: Math.round(Math.max(20, BODY_LINE_HEIGHT * 0.9)),
    openaiRect: { x: gutter - Math.round(openaiSize * 0.3), y: pageHeight - gutter - openaiSize + Math.round(openaiSize * 0.2), width: openaiSize, height: openaiSize },
    claudeRect: { x: pageWidth - Math.round(claudeSize * 0.69), y: -Math.round(claudeSize * 0.22), width: claudeSize, height: claudeSize },
  }
}

function evaluateLayout(
  layout: PageLayout, lineHeight: number, preparedBody: PreparedTextWithSegments,
  creditWidth: number, openaiAngle: number, claudeAngle: number,
  getPrepared: (text: string, font: string) => PreparedTextWithSegments,
) {
  const { openaiObstacle, claudeObstacle } = getLogoProjection(layout, lineHeight, openaiAngle, claudeAngle)
  const headlinePrepared = getPrepared(HEADLINE_TEXT, layout.headlineFont)
  const headlineResult = layoutColumn(headlinePrepared, { segmentIndex: 0, graphemeIndex: 0 }, layout.headlineRegion, layout.headlineLineHeight, [openaiObstacle], 'left')
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
  for (let i = 0; i < creditSlots.length; i++) {
    if (creditSlots[i]!.right - creditSlots[i]!.left >= creditWidth) { creditLeft = Math.round(creditSlots[i]!.left); break }
  }

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

// --- Component ---

export function DynamicLayoutMTSPage() {
  const [pageWidth, setPageWidth] = useState(400)
  const [pageHeight, setPageHeight] = useState(700)
  const [showControls, setShowControls] = useState(false)
  const [mtsFpsDisplay, setMtsFpsDisplay] = useState(0)
  const [btsFpsDisplay, setBtsFpsDisplay] = useState(0)
  const btsFpsFrameCountRef = useRef(0)
  const btsFpsLastTimeRef = useRef(0)

  const onLayout = useCallback((e: any) => {
    setPageWidth(Math.floor(e.detail.width))
    setPageHeight(Math.floor(e.detail.height))
  }, [])
  const toggleControls = useCallback(() => setShowControls(v => !v), [])
  const decreaseWidth = useCallback(() => setPageWidth(w => Math.max(360, w - 40)), [])
  const increaseWidth = useCallback(() => setPageWidth(w => Math.min(1200, w + 40)), [])
  const decreaseHeight = useCallback(() => setPageHeight(h => Math.max(400, h - 40)), [])
  const increaseHeight = useCallback(() => setPageHeight(h => Math.min(1200, h + 40)), [])

  // --- Element pool refs ---
  const hView0 = useMainThreadRef<MainThread.Element>(null)
  const hView1 = useMainThreadRef<MainThread.Element>(null)
  const hView2 = useMainThreadRef<MainThread.Element>(null)
  const hView3 = useMainThreadRef<MainThread.Element>(null)
  const hView4 = useMainThreadRef<MainThread.Element>(null)
  const hViewRefs = [hView0, hView1, hView2, hView3, hView4]
  const hText0 = useMainThreadRef<MainThread.Element>(null)
  const hText1 = useMainThreadRef<MainThread.Element>(null)
  const hText2 = useMainThreadRef<MainThread.Element>(null)
  const hText3 = useMainThreadRef<MainThread.Element>(null)
  const hText4 = useMainThreadRef<MainThread.Element>(null)
  const hTextRefs = [hText0, hText1, hText2, hText3, hText4]

  const creditViewRef = useMainThreadRef<MainThread.Element>(null)

  const bViewRefs: any[] = []
  const bTextRefs: any[] = []
  for (let i = 0; i < BODY_POOL; i++) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    bViewRefs.push(useMainThreadRef<MainThread.Element>(null))
    // eslint-disable-next-line react-hooks/rules-of-hooks
    bTextRefs.push(useMainThreadRef<MainThread.Element>(null))
  }

  const openaiLogoRef = useMainThreadRef<MainThread.Element>(null)
  const claudeLogoRef = useMainThreadRef<MainThread.Element>(null)

  // MTS-only state for smooth rotation
  const openaiAngleMT = useMainThreadRef(0)
  const claudeAngleMT = useMainThreadRef(0)
  const openaiSpinFromMT = useMainThreadRef(0)
  const openaiSpinToMT = useMainThreadRef(0)
  const openaiSpinStartMT = useMainThreadRef(0)
  const claudeSpinFromMT = useMainThreadRef(0)
  const claudeSpinToMT = useMainThreadRef(0)
  const claudeSpinStartMT = useMainThreadRef(0)
  const openaiSpinningMT = useMainThreadRef(false)
  const claudeSpinningMT = useMainThreadRef(false)
  const animatingMT = useMainThreadRef(false)
  const fpsFrameCountMT = useMainThreadRef(0)
  const fpsLastTimeMT = useMainThreadRef(0)

  // BTS-side prepared text cache
  const preparedCacheRef = useRef(new Map<string, PreparedTextWithSegments>())
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

  // BTS ref for current page layout (recomputed when dimensions change)
  const pageLayoutRef = useRef<PageLayout | null>(null)

  // MTS function: apply layout data to the element pool
  function applyLayoutToPool(
    hlFontSize: number, hlLineH: number,
    hLines: PositionedLine[], cLeft: number, cTop: number,
    bodyLines: PositionedLine[],
    oRect: Rect, cRect: Rect,
    oAngle: number, cAngle: number,
  ): void {
    'main thread'
    for (let i = 0; i < HEADLINE_POOL; i++) {
      const view = hViewRefs[i]!.current
      if (!view) continue
      if (i < hLines.length) {
        const line = hLines[i]!
        view.setStyleProperty('display', 'flex')
        view.setStyleProperty('left', `${line.x}px`)
        view.setStyleProperty('top', `${line.y}px`)
        view.setStyleProperty('height', `${hlLineH}px`)
        const text = hTextRefs[i]!.current
        if (text) {
          text.setStyleProperty('font-size', `${hlFontSize}px`)
          text.setAttribute('text', line.text)
        }
      } else {
        view.setStyleProperty('display', 'none')
      }
    }

    if (creditViewRef.current) {
      creditViewRef.current.setStyleProperty('left', `${cLeft}px`)
      creditViewRef.current.setStyleProperty('top', `${cTop}px`)
    }

    for (let i = 0; i < BODY_POOL; i++) {
      const view = bViewRefs[i]!.current
      if (!view) continue
      if (i < bodyLines.length) {
        const line = bodyLines[i]!
        view.setStyleProperty('display', 'flex')
        view.setStyleProperty('left', `${line.x}px`)
        view.setStyleProperty('top', `${line.y}px`)
        const text = bTextRefs[i]!.current
        if (text) text.setAttribute('text', line.text)
      } else {
        view.setStyleProperty('display', 'none')
      }
    }

    if (openaiLogoRef.current) {
      openaiLogoRef.current.setStyleProperty('left', `${oRect.x}px`)
      openaiLogoRef.current.setStyleProperty('top', `${oRect.y}px`)
      openaiLogoRef.current.setStyleProperty('width', `${oRect.width}px`)
      openaiLogoRef.current.setStyleProperty('height', `${oRect.height}px`)
      openaiLogoRef.current.setStyleProperty('transform', `rotate(${oAngle * 180 / Math.PI}deg)`)
    }
    if (claudeLogoRef.current) {
      claudeLogoRef.current.setStyleProperty('left', `${cRect.x}px`)
      claudeLogoRef.current.setStyleProperty('top', `${cRect.y}px`)
      claudeLogoRef.current.setStyleProperty('width', `${cRect.width}px`)
      claudeLogoRef.current.setStyleProperty('height', `${cRect.height}px`)
      claudeLogoRef.current.setStyleProperty('transform', `rotate(${cAngle * 180 / Math.PI}deg)`)
    }
  }

  // BTS function: compute full layout and send to MTS
  function computeAndApply(openaiAngle: number, claudeAngle: number) {
    // BTS FPS measurement
    btsFpsFrameCountRef.current++
    const btsNow = Date.now()
    if (btsFpsLastTimeRef.current === 0) btsFpsLastTimeRef.current = btsNow
    const btsElapsed = btsNow - btsFpsLastTimeRef.current
    if (btsElapsed >= 500) {
      const fps = Math.round((btsFpsFrameCountRef.current / btsElapsed) * 1000)
      btsFpsFrameCountRef.current = 0
      btsFpsLastTimeRef.current = btsNow
      setBtsFpsDisplay(fps)
    }

    const layout = pageLayoutRef.current
    if (!layout) return
    const result = evaluateLayout(layout, BODY_LINE_HEIGHT, preparedBody, creditWidth, openaiAngle, claudeAngle, getPreparedCached)
    const allBody = result.leftLines.concat(result.rightLines)
    void runOnMainThread(applyLayoutToPool)(
      layout.headlineFontSize, layout.headlineLineHeight,
      result.headlineLines, result.creditLeft, result.creditTop,
      allBody,
      layout.openaiRect, layout.claudeRect,
      openaiAngle, claudeAngle,
    )
  }

  // MTS: rAF spin loop — rotates logos + triggers BTS text reflow per frame
  function spinTick(_ts: number): void {
    'main thread'
    const now = Date.now()
    let still = false

    // MTS FPS measurement
    fpsFrameCountMT.current++
    if (fpsLastTimeMT.current === 0) fpsLastTimeMT.current = now
    const fpsElapsed = now - fpsLastTimeMT.current
    if (fpsElapsed >= 500) {
      const fps = Math.round((fpsFrameCountMT.current / fpsElapsed) * 1000)
      fpsFrameCountMT.current = 0
      fpsLastTimeMT.current = now
      runOnBackground(setMtsFpsDisplay)(fps)
    }

    if (openaiSpinningMT.current) {
      const p = Math.min(1, (now - openaiSpinStartMT.current) / SPIN_DURATION)
      const t = 1 - p; const eased = 1 - t * t * t
      openaiAngleMT.current = openaiSpinFromMT.current + (openaiSpinToMT.current - openaiSpinFromMT.current) * eased
      if (p >= 1) { openaiAngleMT.current = openaiSpinToMT.current; openaiSpinningMT.current = false }
      else { still = true }
    }

    if (claudeSpinningMT.current) {
      const p = Math.min(1, (now - claudeSpinStartMT.current) / SPIN_DURATION)
      const t = 1 - p; const eased = 1 - t * t * t
      claudeAngleMT.current = claudeSpinFromMT.current + (claudeSpinToMT.current - claudeSpinFromMT.current) * eased
      if (p >= 1) { claudeAngleMT.current = claudeSpinToMT.current; claudeSpinningMT.current = false }
      else { still = true }
    }

    // Rotate logos immediately on MTS (zero latency)
    if (openaiLogoRef.current) {
      openaiLogoRef.current.setStyleProperty('transform', `rotate(${openaiAngleMT.current * 180 / Math.PI}deg)`)
    }
    if (claudeLogoRef.current) {
      claudeLogoRef.current.setStyleProperty('transform', `rotate(${claudeAngleMT.current * 180 / Math.PI}deg)`)
    }

    // Send current angles to BTS for text reflow (1-2 frame lag)
    runOnBackground(computeAndApply)(openaiAngleMT.current, claudeAngleMT.current)

    if (still) {
      requestAnimationFrame(spinTick)
    } else {
      animatingMT.current = false
    }
  }

  function handleOpenaiTapMT(_e: MainThread.TouchEvent): void {
    'main thread'
    openaiSpinFromMT.current = openaiAngleMT.current
    openaiSpinToMT.current = openaiAngleMT.current - Math.PI
    openaiSpinStartMT.current = Date.now()
    openaiSpinningMT.current = true
    if (!animatingMT.current) { animatingMT.current = true; requestAnimationFrame(spinTick) }
  }

  function handleClaudeTapMT(_e: MainThread.TouchEvent): void {
    'main thread'
    claudeSpinFromMT.current = claudeAngleMT.current
    claudeSpinToMT.current = claudeAngleMT.current + Math.PI
    claudeSpinStartMT.current = Date.now()
    claudeSpinningMT.current = true
    if (!animatingMT.current) { animatingMT.current = true; requestAnimationFrame(spinTick) }
  }

  // Recompute page layout on dimension change and apply initial layout
  useEffect(() => {
    const layout = buildLayout(pageWidth, pageHeight, BODY_LINE_HEIGHT, getPreparedCached)
    pageLayoutRef.current = layout
    const result = evaluateLayout(layout, BODY_LINE_HEIGHT, preparedBody, creditWidth, 0, 0, getPreparedCached)
    const allBody = result.leftLines.concat(result.rightLines)
    void runOnMainThread(applyLayoutToPool)(
      layout.headlineFontSize, layout.headlineLineHeight,
      result.headlineLines, result.creditLeft, result.creditTop,
      allBody,
      layout.openaiRect, layout.claudeRect,
      0, 0,
    )
  }, [pageWidth, pageHeight, preparedBody, creditWidth, getPreparedCached])

  // --- Render: fixed pool of elements ---
  return (
    <view style={{ flex: 1, backgroundColor: '#f6f0e6' }} bindlayoutchange={onLayout}>
      <view style={{ width: `${pageWidth}px`, height: `${pageHeight}px`, overflow: 'hidden', backgroundColor: '#f6f0e6' }}>

        {Array.from({ length: HEADLINE_POOL }, (_, i) => (
          <view key={`h-${i}`} main-thread:ref={hViewRefs[i]} style={{ position: 'absolute', display: 'none' }}>
            <text main-thread:ref={hTextRefs[i]} style={{ fontWeight: 'bold', color: '#11100d' }}> </text>
          </view>
        ))}

        <view main-thread:ref={creditViewRef} style={{ position: 'absolute', height: `${CREDIT_LINE_HEIGHT}px` }}>
          <text style={{ fontSize: '12px', color: 'rgba(17, 16, 13, 0.58)', letterSpacing: '2px' }}>{CREDIT_TEXT}</text>
        </view>

        {Array.from({ length: BODY_POOL }, (_, i) => (
          <view key={`b-${i}`} main-thread:ref={bViewRefs[i]} style={{ position: 'absolute', display: 'none', height: `${BODY_LINE_HEIGHT}px` }}>
            <text main-thread:ref={bTextRefs[i]} style={{ fontSize: `${BODY_FONT_SIZE}px`, color: '#11100d' }}> </text>
          </view>
        ))}

        <view main-thread:ref={openaiLogoRef} main-thread:bindtap={handleOpenaiTapMT} style={{ position: 'absolute' }}>
          <image src={openaiLogoSrc} style={{ width: '100%', height: '100%' }} />
        </view>

        <view main-thread:ref={claudeLogoRef} main-thread:bindtap={handleClaudeTapMT} style={{ position: 'absolute' }}>
          <image src={claudeLogoSrc} style={{ width: '100%', height: '100%' }} />
        </view>
      </view>

      <view
        bindtap={toggleControls}
        style={{
          position: 'absolute', top: '12px', right: '12px',
          width: '36px', height: '36px', borderRadius: '18px',
          backgroundColor: showControls ? 'rgba(255,255,255,0.92)' : 'rgba(0,0,0,0.25)',
          alignItems: 'center', justifyContent: 'center',
        }}
      >
        <text style={{ fontSize: '20px', color: showControls ? '#333' : '#fff', fontWeight: 'bold' }}>
          {showControls ? '\u00D7' : '\u2261'}
        </text>
      </view>

      {showControls && (
        <view style={{
          position: 'absolute', top: '56px', left: '12px', right: '12px',
          backgroundColor: 'rgba(0,0,0,0.88)', borderRadius: '12px', padding: '16px',
        }}>
          <text style={{ fontSize: '18px', fontWeight: 'bold', color: '#fff' }}>
            Dynamic Layout (MTS + BTS)
          </text>
          <text style={{ fontSize: '13px', color: 'rgba(255,255,255,0.6)', marginTop: '4px', lineHeight: '18px' }}>
            {'Logo rotation on main thread at 60fps. ' +
             'Text reflows per frame via BTS bridge.'}
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
              <text style={{ fontSize: '14px', fontWeight: 'bold', color: '#fff' }}>{pageWidth < 760 ? 'Single' : 'Two-col'}</text>
            </view>
            <view>
              <text style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)' }}>Viewport</text>
              <text style={{ fontSize: '14px', fontWeight: 'bold', color: '#fff' }}>{`${pageWidth}\u00D7${pageHeight}`}</text>
            </view>
            <view>
              <text style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)' }}>MTS</text>
              <text style={{ fontSize: '14px', fontWeight: 'bold', color: mtsFpsDisplay >= 50 ? '#4caf50' : mtsFpsDisplay >= 30 ? '#ff9800' : '#f44336' }}>
                {`${mtsFpsDisplay}`}
              </text>
            </view>
            <view>
              <text style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)' }}>BTS</text>
              <text style={{ fontSize: '14px', fontWeight: 'bold', color: btsFpsDisplay >= 50 ? '#4caf50' : btsFpsDisplay >= 30 ? '#ff9800' : '#f44336' }}>
                {`${btsFpsDisplay}`}
              </text>
            </view>
          </view>
        </view>
      )}
    </view>
  )
}

root.render(<DynamicLayoutMTSPage />)

if (import.meta.webpackHot) {
  import.meta.webpackHot.accept()
}

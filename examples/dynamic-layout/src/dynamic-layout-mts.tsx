// Pure MTS dynamic editorial layout.
//
// All layout computation runs on the main thread via shared modules.
// MTS rAF loop: compute rotated obstacles → evaluateLayout → position pool elements.
// React only renders the fixed element pool and controls overlay.

import { root, useState, useCallback, useRef, useEffect, useMainThreadRef, runOnMainThread, runOnBackground } from '@lynx-js/react'
import type { MainThread } from '@lynx-js/types'
import { DevPanel, useDevPanelFPS, DevPanelFPS } from '@lynx-pretext/devtools'
import { BODY_COPY } from './dynamic-layout-text'
import {
  openaiLayout as openaiLayoutHull,
  claudeLayout as claudeLayoutHull,
} from './hull-data'
import openaiLogoSrc from '../assets/openai-symbol.png'
import claudeLogoSrc from '../assets/claude-symbol.png'
// Shared-module imports: code included in both BTS and MTS bundles
import {
  layoutNextLine,
  prepareWithSegments,
  walkLineRanges,
} from 'lynx-pretext' with { runtime: 'shared' }
import {
  carveTextLineSlots,
  getPolygonIntervalForBand,
  getRectIntervalsForBand,
  transformWrapPoints,
} from './wrap-geometry' with { runtime: 'shared' }
import type { Interval, Point, Rect } from './wrap-geometry'

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

const HEADLINE_POOL = 5
const BODY_POOL = 60

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

// --- Component ---

export function DynamicLayoutMTSPage() {
  const [pageWidth, setPageWidth] = useState(400)
  const [pageHeight, setPageHeight] = useState(700)

  // DevPanel FPS hook - MTS with direct update
  const { mtsFpsTick, mtsFpsDisplay, btsFpsDisplay, mtsFpsTextRef } = useDevPanelFPS(true)

  const onLayout = useCallback((e: any) => {
    setPageWidth(Math.floor(e.detail.width))
    setPageHeight(Math.floor(e.detail.height))
  }, [])

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

  // MTS animation state
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
  const pageWidthMT = useMainThreadRef(400)
  const pageHeightMT = useMainThreadRef(700)
  const creditWidthMT = useMainThreadRef(0)
  const prevBodyCountMT = useMainThreadRef(0)

  // MTS-side prepared text cache (state-isolated from BTS).
  // Initialized lazily on MTS — Map is not JSON-serializable so can't be passed as initial value.
  const preparedCacheMT = useMainThreadRef<any>(null)

  // ======= ALL LAYOUT ON MTS VIA SHARED MODULES =======
  // Callee-before-caller order for TDZ safety.

  function getPreparedMTS(text: string, font: string): any {
    'main thread'
    if (preparedCacheMT.current === null) preparedCacheMT.current = new Map()
    const cache = preparedCacheMT.current as Map<string, any>
    const key = `${font}::${text}`
    let cached = cache.get(key)
    if (cached !== undefined) return cached
    cached = prepareWithSegments(text, font)
    cache.set(key, cached)
    return cached
  }

  function getObstacleIntervals(obstacle: BandObstacle, bandTop: number, bandBottom: number): Interval[] {
    'main thread'
    switch (obstacle.kind) {
      case 'polygon': {
        const interval = getPolygonIntervalForBand(obstacle.points, bandTop, bandBottom, obstacle.horizontalPadding, obstacle.verticalPadding)
        return interval === null ? [] : [interval]
      }
      case 'rects':
        return getRectIntervalsForBand(obstacle.rects, bandTop, bandBottom, obstacle.horizontalPadding, obstacle.verticalPadding)
    }
  }

  function layoutColumnMTS(
    prepared: any, startCursor: { segmentIndex: number; graphemeIndex: number },
    region: Rect, lineHeight: number, obstacles: BandObstacle[], side: 'left' | 'right',
  ): { lines: PositionedLine[]; cursor: { segmentIndex: number; graphemeIndex: number } } {
    'main thread'
    let cursor = startCursor
    let lineTop = region.y
    const lines: PositionedLine[] = []
    while (true) {
      if (lineTop + lineHeight > region.y + region.height) break
      const blocked: Interval[] = []
      for (let i = 0; i < obstacles.length; i++) {
        const intervals = getObstacleIntervals(obstacles[i]!, lineTop, lineTop + lineHeight)
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

  function getLogoProjection(layout: PageLayout, lineHeight: number, openaiAngle: number, claudeAngle: number) {
    'main thread'
    const openaiWrap = transformWrapPoints(openaiLayoutHull, layout.openaiRect, openaiAngle)
    const claudeWrap = transformWrapPoints(claudeLayoutHull, layout.claudeRect, claudeAngle)
    return {
      openaiObstacle: { kind: 'polygon' as const, points: openaiWrap, horizontalPadding: Math.round(lineHeight * 0.82), verticalPadding: Math.round(lineHeight * 0.26) },
      claudeObstacle: { kind: 'polygon' as const, points: claudeWrap, horizontalPadding: Math.round(lineHeight * 0.28), verticalPadding: Math.round(lineHeight * 0.12) },
    }
  }

  function fitHeadlineFontSizeMTS(headlineWidth: number, pWidth: number): number {
    'main thread'
    let low = Math.ceil(Math.max(22, pWidth * 0.026))
    let high = Math.floor(Math.min(32, Math.max(24, pWidth * 0.03)))
    let best = low
    while (low <= high) {
      const size = Math.floor((low + high) / 2)
      const prepared = getPreparedMTS(HEADLINE_TEXT, `${size}px`)
      let breaksInsideWord = false
      walkLineRanges(prepared, headlineWidth, (line: any) => { if (line.end.graphemeIndex !== 0) breaksInsideWord = true })
      if (!breaksInsideWord) { best = size; low = size + 1 } else { high = size - 1 }
    }
    return best
  }

  function buildLayoutMTS(pWidth: number, pHeight: number, lineHeight: number): PageLayout {
    'main thread'
    const isNarrow = pWidth < NARROW_BREAKPOINT
    if (isNarrow) {
      const gutter = Math.round(Math.max(18, Math.min(28, pWidth * 0.06)))
      const columnWidth = Math.round(Math.min(pWidth - gutter * 2, NARROW_COLUMN_MAX_WIDTH))
      const headlineWidth = pWidth - gutter * 2
      const headlineFontSize = Math.min(32, fitHeadlineFontSizeMTS(headlineWidth, pWidth))
      const headlineLineHeight = Math.round(headlineFontSize * 0.92)
      const openaiSize = Math.round(Math.min(138, pWidth * 0.34))
      const claudeSize = Math.round(Math.min(184, pWidth * 0.46, pHeight * 0.22))
      return { isNarrow, gutter, pageWidth: pWidth, pageHeight: pHeight, centerGap: 0, columnWidth,
        headlineRegion: { x: gutter, y: 28, width: headlineWidth, height: Math.max(320, pHeight - 28 - gutter) },
        headlineFont: `${headlineFontSize}px`, headlineLineHeight, headlineFontSize,
        creditGap: Math.round(Math.max(12, lineHeight * 0.5)), copyGap: Math.round(Math.max(18, lineHeight * 0.7)),
        openaiRect: { x: gutter - Math.round(openaiSize * 0.22), y: pHeight - gutter - openaiSize + Math.round(openaiSize * 0.08), width: openaiSize, height: openaiSize },
        claudeRect: { x: pWidth - gutter - Math.round(claudeSize * 0.88), y: 4, width: claudeSize, height: claudeSize } }
    }
    const gutter = Math.round(Math.max(52, pWidth * 0.048))
    const centerGap = Math.round(Math.max(28, pWidth * 0.025))
    const columnWidth = Math.round((pWidth - gutter * 2 - centerGap) / 2)
    const headlineTop = Math.round(Math.max(42, pWidth * 0.04, HINT_PILL_SAFE_TOP))
    const headlineWidth = Math.round(Math.min(pWidth - gutter * 2, Math.max(columnWidth, pWidth * 0.5)))
    const headlineFontSize = fitHeadlineFontSizeMTS(headlineWidth, pWidth)
    const headlineLineHeight = Math.round(headlineFontSize * 0.92)
    const openaiShrinkT = Math.max(0, Math.min(1, (960 - pWidth) / 260))
    const openaiSize = Math.round(Math.min(400 - openaiShrinkT * 56, pHeight * 0.43))
    const claudeSize = Math.round(Math.max(552, Math.min(1000, pWidth * 0.71, pHeight * 0.9)))
    return { isNarrow, gutter, pageWidth: pWidth, pageHeight: pHeight, centerGap, columnWidth,
      headlineRegion: { x: gutter, y: headlineTop, width: headlineWidth, height: pHeight - headlineTop - gutter },
      headlineFont: `${headlineFontSize}px`, headlineLineHeight, headlineFontSize,
      creditGap: Math.round(Math.max(14, BODY_LINE_HEIGHT * 0.6)), copyGap: Math.round(Math.max(20, BODY_LINE_HEIGHT * 0.9)),
      openaiRect: { x: gutter - Math.round(openaiSize * 0.3), y: pHeight - gutter - openaiSize + Math.round(openaiSize * 0.2), width: openaiSize, height: openaiSize },
      claudeRect: { x: pWidth - Math.round(claudeSize * 0.69), y: -Math.round(claudeSize * 0.22), width: claudeSize, height: claudeSize } }
  }

  // --- Helpers (like editorial-mts pattern) ---

  function positionTextLine(viewRef: any, textRef: any, line: PositionedLine | null, height: number, fontSize?: number): void {
    'main thread'
    const view = viewRef.current
    if (!view) return
    if (line === null) { view.setStyleProperty('display', 'none'); return }
    view.setStyleProperties({ display: 'flex', left: `${line.x}px`, top: `${line.y}px`, height: `${height}px` })
    const text = textRef.current
    if (!text) return
    if (fontSize !== undefined) text.setStyleProperty('font-size', `${fontSize}px`)
    text.setAttribute('text', line.text)
  }

  function positionLogo(ref: any, rect: Rect, angle: number): void {
    'main thread'
    if (!ref.current) return
    ref.current.setStyleProperties({
      left: `${rect.x}px`, top: `${rect.y}px`,
      width: `${rect.width}px`, height: `${rect.height}px`,
      transform: `rotate(${angle * 180 / Math.PI}deg)`,
    })
  }

  // Full evaluate + apply to pool — ALL on MTS, zero cross-thread
  function evaluateAndApply(openaiAngle: number, claudeAngle: number): void {
    'main thread'
    const layout = buildLayoutMTS(pageWidthMT.current, pageHeightMT.current, BODY_LINE_HEIGHT)
    const { openaiObstacle, claudeObstacle } = getLogoProjection(layout, BODY_LINE_HEIGHT, openaiAngle, claudeAngle)

    const headlinePrepared = getPreparedMTS(HEADLINE_TEXT, layout.headlineFont)
    const headlineResult = layoutColumnMTS(headlinePrepared, { segmentIndex: 0, graphemeIndex: 0 }, layout.headlineRegion, layout.headlineLineHeight, [openaiObstacle], 'left')
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
    for (let ci = 0; ci < creditSlots.length; ci++) {
      if (creditSlots[ci]!.right - creditSlots[ci]!.left >= creditWidthMT.current) { creditLeft = Math.round(creditSlots[ci]!.left); break }
    }

    const preparedBody = getPreparedMTS(BODY_COPY, BODY_FONT)
    let leftLines: PositionedLine[]; let rightLines: PositionedLine[]
    if (layout.isNarrow) {
      const bodyRegion: Rect = { x: Math.round((layout.pageWidth - layout.columnWidth) / 2), y: copyTop, width: layout.columnWidth, height: Math.max(0, layout.pageHeight - copyTop - layout.gutter) }
      const bodyResult = layoutColumnMTS(preparedBody, { segmentIndex: 0, graphemeIndex: 0 }, bodyRegion, BODY_LINE_HEIGHT, [claudeObstacle, openaiObstacle], 'left')
      leftLines = bodyResult.lines; rightLines = []
    } else {
      const leftRegion: Rect = { x: layout.gutter, y: copyTop, width: layout.columnWidth, height: layout.pageHeight - copyTop - layout.gutter }
      const rightRegion: Rect = { x: layout.gutter + layout.columnWidth + layout.centerGap, y: layout.headlineRegion.y, width: layout.columnWidth, height: layout.pageHeight - layout.headlineRegion.y - layout.gutter }
      const titleObstacle: BandObstacle = { kind: 'rects', rects: headlineRects, horizontalPadding: Math.round(BODY_LINE_HEIGHT * 0.95), verticalPadding: Math.round(BODY_LINE_HEIGHT * 0.3) }
      const leftResult = layoutColumnMTS(preparedBody, { segmentIndex: 0, graphemeIndex: 0 }, leftRegion, BODY_LINE_HEIGHT, [openaiObstacle], 'left')
      const rightResult = layoutColumnMTS(preparedBody, leftResult.cursor, rightRegion, BODY_LINE_HEIGHT, [titleObstacle, claudeObstacle, openaiObstacle], 'right')
      leftLines = leftResult.lines; rightLines = rightResult.lines
    }

    // Apply headline
    for (let i = 0; i < HEADLINE_POOL; i++) {
      positionTextLine(hViewRefs[i], hTextRefs[i], i < headlineLines.length ? headlineLines[i]! : null, layout.headlineLineHeight, layout.headlineFontSize)
    }
    // Apply credit
    if (creditViewRef.current) {
      creditViewRef.current.setStyleProperties({ left: `${creditLeft}px`, top: `${creditTop}px` })
    }
    // Apply body — only hide the delta from previous frame
    const allBody = leftLines.concat(rightLines)
    for (let i = 0; i < allBody.length; i++) {
      positionTextLine(bViewRefs[i], bTextRefs[i], allBody[i]!, BODY_LINE_HEIGHT)
    }
    for (let i = allBody.length; i < prevBodyCountMT.current; i++) {
      const view = bViewRefs[i]?.current
      if (view) view.setStyleProperty('display', 'none')
    }
    prevBodyCountMT.current = allBody.length
    // Apply logos
    positionLogo(openaiLogoRef, layout.openaiRect, openaiAngle)
    positionLogo(claudeLogoRef, layout.claudeRect, claudeAngle)
  }

  // ======= ANIMATION =======

  function spinTick(ts: number): void {
    'main thread'
    const now = Date.now()
    let still = false

    // MTS FPS tick (from hook)
    mtsFpsTick()

    if (openaiSpinningMT.current) {
      const p = Math.min(1, (now - openaiSpinStartMT.current) / SPIN_DURATION)
      const t = 1 - p; const eased = 1 - t * t * t
      openaiAngleMT.current = openaiSpinFromMT.current + (openaiSpinToMT.current - openaiSpinFromMT.current) * eased
      if (p >= 1) { openaiAngleMT.current = openaiSpinToMT.current; openaiSpinningMT.current = false } else { still = true }
    }
    if (claudeSpinningMT.current) {
      const p = Math.min(1, (now - claudeSpinStartMT.current) / SPIN_DURATION)
      const t = 1 - p; const eased = 1 - t * t * t
      claudeAngleMT.current = claudeSpinFromMT.current + (claudeSpinToMT.current - claudeSpinFromMT.current) * eased
      if (p >= 1) { claudeAngleMT.current = claudeSpinToMT.current; claudeSpinningMT.current = false } else { still = true }
    }

    evaluateAndApply(openaiAngleMT.current, claudeAngleMT.current)

    if (still) { requestAnimationFrame(spinTick) } else { animatingMT.current = false }
  }

  function handleOpenaiTapMT(_e: MainThread.TouchEvent): void {
    'main thread'
    openaiSpinFromMT.current = openaiAngleMT.current; openaiSpinToMT.current = openaiAngleMT.current - Math.PI
    openaiSpinStartMT.current = Date.now(); openaiSpinningMT.current = true
    if (!animatingMT.current) { animatingMT.current = true; requestAnimationFrame(spinTick) }
  }

  function handleClaudeTapMT(_e: MainThread.TouchEvent): void {
    'main thread'
    claudeSpinFromMT.current = claudeAngleMT.current; claudeSpinToMT.current = claudeAngleMT.current + Math.PI
    claudeSpinStartMT.current = Date.now(); claudeSpinningMT.current = true
    if (!animatingMT.current) { animatingMT.current = true; requestAnimationFrame(spinTick) }
  }

  function initMTS(): void {
    'main thread'
    getPreparedMTS(BODY_COPY, BODY_FONT)
    getPreparedMTS(CREDIT_TEXT, CREDIT_FONT)
    let cw = 0
    walkLineRanges(getPreparedMTS(CREDIT_TEXT, CREDIT_FONT), 100_000, (line: any) => { cw = line.width })
    creditWidthMT.current = Math.ceil(cw)
    evaluateAndApply(0, 0)
  }

  function syncDimensionsMTS(w: number, h: number): void {
    'main thread'
    pageWidthMT.current = w; pageHeightMT.current = h
    if (!animatingMT.current) evaluateAndApply(openaiAngleMT.current, claudeAngleMT.current)
  }

  useEffect(() => { void runOnMainThread(initMTS)() }, [])
  useEffect(() => { void runOnMainThread(syncDimensionsMTS)(pageWidth, pageHeight) }, [pageWidth, pageHeight])

  // --- Render: fixed pool ---
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

      {/* DevPanel */}
      <DevPanel.Root>
        <DevPanel.Trigger />
        <DevPanel.Content
          title="Dynamic Layout (Pure MTS)"
          description="Full text reflow on main thread at 60fps via shared modules. Zero cross-thread during animation."
        >
          <DevPanelFPS mtsFpsDisplay={mtsFpsDisplay} btsFpsDisplay={btsFpsDisplay} mtsFpsTextRef={mtsFpsTextRef} />
          <DevPanel.Stats>
            <DevPanel.Stat label="Mode" value={pageWidth < 760 ? 'Single' : 'Two-col'} />
            <DevPanel.Stat label="Viewport" value={`${pageWidth}\u00D7${pageHeight}`} />
          </DevPanel.Stats>
          <DevPanel.Stepper label="W" value={pageWidth} min={360} max={1200} step={40} onChange={setPageWidth} />
          <DevPanel.Stepper label="H" value={pageHeight} min={400} max={1200} step={40} onChange={setPageHeight} />
        </DevPanel.Content>
      </DevPanel.Root>
    </view>
  )
}

root.render(<DynamicLayoutMTSPage />)

if (import.meta.webpackHot) {
  import.meta.webpackHot.accept()
}

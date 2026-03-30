# Dynamic Layout MTS Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a new `dynamic-layout-mts` demo that runs the full editorial text reflow on the main thread during logo spin animation, achieving smooth 60fps like the original browser Pretext demo.

**Architecture:** Pre-allocate a fixed pool of `<view>/<text>` elements with `main-thread:ref`. On tap, a `requestAnimationFrame` loop on the main thread computes rotated hull → evaluateLayout (via shared-module pretext) → positions all text lines via `setStyleProperty`. React only handles initial render and the controls overlay. The key insight: pretext's `layoutNextLine` is pure arithmetic — once segment widths are cached on the MTS side (one `prepareWithSegments` call), all subsequent reflows are zero-cost native calls.

**Tech Stack:** ReactLynx, Main Thread Script (`'main thread'` directive), `useMainThreadRef`, `requestAnimationFrame`, `with { runtime: 'shared' }` imports

---

## File Structure

| File | Responsibility |
|------|---------------|
| `pages/demos/dynamic-layout-mts.tsx` | New demo entry. React shell with element pool + MTS animation loop |
| `pages/demos/mts/editorial-layout.ts` | Main-thread-only module: all layout computation (`evaluateLayout`, `layoutColumn`, `buildLayout`, obstacle geometry). Every exported function has `'main thread'` directive. Imports pretext via `with { runtime: 'shared' }` |
| `pages/demos/mts/editorial-constants.ts` | Shared constants (fonts, dimensions, hull data). No `'main thread'` directive needed — pure data |
| `lynx.config.ts` | Add `'dynamic-layout-mts'` entry point |

**Why separate `mts/editorial-layout.ts`?** The TDZ problem (see flappy-bird CLAUDE.md): SWC transforms function declarations inside components into `let` bindings, breaking hoisting. Extracting MTS functions to a separate module makes them TDZ-immune. Also keeps the component file focused on the React shell.

**Why not `with { runtime: 'shared' }` for everything?** Shared modules have state isolation — each thread gets independent instances. For pretext, this means the MTS side needs its own `prepareWithSegments()` call to build its width cache. That's fine — it only happens once. But the layout computation functions (`evaluateLayout`, `layoutColumn`, etc.) are stateless and only need to run on MTS during animation, so they go in a `'main thread'` module.

## Pool Strategy

Pre-allocate enough elements for the maximum possible layout:
- **Headline lines:** 5 (short text, large font)
- **Credit line:** 1
- **Body lines (left + right columns combined):** 60
- **Logo wrappers:** 2
- **Total:** 68 elements with `main-thread:ref`

Each pool element is a `<view>` (position: absolute) containing a `<text>`. On each frame, MTS sets `left`, `top`, `display` (visible/hidden), and the `<text>` content via `setAttribute('text-content', ...)` or setting innerText equivalent. Unused elements get `display: none`.

**Important:** Lynx `<text>` content can't be changed via `setStyleProperty`. We need to use `element.setText(text)` or `element.setAttribute('text-content', text)` — need to verify which API works. Fallback: set `textContent` if MainThread.Element supports it.

---

### Task 1: Constants and hull data module

**Files:**
- Create: `pages/demos/mts/editorial-constants.ts`

- [ ] **Step 1: Create the constants file**

Extract all constants from `dynamic-layout.tsx` into a pure data module. No `'main thread'` directive needed — these are just numbers and arrays.

```ts
// pages/demos/mts/editorial-constants.ts
import type { Point } from '../wrap-geometry'
import {
  openaiLayout as openaiLayoutHull,
  claudeLayout as claudeLayoutHull,
  openaiHit as openaiHitHull,
  claudeHit as claudeHitHull,
} from '../hull-data'

export const BODY_FONT = '20px'
export const BODY_FONT_SIZE = 20
export const BODY_LINE_HEIGHT = 32
export const CREDIT_TEXT = 'Leopold Aschenbrenner'
export const CREDIT_FONT = '12px'
export const CREDIT_LINE_HEIGHT = 16
export const HEADLINE_TEXT = 'LYNX PRETEXT'
export const HEADLINE_FONT_FAMILY_SUFFIX = '' // Lynx uses system font; no custom serif
export const HINT_PILL_SAFE_TOP = 72
export const NARROW_BREAKPOINT = 760
export const NARROW_COLUMN_MAX_WIDTH = 430
export const SPIN_DURATION = 900

export const MAX_HEADLINE_LINES = 5
export const MAX_BODY_LINES = 60  // left + right combined
export const POOL_SIZE = MAX_HEADLINE_LINES + 1 + MAX_BODY_LINES // +1 for credit

export const WRAP_HULLS = {
  openaiLayout: openaiLayoutHull,
  claudeLayout: claudeLayoutHull,
  openaiHit: openaiHitHull,
  claudeHit: claudeHitHull,
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: No errors related to the new file

- [ ] **Step 3: Commit**

```bash
git add pages/demos/mts/editorial-constants.ts
git commit -m "feat: extract editorial layout constants to mts module"
```

---

### Task 2: Main-thread layout computation module

**Files:**
- Create: `pages/demos/mts/editorial-layout.ts`

This is the core — all layout functions that will run on the main thread during animation. Each exported function has the `'main thread'` directive. It imports pretext functions via `with { runtime: 'shared' }`.

**TDZ ordering rule:** callees MUST be declared before callers. Order:
1. `getObstacleIntervals` (leaf)
2. `layoutColumnMTS` (calls getObstacleIntervals + pretext layoutNextLine)
3. `getLogoProjection` (calls wrap-geometry transformWrapPoints)
4. `buildLayoutMTS` (calls fitHeadlineFontSizeMTS)
5. `fitHeadlineFontSizeMTS` — wait, this calls prepareWithSegments + walkLineRanges. Actually need to re-check ordering...

Let me fix the order: `fitHeadlineFontSize` is called by `buildLayout`, and it calls `prepareWithSegments` + `walkLineRanges`. So:

1. helpers (getObstacleIntervals, headlineBreaksInsideWord, getPreparedSingleLineWidth)
2. layoutColumnMTS
3. getLogoProjection
4. fitHeadlineFontSizeMTS
5. buildLayoutMTS
6. evaluateLayoutMTS (calls all above)

- [ ] **Step 1: Create the editorial-layout MTS module**

```ts
// pages/demos/mts/editorial-layout.ts
//
// Main-thread-only layout computation for the editorial demo.
// Every exported function has 'main thread' directive.
// Callee-before-caller order (TDZ rule).

import {
  layoutNextLine,
  prepareWithSegments,
  walkLineRanges,
} from '../../../src/layout' with { runtime: 'shared' }

import {
  carveTextLineSlots,
  getPolygonIntervalForBand,
  getRectIntervalsForBand,
  transformWrapPoints,
} from '../wrap-geometry' with { runtime: 'shared' }

import type { Interval, Point, Rect } from '../wrap-geometry'

import {
  BODY_LINE_HEIGHT,
  CREDIT_LINE_HEIGHT,
  CREDIT_TEXT,
  HEADLINE_TEXT,
  HINT_PILL_SAFE_TOP,
  NARROW_BREAKPOINT,
  NARROW_COLUMN_MAX_WIDTH,
  WRAP_HULLS,
} from './editorial-constants'

// --- Types ---

export type PositionedLine = { x: number; y: number; width: number; text: string }

type BandObstacle =
  | { kind: 'polygon'; points: Point[]; horizontalPadding: number; verticalPadding: number }
  | { kind: 'rects'; rects: Rect[]; horizontalPadding: number; verticalPadding: number }

export type PageLayout = {
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

export type FullLayout = {
  pageLayout: PageLayout
  headlineLines: PositionedLine[]
  creditLeft: number
  creditTop: number
  leftLines: PositionedLine[]
  rightLines: PositionedLine[]
}

// --- Prepared text cache (MTS-side, independent from BTS) ---

const preparedCache = new Map<string, any>()

export function getPreparedMTS(text: string, font: string): any {
  'main thread'
  const key = `${font}::${text}`
  let cached = preparedCache.get(key)
  if (cached !== undefined) return cached
  cached = prepareWithSegments(text, font)
  preparedCache.set(key, cached)
  return cached
}

// --- Helpers (leaves first for TDZ) ---

function getObstacleIntervals(obstacle: BandObstacle, bandTop: number, bandBottom: number): Interval[] {
  'main thread'
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

function headlineBreaksInsideWord(prepared: any, maxWidth: number): boolean {
  'main thread'
  let breaksInsideWord = false
  walkLineRanges(prepared, maxWidth, (line: any) => {
    if (line.end.graphemeIndex !== 0) breaksInsideWord = true
  })
  return breaksInsideWord
}

function getPreparedSingleLineWidth(prepared: any): number {
  'main thread'
  let width = 0
  walkLineRanges(prepared, 100_000, (line: any) => { width = line.width })
  return width
}

function layoutColumnMTS(
  prepared: any,
  startCursor: { segmentIndex: number; graphemeIndex: number },
  region: Rect,
  lineHeight: number,
  obstacles: BandObstacle[],
  side: 'left' | 'right',
): { lines: PositionedLine[]; cursor: { segmentIndex: number; graphemeIndex: number } } {
  'main thread'
  let cursor = startCursor
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

function getLogoProjection(
  layout: PageLayout,
  lineHeight: number,
  openaiAngle: number,
  claudeAngle: number,
): { openaiObstacle: BandObstacle; claudeObstacle: BandObstacle } {
  'main thread'
  const openaiWrap = transformWrapPoints(WRAP_HULLS.openaiLayout, layout.openaiRect, openaiAngle)
  const claudeWrap = transformWrapPoints(WRAP_HULLS.claudeLayout, layout.claudeRect, claudeAngle)
  return {
    openaiObstacle: { kind: 'polygon', points: openaiWrap, horizontalPadding: Math.round(lineHeight * 0.82), verticalPadding: Math.round(lineHeight * 0.26) },
    claudeObstacle: { kind: 'polygon', points: claudeWrap, horizontalPadding: Math.round(lineHeight * 0.28), verticalPadding: Math.round(lineHeight * 0.12) },
  }
}

function fitHeadlineFontSizeMTS(headlineWidth: number, pageWidth: number): number {
  'main thread'
  let low = Math.ceil(Math.max(22, pageWidth * 0.026))
  let high = Math.floor(Math.min(94.4, Math.max(55.2, pageWidth * 0.055)))
  let best = low
  while (low <= high) {
    const size = Math.floor((low + high) / 2)
    const font = `${size}px`
    const prepared = getPreparedMTS(HEADLINE_TEXT, font)
    if (!headlineBreaksInsideWord(prepared, headlineWidth)) { best = size; low = size + 1 }
    else { high = size - 1 }
  }
  return best
}

// --- Top-level layout builders ---

export function buildLayoutMTS(pageWidth: number, pageHeight: number, lineHeight: number): PageLayout {
  'main thread'
  const isNarrow = pageWidth < NARROW_BREAKPOINT
  if (isNarrow) {
    const gutter = Math.round(Math.max(18, Math.min(28, pageWidth * 0.06)))
    const columnWidth = Math.round(Math.min(pageWidth - gutter * 2, NARROW_COLUMN_MAX_WIDTH))
    const headlineWidth = pageWidth - gutter * 2
    const headlineFontSize = Math.min(48, fitHeadlineFontSizeMTS(headlineWidth, pageWidth))
    const headlineLineHeight = Math.round(headlineFontSize * 0.92)
    const headlineFont = `${headlineFontSize}px`
    return {
      isNarrow, gutter, pageWidth, pageHeight, centerGap: 0, columnWidth,
      headlineRegion: { x: gutter, y: 28, width: headlineWidth, height: Math.max(320, pageHeight - 28 - gutter) },
      headlineFont, headlineLineHeight, headlineFontSize,
      creditGap: Math.round(Math.max(12, lineHeight * 0.5)),
      copyGap: Math.round(Math.max(18, lineHeight * 0.7)),
      openaiRect: { x: gutter - Math.round(Math.min(138, pageWidth * 0.34) * 0.22), y: pageHeight - gutter - Math.min(138, pageWidth * 0.34) + Math.round(Math.min(138, pageWidth * 0.34) * 0.08), width: Math.round(Math.min(138, pageWidth * 0.34)), height: Math.round(Math.min(138, pageWidth * 0.34)) },
      claudeRect: { x: pageWidth - gutter - Math.round(Math.min(92, pageWidth * 0.23, pageHeight * 0.11) * 0.88), y: 4, width: Math.round(Math.min(92, pageWidth * 0.23, pageHeight * 0.11)), height: Math.round(Math.min(92, pageWidth * 0.23, pageHeight * 0.11)) },
    }
  }
  const gutter = Math.round(Math.max(52, pageWidth * 0.048))
  const centerGap = Math.round(Math.max(28, pageWidth * 0.025))
  const columnWidth = Math.round((pageWidth - gutter * 2 - centerGap) / 2)
  const headlineTop = Math.round(Math.max(42, pageWidth * 0.04, HINT_PILL_SAFE_TOP))
  const headlineWidth = Math.round(Math.min(pageWidth - gutter * 2, Math.max(columnWidth, pageWidth * 0.5)))
  const headlineFontSize = fitHeadlineFontSizeMTS(headlineWidth, pageWidth)
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

export function evaluateLayoutMTS(
  layout: PageLayout,
  lineHeight: number,
  bodyText: string,
  bodyFont: string,
  creditWidth: number,
  openaiAngle: number,
  claudeAngle: number,
): FullLayout {
  'main thread'
  const { openaiObstacle, claudeObstacle } = getLogoProjection(layout, lineHeight, openaiAngle, claudeAngle)
  const headlinePrepared = getPreparedMTS(HEADLINE_TEXT, layout.headlineFont)
  const headlineResult = layoutColumnMTS(headlinePrepared, { segmentIndex: 0, graphemeIndex: 0 }, layout.headlineRegion, layout.headlineLineHeight, [openaiObstacle], 'left')
  const headlineLines = headlineResult.lines
  const headlineRects = headlineLines.map(l => ({ x: l.x, y: l.y, width: Math.ceil(l.width), height: layout.headlineLineHeight }))
  const headlineBottom = headlineLines.length === 0 ? layout.headlineRegion.y : Math.max(...headlineLines.map(l => l.y + layout.headlineLineHeight))
  const creditTop = headlineBottom + layout.creditGap
  const creditRegion: Rect = { x: layout.gutter + 4, y: creditTop, width: layout.headlineRegion.width, height: CREDIT_LINE_HEIGHT }
  const copyTop = creditTop + CREDIT_LINE_HEIGHT + layout.copyGap

  // Credit slot
  const creditBlocked = getObstacleIntervals(openaiObstacle, creditRegion.y, creditRegion.y + creditRegion.height)
  const claudeCreditBlocked = getObstacleIntervals(claudeObstacle, creditRegion.y, creditRegion.y + creditRegion.height)
  const creditSlots = carveTextLineSlots({ left: creditRegion.x, right: creditRegion.x + creditRegion.width }, layout.isNarrow ? creditBlocked.concat(claudeCreditBlocked) : creditBlocked)
  let creditLeft = creditRegion.x
  for (let i = 0; i < creditSlots.length; i++) {
    if (creditSlots[i]!.right - creditSlots[i]!.left >= creditWidth) { creditLeft = Math.round(creditSlots[i]!.left); break }
  }

  const preparedBody = getPreparedMTS(bodyText, bodyFont)

  if (layout.isNarrow) {
    const bodyRegion: Rect = { x: Math.round((layout.pageWidth - layout.columnWidth) / 2), y: copyTop, width: layout.columnWidth, height: Math.max(0, layout.pageHeight - copyTop - layout.gutter) }
    const bodyResult = layoutColumnMTS(preparedBody, { segmentIndex: 0, graphemeIndex: 0 }, bodyRegion, lineHeight, [claudeObstacle, openaiObstacle], 'left')
    return { pageLayout: layout, headlineLines, creditLeft, creditTop, leftLines: bodyResult.lines, rightLines: [] }
  }

  const leftRegion: Rect = { x: layout.gutter, y: copyTop, width: layout.columnWidth, height: layout.pageHeight - copyTop - layout.gutter }
  const rightRegion: Rect = { x: layout.gutter + layout.columnWidth + layout.centerGap, y: layout.headlineRegion.y, width: layout.columnWidth, height: layout.pageHeight - layout.headlineRegion.y - layout.gutter }
  const titleObstacle: BandObstacle = { kind: 'rects', rects: headlineRects, horizontalPadding: Math.round(lineHeight * 0.95), verticalPadding: Math.round(lineHeight * 0.3) }
  const leftResult = layoutColumnMTS(preparedBody, { segmentIndex: 0, graphemeIndex: 0 }, leftRegion, lineHeight, [openaiObstacle], 'left')
  const rightResult = layoutColumnMTS(preparedBody, leftResult.cursor, rightRegion, lineHeight, [titleObstacle, claudeObstacle, openaiObstacle], 'right')

  return { pageLayout: layout, headlineLines, creditLeft, creditTop, leftLines: leftResult.lines, rightLines: rightResult.lines }
}

export function computeCreditWidth(creditFont: string): number {
  'main thread'
  const prepared = getPreparedMTS(CREDIT_TEXT, creditFont)
  return Math.ceil(getPreparedSingleLineWidth(prepared))
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npx tsc --noEmit`

Note: `with { runtime: 'shared' }` import attributes may need TypeScript 5.3+ and `"module": "esnext"` in tsconfig. If TS errors on the syntax, check tsconfig `"moduleResolution"` and possibly add `"ignoreDeprecations": "5.0"`.

- [ ] **Step 3: Commit**

```bash
git add pages/demos/mts/editorial-layout.ts
git commit -m "feat: add MTS editorial layout computation module"
```

---

### Task 3: React shell with element pool

**Files:**
- Create: `pages/demos/dynamic-layout-mts.tsx`
- Modify: `lynx.config.ts` (add entry)

- [ ] **Step 1: Add entry to lynx.config.ts**

Add to the `source.entry` object:
```ts
'dynamic-layout-mts': './pages/demos/dynamic-layout-mts.tsx',
```

- [ ] **Step 2: Create the MTS demo page**

This is the main file. Key architecture:
- React renders a fixed pool of `<view>/<text>` pairs, all with `main-thread:ref`
- Initial layout computed on BTS (React render), populating the pool
- Tap triggers MTS animation loop that directly updates pool elements
- `runOnMainThread` kicks off the initial MTS-side prepare cache warmup

```tsx
// pages/demos/dynamic-layout-mts.tsx
import { root, useState, useCallback, useEffect, useMainThreadRef, runOnMainThread } from '@lynx-js/react'
import type { MainThread } from '@lynx-js/types'
import { BODY_COPY } from './dynamic-layout-text'
import openaiLogoSrc from '../assets/openai-symbol.png'
import claudeLogoSrc from '../assets/claude-symbol.png'
import {
  BODY_FONT,
  BODY_FONT_SIZE,
  BODY_LINE_HEIGHT,
  CREDIT_FONT,
  CREDIT_LINE_HEIGHT,
  CREDIT_TEXT,
  MAX_HEADLINE_LINES,
  MAX_BODY_LINES,
  SPIN_DURATION,
} from './mts/editorial-constants'
import {
  buildLayoutMTS,
  evaluateLayoutMTS,
  computeCreditWidth,
  getPreparedMTS,
} from './mts/editorial-layout'

// Pool sizes
const HEADLINE_POOL = MAX_HEADLINE_LINES  // 5
const BODY_POOL = MAX_BODY_LINES          // 60

export function DynamicLayoutMTSPage() {
  const [pageWidth, setPageWidth] = useState(400)
  const [pageHeight, setPageHeight] = useState(700)

  const onLayout = useCallback((e: any) => {
    setPageWidth(Math.floor(e.detail.width))
    setPageHeight(Math.floor(e.detail.height))
  }, [])

  // --- Element pool refs ---
  // Headline pool: view + text pairs
  const hViewRefs: ReturnType<typeof useMainThreadRef<MainThread.Element>>[] = []
  const hTextRefs: ReturnType<typeof useMainThreadRef<MainThread.Element>>[] = []
  for (let i = 0; i < HEADLINE_POOL; i++) {
    hViewRefs.push(useMainThreadRef<MainThread.Element>(null))
    hTextRefs.push(useMainThreadRef<MainThread.Element>(null))
  }

  // Credit ref
  const creditViewRef = useMainThreadRef<MainThread.Element>(null)

  // Body pool (left + right combined)
  const bViewRefs: ReturnType<typeof useMainThreadRef<MainThread.Element>>[] = []
  const bTextRefs: ReturnType<typeof useMainThreadRef<MainThread.Element>>[] = []
  for (let i = 0; i < BODY_POOL; i++) {
    bViewRefs.push(useMainThreadRef<MainThread.Element>(null))
    bTextRefs.push(useMainThreadRef<MainThread.Element>(null))
  }

  // Logo refs
  const openaiLogoRef = useMainThreadRef<MainThread.Element>(null)
  const claudeLogoRef = useMainThreadRef<MainThread.Element>(null)

  // Animation state (all on MTS)
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

  // Sync page dimensions to MTS on change
  // (We use runOnMainThread to push BTS state to MTS refs)
  // NOTE: This is a simplified approach — in production you'd use
  // a main-thread:bindlayoutchange handler instead

  // --- MTS animation functions ---

  // Apply a full layout to the element pool
  function applyLayoutToPool(): void {
    'main thread'
    const layout = evaluateLayoutMTS(
      buildLayoutMTS(pageWidthMT.current, pageHeightMT.current, BODY_LINE_HEIGHT),
      BODY_LINE_HEIGHT,
      BODY_COPY,
      BODY_FONT,
      creditWidthMT.current,
      openaiAngleMT.current,
      claudeAngleMT.current,
    )

    // Position headline lines
    for (let i = 0; i < HEADLINE_POOL; i++) {
      const view = hViewRefs[i]!.current
      if (!view) continue
      if (i < layout.headlineLines.length) {
        const line = layout.headlineLines[i]!
        view.setStyleProperty('display', 'flex')
        view.setStyleProperty('left', `${line.x}px`)
        view.setStyleProperty('top', `${line.y}px`)
        view.setStyleProperty('height', `${layout.pageLayout.headlineLineHeight}px`)
        const text = hTextRefs[i]!.current
        if (text) {
          text.setStyleProperty('font-size', `${layout.pageLayout.headlineFontSize}px`)
          text.setAttribute('textContent', line.text)
        }
      } else {
        view.setStyleProperty('display', 'none')
      }
    }

    // Position credit
    if (creditViewRef.current) {
      creditViewRef.current.setStyleProperty('left', `${layout.creditLeft}px`)
      creditViewRef.current.setStyleProperty('top', `${layout.creditTop}px`)
    }

    // Position body lines (left then right, sequentially in the pool)
    const allBodyLines = layout.leftLines.concat(layout.rightLines)
    for (let i = 0; i < BODY_POOL; i++) {
      const view = bViewRefs[i]!.current
      if (!view) continue
      if (i < allBodyLines.length) {
        const line = allBodyLines[i]!
        view.setStyleProperty('display', 'flex')
        view.setStyleProperty('left', `${line.x}px`)
        view.setStyleProperty('top', `${line.y}px`)
        const text = bTextRefs[i]!.current
        if (text) text.setAttribute('textContent', line.text)
      } else {
        view.setStyleProperty('display', 'none')
      }
    }

    // Position logos
    if (openaiLogoRef.current) {
      openaiLogoRef.current.setStyleProperty('left', `${layout.pageLayout.openaiRect.x}px`)
      openaiLogoRef.current.setStyleProperty('top', `${layout.pageLayout.openaiRect.y}px`)
      openaiLogoRef.current.setStyleProperty('width', `${layout.pageLayout.openaiRect.width}px`)
      openaiLogoRef.current.setStyleProperty('height', `${layout.pageLayout.openaiRect.height}px`)
      openaiLogoRef.current.setStyleProperty('transform', `rotate(${openaiAngleMT.current * 180 / Math.PI}deg)`)
    }
    if (claudeLogoRef.current) {
      claudeLogoRef.current.setStyleProperty('left', `${layout.pageLayout.claudeRect.x}px`)
      claudeLogoRef.current.setStyleProperty('top', `${layout.pageLayout.claudeRect.y}px`)
      claudeLogoRef.current.setStyleProperty('width', `${layout.pageLayout.claudeRect.width}px`)
      claudeLogoRef.current.setStyleProperty('height', `${layout.pageLayout.claudeRect.height}px`)
      claudeLogoRef.current.setStyleProperty('transform', `rotate(${claudeAngleMT.current * 180 / Math.PI}deg)`)
    }
  }

  // rAF spin loop — reflows text every frame
  function spinTick(_ts: number): void {
    'main thread'
    const now = Date.now()
    let still = false

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

    // Full reflow every frame — this is the whole point of MTS
    applyLayoutToPool()

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

  // Initialize MTS-side cache + apply first layout
  function initMTS(): void {
    'main thread'
    // Warm up MTS-side pretext cache
    getPreparedMTS(BODY_COPY, BODY_FONT)
    getPreparedMTS(CREDIT_TEXT, CREDIT_FONT)
    creditWidthMT.current = computeCreditWidth(CREDIT_FONT)
    // Apply initial layout
    applyLayoutToPool()
  }

  // Sync dimensions to MTS and re-layout
  function syncDimensionsMTS(w: number, h: number): void {
    'main thread'
    pageWidthMT.current = w
    pageHeightMT.current = h
    if (!animatingMT.current) applyLayoutToPool()
  }

  useEffect(() => {
    void runOnMainThread(initMTS)()
  }, [])

  useEffect(() => {
    void runOnMainThread(syncDimensionsMTS)(pageWidth, pageHeight)
  }, [pageWidth, pageHeight])

  // --- Render: fixed pool of elements ---
  return (
    <view style={{ width: '100%', height: '100%', backgroundColor: '#f6f0e6' }} bindlayoutchange={onLayout}>
      <view style={{ width: `${pageWidth}px`, height: `${pageHeight}px`, overflow: 'hidden', backgroundColor: '#f6f0e6' }}>

        {/* Headline pool */}
        {Array.from({ length: HEADLINE_POOL }, (_, i) => (
          <view key={`h-${i}`} main-thread:ref={hViewRefs[i]} style={{ position: 'absolute', display: 'none' }}>
            <text main-thread:ref={hTextRefs[i]} style={{ fontWeight: 'bold', color: '#11100d' }}> </text>
          </view>
        ))}

        {/* Credit line */}
        <view main-thread:ref={creditViewRef} style={{ position: 'absolute', height: `${CREDIT_LINE_HEIGHT}px` }}>
          <text style={{ fontSize: '12px', color: 'rgba(17, 16, 13, 0.58)', letterSpacing: '2px' }}>{CREDIT_TEXT}</text>
        </view>

        {/* Body line pool */}
        {Array.from({ length: BODY_POOL }, (_, i) => (
          <view key={`b-${i}`} main-thread:ref={bViewRefs[i]} style={{ position: 'absolute', display: 'none', height: `${BODY_LINE_HEIGHT}px` }}>
            <text main-thread:ref={bTextRefs[i]} style={{ fontSize: `${BODY_FONT_SIZE}px`, color: '#11100d' }}> </text>
          </view>
        ))}

        {/* OpenAI logo */}
        <view main-thread:ref={openaiLogoRef} main-thread:bindtap={handleOpenaiTapMT} style={{ position: 'absolute' }}>
          <image src={openaiLogoSrc} style={{ width: '100%', height: '100%' }} />
        </view>

        {/* Claude logo */}
        <view main-thread:ref={claudeLogoRef} main-thread:bindtap={handleClaudeTapMT} style={{ position: 'absolute' }}>
          <image src={claudeLogoSrc} style={{ width: '100%', height: '100%' }} />
        </view>
      </view>
    </view>
  )
}

root.render(<DynamicLayoutMTSPage />)

if (import.meta.webpackHot) {
  import.meta.webpackHot.accept()
}
```

- [ ] **Step 3: Build and verify**

Run: `pnpm build`
Expected: Build passes, `dist/dynamic-layout-mts.lynx.bundle` is emitted

- [ ] **Step 4: Commit**

```bash
git add pages/demos/dynamic-layout-mts.tsx lynx.config.ts
git commit -m "feat: add dynamic-layout-mts demo with main-thread text reflow"
```

---

### Task 4: Test on device and fix text content update

**Files:**
- Possibly modify: `pages/demos/dynamic-layout-mts.tsx` or `pages/demos/mts/editorial-layout.ts`

The biggest unknown is how to update `<text>` content from main thread. `setAttribute('textContent', text)` may not work — Lynx's `<text>` may need a different API.

- [ ] **Step 1: Test initial render on device**

Open the demo in LynxExplorer. Check:
1. Does the page render at all?
2. Are headline and body text lines visible?
3. Are logos visible?

- [ ] **Step 2: Test tap animation**

Tap a logo. Check:
1. Does it rotate smoothly?
2. Does text reflow during rotation?
3. Any visible jank?

- [ ] **Step 3: Fix text content update if needed**

If `setAttribute('textContent', text)` doesn't work, try alternatives:
- `element.setAttribute('text', text)`
- `element.setProperty('textContent', text)`
- Check Lynx MainThread.Element API docs for the correct method

This may require reading Lynx source or experimenting. Document what works in a comment.

- [ ] **Step 4: Commit fixes**

```bash
git add -A
git commit -m "fix: correct text content update API for MTS pool elements"
```

---

### Task 5: Polish — controls overlay and dimension sync

**Files:**
- Modify: `pages/demos/dynamic-layout-mts.tsx`

Add the controls overlay (toggle button, W/H steppers, stats) from the original `dynamic-layout.tsx`. This part uses normal React state (BTS) since it's UI chrome, not animated.

- [ ] **Step 1: Add controls overlay**

Copy the toggle button and controls overlay JSX from `dynamic-layout.tsx` into the MTS version. This is normal React — `useState` for `showControls`, `bindtap` handlers for steppers.

- [ ] **Step 2: Verify controls work**

Build, open on device, tap toggle button, change W/H values. Text should re-layout when dimensions change (via `syncDimensionsMTS`).

- [ ] **Step 3: Commit**

```bash
git add pages/demos/dynamic-layout-mts.tsx
git commit -m "feat: add controls overlay to dynamic-layout-mts"
```

---

## Open Questions (to resolve during implementation)

1. **`setAttribute('textContent', ...)` vs what?** — Need to verify the correct MainThread.Element API for changing text content. The flappy bird demo uses `setAttribute('src', ...)` for images but doesn't change text. May need `element.invoke('setText', { text })` or similar.

2. **`with { runtime: 'shared' }` TypeScript support** — Import attributes need TS 5.3+ with `"module": "esnext"`. If TS rejects it, fallback is to mark all pretext functions with `'main thread'` directive directly (like flappy bird does with `mts/*.ts` files). This would mean pretext only runs on MTS, which is actually fine for this demo.

3. **`useMainThreadRef` in loops** — React hooks can't be called in loops. The pool refs need to be declared individually or use a helper pattern. The plan shows arrays but these need to be unrolled at the component level, or use a custom hook that allocates a fixed number of refs.

4. **Performance of full reflow per frame** — `evaluateLayoutMTS` calls `layoutNextLine` ~60 times per frame during animation. On the original browser Pretext, this is ~0.09ms for 500 texts. For our ~60 lines it should be well under 1ms per frame. But if `getTextInfo` is called during reflow (cache miss on MTS side), it could be slow. The `initMTS` warmup should prevent this.

Plan complete and saved to `docs/superpowers/plans/2026-03-29-dynamic-layout-mts.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?

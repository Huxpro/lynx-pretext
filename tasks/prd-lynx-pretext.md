# PRD: lynx-pretext — Pure JS Text Measurement & Layout for Lynx

## Introduction

Port [chenglou/pretext](https://github.com/chenglou/pretext) to the Lynx runtime, providing a pure-JS text measurement and layout library that bypasses native `<text>` element layout. The library runs entirely on Lynx's **main thread**, using `lynx.getTextInfo()` as the measurement primitive (replacing Canvas `measureText`), and performs line breaking with pure arithmetic on cached segment widths.

The project lives at `huxpro/lynx-pretext`, a single Rspeedy project with the library source and multiple demo entries. Each Pretext API example and page-level demo must be reproducible on a Lynx page.

### Why this matters on Lynx

Lynx's native `<text>` layout happens inside the platform's layout engine. Every time text content or container width changes, the engine re-measures and re-lays out. lynx-pretext enables:

- **Virtualization without guesstimates** — know the exact height of off-screen text blocks before creating elements
- **JS-driven custom layouts** — masonry, chat bubble shrinkwrap, multi-column text flow around obstacles — impossible with declarative `<text>` alone
- **Resize hot-path** — after a one-time `prepare()`, relayout at any width is ~0.0002ms per block, pure JS, zero native calls

### Architecture (mirroring Pretext)

```
Phase 1: prepare(text, font)          ← one-time, calls native getTextInfo per segment
  ┌──────────────────────────────┐
  │ analysis.ts                  │  Intl.Segmenter (polyfill) → segment stream
  │   whitespace normalization   │  punctuation merge, CJK kinsoku, URL merge, etc.
  ├──────────────────────────────┤
  │ measurement.ts               │  lynx.getTextInfo() per segment → width cache
  │   Map<font, Map<seg, width>> │  (replaces Canvas measureText)
  └──────────────────────────────┘

Phase 2: layout(prepared, maxWidth, lineHeight)    ← pure arithmetic, zero native calls
  ┌──────────────────────────────┐
  │ line-break.ts                │  walk cached widths, count lines, compute height
  │   overflow-wrap: break-word  │  trailing whitespace hangs, grapheme-level breaking
  └──────────────────────────────┘
```

**Key adaptation**: Browser Pretext uses `CanvasRenderingContext2D.measureText()`. lynx-pretext uses `lynx.getTextInfo(segment, { fontSize, fontFamily })` called from main-thread JS, which is a synchronous local call with no cross-thread bridge overhead.

## Goals

- Provide the same public API as `@chenglou/pretext`: `prepare`, `layout`, `prepareWithSegments`, `layoutWithLines`, `walkLineRanges`, `layoutNextLine`, `clearCache`, `setLocale`
- All code executes on Lynx main thread
- Reproduce every README API example as a runnable Lynx page
- Reproduce the Bubbles shrinkwrap demo and Dynamic Layout editorial demo on Lynx
- Accuracy target: match Lynx native `<text>` layout results (line count, height) for the same text/font/width inputs
- MVP font support: `fontSize` + `fontFamily` only (document limitations)
- English fast-path: space-based splitting for maximum performance; other languages via `@formatjs/intl-segmenter` polyfill

## User Stories

### US-001: Project Scaffolding

**Description:** As a developer, I want a working Rspeedy project skeleton so that I can build the library and run demo entries.

**Acceptance Criteria:**
- [ ] Rspeedy project at `huxpro/lynx-pretext` with TypeScript config
- [ ] `@formatjs/intl-segmenter` installed as dependency
- [ ] Multiple entry points: library source under `src/`, demo pages under `pages/`
- [ ] `rspeedy dev` launches and serves demo entries
- [ ] Verify in Lynx DevTool that a "hello world" page renders

### US-002: Text Analysis (analysis.ts)

**Description:** As the library, I need to segment and preprocess text into a stream of typed segments so that measurement and layout can work on them.

**Acceptance Criteria:**
- [ ] Port `analysis.ts` from Pretext with the following adaptations:
  - English fast-path: split on whitespace/punctuation boundaries without `Intl.Segmenter`
  - Other languages: use `@formatjs/intl-segmenter` polyfill for word segmentation
- [ ] All 8 segment break kinds preserved: `text`, `space`, `preserved-space`, `tab`, `glue`, `zero-width-break`, `soft-hyphen`, `hard-break`
- [ ] Whitespace normalization for both `normal` and `pre-wrap` modes
- [ ] Punctuation merging into preceding word segments
- [ ] CJK kinsoku (line-start/end prohibition) handling
- [ ] URL-like run merging
- [ ] Numeric run merging
- [ ] NBSP/ZWSP/soft-hyphen segment classification
- [ ] Unit test: `analyzeText("hello world", ...)` produces expected segment stream

### US-003: Text Measurement (measurement.ts)

**Description:** As the library, I need to measure segment widths via Lynx's native text engine so that layout can compute line breaks accurately.

**Acceptance Criteria:**
- [ ] Replace `CanvasRenderingContext2D.measureText()` with `lynx.getTextInfo(segment, { fontSize, fontFamily })`
- [ ] All `getTextInfo` calls happen on Lynx main thread (synchronous, no bridge overhead)
- [ ] Segment metrics cache: `Map<font, Map<segment, SegmentMetrics>>`
- [ ] `getCorrectedSegmentWidth()` — initially no emoji correction needed (Lynx doesn't have Canvas/DOM emoji mismatch), but keep the correction interface for future use
- [ ] `getSegmentGraphemeWidths()` for overflow-wrap breakable segments
- [ ] `getFontMeasurementState(font)` returns cache + correction state
- [ ] `clearMeasurementCaches()` works
- [ ] `parseFontSize(font)` extracts px size from font string
- [ ] Unit test: measure "hello" at "16px Inter" returns a plausible positive width

### US-004: Line Breaking Engine (line-break.ts)

**Description:** As the library, I need pure-arithmetic line breaking that walks cached segment widths to count lines and compute positions.

**Acceptance Criteria:**
- [ ] Port `line-break.ts` from Pretext — this file is pure JS arithmetic with zero platform dependencies, should port 1:1
- [ ] Simple fast-path for normal text (only text + space + zero-width-break segments)
- [ ] Full path for soft-hyphen, tab, hard-break, pre-wrap modes
- [ ] Trailing whitespace hangs past line edge (CSS behavior)
- [ ] Words wider than maxWidth break at grapheme boundaries
- [ ] `countPreparedLines()` returns correct line count
- [ ] `walkPreparedLines()` calls back with each line's range and width
- [ ] `layoutNextLineRange()` returns one line at a time for streaming layout

### US-005: Public API (layout.ts)

**Description:** As a Lynx developer, I want the same API surface as Pretext so that code using the library looks identical.

**Acceptance Criteria:**
- [ ] `prepare(text, font, options?)` → opaque `PreparedText`
- [ ] `layout(prepared, maxWidth, lineHeight)` → `{ height, lineCount }`
- [ ] `prepareWithSegments(text, font, options?)` → `PreparedTextWithSegments` with `.segments`
- [ ] `layoutWithLines(prepared, maxWidth, lineHeight)` → `{ height, lineCount, lines }`
- [ ] `walkLineRanges(prepared, maxWidth, onLine)` → line count, calls back with `{ width, start, end }`
- [ ] `layoutNextLine(prepared, start, maxWidth)` → `LayoutLine | null`
- [ ] `clearCache()` resets all internal caches
- [ ] `setLocale(locale?)` retargets the word segmenter
- [ ] `{ whiteSpace: 'pre-wrap' }` option works for preserved spaces/tabs/newlines
- [ ] Types exported: `PreparedText`, `PreparedTextWithSegments`, `LayoutCursor`, `LayoutResult`, `LayoutLine`, `LayoutLineRange`, `LayoutLinesResult`

### US-006: Demo — Basic Height Measurement

**Description:** As a developer, I want to see the simplest use case: measure a paragraph's height without touching any layout element.

Corresponds to Pretext README example 1:
```ts
const prepared = prepare('AGI 春天到了. بدأت الرحلة 🚀', '16px Inter')
const { height, lineCount } = layout(prepared, textWidth, 20)
```

**Acceptance Criteria:**
- [ ] Lynx page entry `pages/basic-height.ts` (or `.tsx`)
- [ ] Displays a text block using `<text>` element
- [ ] Next to it (or below), shows the pretext-computed `height` and `lineCount`
- [ ] A slider or input changes `maxWidth`, pretext recomputes height in real time
- [ ] Side-by-side comparison: native `<text>` actual height vs pretext-computed height
- [ ] Verify in Lynx DevTool that values match (or document discrepancies)

### US-007: Demo — layoutWithLines

**Description:** As a developer, I want to see manual line layout: getting all lines at a fixed width and rendering them individually.

Corresponds to Pretext README example 2 (`layoutWithLines`):
```ts
const { lines } = layoutWithLines(prepared, 320, 26)
for (let i = 0; i < lines.length; i++) ctx.fillText(lines[i].text, 0, i * 26)
```

**Acceptance Criteria:**
- [ ] Lynx page entry `pages/layout-with-lines.ts`
- [ ] Uses `prepareWithSegments` + `layoutWithLines` to get line array
- [ ] Renders each line as an individual `<text>` element positioned absolutely
- [ ] Shows line text, line width, and line index for each line
- [ ] Changing maxWidth (via slider) triggers only `layoutWithLines` (not re-prepare), updating lines in real time

### US-008: Demo — walkLineRanges (Shrinkwrap Width)

**Description:** As a developer, I want to compute the tightest container width (multiline shrinkwrap) — a capability missing from Lynx's native layout.

Corresponds to Pretext README example 3 (`walkLineRanges`):
```ts
let maxW = 0
walkLineRanges(prepared, 320, line => { if (line.width > maxW) maxW = line.width })
```

**Acceptance Criteria:**
- [ ] Lynx page entry `pages/shrinkwrap.ts`
- [ ] Shows a text block at a given maxWidth
- [ ] Computes and displays the shrinkwrap width (widest line across all lines)
- [ ] Visual: two containers side by side — one at maxWidth (CSS default), one at shrinkwrap width (tighter)
- [ ] The pixel difference (wasted space) is shown numerically

### US-009: Demo — layoutNextLine (Variable-Width Flow)

**Description:** As a developer, I want to flow text one line at a time with different widths per line, enabling text wrapping around obstacles.

Corresponds to Pretext README example 4 (`layoutNextLine`):
```ts
let cursor = { segmentIndex: 0, graphemeIndex: 0 }
while (true) {
  const width = y < image.bottom ? columnWidth - image.width : columnWidth
  const line = layoutNextLine(prepared, cursor, width)
  if (line === null) break
  cursor = line.end
  y += 26
}
```

**Acceptance Criteria:**
- [ ] Lynx page entry `pages/variable-flow.ts`
- [ ] Shows text flowing around a rectangular obstacle (e.g. an `<image>` element)
- [ ] Lines beside the image are narrower; lines below it are full width
- [ ] Each line rendered as an individual positioned `<text>` element
- [ ] Moving or resizing the obstacle causes live reflow (only `layoutNextLine` loop re-runs)

### US-010: Demo — Bubbles Shrinkwrap Chat

**Description:** As a developer, I want the chat bubble demo showing per-bubble shrinkwrap — each message bubble is tightened to its widest line, eliminating wasted whitespace.

This is a port of Pretext's `pages/demos/bubbles.ts` + `bubbles-shared.ts`.

**Acceptance Criteria:**
- [ ] Lynx page entry `pages/demos/bubbles.ts`
- [ ] Multiple chat message bubbles displayed
- [ ] Each bubble uses `walkLineRanges` to find shrinkwrap width, then binary-search via `layout` to find minimum width that doesn't increase line count
- [ ] Slider to change chat container width, bubbles reflow live
- [ ] Shows wasted pixels comparison: CSS maxWidth vs shrinkwrap width
- [ ] Verify in Lynx DevTool that bubbles visually shrinkwrap correctly

### US-011: Demo — Dynamic Editorial Layout

**Description:** As a developer, I want the editorial spread demo: fixed-height two-column layout with text flowing around rotatable logo obstacles.

This is a port of Pretext's `pages/demos/dynamic-layout.ts`.

**Acceptance Criteria:**
- [ ] Lynx page entry `pages/demos/dynamic-layout.ts`
- [ ] Headline text with font-size binary-search fitting (no mid-word breaks)
- [ ] Body text flows left column → right column via `layoutNextLine` cursor continuity
- [ ] Right column routes around headline geometry and logo obstacle
- [ ] Left column routes around logo obstacle
- [ ] Tap on logo triggers rotation animation, text reflows live around rotated geometry
- [ ] Viewport resize changes column layout and triggers full reflow
- [ ] Adapt DOM manipulation to Lynx element creation (replace `document.createElement` with Lynx main-thread element APIs or ReactLynx components)
- [ ] Verify in Lynx DevTool that layout looks correct

### US-009 (moved up): Line-by-Line Accuracy Validation

**Description:** As a developer, I want to verify that lynx-pretext's line breaking matches `getTextInfo`'s native line breaking by comparing per-line text content. This runs **before** any demos to catch bugs early.

**Verification Oracle:**
```ts
// Native oracle: getTextInfo does its own line breaking
const native = lynx.getTextInfo(text, { fontSize, fontFamily, maxWidth })
// native.content = ['line 1 text', 'line 2 text', ...]

// Our implementation
const { lines } = layoutWithLines(prepared, maxWidthPx, lineHeight)
// Compare: native.content[i].trim() === lines[i].text.trim()
```

**Acceptance Criteria:**
- [ ] Lynx page entry `pages/accuracy.tsx`
- [ ] Corpus of ~20 diverse texts (English, CJK, mixed, emoji, long words, short text)
- [ ] For each text at 10 widths: line-by-line text comparison (native `content[i]` vs our `lines[i].text`)
- [ ] Also compare line count and single-line total width
- [ ] Per-text pass/fail with first divergent line highlighted on mismatch
- [ ] Overall pass rate displayed; target > 90% for English
- [ ] Mismatch log: text, width, expected line, actual line (for debugging)
- [ ] Document systematic discrepancies (segment-sum vs whole-text shaping, trailing space handling)

## Functional Requirements

- **FR-1:** `prepare()` must call `lynx.getTextInfo()` on main thread for each segment to obtain width. The call is `lynx.getTextInfo(segmentText, { fontSize: '...px', fontFamily: '...' })`.
- **FR-2:** `prepare()` must parse the `font` string parameter to extract `fontSize` and `fontFamily` for `getTextInfo`. For MVP, support `"16px Inter"` and `"700 20px Palatino"` style strings (weight is parsed but ignored by getTextInfo).
- **FR-3:** English text segmentation fast-path: split on space boundaries and punctuation, apply Pretext's merge rules. No `Intl.Segmenter` needed.
- **FR-4:** Non-English text segmentation: use `@formatjs/intl-segmenter` polyfill with `granularity: 'word'`.
- **FR-5:** Grapheme segmentation (for overflow-wrap breaking): use `@formatjs/intl-segmenter` polyfill with `granularity: 'grapheme'`.
- **FR-6:** `layout()` must perform zero native calls — pure arithmetic on cached widths only.
- **FR-7:** Segment width cache must be shared across texts with the same font, and clearable via `clearCache()`.
- **FR-8:** All demo pages must run inside a Lynx runtime. DOM APIs (`document.createElement`, `document.getElementById`, etc.) must be replaced with Lynx equivalents (main-thread element APIs, or ReactLynx components where appropriate).
- **FR-9:** The `pre-wrap` whitespace mode must preserve ordinary spaces, tabs (`tab-size: 8` equivalent), and `\n` hard breaks.
- **FR-10:** Emoji correction: initially set to 0 (Lynx's `getTextInfo` and native `<text>` should agree on emoji widths). If accuracy testing reveals a systematic emoji width mismatch, add a calibration step similar to Pretext's DOM-vs-canvas comparison.

## Non-Goals

- **No server-side rendering** — Lynx is a client runtime
- **No SVG/WebGL rendering** — demo rendering uses Lynx `<text>` and `<view>` elements
- **No `fontWeight` / `letterSpacing` / `fontStyle` support** — `getTextInfo` doesn't accept these. Document as known limitation.
- **No custom `@font-face` fonts** — `getTextInfo` only supports built-in fonts. Document as limitation.
- **No bidi rendering metadata** — the `segLevels` / bidi path is skipped for MVP (layout correctness for mixed LTR/RTL text is preserved since line breaking doesn't use bidi levels, but custom RTL rendering metadata is not computed)
- **No browser accuracy parity** — we target Lynx native `<text>` as ground truth, not browser CSS layout
- **No benchmark infrastructure** — performance comparisons are out of scope for MVP; the architecture inherently provides the same O(1)-resize benefit as browser Pretext

## Technical Considerations

### Platform Adaptation

| Browser Pretext | lynx-pretext |
|---|---|
| `CanvasRenderingContext2D.measureText()` | `lynx.getTextInfo(text, { fontSize, fontFamily })` |
| `document.createElement('span')` for emoji calibration | Skip for MVP (or use `<text>` element layout event if needed) |
| `Intl.Segmenter` (native) | `@formatjs/intl-segmenter` polyfill; English fast-path skips it |
| DOM elements for rendering | Lynx `<text>`, `<view>`, `<image>` elements |
| `requestAnimationFrame` | Lynx main-thread `requestAnimationFrame` equivalent (or timer-based) |
| `window.addEventListener('resize')` | Lynx viewport change events |
| CSS styling | Lynx inline styles or stylesheet |

### Font String Parsing

Pretext accepts CSS `font` shorthand strings like `"16px Inter"` or `"700 20px 'Helvetica Neue'"`. We need a parser to extract:
- `fontSize` → string like `"16px"` for getTextInfo
- `fontFamily` → string like `"Inter"` for getTextInfo
- `fontWeight` → parsed but ignored (logged as warning)

### Engine Profile

Pretext has browser-specific engine profiles (Safari vs Chrome epsilon, soft-hyphen behavior, etc.). For Lynx:
- Single profile — no need for UA sniffing
- `lineFitEpsilon` needs calibration against Lynx's native `<text>` behavior
- `carryCJKAfterClosingQuote`, `preferPrefixWidthsForBreakableRuns`, `preferEarlySoftHyphenBreak` — start with defaults, tune based on accuracy testing

### Demo Rendering Strategy

Pretext's demos manipulate DOM elements directly. On Lynx, two approaches:

1. **Main-thread imperative API** — create and position elements using Lynx's main-thread element manipulation APIs. Closest to original Pretext code structure.
2. **ReactLynx components** — wrap the layout engine in React components. Better developer ergonomics, but requires bridging between main-thread measurement and React rendering.

**Recommendation:** Start with approach 1 (closest to original), consider wrapping in React components later.

### Lynx DevTool Verification

Each demo should be verifiable using `lynx-devtool` skills:
- Connect to running Lynx app
- Inspect element positions and sizes
- Compare native `<text>` layout vs pretext-computed layout
- Screenshot comparison for visual verification

### Dependencies

- `@anthropic-ai/anthropic-sdk` — NOT needed
- `@formatjs/intl-segmenter` — polyfill for `Intl.Segmenter`
- `@anthropic/rspeedy` (or equivalent Rspeedy toolchain) — build system
- `react` + `@anthropic/react-lynx` — only if demo rendering uses ReactLynx

## Success Metrics

- All 6 public API functions (`prepare`, `layout`, `prepareWithSegments`, `layoutWithLines`, `walkLineRanges`, `layoutNextLine`) work correctly on Lynx main thread
- All 4 README API examples (basic height, layoutWithLines, walkLineRanges, layoutNextLine) are runnable as Lynx demo pages
- Bubbles shrinkwrap demo runs on Lynx with interactive width slider
- Dynamic editorial layout demo runs on Lynx with obstacle avoidance and tap-to-rotate
- Height accuracy vs native `<text>`: > 95% match rate on a 20-text corpus at 10 widths each, using built-in fonts

## Open Questions

1. **Does Lynx's `<canvas>` element support `measureText()`?** If yes, it would be a more direct port path than `getTextInfo` — same API, potentially faster for batch measurement. Worth investigating before committing to `getTextInfo`.
2. **What is Lynx main thread's `requestAnimationFrame` equivalent?** The dynamic-layout demo relies on rAF for animation. Need to verify main-thread animation scheduling API.
3. **How to read actual `<text>` element height from main thread?** For accuracy validation, we need to compare pretext output against native layout. Options: `layout` event callback, `getTextInfo` with maxWidth, or `boundingClientRect` from main thread.
4. **`lineFitEpsilon` value for Lynx** — needs empirical calibration. Start with 0.005 (Chromium default) and adjust based on accuracy test results.
5. **Lynx main-thread element creation API** — need to confirm the exact API for imperatively creating and positioning `<text>` / `<view>` elements from main-thread scripts, especially for the dynamic-layout demo which creates/removes elements each frame.
6. **`@formatjs/intl-segmenter` bundle size and performance** — verify that the polyfill is acceptable for the Lynx bundle. If too large, consider a lighter segmentation approach for MVP.

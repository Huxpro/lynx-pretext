# Editorial MTS Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a new `editorial-mts` Lynx demo that shows a fixed editorial header plus a main-thread-driven body text region that wraps around three floating, draggable circles.

**Architecture:** Add a new `pages/demos/editorial-mts.tsx` entry that pre-renders fixed text/orb pools and runs the hot path on Main Thread Script. BTS only forwards viewport size; MTS owns orb motion, drag state, region geometry, line layout, and direct element mutation through `main-thread:ref`.

**Tech Stack:** ReactLynx, Main Thread Script, `useMainThreadRef`, `runOnMainThread`, `requestAnimationFrame`, `src/layout` pretext APIs, `pages/demos/wrap-geometry.ts`

---

## File Structure

- `pages/demos/editorial-mts.tsx`
  Responsibility: New demo entry with constants, content, main-thread layout helpers, element pools, orb animation, touch drag handling, and root render.
- `lynx.config.ts`
  Responsibility: Register the `editorial-mts` page bundle.
- `docs/superpowers/plans/2026-03-29-editorial-mts.md`
  Responsibility: Execution record for this feature.

## Verification Strategy

This repo does not have a dedicated UI unit-test harness, so the red/green loop for this feature uses:

- a failing bundle registration or type/build check to prove the missing page is not implemented yet
- `tsc --build` for type safety
- `pnpm build` for bytecode/build validation
- Lynx DevTool screenshot capture for runtime confirmation

---

### Task 1: Add the New Page Entry and Create the Failing State

**Files:**
- Modify: `lynx.config.ts`
- Create: `pages/demos/editorial-mts.tsx`

- [ ] **Step 1: Register the new entry before the page exists**

Add the new entry key to `source.entry` in `lynx.config.ts`:

```ts
      'editorial-mts': './pages/demos/editorial-mts.tsx',
```

- [ ] **Step 2: Run build to verify the new page is still missing**

Run: `pnpm build`
Expected: FAIL with a module resolution error for `./pages/demos/editorial-mts.tsx`

- [ ] **Step 3: Create the initial page shell**

Create a minimal file so the entry resolves and the later tasks have a concrete target:

```tsx
import { root } from '@lynx-js/react'

function EditorialMTSPage() {
  return <view style={{ flex: 1, backgroundColor: '#0c0c10' }} />
}

root.render(<EditorialMTSPage />)

if (import.meta.webpackHot) {
  import.meta.webpackHot.accept()
}
```

- [ ] **Step 4: Run typecheck to verify the shell is valid**

Run: `tsc --build`
Expected: PASS

---

### Task 2: Implement the Fixed Header, Dynamic Body Pools, and MTS Layout Engine

**Files:**
- Modify: `pages/demos/editorial-mts.tsx`

- [ ] **Step 1: Replace the shell with page constants, content, and pools**

Add:

- fixed header copy (`HEADLINE_TEXT`, `CREDIT_TEXT`, `INTRO_TEXT`)
- dynamic body copy (the editorial body text)
- pool sizes for headline, intro, and body lines
- orb definitions for exactly 3 circles
- `useMainThreadRef` pools for headline lines, credit, intro lines, body lines, and orb layers

Use this structure at the top of the file:

```tsx
const BODY_FONT_SIZE = 16
const BODY_FONT = `${BODY_FONT_SIZE}px "Palatino Linotype", Palatino, serif`
const BODY_LINE_HEIGHT = 26
const HEADLINE_FONT_FAMILY = '"Palatino Linotype", Palatino, serif'
const CREDIT_TEXT = 'Zero DOM reads · Main thread text flow'
const CREDIT_LINE_HEIGHT = 16
const INTRO_TEXT = 'A fixed editorial header sits above a live body-text field. Drag the glowing circles to force the body text to route around them in real time.'
const INTRO_FONT_SIZE = 14
const INTRO_LINE_HEIGHT = 22
const HEADLINE_TEXT = 'THE EDITORIAL ENGINE'

const HEADLINE_POOL = 4
const INTRO_POOL = 8
const BODY_POOL = 84

const ORB_DEFS = [
  { fx: 0.72, fy: 0.16, r: 46, vx: 18, vy: 14, color: '#c4a35a' },
  { fx: 0.24, fy: 0.36, r: 38, vx: -16, vy: 20, color: '#648cff' },
  { fx: 0.58, fy: 0.62, r: 42, vx: 14, vy: -18, color: '#e86482' },
] as const
```

- [ ] **Step 2: Add pure helper functions before the component**

Implement:

- `circleIntervalForBand()`
- `fitHeadline()`
- `layoutFixedBlock()`
- `layoutEditorialBody()`
- `clampOrbToBody()`

The body helper must use `layoutNextLine()` plus `carveTextLineSlots()` and support two-slot fill when both remaining slots are viable:

```ts
const orderedSlots = slots
  .filter(slot => slot.right - slot.left >= MIN_SLOT_WIDTH)
  .sort((a, b) => a.left - b.left)

const useAllSlots = orderedSlots.length > 1 &&
  orderedSlots.every(slot => slot.right - slot.left >= MULTI_SLOT_WIDTH)

const lineSlots = useAllSlots
  ? orderedSlots
  : [orderedSlots.reduce((best, slot) => {
      const bestWidth = best.right - best.left
      const slotWidth = slot.right - slot.left
      return slotWidth > bestWidth ? slot : best
    })]
```

- [ ] **Step 3: Add the MTS state and layout application pipeline**

Inside the component, add:

- viewport state: `pageWidth`, `pageHeight`
- MTS prepared-text cache via `useMainThreadRef(new Map())`
- orb state refs (`orbsMT`, drag refs, animation refs)
- geometry refs for `bodyRegion`
- `applyEditorialLayoutMT()` to compute header/body lines and mutate the pools
- `tickMT()` that updates orbs and then calls `applyEditorialLayoutMT()`

Use direct mutation on the text nodes:

```ts
textRef.current?.setAttribute('textContent', line.text)
viewRef.current?.setStyleProperties({
  display: 'flex',
  left: `${line.x}px`,
  top: `${line.y}px`,
})
```

- [ ] **Step 4: Add MTS touch handlers for drag and pause**

Bind main-thread touch handlers on the root container:

```tsx
<view
  style={{ flex: 1, backgroundColor: '#0c0c10', overflow: 'hidden' }}
  bindlayoutchange={onLayout}
  main-thread:bindtouchstart={handleTouchStartMT}
  main-thread:bindtouchmove={handleTouchMoveMT}
  main-thread:bindtouchend={handleTouchEndMT}
  main-thread:bindtouchcancel={handleTouchEndMT}
>
```

Handler behavior:

- touch-start: hit test circles and capture drag origin
- touch-move: update dragged orb position, clamp to body region, reflow immediately
- touch-end: if movement is tiny, toggle `paused`; otherwise keep the final position and resume animation

- [ ] **Step 5: Render the pooled structure**

The final JSX must include:

- headline line pool
- credit element
- intro line pool
- body line pool
- 3 orb layers

The orb visuals can use one aura view plus one core view per orb:

```tsx
<view main-thread:ref={orbGlowRefs[i]} style={{ position: 'absolute', opacity: '0.28' }} />
<view main-thread:ref={orbCoreRefs[i]} style={{ position: 'absolute', opacity: '0.88' }} />
```

- [ ] **Step 6: Run typecheck to verify the full page compiles**

Run: `tsc --build`
Expected: PASS

---

### Task 3: Run Build and Runtime Verification

**Files:**
- Modify: `pages/demos/editorial-mts.tsx` if fixes are needed after verification

- [ ] **Step 1: Run the full bundle build**

Run: `pnpm build`
Expected: PASS

- [ ] **Step 2: Start the dev server**

Run: `pnpm dev`
Expected: server starts and prints a local Lynx URL

- [ ] **Step 3: Open the new page in Lynx DevTool**

Run:

```bash
node /Users/bytedance/.agents/skills/devtool/scripts/index.mjs list-clients
node /Users/bytedance/.agents/skills/devtool/scripts/index.mjs open "http://localhost:3004/editorial-mts.lynx.bundle" --client localhost:8901
```

Expected: the page opens on the connected client

- [ ] **Step 4: Take a screenshot**

Run:

```bash
node /Users/bytedance/.agents/skills/devtool/scripts/index.mjs list-sessions --client localhost:8901
node /Users/bytedance/.agents/skills/devtool/scripts/index.mjs take-screenshot --client localhost:8901 --session <session_id> --output /tmp/screenshot-editorial-mts.png
```

Expected: `/tmp/screenshot-editorial-mts.png` exists and is non-empty

- [ ] **Step 5: Verify the required behaviors manually**

Confirm in the running page:

- header text is fixed
- 3 orbs move without React-driven rerender state
- dragging an orb immediately changes the wrapped body lines
- a tap pauses/resumes an orb through opacity change

- [ ] **Step 6: Stop the dev server**

Run: `pkill -f "rspeedy dev"`
Expected: dev server exits cleanly

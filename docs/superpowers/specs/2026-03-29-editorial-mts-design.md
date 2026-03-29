# Editorial MTS Mobile Demo Design

## Goal

Add a new Lynx demo page at `pages/demos/editorial-mts.tsx` that showcases mobile-first editorial text layout with the hottest path running on Main Thread Script (MTS). The demo must highlight three behaviors clearly:

1. A fixed editorial header region that stays stable.
2. Floating circular obstacles that move on their own and can be dragged directly.
3. A body-text region that reflows around those circles in real time.

The page is a performance demo first, not a full browser-demo clone.

## Product Shape

The mobile page is split into two text zones:

- A fixed top region with headline, credit, and a short intro paragraph. This region does not react to orb movement.
- A dynamic lower region with a single flowing text column. This region recomputes line positions whenever orb geometry changes.

Three glowing circles sit above the dynamic text region. They drift continuously, bounce within the allowed body area, and can be dragged by touch. Dragging an orb updates the body layout immediately. Releasing an orb resumes motion. A tap without meaningful movement toggles pause/resume for that orb.

This gives the user an explicit visual contrast between static editorial text and obstacle-aware live text layout.

## Constraints

- Mobile-first only. The page does not need a desktop-specific layout.
- The demo should maximize MTS usage for layout and animation work.
- The page should reuse the existing Lynx Pretext line-breaking pipeline instead of inventing a second layout engine.
- The demo should avoid React-driven per-frame reconciliation.
- The demo should stay visually close to the dark, atmospheric editorial style of the browser `editorial-engine` reference without porting every browser-only behavior.

## Non-Goals

- No multi-column desktop spread.
- No pullquote blocks.
- No drop cap.
- No text-selection compatibility state machine from the browser version.
- No SVG hull wrapping for this page. Obstacles are circles only.
- No attempt to preserve parity with every layout rule from `~/github/pretext/pages/demos/editorial-engine.ts`.

## Why Pure MTS

The performance point of the demo is lost if orb motion, drag updates, and text reflow bounce through BTS state every frame. The recommended architecture is therefore:

- BTS initializes the page, listens to layout size changes, and sends the latest viewport dimensions to MTS.
- MTS owns orb state, drag state, prepared-text caches, layout computation, the animation loop, hit testing, and all direct element updates.
- Text lines are rendered through fixed element pools. MTS mutates `left`, `top`, `display`, and `textContent` directly on those pooled elements.

This matches the direction already proven by `pages/demos/dynamic-layout-mts.tsx` and the MTS-heavy organization in `~/github/lynx-flappy-bird`.

## Proposed Files

- Create: `pages/demos/editorial-mts.tsx`
- Modify: `lynx.config.ts`

No shared library changes are required for the first version. The demo should reuse:

- `src/layout.ts`
- `pages/demos/wrap-geometry.ts`

## Layout Model

### Root Regions

The page root fills the viewport and uses a dark editorial background. Inside it:

- `headerRegion`: headline, credit, and intro copy.
- `bodyRegion`: the only region where orb geometry is applied to text layout.
- `orbLayer`: visually above the text, but constrained to move inside `bodyRegion`.

The body region should start below the fixed intro copy, with enough top spacing to keep the distinction obvious on first render.

### Header Region

The header region contains:

- A fitted headline in a serif face.
- A lightweight credit/byline.
- A short fixed intro paragraph that explains the demo in plain language.

The headline can reuse the same binary-search idea already present in `dynamic-layout-mts.tsx`, but it is not obstacle-aware. It only fits to available width and available header height.

### Body Region

The body region is a single text column. Its lines are generated with `layoutNextLine()` and obstacle-aware slot carving:

1. For each line band, compute the horizontal intervals blocked by all active circles.
2. Use `carveTextLineSlots()` to subtract blocked intervals from the base body width.
3. If multiple viable slots remain:
   - Prefer rendering into both slots when both widths clear the minimum threshold.
   - Otherwise choose the widest slot.
4. Advance the Pretext cursor until the body region is full or text is exhausted.

This preserves the “text flows around objects” effect on mobile instead of degenerating into simple indentation.

## Orb Model

There are exactly three orbs.

Each orb state contains:

- `x`, `y`
- `r`
- `vx`, `vy`
- `paused`

The radii and initial positions are chosen relative to the body region so the first render already shows visible wrap behavior.

### Motion Rules

- Orbs move every frame using `requestAnimationFrame` on MTS.
- Motion is bounded to the dynamic body region, not the full page.
- Colliding with the body region bounds flips the corresponding velocity sign and clamps position.
- Basic pairwise repulsion prevents the orbs from collapsing into one cluster.

The repulsion can stay simple and deterministic; this is a readability demo, not a physics sandbox.

### Interaction Rules

- A touch inside an orb starts drag mode for that orb.
- During drag, the orb follows the pointer position delta.
- During drag, orb autonomous movement is suppressed for the dragged orb but continues for the others.
- On release:
  - If movement stayed under a small threshold, toggle `paused`.
  - Otherwise keep the orb at its released position and resume drift.

No inertial fling is needed.

## Thread Ownership

### BTS Responsibilities

- Render the root view tree and the pooled child elements.
- Track viewport dimensions via `bindlayoutchange`.
- Forward width and height changes into MTS with `runOnMainThread`.
- Render the intro paragraph as a normal static Lynx `<text>` block in the fixed header region.

### MTS Responsibilities

- Cache prepared text for headline, intro, credit, and body.
- Compute region geometry from viewport size.
- Own all orb state and drag state.
- Run the animation loop.
- Recompute body line layout whenever:
  - viewport size changes
  - orb positions change
  - orb paused state changes
- Mutate pooled element styles and text content directly.

## Element Pools

The page should pre-render fixed pools rather than create and destroy nodes at runtime.

### Header Pools

- Headline lines: fixed small pool
- Credit element: single node

The intro paragraph is rendered as a normal Lynx `<text>` block in BTS because it is outside the hot path and does not benefit from MTS mutation.

### Body Pool

The dynamic body text uses a large fixed pool of positioned line containers:

- Each pool entry is a positioned `<view>` containing one `<text>`.
- MTS toggles `display` for used vs unused lines.
- MTS writes `left`, `top`, and `textContent` into the pool each layout pass.

The pool size should be chosen conservatively high for mobile body height. If text exceeds pool capacity, the remaining text is dropped. This failure mode is acceptable for a demo and is better than allocating during animation.

### Orb Elements

- Three positioned orb views
- Visual styling through gradients, shadows, and opacity changes for paused state

Orb visuals do not need images. Circles are both simpler and more direct for the wrap-around story.

## Geometry and Layout Helpers

The page should reuse existing geometry helpers where they already fit:

- `carveTextLineSlots()` from `pages/demos/wrap-geometry.ts`

For circle blocking, `editorial-mts.tsx` should define a local helper similar to the one in the browser `editorial-engine.ts`:

- `circleIntervalForBand(cx, cy, r, bandTop, bandBottom, hPad, vPad)`

Padding values should be tuned for readable wrap, not geometric purity. Horizontal padding should be strong enough that text visually clears each orb.

## Responsive Behavior

The page is still responsive inside the mobile-first constraint:

- Width changes recompute all region geometry.
- Very short heights reduce headline size and header spacing first.
- The body region must always retain a minimum usable height.
- Orbs are clamped back inside the new body bounds after resize before reflowing text.

There is no alternate tablet/desktop composition in v1.

## Visual Direction

The page should keep the editorial-engine mood:

- Dark background with slight tonal variation
- Serif headline and body copy
- Warm, low-contrast body text
- Glowing orbs in three distinct colors
- Minimal chrome

The demo should open visually as content, not as a debug screen.

## Error Handling and Simplifications

- If body width becomes too narrow for meaningful split slots, fall back to the single widest slot for that line.
- If a line band has no viable slot, skip that band and continue downward.
- If the text pool limit is reached, stop writing new lines and leave the rest of the text unrendered.
- If a resize would place an orb outside the body region, clamp it before running the next layout pass.

These rules favor stable rendering and frame pacing over perfect completeness.

## Verification Plan

The implementation is complete only when all of the following are true:

### Build Verification

- `tsc --build` passes
- `pnpm build` passes

### Runtime Verification

Use Lynx DevTool and a real rendered screenshot to verify:

1. The page loads from the new `editorial-mts.lynx.bundle` entry.
2. The top editorial text region stays fixed while the orbs move.
3. All three orbs drift on their own without BTS-driven React rerenders.
4. Dragging an orb causes the body text to reflow immediately.
5. Releasing an orb resumes movement.
6. A tap without drag toggles paused state, visible through reduced opacity.
7. The body text visibly wraps around orb silhouettes rather than only shrinking uniformly.

### Code-Level Verification

- No per-frame body line data is stored in React state.
- No per-frame orb positions are stored in React state.
- The hot path uses `useMainThreadRef`, `runOnMainThread`, and direct main-thread element mutation.

## Implementation Summary

The recommended implementation is a new `editorial-mts` page built as a mobile-only, single-column, pure-MTS editorial demo. It intentionally narrows scope compared with the browser `editorial-engine` reference so the page can make one point very clearly: moving and draggable circular obstacles can drive live text wrap on Lynx without relying on React rerenders in the hot path.

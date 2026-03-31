# lynx-pretext

A port of [chenglou/pretext](https://github.com/chenglou/pretext) text layout engine to the Lynx platform.

## Overview

This is a pure JavaScript text measurement and layout library running on the Lynx main thread. It provides the core functionality of the browser-based Pretext, adapted for the Lynx platform.

## Core Differences

### 1. Measurement Backend (Key Difference)

| Feature | Original Pretext (Browser) | Lynx Pretext |
|---------|---------------------------|--------------|
| **Measurement API** | Canvas `measureText()` | `lynx.getTextInfo()` |
| **Runtime Environment** | Browser main thread/Worker | Lynx main thread |
| **Font Configuration** | `ctx.font = font` | Via `fontSize`/`fontFamily` parameters |
| **Emoji Correction** | Auto-detect and correct Canvas/DOM differences | Not supported (MVP version) |

### 2. Code File Comparison

| File | Original Pretext | Lynx Pretext | Reuse Rate |
|------|-----------------|--------------|------------|
| `analysis.ts` | 1,008 lines | ~1,016 lines | ~95% |
| `line-break.ts` | ~1,056 lines | ~1,056 lines | ~98% |
| `layout.ts` | 718 lines | 621 lines | ~85% |
| `measurement.ts` | 232 lines | 149 lines | ~60% (main adaptation point) |

### 3. Platform Adaptation Layer

Lynx Pretext adds the following adaptation files:

- **`intl-shim.ts`** (6 lines): Provides `Intl` global object polyfill for PrimJS
- **`segmenter-polyfill.ts`** (102 lines): Lightweight `Intl.Segmenter` alternative (PrimJS's `@formatjs/intl-segmenter` crashes)
- **`rspeedy-env.d.ts`** (12 lines): Lynx/Rspeedy environment TypeScript declarations

### 4. Feature Differences

| Feature | Original Pretext | Lynx Pretext |
|---------|-----------------|--------------|
| **Bidirectional Text (Bidi)** | Full support | Returns `null` in MVP (stub) |
| **Emoji Width Correction** | Supported (Canvas vs DOM differences) | Not supported (returns 0) |
| **Browser Engine Config** | Safari/Chromium differentiated handling | Fixed default values |
| **System Font Detection** | Supports `system-ui`, etc. | Depends on Lynx underlying implementation |

### 5. Architecture Consistency

Both projects share the same two-phase architecture:

```
┌─────────────────┐     ┌─────────────────┐
│  Prepare Phase  │ ──▶ │  Layout Phase   │
│  (text appears) │     │  (on resize)    │
└─────────────────┘     └─────────────────┘
        │                        │
        ▼                        ▼
  - Text analysis/segmentation   Pure arithmetic
  - Measure each segment         Walk cached widths
  - Cache results                Compute lines & height
```

Core type definitions remain consistent:
- `SegmentBreakKind`: `'text' | 'space' | 'preserved-space' | 'tab' | 'glue' | 'zero-width-break' | 'soft-hyphen' | 'hard-break'`
- `PreparedText` / `PreparedTextWithSegments`
- `LayoutCursor` / `LayoutLine` / `LayoutResult`

### 6. API Compatibility

Main APIs remain consistent:

```typescript
// Preparation phase (same in both projects)
const prepared = prepare(text, font, options)
const preparedWithSegments = prepareWithSegments(text, font, options)

// Layout phase (same in both projects)
const result = layout(prepared, maxWidth, lineHeight)
const { lines } = layoutWithLines(preparedWithSegments, maxWidth, lineHeight)

// Line-by-line layout (same in both projects)
const line = layoutNextLine(preparedWithSegments, cursor, maxWidth)
```

## Code Reuse Summary

- **Analysis Layer (`analysis.ts`)**: ~95% reuse, mainly import path adjustments
- **Line Breaking Layer (`line-break.ts`)**: ~98% reuse, almost direct port
- **Layout Layer (`layout.ts`)**: ~85% reuse, removed browser-specific features
- **Measurement Layer (`measurement.ts`)**: ~60% reuse, main adaptation point (Canvas → Lynx API)

**Overall Reuse Rate**: Approximately 85-90% of core logic is directly reused, with differences concentrated in the platform adaptation layer.

## Technical Details

### Original Pretext Measurement
```typescript
// Browser version uses Canvas
const ctx = getMeasureContext() // OffscreenCanvas or DOM Canvas
ctx.font = font
const width = ctx.measureText(segment).width
```

### Lynx Pretext Measurement
```typescript
// Lynx version uses main thread API
const info = { fontSize: currentFontSizeStr }
if (currentFontFamily) info.fontFamily = currentFontFamily
const result = lynx.getTextInfo(segment, info)
const width = result.width
```

### Verification Strategy

Using Lynx native `getTextInfo` with `maxWidth` mode as the verification oracle:

```typescript
// Native oracle
const native = lynx.getTextInfo(text, { fontSize, fontFamily, maxWidth })
// native.content = ['line 1 text', 'line 2 text', ...]

// Our implementation
const { lines } = layoutWithLines(prepared, maxWidthPx, lineHeight)
// lines[i].text should match native.content[i]
```

## Project Structure

```
lynx-pretext/
├── src/                        # Core library
│   ├── analysis.ts             # Text analysis/segmentation (~95% reused)
│   ├── line-break.ts           # Line breaking algorithm (~98% reused)
│   ├── layout.ts               # Layout API (~85% reused)
│   ├── measurement.ts          # Measurement layer (Lynx adaptation)
│   ├── intl-shim.ts            # PrimJS Intl polyfill
│   └── segmenter-polyfill.ts   # Intl.Segmenter alternative
│
├── packages/                   # Monorepo packages
│   └── devtools/               # @lynx-pretext/devtools (DevPanel component)
│
├── examples/                   # Example projects
│   ├── basic/                  # Basic API usage demos
│   ├── ascii-arts/             # ASCII art rendering (torus, particles)
│   ├── bubble/                 # Bubble text layout
│   ├── dance/                  # Dance sprite animation with text exclusion
│   ├── dynamic-layout/         # Dynamic layout with 3 architectures (BTS/MTS/Hybrid)
│   └── editorial/              # Editorial layout with draggable orbs
│
├── docs/                       # Documentation
│   ├── blog.md                 # Project overview and journey
│   └── learning/               # Learning notes and migration guides
│       ├── mts-bts-architecture-patterns.md
│       ├── ascii-art-rendering.md
│       ├── bts-mts-compatible-components.md
│       └── ...
│
├── website/                    # Project website
└── scripts/                    # Build and utility scripts
```

## Related Projects

- [chenglou/pretext](https://github.com/chenglou/pretext) - Original browser-based text layout engine
- [Lynx](https://lynxjs.org/) - Cross-platform framework

## License

Same as the original Pretext project

# Monorepo Restructure Plan

## Goal

Restructure lynx-pretext from a flat Rspeedy project into a pnpm monorepo following the vue-lynx pattern. Clean separation between library, examples, and website.

## Current Structure (flat)

```
lynx-pretext/
├── src/                  ← library + app entry (index.tsx) mixed together
│   ├── analysis.ts
│   ├── layout.ts
│   ├── line-break.ts
│   ├── measurement.ts
│   ├── segmenter-polyfill.ts
│   ├── intl-shim.ts
│   └── index.tsx         ← app entry, doesn't belong in library
├── pages/                ← basic API demos
│   ├── basic-height.tsx
│   ├── layout-with-lines.tsx
│   ├── shrinkwrap.tsx
│   ├── variable-flow.tsx
│   ├── accuracy.tsx
│   └── demos/            ← advanced demos
│       ├── bubbles.tsx
│       ├── dynamic-layout*.tsx
│       ├── editorial-*.tsx
│       ├── wireframe-torus.tsx
│       ├── field-mono.tsx
│       ├── field-prop.tsx
│       └── (shared: hull-data, wrap-geometry, etc.)
├── website/
├── lynx.config.ts        ← single config for everything
└── package.json
```

## Target Structure (monorepo)

```
lynx-pretext/
├── packages/
│   └── lynx-pretext/              ← the library (publishable, TS source, no build step)
│       ├── src/
│       │   ├── analysis.ts
│       │   ├── layout.ts
│       │   ├── line-break.ts
│       │   ├── measurement.ts
│       │   ├── segmenter-polyfill.ts
│       │   └── intl-shim.ts
│       ├── package.json
│       └── tsconfig.json
│
├── examples/
│   ├── basic/                     ← basic API examples
│   │   ├── src/
│   │   │   ├── index.tsx
│   │   │   ├── basic-height.tsx
│   │   │   ├── layout-with-lines.tsx
│   │   │   ├── shrinkwrap.tsx
│   │   │   ├── variable-flow.tsx
│   │   │   ├── accuracy.tsx
│   │   │   └── hello-world.tsx
│   │   ├── lynx.config.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── bubble/                    ← chat bubble shrinkwrap demo
│   │   ├── src/
│   │   │   ├── index.tsx
│   │   │   ├── bubbles.tsx
│   │   │   └── bubbles-shared.ts
│   │   ├── lynx.config.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── dynamic-layout/            ← editorial spread with logo obstacles
│   │   ├── src/
│   │   │   ├── index.tsx
│   │   │   ├── dynamic-layout.tsx
│   │   │   ├── dynamic-layout-bts.tsx
│   │   │   ├── dynamic-layout-mts.tsx
│   │   │   ├── dynamic-layout-text.ts
│   │   │   ├── hull-data.ts
│   │   │   └── wrap-geometry.ts
│   │   ├── assets/
│   │   │   ├── openai-symbol.png
│   │   │   └── claude-symbol.png
│   │   ├── lynx.config.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── editorial/                 ← editorial engine with draggable orbs
│   │   ├── src/
│   │   │   ├── index.tsx
│   │   │   ├── editorial-engine.tsx
│   │   │   └── editorial-mts.tsx  ← inlines carveTextLineSlots (~20 lines)
│   │   ├── lynx.config.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── ascii-arts/                ← ASCII art demos
│       ├── src/
│       │   ├── index.tsx
│       │   ├── wireframe-torus.tsx
│       │   ├── field-mono.tsx
│       │   └── field-prop.tsx
│       ├── lynx.config.ts
│       ├── package.json
│       └── tsconfig.json
│
├── website/                       ← documentation site (unchanged)
│
├── docs/                          ← plans, specs (unchanged)
├── tasks/                         ← Ralph PRD, progress (unchanged)
├── package.json                   ← root: private, scripts only
├── pnpm-workspace.yaml
└── tsconfig.json                  ← root tsconfig (shared compiler options)
```

## Key Design Decisions

### Each example is self-contained

No cross-example imports. Shared files that were in `pages/demos/` are handled:

- **`wrap-geometry.ts` + `hull-data.ts`** → stays in `examples/dynamic-layout/src/` only
- **`editorial-mts.tsx`** → inlines the ~20-line `carveTextLineSlots` + types it needs (matches original pretext pattern where editorial-engine.ts inlined it)
- **`bubbles-shared.ts`** → stays with `examples/bubble/src/`
- **`dynamic-layout-text.ts`** → stays with `examples/dynamic-layout/src/`

### DevPanel is a separate package (future)

Planned as `packages/lynx-pretext-devtools/` so both `basic` and all demo examples can depend on it via `workspace:*`. Not created in this refactor — just the monorepo structure that enables it.

### Library ships TS source, no build step

Same as vue-lynx and original @chenglou/pretext. Consumers' bundlers (Rspeedy/webpack) compile it. The library `package.json` has `"exports": { ".": "./src/layout.ts" }`.

## Key Files

### Root package.json

```json
{
  "name": "lynx-pretext-monorepo",
  "private": true,
  "scripts": {
    "build": "pnpm --filter lynx-pretext run build",
    "build:examples": "pnpm --filter './examples/*' --parallel run build",
    "dev:basic": "pnpm --filter @lynx-pretext-example/basic run dev",
    "dev:bubble": "pnpm --filter @lynx-pretext-example/bubble run dev",
    "dev:dynamic-layout": "pnpm --filter @lynx-pretext-example/dynamic-layout run dev",
    "dev:editorial": "pnpm --filter @lynx-pretext-example/editorial run dev",
    "dev:ascii-arts": "pnpm --filter @lynx-pretext-example/ascii-arts run dev"
  }
}
```

### pnpm-workspace.yaml

```yaml
packages:
  - packages/*
  - examples/*
  - website
```

### packages/lynx-pretext/package.json

```json
{
  "name": "lynx-pretext",
  "version": "0.0.1",
  "license": "MIT",
  "type": "module",
  "exports": {
    ".": "./src/layout.ts"
  },
  "files": ["src"],
  "dependencies": {}
}
```

### Example package.json (template — same for all 5 examples)

```json
{
  "name": "@lynx-pretext-example/<name>",
  "version": "0.0.1",
  "private": true,
  "scripts": {
    "build": "rspeedy build",
    "dev": "rspeedy dev"
  },
  "dependencies": {
    "lynx-pretext": "workspace:*"
  },
  "devDependencies": {
    "@lynx-js/react": "0.116.4",
    "@lynx-js/rspeedy": "0.13.4",
    "@lynx-js/react-rsbuild-plugin": "0.12.9",
    "@lynx-js/qrcode-rsbuild-plugin": "^0.4.6",
    "@lynx-js/types": "3.7.0",
    "@types/react": "^18.3.28",
    "typescript": "~5.9.3"
  }
}
```

### Example lynx.config.ts (per example)

**basic:**
```ts
import { defineConfig } from '@lynx-js/rspeedy'
import { pluginReactLynx } from '@lynx-js/react-rsbuild-plugin'
import { pluginQRCode } from '@lynx-js/qrcode-rsbuild-plugin'

export default defineConfig({
  source: {
    entry: {
      main: './src/index.tsx',
      'basic-height': './src/basic-height.tsx',
      'layout-with-lines': './src/layout-with-lines.tsx',
      shrinkwrap: './src/shrinkwrap.tsx',
      'variable-flow': './src/variable-flow.tsx',
      accuracy: './src/accuracy.tsx',
      'hello-world': './src/hello-world.tsx',
    },
  },
  plugins: [
    pluginQRCode({ schema: (url) => `${url}?fullscreen=true` }),
    pluginReactLynx(),
  ],
})
```

**bubble:**
```ts
export default defineConfig({
  source: {
    entry: {
      main: './src/bubbles.tsx',
    },
  },
  // ...same plugins
})
```

**dynamic-layout:**
```ts
export default defineConfig({
  source: {
    entry: {
      main: './src/dynamic-layout.tsx',
      'dynamic-layout-bts': './src/dynamic-layout-bts.tsx',
      'dynamic-layout-mts': './src/dynamic-layout-mts.tsx',
    },
  },
  // ...same plugins
})
```

**editorial:**
```ts
export default defineConfig({
  source: {
    entry: {
      main: './src/editorial-mts.tsx',
      'editorial-engine': './src/editorial-engine.tsx',
    },
  },
  // ...same plugins
})
```

**ascii-arts:**
```ts
export default defineConfig({
  source: {
    entry: {
      main: './src/wireframe-torus.tsx',
      'field-mono': './src/field-mono.tsx',
      'field-prop': './src/field-prop.tsx',
    },
  },
  // ...same plugins
})
```

## Import Path Changes

Library imports change from relative to package:

```ts
// Before (flat):
import { prepare, layout } from '../../src/layout'
import { prepare, layout } from '../src/layout'

// After (monorepo):
import { prepare, layout } from 'lynx-pretext'
```

Shared module imports for MTS:

```ts
// Before:
import { layoutNextLine } from '../../src/layout' with { runtime: 'shared' }

// After:
import { layoutNextLine } from 'lynx-pretext' with { runtime: 'shared' }
```

Intra-example imports stay relative:

```ts
// Before:
import { BODY_COPY } from './dynamic-layout-text'

// After (unchanged — same directory):
import { BODY_COPY } from './dynamic-layout-text'
```

Asset imports change for dynamic-layout:

```ts
// Before:
import openaiLogoSrc from '../assets/openai-symbol.png'

// After:
import openaiLogoSrc from '../assets/openai-symbol.png'  // same — assets/ is sibling to src/
```

## editorial-mts: Inlining carveTextLineSlots

Currently `editorial-mts.tsx` imports from `./wrap-geometry`:
```ts
import { carveTextLineSlots } from './wrap-geometry' with { runtime: 'shared' }
import type { Interval, Rect } from './wrap-geometry'
```

After migration, inline these ~20 lines directly into `editorial-mts.tsx`:
```ts
// Inlined from wrap-geometry.ts (avoids cross-example dependency)
type Rect = { x: number; y: number; width: number; height: number }
type Interval = { left: number; right: number }

function carveTextLineSlots(base: Interval, blocked: Interval[]): Interval[] {
  let slots: Interval[] = [base]
  for (let bi = 0; bi < blocked.length; bi++) {
    const interval = blocked[bi]!
    const next: Interval[] = []
    for (let si = 0; si < slots.length; si++) {
      const slot = slots[si]!
      if (interval.right <= slot.left || interval.left >= slot.right) { next.push(slot); continue }
      if (interval.left > slot.left) next.push({ left: slot.left, right: interval.left })
      if (interval.right < slot.right) next.push({ left: interval.right, right: slot.right })
    }
    slots = next
  }
  return slots.filter(s => s.right - s.left >= 24)
}
```

This matches the original pretext `editorial-engine.ts` which also inlines `carveTextLineSlots`.

## Migration Steps

1. Create root `pnpm-workspace.yaml` and root `package.json`
2. Create `packages/lynx-pretext/` — move library source files from `src/` (exclude `index.tsx`, `rspeedy-env.d.ts`)
3. Create `packages/lynx-pretext/package.json` and `tsconfig.json`
4. Create `examples/basic/` — move from `pages/*.tsx` + `pages/hello-world.tsx`
5. Create `examples/bubble/` — move `pages/demos/bubbles*.ts(x)`
6. Create `examples/dynamic-layout/` — move `pages/demos/dynamic-layout*`, `wrap-geometry.ts`, `hull-data.ts`, `pages/assets/`
7. Create `examples/editorial/` — move `pages/demos/editorial-*`, inline `carveTextLineSlots`
8. Create `examples/ascii-arts/` — move `pages/demos/wireframe-torus.tsx`
9. Create `lynx.config.ts` and `package.json` for each example
10. Update all import paths: relative `../src/layout` / `../../src/layout` → `lynx-pretext`
11. Remove `editorial-mts.tsx` import of `wrap-geometry`, inline the function
12. `pnpm install` at root
13. `pnpm build:examples` — verify all 5 examples build
14. Delete old flat structure files (`pages/`, old `src/index.tsx`, old `lynx.config.ts`, old root `package.json`)

## What Goes Where

| Current location | Target | Rationale |
|---|---|---|
| `src/layout.ts` | `packages/lynx-pretext/src/layout.ts` | Library public API |
| `src/analysis.ts` | `packages/lynx-pretext/src/analysis.ts` | Library internal |
| `src/measurement.ts` | `packages/lynx-pretext/src/measurement.ts` | Library internal |
| `src/line-break.ts` | `packages/lynx-pretext/src/line-break.ts` | Library internal |
| `src/segmenter-polyfill.ts` | `packages/lynx-pretext/src/segmenter-polyfill.ts` | Library dependency |
| `src/intl-shim.ts` | `packages/lynx-pretext/src/intl-shim.ts` | Library dependency |
| `src/index.tsx` | `examples/basic/src/index.tsx` | App entry, not library |
| `src/rspeedy-env.d.ts` | `examples/*/src/rspeedy-env.d.ts` | Build env types (copy to each) |
| `pages/hello-world.tsx` | `examples/basic/src/hello-world.tsx` | Basic example |
| `pages/basic-height.tsx` | `examples/basic/src/basic-height.tsx` | Basic example |
| `pages/layout-with-lines.tsx` | `examples/basic/src/layout-with-lines.tsx` | Basic example |
| `pages/shrinkwrap.tsx` | `examples/basic/src/shrinkwrap.tsx` | Basic example |
| `pages/variable-flow.tsx` | `examples/basic/src/variable-flow.tsx` | Basic example |
| `pages/accuracy.tsx` | `examples/basic/src/accuracy.tsx` | Basic example |
| `pages/demos/bubbles.tsx` | `examples/bubble/src/bubbles.tsx` | Bubble demo |
| `pages/demos/bubbles-shared.ts` | `examples/bubble/src/bubbles-shared.ts` | Bubble demo |
| `pages/demos/dynamic-layout.tsx` | `examples/dynamic-layout/src/dynamic-layout.tsx` | Dynamic layout demo |
| `pages/demos/dynamic-layout-bts.tsx` | `examples/dynamic-layout/src/dynamic-layout-bts.tsx` | Dynamic layout demo |
| `pages/demos/dynamic-layout-mts.tsx` | `examples/dynamic-layout/src/dynamic-layout-mts.tsx` | Dynamic layout demo |
| `pages/demos/dynamic-layout-text.ts` | `examples/dynamic-layout/src/dynamic-layout-text.ts` | Dynamic layout demo |
| `pages/demos/wrap-geometry.ts` | `examples/dynamic-layout/src/wrap-geometry.ts` | Dynamic layout only |
| `pages/demos/hull-data.ts` | `examples/dynamic-layout/src/hull-data.ts` | Dynamic layout only |
| `pages/assets/*.png` | `examples/dynamic-layout/assets/*.png` | Dynamic layout only |
| `pages/demos/editorial-engine.tsx` | `examples/editorial/src/editorial-engine.tsx` | Editorial demo |
| `pages/demos/editorial-mts.tsx` | `examples/editorial/src/editorial-mts.tsx` | Editorial demo (inline carveTextLineSlots) |
| `pages/demos/wireframe-torus.tsx` | `examples/ascii-arts/src/wireframe-torus.tsx` | ASCII art demo |
| `pages/demos/field-mono.tsx` | `examples/ascii-arts/src/field-mono.tsx` | ASCII art demo (mono) |
| `pages/demos/field-prop.tsx` | `examples/ascii-arts/src/field-prop.tsx` | ASCII art demo (proportional) |
| `website/` | `website/` | Unchanged |
| `docs/` | `docs/` | Unchanged |
| `tasks/` | `tasks/` | Unchanged |

## Notes

- Library ships TS source, no build step. Matches vue-lynx and original @chenglou/pretext.
- `segmenter-polyfill.ts` and `intl-shim.ts` stay in library — required for it to function on Lynx (PrimJS has no `Intl`).
- `test-data.ts` moves to `examples/basic/src/` if only used by accuracy.tsx.
- DevPanel will be `packages/lynx-pretext-devtools/` in a future step — all examples can depend on it via `workspace:*`.
- Each example is a fully independent Rspeedy project that can `pnpm dev` / `pnpm build` on its own.

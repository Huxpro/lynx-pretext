# Monorepo Restructure Plan

## Goal

Restructure lynx-pretext from a single Rspeedy project into a pnpm monorepo following the vue-lynx pattern. Clean separation between library, examples, and website.

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
│       └── (shared: hull-data, wrap-geometry, etc.)
├── components/           ← (planned) DevPanel
├── website/
├── lynx.config.ts        ← single config for everything
└── package.json
```

## Target Structure (monorepo)

```
lynx-pretext/
├── packages/
│   └── lynx-pretext/              ← the library (publishable)
│       ├── src/
│       │   ├── analysis.ts
│       │   ├── layout.ts
│       │   ├── line-break.ts
│       │   ├── measurement.ts
│       │   ├── segmenter-polyfill.ts
│       │   └── intl-shim.ts
│       ├── package.json           ← name: "lynx-pretext", exports: "./src/layout.ts"
│       └── tsconfig.json
│
├── examples/
│   ├── basics/                    ← basic API examples (one Rspeedy project)
│   │   ├── src/
│   │   │   ├── index.tsx          ← default entry
│   │   │   ├── basic-height.tsx
│   │   │   ├── layout-with-lines.tsx
│   │   │   ├── shrinkwrap.tsx
│   │   │   ├── variable-flow.tsx
│   │   │   └── accuracy.tsx
│   │   ├── lynx.config.ts
│   │   ├── package.json           ← depends on "lynx-pretext": "workspace:*"
│   │   └── tsconfig.json
│   │
│   └── demos/                     ← advanced demos (one Rspeedy project)
│       ├── src/
│       │   ├── index.tsx
│       │   ├── bubbles.tsx
│       │   ├── bubbles-shared.ts
│       │   ├── dynamic-layout.tsx
│       │   ├── dynamic-layout-bts.tsx
│       │   ├── dynamic-layout-mts.tsx
│       │   ├── dynamic-layout-text.ts
│       │   ├── editorial-engine.tsx
│       │   ├── editorial-mts.tsx
│       │   ├── wireframe-torus.tsx
│       │   ├── hull-data.ts
│       │   └── wrap-geometry.ts
│       ├── assets/
│       │   ├── openai-symbol.png
│       │   └── claude-symbol.png
│       ├── components/
│       │   └── dev-panel/         ← shared DevPanel components
│       ├── lynx.config.ts
│       ├── package.json           ← depends on "lynx-pretext": "workspace:*"
│       └── tsconfig.json
│
├── website/                       ← documentation site (unchanged)
│
├── package.json                   ← root: "lynx-pretext-monorepo", private: true
├── pnpm-workspace.yaml
└── tsconfig.json                  ← root tsconfig (shared settings)
```

## Key Files

### Root package.json

```json
{
  "name": "lynx-pretext-monorepo",
  "private": true,
  "scripts": {
    "build": "pnpm --filter lynx-pretext run build",
    "build:examples": "pnpm --filter './examples/*' --parallel run build",
    "dev:basics": "pnpm --filter @lynx-pretext-example/basics run dev",
    "dev:demos": "pnpm --filter @lynx-pretext-example/demos run dev",
    "check": "pnpm --filter lynx-pretext run check"
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

No build step for the library — consumers import `.ts` source directly (same as vue-lynx and the original @chenglou/pretext pattern). Rspeedy/webpack in the example projects handles compilation.

### examples/basics/package.json

```json
{
  "name": "@lynx-pretext-example/basics",
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
    "@lynx-js/react": "...",
    "@lynx-js/rspeedy": "...",
    "@lynx-js/react-rsbuild-plugin": "...",
    "typescript": "^5"
  }
}
```

### examples/demos/package.json

```json
{
  "name": "@lynx-pretext-example/demos",
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
    "@lynx-js/react": "...",
    "@lynx-js/rspeedy": "...",
    "@lynx-js/react-rsbuild-plugin": "...",
    "typescript": "^5"
  }
}
```

### examples/basics/lynx.config.ts

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
    },
  },
  plugins: [
    pluginQRCode({ schema: (url) => `${url}?fullscreen=true` }),
    pluginReactLynx(),
  ],
})
```

### examples/demos/lynx.config.ts

```ts
import { defineConfig } from '@lynx-js/rspeedy'
import { pluginReactLynx } from '@lynx-js/react-rsbuild-plugin'
import { pluginQRCode } from '@lynx-js/qrcode-rsbuild-plugin'

export default defineConfig({
  source: {
    entry: {
      main: './src/index.tsx',
      bubbles: './src/bubbles.tsx',
      'dynamic-layout': './src/dynamic-layout.tsx',
      'dynamic-layout-bts': './src/dynamic-layout-bts.tsx',
      'dynamic-layout-mts': './src/dynamic-layout-mts.tsx',
      'editorial-engine': './src/editorial-engine.tsx',
      'editorial-mts': './src/editorial-mts.tsx',
      'wireframe-torus': './src/wireframe-torus.tsx',
    },
  },
  plugins: [
    pluginQRCode({ schema: (url) => `${url}?fullscreen=true` }),
    pluginReactLynx(),
  ],
})
```

## Import Path Changes

Library imports change from relative to package:

```ts
// Before (flat):
import { prepare, layout } from '../../src/layout'

// After (monorepo):
import { prepare, layout } from 'lynx-pretext'
```

Shared module imports for MTS stay the same syntax but with package name:

```ts
// Before:
import { layoutNextLine } from '../../src/layout' with { runtime: 'shared' }

// After:
import { layoutNextLine } from 'lynx-pretext' with { runtime: 'shared' }
```

## Migration Steps

1. Create root `pnpm-workspace.yaml` and root `package.json`
2. Create `packages/lynx-pretext/` — move library source files from `src/` (exclude `index.tsx`, `rspeedy-env.d.ts`)
3. Create `packages/lynx-pretext/package.json` and `tsconfig.json`
4. Create `examples/basics/` — move basic pages from `pages/*.tsx`
5. Create `examples/demos/` — move demo pages from `pages/demos/*.tsx`, assets, components
6. Create `lynx.config.ts` for each example
7. Update all import paths: `../../src/layout` → `lynx-pretext`
8. Move `@formatjs/intl-segmenter` and `segmenter-polyfill` into the library package
9. `pnpm install` at root
10. Verify `pnpm build:examples` passes
11. Delete old flat structure files

## What Goes Where

| Current location | Target | Rationale |
|---|---|---|
| `src/layout.ts` | `packages/lynx-pretext/src/layout.ts` | Library public API |
| `src/analysis.ts` | `packages/lynx-pretext/src/analysis.ts` | Library internal |
| `src/measurement.ts` | `packages/lynx-pretext/src/measurement.ts` | Library internal |
| `src/line-break.ts` | `packages/lynx-pretext/src/line-break.ts` | Library internal |
| `src/segmenter-polyfill.ts` | `packages/lynx-pretext/src/segmenter-polyfill.ts` | Library dependency |
| `src/intl-shim.ts` | `packages/lynx-pretext/src/intl-shim.ts` | Library dependency |
| `src/index.tsx` | `examples/basics/src/index.tsx` | App entry, not library |
| `src/rspeedy-env.d.ts` | `examples/*/src/rspeedy-env.d.ts` | Build env types |
| `pages/basic-height.tsx` | `examples/basics/src/basic-height.tsx` | Basic API example |
| `pages/variable-flow.tsx` | `examples/basics/src/variable-flow.tsx` | Basic API example |
| `pages/demos/bubbles.tsx` | `examples/demos/src/bubbles.tsx` | Advanced demo |
| `pages/demos/dynamic-layout*.tsx` | `examples/demos/src/dynamic-layout*.tsx` | Advanced demo |
| `pages/demos/editorial-*.tsx` | `examples/demos/src/editorial-*.tsx` | Advanced demo |
| `pages/demos/wireframe-torus.tsx` | `examples/demos/src/wireframe-torus.tsx` | Advanced demo |
| `pages/demos/wrap-geometry.ts` | `examples/demos/src/wrap-geometry.ts` | Demo-specific helper |
| `pages/demos/hull-data.ts` | `examples/demos/src/hull-data.ts` | Demo-specific data |
| `pages/assets/` | `examples/demos/assets/` | Demo assets |
| `components/dev-panel/` | `examples/demos/components/dev-panel/` | Demo UI component |
| `website/` | `website/` | Unchanged |
| `docs/` | `docs/` | Unchanged |
| `tasks/` | `tasks/` | Unchanged |

## Notes

- The library (`packages/lynx-pretext`) ships TypeScript source, no build step. Consumers' bundlers (Rspeedy/webpack) compile it. This matches both vue-lynx and the original @chenglou/pretext.
- `segmenter-polyfill.ts` and `intl-shim.ts` are imported by `analysis.ts` at the top — they stay in the library package since they're required for the library to function on Lynx.
- `test-data.ts` can stay in library if we want `accuracy.tsx` to import it, or move to examples/basics if it's only used there.
- The DevPanel component lives in `examples/demos/components/` since it's demo UI, not library code. If it grows useful enough to be a separate package, it can become `packages/lynx-pretext-devtools/` later.

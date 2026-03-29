/**
 * Pre-build script that copies built demo bundles and source files
 * to public/examples/ for the <Go> component to consume.
 *
 * Mirrors the vue-lynx website pattern: builds locally, no npm round-trip.
 * Each demo gets its bundle renamed to main.lynx.bundle (Go web convention).
 *
 * Usage:
 *   node scripts/prepare-examples.mjs
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const DIST_DIR = path.join(REPO_ROOT, 'dist');
const EXAMPLES_DEST = path.resolve(__dirname, '../public/examples');
const EXAMPLE_GIT_BASE_URL =
  'https://github.com/Huxpro/lynx-pretext/tree/main';

/** All demo entries to expose on the website (matches lynx.config.ts). */
const demos = [
  {
    name: 'basic-height',
    sources: ['pages/basic-height.tsx'],
  },
  {
    name: 'layout-with-lines',
    sources: ['pages/layout-with-lines.tsx'],
  },
  {
    name: 'shrinkwrap',
    sources: ['pages/shrinkwrap.tsx'],
  },
  {
    name: 'variable-flow',
    sources: ['pages/variable-flow.tsx'],
  },
  {
    name: 'accuracy',
    sources: ['pages/accuracy.tsx'],
  },
  {
    name: 'bubbles',
    sources: ['pages/demos/bubbles.tsx', 'pages/demos/bubbles-shared.ts'],
  },
  {
    name: 'dynamic-layout',
    sources: [
      'pages/demos/dynamic-layout.tsx',
      'pages/demos/dynamic-layout-text.ts',
      'pages/demos/wrap-geometry.ts',
      'pages/demos/hull-data.ts',
    ],
  },
  {
    name: 'editorial-engine',
    sources: ['pages/demos/editorial-engine.tsx'],
  },
  {
    name: 'dynamic-layout-mts',
    sources: [
      'pages/demos/dynamic-layout-mts.tsx',
      'pages/demos/dynamic-layout-text.ts',
      'pages/demos/hull-data.ts',
      'pages/demos/wrap-geometry.ts',
    ],
  },
  {
    name: 'dynamic-layout-bts',
    sources: [
      'pages/demos/dynamic-layout-bts.tsx',
      'pages/demos/dynamic-layout-text.ts',
      'pages/demos/hull-data.ts',
      'pages/demos/wrap-geometry.ts',
    ],
  },
  {
    name: 'editorial-mts',
    sources: ['pages/demos/editorial-mts.tsx', 'pages/demos/wrap-geometry.ts'],
  },
  {
    name: 'wireframe-torus',
    sources: ['pages/demos/wireframe-torus.tsx'],
  },
];

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

// --- Build if needed ---

if (!fs.existsSync(DIST_DIR)) {
  console.info('Building main project (no dist/ found)…');
  execSync('pnpm build', { cwd: REPO_ROOT, stdio: 'inherit' });
}

// --- Clean destination ---

if (fs.existsSync(EXAMPLES_DEST)) {
  fs.rmSync(EXAMPLES_DEST, { recursive: true });
}
fs.mkdirSync(EXAMPLES_DEST, { recursive: true });

// --- Process each demo ---

let processed = 0;

for (const demo of demos) {
  const bundleFile = `${demo.name}.lynx.bundle`;
  const bundlePath = path.join(DIST_DIR, bundleFile);

  if (!fs.existsSync(bundlePath)) {
    console.warn(`  ⚠ skipping ${demo.name}: ${bundleFile} not found in dist/`);
    continue;
  }

  const destDir = path.join(EXAMPLES_DEST, demo.name);
  const destDist = path.join(destDir, 'dist');
  fs.mkdirSync(destDist, { recursive: true });

  // Copy the .lynx.bundle, renamed to main.lynx.bundle (Go web convention)
  fs.copyFileSync(bundlePath, path.join(destDist, 'main.lynx.bundle'));

  // Copy static assets from dist/static/ (images referenced by bundles)
  const staticDir = path.join(DIST_DIR, 'static');
  if (fs.existsSync(staticDir)) {
    copyDir(staticDir, path.join(destDist, 'static'));
  }

  // Copy source files
  const sourceFiles = [];
  for (const srcFile of demo.sources) {
    const srcPath = path.join(REPO_ROOT, srcFile);
    if (!fs.existsSync(srcPath)) continue;
    const destPath = path.join(destDir, srcFile);
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    fs.copyFileSync(srcPath, destPath);
    sourceFiles.push(srcFile);
  }

  // Copy lynx.config.ts for reference
  const configSrc = path.join(REPO_ROOT, 'lynx.config.ts');
  if (fs.existsSync(configSrc)) {
    fs.copyFileSync(configSrc, path.join(destDir, 'lynx.config.ts'));
    sourceFiles.push('lynx.config.ts');
  }

  // Generate example-metadata.json
  const metadata = {
    name: demo.name,
    files: sourceFiles,
    templateFiles: [{ name: 'main', file: 'dist/main.lynx.bundle' }],
    exampleGitBaseUrl: EXAMPLE_GIT_BASE_URL,
  };

  fs.writeFileSync(
    path.join(destDir, 'example-metadata.json'),
    JSON.stringify(metadata, null, 2),
  );

  processed++;
  console.info(`  ✓ ${demo.name} (${sourceFiles.length} files)`);
}

console.info(`\nPrepared ${processed}/${demos.length} examples in public/examples/`);

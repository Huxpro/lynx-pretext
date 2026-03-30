/**
 * Pre-build script that copies the built dist/ and source files into a single
 * "lynx-pretext" example at public/examples/lynx-pretext/ for Go web to consume.
 *
 * Unlike vue-lynx (many separate example packages), lynx-pretext is one project
 * with multiple entries — so it becomes one Go web example with many templateFiles.
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
const EXAMPLE_DIR = path.join(EXAMPLES_DEST, 'lynx-pretext');
const EXAMPLE_GIT_BASE_URL =
  'https://github.com/Huxpro/lynx-pretext/tree/main';

/** Source files to include for code viewing. */
const sourceFiles = [
  'lynx.config.ts',
  'pages/basic-height.tsx',
  'pages/layout-with-lines.tsx',
  'pages/shrinkwrap.tsx',
  'pages/variable-flow.tsx',
  'pages/accuracy.tsx',
  'pages/demos/bubbles.tsx',
  'pages/demos/bubbles-shared.ts',
  'pages/demos/dynamic-layout.tsx',
  'pages/demos/dynamic-layout-text.ts',
  'pages/demos/dynamic-layout-mts.tsx',
  'pages/demos/dynamic-layout-bts.tsx',
  'pages/demos/editorial-engine.tsx',
  'pages/demos/editorial-mts.tsx',
  'pages/demos/wireframe-torus.tsx',
  'pages/demos/wrap-geometry.ts',
  'pages/demos/hull-data.ts',
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

// --- Copy entire dist/ ---

const destDist = path.join(EXAMPLE_DIR, 'dist');
copyDir(DIST_DIR, destDist);
console.info('  ✓ dist/ copied');

// --- Copy source files ---

const copiedFiles = [];
for (const srcFile of sourceFiles) {
  const srcPath = path.join(REPO_ROOT, srcFile);
  if (!fs.existsSync(srcPath)) {
    console.warn(`  ⚠ ${srcFile} not found, skipping`);
    continue;
  }
  const destPath = path.join(EXAMPLE_DIR, srcFile);
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  fs.copyFileSync(srcPath, destPath);
  copiedFiles.push(srcFile);
}
console.info(`  ✓ ${copiedFiles.length} source files copied`);

// --- Discover templateFiles from dist/ ---

const templateFiles = fs
  .readdirSync(destDist)
  .filter((f) => f.endsWith('.lynx.bundle'))
  .sort()
  .map((f) => ({ name: f.replace('.lynx.bundle', ''), file: `dist/${f}` }));

console.info(`  ✓ ${templateFiles.length} template entries`);

// --- Generate example-metadata.json ---

fs.writeFileSync(
  path.join(EXAMPLE_DIR, 'example-metadata.json'),
  JSON.stringify(
    {
      name: 'lynx-pretext',
      files: copiedFiles,
      templateFiles,
      exampleGitBaseUrl: EXAMPLE_GIT_BASE_URL,
    },
    null,
    2,
  ),
);

console.info('\nPrepared example at public/examples/lynx-pretext/');

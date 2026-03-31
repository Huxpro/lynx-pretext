/**
 * Pre-build script that builds all examples and prepares them for Go web.
 * 
 * Each example project in examples/ becomes a separate Go web example
 * with its own metadata. The index page displays a grid of mobile previews.
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
const EXAMPLES_DIR = path.join(REPO_ROOT, 'examples');
const EXAMPLES_DEST = path.resolve(__dirname, '../public/examples');
const EXAMPLE_GIT_BASE_URL =
  'https://github.com/Huxpro/lynx-pretext/tree/main';

// Example projects with display names
const EXAMPLE_PROJECTS = [
  { dir: 'basic', name: 'Basic Layout', description: 'Basic text layout examples' },
  { dir: 'bubble', name: 'Bubbles', description: 'Bubble animation demo' },
  { dir: 'dynamic-layout', name: 'Dynamic Layout', description: 'Dynamic text layout with animations' },
  { dir: 'editorial', name: 'Editorial', description: 'Editorial layout engine' },
  { dir: 'ascii-arts', name: 'ASCII Arts', description: 'ASCII art rendering' },
  { dir: 'dance', name: 'Dance', description: 'Sprite-based dance animation' },
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

function copySrcFiles(exampleDir, destDir) {
  const srcDir = path.join(exampleDir, 'src');
  const destSrcDir = path.join(destDir, 'src');
  const copiedFiles = [];

  if (fs.existsSync(srcDir)) {
    copyDir(srcDir, destSrcDir);
    // Collect all .tsx and .ts files
    for (const file of fs.readdirSync(srcDir, { withFileTypes: true })) {
      if (file.isFile() && /\.(tsx?|ts)$/.test(file.name)) {
        copiedFiles.push(`src/${file.name}`);
      }
    }
  }
  return copiedFiles;
}

// --- Build all examples ---

console.info('Building all examples...');
execSync('pnpm build:examples', { cwd: REPO_ROOT, stdio: 'inherit' });

// --- Clean destination ---

if (fs.existsSync(EXAMPLES_DEST)) {
  fs.rmSync(EXAMPLES_DEST, { recursive: true });
}

// --- Process each example project ---

const allExamples = [];

for (const project of EXAMPLE_PROJECTS) {
  const { dir, name, description } = project;
  const exampleDir = path.join(EXAMPLES_DIR, dir);
  const distDir = path.join(exampleDir, 'dist');
  const assetsDir = path.join(exampleDir, 'assets');
  
  if (!fs.existsSync(distDir)) {
    console.warn(`  ⚠ ${dir}: no dist/ found, skipping`);
    continue;
  }

  // Create example directory: public/examples/{dir}/
  const exampleDest = path.join(EXAMPLES_DEST, dir);
  const destDist = path.join(exampleDest, 'dist');
  
  // Copy dist/
  copyDir(distDir, destDist);
  
  // Copy assets/ if exists
  if (fs.existsSync(assetsDir)) {
    copyDir(assetsDir, path.join(exampleDest, 'assets'));
  }

  // Copy preview video files
  const previewFiles = fs.readdirSync(exampleDir).filter(f =>
    f.startsWith('preview') && f.endsWith('.mp4')
  );
  for (const previewFile of previewFiles) {
    fs.copyFileSync(
      path.join(exampleDir, previewFile),
      path.join(exampleDest, previewFile)
    );
  }

  // Copy lynx.config.ts
  const configPath = path.join(exampleDir, 'lynx.config.ts');
  if (fs.existsSync(configPath)) {
    fs.copyFileSync(configPath, path.join(exampleDest, 'lynx.config.ts'));
  }
  
  // Copy source files
  const copiedFiles = copySrcFiles(exampleDir, exampleDest);

  // Discover templateFiles from dist/
  const templateFiles = fs
    .readdirSync(destDist)
    .filter((f) => f.endsWith('.lynx.bundle'))
    .sort()
    .map((f) => ({ name: f.replace('.lynx.bundle', ''), file: `dist/${f}` }));

  // Find main entry (either 'main' or 'index', or first entry)
  let mainEntry = templateFiles.find(t => t.name === 'main');
  if (!mainEntry) {
    mainEntry = templateFiles.find(t => t.name === 'index');
  }
  if (!mainEntry && templateFiles.length > 0) {
    mainEntry = templateFiles[0];
  }

  // Generate example-metadata.json
  const metadata = {
    name: dir,
    displayName: name,
    description,
    files: copiedFiles,
    templateFiles,
    mainEntry: mainEntry?.name || 'main',
    exampleGitBaseUrl: `${EXAMPLE_GIT_BASE_URL}/examples/${dir}`,
  };

  fs.writeFileSync(
    path.join(exampleDest, 'example-metadata.json'),
    JSON.stringify(metadata, null, 2),
  );

  allExamples.push({
    name: dir,
    displayName: name,
    description,
    mainEntry: metadata.mainEntry,
    entryCount: templateFiles.length,
  });

  console.info(`  ✓ ${dir}: ${templateFiles.length} entries, main: ${metadata.mainEntry}`);
}

// --- Generate index metadata ---

const indexMetadata = {
  examples: allExamples,
};

fs.writeFileSync(
  path.join(EXAMPLES_DEST, 'index.json'),
  JSON.stringify(indexMetadata, null, 2),
);

console.info(`\nPrepared ${allExamples.length} examples at public/examples/`);

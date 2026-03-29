/**
 * Assembles the static website into dist/:
 *   dist/index.html        ← from website/index.html
 *   dist/examples/          ← from website/public/examples/ (built bundles)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const dist = path.join(root, 'dist');

// Clean
if (fs.existsSync(dist)) fs.rmSync(dist, { recursive: true });
fs.mkdirSync(dist, { recursive: true });

// Copy index.html
fs.copyFileSync(path.join(root, 'index.html'), path.join(dist, 'index.html'));

// Copy examples
const exSrc = path.join(root, 'public/examples');
if (fs.existsSync(exSrc)) {
  copyDir(exSrc, path.join(dist, 'examples'));
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

console.log('Built website to dist/');

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEBSITE_ROOT = path.resolve(__dirname, '..');

function readWebsiteFile(relativePath) {
  return fs.readFileSync(path.join(WEBSITE_ROOT, relativePath), 'utf8');
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

test('Go preview cards use static preview assets from public/previews', () => {
  const source = readWebsiteFile('src/main.tsx');
  const expectedAssets = [
    '/previews/editorial.mp4',
    '/previews/torus.mp4',
    '/previews/particles.mp4',
    '/previews/dance.mp4',
    '/previews/dynamic-layout.mp4',
    '/previews/bubble.mp4',
  ];

  assert.doesNotMatch(source, /img:\s*['"]\/examples\/[^'"]+\.mp4['"]/);

  for (const asset of expectedAssets) {
    assert.match(source, new RegExp(`img:\\s*['"]${escapeRegex(asset)}['"]`));
  }
});

test('prepare-examples no longer copies preview videos into generated examples output', () => {
  const source = readWebsiteFile('scripts/prepare-examples.mjs');

  assert.doesNotMatch(source, /website\/public\/previews/);
  assert.doesNotMatch(source, /const previewsDir =/);
  assert.doesNotMatch(source, /Copied preview:/);
});

test('gitignore keeps preview videos out of generated public/examples output', () => {
  const source = readWebsiteFile('.gitignore');

  assert.doesNotMatch(source, /public\/examples\/\*\/preview\*\.mp4/i);
});

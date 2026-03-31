import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
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

function readVideoStats(relativePath) {
  const output = execFileSync(
    'ffprobe',
    [
      '-v',
      'error',
      '-select_streams',
      'v:0',
      '-show_entries',
      'stream=width,height',
      '-show_entries',
      'format=size',
      '-of',
      'json',
      path.join(WEBSITE_ROOT, relativePath),
    ],
    { encoding: 'utf8' },
  );
  const data = JSON.parse(output);
  const [stream] = data.streams;

  return {
    width: stream.width,
    height: stream.height,
    size: Number(data.format.size),
  };
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

test('preview videos stay within a smaller mobile resolution and size budget', () => {
  const previewFiles = [
    'public/previews/editorial.mp4',
    'public/previews/torus.mp4',
    'public/previews/particles.mp4',
    'public/previews/dance.mp4',
    'public/previews/dynamic-layout.mp4',
    'public/previews/bubble.mp4',
  ];
  let totalSize = 0;

  for (const previewFile of previewFiles) {
    const stats = readVideoStats(previewFile);

    assert.ok(
      stats.width <= 720,
      `${previewFile} width ${stats.width}px exceeds 720px budget`,
    );
    assert.ok(
      stats.height <= 1568,
      `${previewFile} height ${stats.height}px exceeds 1568px budget`,
    );

    totalSize += stats.size;
  }

  assert.ok(
    totalSize <= 12 * 1024 * 1024,
    `preview videos total ${totalSize} bytes exceeds 12 MiB budget`,
  );
});

test('page width stays slightly tighter on desktop', () => {
  const source = readWebsiteFile('src/styles.css');

  assert.match(source, /\.page\s*\{[\s\S]*max-width:\s*1140px;/);
});

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const DANCE_ASSETS_DIR = path.join(REPO_ROOT, 'examples/dance/assets');
const DANCE_SRC_DIR = path.join(REPO_ROOT, 'examples/dance/src');

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(DANCE_ASSETS_DIR, relativePath), 'utf8'));
}

function fileSize(relativePath) {
  return fs.statSync(path.join(DANCE_ASSETS_DIR, relativePath)).size;
}

test('dance sprite assets stay within an acceptable size budget', () => {
  const chikaSize = fileSize('chika-sprite.png');
  const makimaSize = fileSize('makima-sprite.png');

  assert.ok(
    chikaSize <= 8 * 1024 * 1024,
    `chika sprite is ${chikaSize} bytes, expected <= 8 MiB`,
  );
  assert.ok(
    makimaSize <= 4 * 1024 * 1024,
    `makima sprite is ${makimaSize} bytes, expected <= 4 MiB`,
  );
  assert.ok(
    chikaSize + makimaSize <= 12 * 1024 * 1024,
    `combined sprite size is ${chikaSize + makimaSize} bytes, expected <= 12 MiB`,
  );
});

test('makima sprite resolution is slightly reduced for shipping', () => {
  const makimaMeta = readJson('makima-meta.json');
  const makimaSource = fs.readFileSync(
    path.join(DANCE_SRC_DIR, 'makima-exclusion.ts'),
    'utf8',
  );

  assert.ok(
    makimaMeta.frameWidth <= 432,
    `makima frame width is ${makimaMeta.frameWidth}px, expected <= 432px`,
  );
  assert.ok(
    makimaMeta.frameHeight <= 768,
    `makima frame height is ${makimaMeta.frameHeight}px, expected <= 768px`,
  );
  assert.match(makimaSource, /"frameWidth": 432/);
  assert.match(makimaSource, /"frameHeight": 768/);
  assert.match(makimaSource, /x: col \* 432,/);
  assert.match(makimaSource, /y: row \* 768,/);
});

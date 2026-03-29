/**
 * Packages built demo bundles into individual npm packages for go-web consumption.
 *
 * After `pnpm build`, each demo entry's .lynx.bundle is packaged as
 * @lynx-pretext-example/<name> under .examples/<name>/.
 *
 * Usage:
 *   pnpm build && node scripts/package-examples.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');
const outputDir = path.join(rootDir, '.examples');

const rootPkg = JSON.parse(
  fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'),
);

/** Demo entries to package. Each maps to an entry in lynx.config.ts. */
const examples = [
  {
    name: 'bubbles',
    description:
      'Tight multiline message bubbles with optimal wrapping — Lynx port of Pretext bubbles demo',
    sources: ['pages/demos/bubbles.tsx', 'pages/demos/bubbles-shared.ts'],
  },
  {
    name: 'dynamic-layout',
    description:
      'Fixed-height editorial spread with obstacle-aware title routing — Lynx port of Pretext dynamic-layout demo',
    sources: [
      'pages/demos/dynamic-layout.tsx',
      'pages/demos/dynamic-layout-text.ts',
      'pages/demos/wrap-geometry.ts',
      'pages/demos/hull-data.ts',
    ],
  },
  {
    name: 'editorial-engine',
    description:
      'Animated orbs, live text reflow, pull quotes, multi-column flow — Lynx port of Pretext editorial-engine demo',
    sources: ['pages/demos/editorial-engine.tsx'],
  },
];

// Clean output
if (fs.existsSync(outputDir)) {
  fs.rmSync(outputDir, { recursive: true, force: true });
}

let count = 0;

for (const example of examples) {
  const bundleFile = `${example.name}.lynx.bundle`;
  const bundlePath = path.join(distDir, bundleFile);

  if (!fs.existsSync(bundlePath)) {
    console.warn(`  ⚠ skipping ${example.name}: ${bundleFile} not found in dist/`);
    continue;
  }

  const exampleDir = path.join(outputDir, example.name);
  const exampleDistDir = path.join(exampleDir, 'dist');
  fs.mkdirSync(exampleDistDir, { recursive: true });

  // Copy the .lynx.bundle
  fs.copyFileSync(bundlePath, path.join(exampleDistDir, bundleFile));

  // Copy any related assets (e.g., images referenced by this entry)
  // rspeedy puts shared assets in dist/ — copy all non-bundle assets
  for (const file of fs.readdirSync(distDir)) {
    if (file.endsWith('.lynx.bundle') || file.endsWith('.web.bundle')) continue;
    const src = path.join(distDir, file);
    if (fs.statSync(src).isFile()) {
      fs.copyFileSync(src, path.join(exampleDistDir, file));
    }
  }

  // Copy source files (for code viewing in go-web)
  for (const srcFile of example.sources) {
    const srcPath = path.join(rootDir, srcFile);
    if (!fs.existsSync(srcPath)) continue;
    const destPath = path.join(exampleDir, srcFile);
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    fs.copyFileSync(srcPath, destPath);
  }

  // Copy lynx.config.ts for reference
  const configSrc = path.join(rootDir, 'lynx.config.ts');
  if (fs.existsSync(configSrc)) {
    fs.copyFileSync(configSrc, path.join(exampleDir, 'lynx.config.ts'));
  }

  // Copy asset images used by demos
  const assetsDir = path.join(rootDir, 'pages/assets');
  if (fs.existsSync(assetsDir)) {
    const destAssetsDir = path.join(exampleDir, 'pages/assets');
    fs.mkdirSync(destAssetsDir, { recursive: true });
    for (const file of fs.readdirSync(assetsDir)) {
      fs.copyFileSync(
        path.join(assetsDir, file),
        path.join(destAssetsDir, file),
      );
    }
  }

  // Generate package.json
  const pkg = {
    name: `@lynx-pretext-example/${example.name}`,
    version: rootPkg.version,
    private: false,
    description: example.description,
    license: 'MIT',
    type: 'module',
    files: ['dist', 'pages', 'lynx.config.ts'],
    repository: {
      type: 'git',
      url: 'https://github.com/Huxpro/lynx-pretext',
      directory: `pages/demos`,
    },
    dependencies: {
      '@lynx-js/react': rootPkg.dependencies['@lynx-js/react'],
    },
  };

  fs.writeFileSync(
    path.join(exampleDir, 'package.json'),
    JSON.stringify(pkg, null, 2) + '\n',
  );

  console.log(`  ✓ ${example.name}`);
  count++;
}

console.log(`\nPackaged ${count} examples in .examples/`);

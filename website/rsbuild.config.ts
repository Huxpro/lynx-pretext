import { defineConfig } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';
import { pluginSass } from '@rsbuild/plugin-sass';
import path from 'node:path';
import fs from 'node:fs';

// Read template entries from the prepared example metadata
const metadataPath = path.resolve(
  __dirname,
  'public/examples/lynx-pretext/example-metadata.json',
);
let entryNames: string[] = [];
if (fs.existsSync(metadataPath)) {
  const meta = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
  entryNames = meta.templateFiles.map(
    (t: { name: string }) => t.name,
  );
}

export default defineConfig({
  plugins: [pluginReact(), pluginSass()],

  html: {
    template: ({ entryName }) =>
      entryName === 'embed'
        ? './src/embed.html'
        : './src/index.html',
  },

  source: {
    entry: {
      index: './src/main.tsx',
      embed: './src/embed-entry.tsx',
    },
    define: {
      'import.meta.env.ENTRY_NAMES': JSON.stringify(entryNames),
    },
  },

  resolve: {
    alias: {
      react: path.resolve(__dirname, 'node_modules/react'),
      'react-dom': path.resolve(__dirname, 'node_modules/react-dom'),
      '@douyinfe/semi-ui/dist/css/semi.min.css': path.resolve(
        __dirname,
        'node_modules/@douyinfe/semi-ui/dist/css/semi.min.css',
      ),
    },
  },

  tools: {
    sass: {
      sassOptions: {
        silenceDeprecations: ['legacy-js-api'],
      },
    },
  },
});

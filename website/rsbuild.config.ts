import { defineConfig } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';
import { pluginSass } from '@rsbuild/plugin-sass';
import path from 'node:path';
import fs from 'node:fs';

// Discover examples from public/examples/ (populated by prepare-examples.mjs)
const examplesDir = path.resolve(__dirname, 'public/examples');
const exampleNames = fs.existsSync(examplesDir)
  ? fs
      .readdirSync(examplesDir)
      .filter((name) =>
        fs.statSync(path.join(examplesDir, name)).isDirectory(),
      )
      .sort()
  : [];

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
      'import.meta.env.EXAMPLES': JSON.stringify(exampleNames),
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

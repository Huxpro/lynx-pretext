import { defineConfig } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';
import { pluginSass } from '@rsbuild/plugin-sass';
import path from 'node:path';

export default defineConfig({
  plugins: [pluginReact(), pluginSass()],

  source: {
    entry: {
      index: './src/main.tsx',
    },
  },

  server: {
    publicDir: {
      name: 'public',
      copyOnBuild: true,
    },
  },

  html: {
    template: './src/index.html',
  },

  output: {
    assetPrefix: '/',
    copy: [
      { from: 'public', to: '.' }
    ],
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

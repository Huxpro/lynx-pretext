import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from '@lynx-js/rspeedy'
import { pluginQRCode } from '@lynx-js/qrcode-rsbuild-plugin'
import { pluginReactLynx } from '@lynx-js/react-rsbuild-plugin'
import { pluginTypeCheck } from '@rsbuild/plugin-type-check'

const exampleName = path.basename(path.dirname(fileURLToPath(import.meta.url)))

export default defineConfig({
  output: {
    assetPrefix: `https://lynx-pretext.vercel.app/examples/${exampleName}/dist/`,
  },
  source: {
    entry: {
      main: './src/dynamic-layout.tsx',
      'bts-only': './src/dynamic-layout-bts.tsx',
      'mts-only': './src/dynamic-layout-mts.tsx',
    },
  },
  plugins: [
    pluginQRCode({
      schema(url) {
        return `${url}?fullscreen=true`
      },
    }),
    pluginReactLynx(),
    pluginTypeCheck(),
  ],
})

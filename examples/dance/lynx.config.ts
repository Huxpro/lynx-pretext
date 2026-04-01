import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from '@lynx-js/rspeedy'
import { pluginQRCode } from '@lynx-js/qrcode-rsbuild-plugin'
import { pluginReactLynx } from '@lynx-js/react-rsbuild-plugin'

const exampleName = path.basename(path.dirname(fileURLToPath(import.meta.url)))

export default defineConfig({
  environments: {
    lynx: {},
    web: {},
  },
  output: {
    assetPrefix: `https://lynx-pretext.vercel.app/examples/${exampleName}/dist/`,
  },
  source: {
    entry: {
      main: './src/index.tsx',
    },
  },
  plugins: [
    pluginQRCode({
      schema(url) {
        return `${url}?fullscreen=true`
      },
    }),
    pluginReactLynx(),
  ],
})

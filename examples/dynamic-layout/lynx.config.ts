import { defineConfig } from '@lynx-js/rspeedy'
import { pluginQRCode } from '@lynx-js/qrcode-rsbuild-plugin'
import { pluginReactLynx } from '@lynx-js/react-rsbuild-plugin'
import { pluginTypeCheck } from '@rsbuild/plugin-type-check'

export default defineConfig({
  source: {
    entry: {
      main: './src/dynamic-layout.tsx',
      'bts-only': './src/dynamic-layout-bts.tsx',
      'mts-only': './src/dynamic-layout-mts.tsx',
    },
  },
  output: {
    assetPrefix: '/',
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

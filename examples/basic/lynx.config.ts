import { defineConfig } from '@lynx-js/rspeedy'
import { pluginQRCode } from '@lynx-js/qrcode-rsbuild-plugin'
import { pluginReactLynx } from '@lynx-js/react-rsbuild-plugin'
import { pluginTypeCheck } from '@rsbuild/plugin-type-check'

export default defineConfig({
  source: {
    entry: {
      main: './src/index.tsx',
      'basic-height': './src/basic-height.tsx',
      'layout-with-lines': './src/layout-with-lines.tsx',
      shrinkwrap: './src/shrinkwrap.tsx',
      'variable-flow': './src/variable-flow.tsx',
      accuracy: './src/accuracy.tsx',
      'hello-world': './src/hello-world.tsx',
      'bidi-test': './src/bidi-test.tsx',
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

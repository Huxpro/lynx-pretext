import { defineConfig } from '@lynx-js/rspeedy'

import { pluginQRCode } from '@lynx-js/qrcode-rsbuild-plugin'
import { pluginReactLynx } from '@lynx-js/react-rsbuild-plugin'
import { pluginTypeCheck } from '@rsbuild/plugin-type-check'

export default defineConfig({
  source: {
    entry: {
      main: './src/index.tsx',
      'basic-height': './pages/basic-height.tsx',
      'layout-with-lines': './pages/layout-with-lines.tsx',
      shrinkwrap: './pages/shrinkwrap.tsx',
      'variable-flow': './pages/variable-flow.tsx',
      accuracy: './pages/accuracy.tsx',
      bubbles: './pages/demos/bubbles.tsx',
      'dynamic-layout': './pages/demos/dynamic-layout.tsx',
      'editorial-engine': './pages/demos/editorial-engine.tsx',
      'dynamic-layout-mts': './pages/demos/dynamic-layout-mts.tsx',
      'dynamic-layout-bts': './pages/demos/dynamic-layout-bts.tsx',
      'editorial-mts': './pages/demos/editorial-mts.tsx',
      'wireframe-torus': './pages/demos/wireframe-torus.tsx',
      'field-mono': './pages/demos/field-mono.tsx',
      'field-prop': './pages/demos/field-prop.tsx',
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

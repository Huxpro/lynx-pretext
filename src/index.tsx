import { root } from '@lynx-js/react'

import { DynamicLayoutPage } from '../pages/demos/dynamic-layout.js'

root.render(<DynamicLayoutPage />)

if (import.meta.webpackHot) {
  import.meta.webpackHot.accept()
}

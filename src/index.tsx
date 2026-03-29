import { root } from '@lynx-js/react'

import { BubblesPage } from '../pages/demos/bubbles.js'

root.render(<BubblesPage />)

if (import.meta.webpackHot) {
  import.meta.webpackHot.accept()
}

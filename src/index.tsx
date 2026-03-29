import { root } from '@lynx-js/react'

import { AccuracyPage } from '../pages/accuracy.js'

root.render(<AccuracyPage />)

if (import.meta.webpackHot) {
  import.meta.webpackHot.accept()
}

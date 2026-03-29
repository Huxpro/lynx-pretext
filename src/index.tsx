import { root } from '@lynx-js/react'

import { LayoutWithLinesPage } from '../pages/layout-with-lines.js'

root.render(<LayoutWithLinesPage />)

if (import.meta.webpackHot) {
  import.meta.webpackHot.accept()
}

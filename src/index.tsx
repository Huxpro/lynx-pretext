import { root } from '@lynx-js/react'

import { ShrinkwrapPage } from '../pages/shrinkwrap.js'

root.render(<ShrinkwrapPage />)

if (import.meta.webpackHot) {
  import.meta.webpackHot.accept()
}

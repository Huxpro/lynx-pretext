import { root } from '@lynx-js/react'

import { BasicHeightPage } from '../pages/basic-height.js'

root.render(<BasicHeightPage />)

if (import.meta.webpackHot) {
  import.meta.webpackHot.accept()
}

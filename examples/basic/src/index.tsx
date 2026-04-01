import { root } from '@lynx-js/react'
import { BidiTestPage } from './bidi-test'

root.render(<BidiTestPage />)

if (import.meta.webpackHot) {
  import.meta.webpackHot.accept()
}

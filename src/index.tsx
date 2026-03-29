import { root } from '@lynx-js/react'

import { HelloWorld } from '../pages/hello-world.js'

root.render(<HelloWorld />)

if (import.meta.webpackHot) {
  import.meta.webpackHot.accept()
}

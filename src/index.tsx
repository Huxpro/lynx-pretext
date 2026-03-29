import { root } from '@lynx-js/react'
import { VariableFlowPage } from '../pages/variable-flow'

root.render(<VariableFlowPage />)

if (import.meta.webpackHot) {
  import.meta.webpackHot.accept()
}

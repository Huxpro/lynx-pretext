import { DevPanelProvider } from '../context'
import type { DevPanelRootProps } from '../types'

export function DevPanelRoot({
  children,
  defaultOpen = false,
}: DevPanelRootProps): React.ReactElement {
  return (
    <DevPanelProvider defaultOpen={defaultOpen}>
      {children}
    </DevPanelProvider>
  )
}

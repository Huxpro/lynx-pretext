import { createContext, useContext, useState } from '@lynx-js/react'
import type { DevPanelContextValue } from './types'

const DevPanelContext = createContext<DevPanelContextValue | null>(null)

export function useDevPanelContext(): DevPanelContextValue {
  const ctx = useContext(DevPanelContext)
  if (!ctx) {
    throw new Error('DevPanel components must be used within DevPanel.Root')
  }
  return ctx
}

export interface DevPanelProviderProps {
  children: React.ReactNode
  defaultOpen?: boolean
}

export function DevPanelProvider({
  children,
  defaultOpen = false,
}: DevPanelProviderProps): React.ReactElement {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <DevPanelContext.Provider value={{ open, setOpen }}>
      {children}
    </DevPanelContext.Provider>
  )
}

import type { MainThread } from '@lynx-js/types'

export interface DevPanelRootProps {
  children: React.ReactNode
  defaultOpen?: boolean
}

export interface DevPanelContentProps {
  title: string
  description?: string
  children?: React.ReactNode
}

export interface DevPanelStatProps {
  label: string
  value: string | number
}

export interface DevPanelStepperProps {
  label: string
  value: number
  min?: number
  max?: number
  step?: number
  unit?: string
  onChange: (value: number) => void
}

export interface DevPanelButtonProps {
  label: string
  active?: boolean
  onPress: () => void
}

export interface DevPanelStatsProps {
  children: React.ReactNode
}

export interface DevPanelActionsProps {
  children: React.ReactNode
}

// Context types
export interface DevPanelContextValue {
  open: boolean
  setOpen: (open: boolean) => void
}

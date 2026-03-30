// Context
export { DevPanelProvider, useDevPanelContext } from './context'

// Types
export type {
  DevPanelRootProps,
  DevPanelContentProps,
  DevPanelStatProps,
  DevPanelStepperProps,
  DevPanelButtonProps,
  DevPanelStatsProps,
  DevPanelActionsProps,
  DevPanelContextValue,
} from './types'

// Hook
export { useDevPanelFPS } from './hooks/useDevPanelFPS'
export type { UseDevPanelFPSReturn } from './hooks/useDevPanelFPS'

// FPS Component (requires props from hook)
export { DevPanelFPS } from './components/DevPanelFPS'
export type { DevPanelFPSProps } from './components/DevPanelFPS'

// Constants (for advanced customization)
export {
  PANEL_BG,
  PANEL_RADIUS,
  PANEL_PADDING,
  TRIGGER_SIZE,
  TRIGGER_RADIUS,
  TRIGGER_BG_OPEN,
  TRIGGER_BG_CLOSED,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
  TEXT_TERTIARY,
  FPS_GREEN,
  FPS_ORANGE,
  FPS_RED,
  STEPPER_BG,
  STEPPER_SIZE,
  STEPPER_RADIUS,
  getFpsColor,
} from './constants'

// Components
import { DevPanelRoot } from './components/DevPanelRoot'
import { DevPanelTrigger } from './components/DevPanelTrigger'
import { DevPanelContent } from './components/DevPanelContent'
import { DevPanelFPS } from './components/DevPanelFPS'
import { DevPanelStats } from './components/DevPanelStats'
import { DevPanelStat } from './components/DevPanelStat'
import { DevPanelStepper } from './components/DevPanelStepper'
import { DevPanelActions } from './components/DevPanelActions'
import { DevPanelButton } from './components/DevPanelButton'

// Namespace assembly (Radix-style compound component API)
export const DevPanel = {
  Root: DevPanelRoot,
  Trigger: DevPanelTrigger,
  Content: DevPanelContent,
  FPS: DevPanelFPS,
  Stats: DevPanelStats,
  Stat: DevPanelStat,
  Stepper: DevPanelStepper,
  Actions: DevPanelActions,
  Button: DevPanelButton,
}

// Panel styling
export const PANEL_BG = 'rgba(0,0,0,0.88)'
export const PANEL_RADIUS = '12px'
export const PANEL_PADDING = '16px'

// Trigger button
export const TRIGGER_SIZE = '36px'
export const TRIGGER_RADIUS = '18px'
export const TRIGGER_BG_OPEN = 'rgba(255,255,255,0.92)'
export const TRIGGER_BG_CLOSED = 'rgba(0,0,0,0.25)'

// Text colors
export const TEXT_PRIMARY = '#fff'
export const TEXT_SECONDARY = 'rgba(255,255,255,0.6)'
export const TEXT_TERTIARY = 'rgba(255,255,255,0.5)'

// FPS color coding
export const FPS_GREEN = '#4caf50'
export const FPS_ORANGE = '#ff9800'
export const FPS_RED = '#f44336'

// Stepper
export const STEPPER_BG = 'rgba(255,255,255,0.2)'
export const STEPPER_SIZE = '28px'
export const STEPPER_RADIUS = '14px'

// Helper: get FPS color based on value
export function getFpsColor(fps: number): string {
  return fps >= 50 ? FPS_GREEN : fps >= 30 ? FPS_ORANGE : FPS_RED
}

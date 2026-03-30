// Panel styling - minimalist devtool aesthetic
export const PANEL_BG = 'rgba(0,0,0,0.88)'
export const PANEL_RADIUS = '6px'
export const PANEL_PADDING = '8px'

// Safe area - iOS status bar height
export const SAFE_AREA_TOP = '48px'

// Trigger button - smaller, more subtle
export const TRIGGER_SIZE = '24px'
export const TRIGGER_RADIUS = '4px'
export const TRIGGER_BG_OPEN = 'rgba(0,0,0,0.85)'
export const TRIGGER_BG_CLOSED = 'rgba(0,0,0,0.18)' // More subtle when not active

// Panel content position (below trigger)
export const PANEL_TOP = '80px' // SAFE_AREA_TOP + TRIGGER_SIZE + 8px gap

// Text colors - muted, devtool-like
export const TEXT_PRIMARY = 'rgba(255,255,255,0.92)'
export const TEXT_SECONDARY = 'rgba(255,255,255,0.55)'
export const TEXT_TERTIARY = 'rgba(255,255,255,0.38)'

// FPS color coding - subtle, not harsh
export const FPS_GREEN = 'rgba(129,199,132,0.9)'
export const FPS_ORANGE = 'rgba(255,183,77,0.9)'
export const FPS_RED = 'rgba(229,115,115,0.9)'

// Stepper - compact
export const STEPPER_BG = 'rgba(255,255,255,0.08)'
export const STEPPER_SIZE = '20px'
export const STEPPER_RADIUS = '3px'

// Button
export const BUTTON_BG = 'rgba(255,255,255,0.06)'
export const BUTTON_ACTIVE = 'rgba(255,255,255,0.15)'

// Helper: get FPS color based on value
export function getFpsColor(fps: number): string {
  return fps >= 50 ? FPS_GREEN : fps >= 30 ? FPS_ORANGE : FPS_RED
}

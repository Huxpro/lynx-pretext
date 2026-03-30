import { useCallback } from '@lynx-js/react'
import {
  STEPPER_BG,
  STEPPER_SIZE,
  STEPPER_RADIUS,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
} from '../constants'
import type { DevPanelStepperProps } from '../types'

export function DevPanelStepper({
  label,
  value,
  min = -Infinity,
  max = Infinity,
  step = 1,
  unit = 'px',
  onChange,
}: DevPanelStepperProps): React.ReactElement {
  const decrease = useCallback(() => {
    onChange(Math.max(min, value - step))
  }, [value, min, step, onChange])

  const increase = useCallback(() => {
    onChange(Math.min(max, value + step))
  }, [value, max, step, onChange])

  const buttonStyle = {
    width: STEPPER_SIZE,
    height: STEPPER_SIZE,
    borderRadius: STEPPER_RADIUS,
    backgroundColor: STEPPER_BG,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  }

  return (
    <view
      style={{
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: '12px',
        gap: '8px',
      }}
    >
      <text style={{ fontSize: '13px', color: TEXT_SECONDARY }}>{label}:</text>

      <view bindtap={decrease} style={buttonStyle}>
        <text style={{ fontSize: '16px', color: TEXT_PRIMARY, fontWeight: 'bold' }}>
          {'\u2212'}
        </text>
      </view>

      <text
        style={{
          fontSize: '13px',
          color: TEXT_PRIMARY,
          minWidth: '55px',
          textAlign: 'center',
        }}
      >
        {`${value}${unit}`}
      </text>

      <view bindtap={increase} style={buttonStyle}>
        <text style={{ fontSize: '16px', color: TEXT_PRIMARY, fontWeight: 'bold' }}>
          +
        </text>
      </view>
    </view>
  )
}

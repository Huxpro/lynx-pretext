import { useCallback } from '@lynx-js/react'
import {
  STEPPER_BG,
  STEPPER_SIZE,
  STEPPER_RADIUS,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
  TEXT_TERTIARY,
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
  const canDecrease = value > min
  const canIncrease = value < max

  const decrease = useCallback(() => {
    if (canDecrease) {
      onChange(Math.max(min, value - step))
    }
  }, [value, min, step, onChange, canDecrease])

  const increase = useCallback(() => {
    if (canIncrease) {
      onChange(Math.min(max, value + step))
    }
  }, [value, max, step, onChange, canIncrease])

  const buttonStyle = (enabled: boolean) => ({
    width: STEPPER_SIZE,
    height: STEPPER_SIZE,
    borderRadius: STEPPER_RADIUS,
    backgroundColor: enabled ? STEPPER_BG : 'transparent',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  })

  return (
    <view
      style={{
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: '6px',
        gap: '6px',
      }}
    >
      <text style={{ fontSize: '9px', color: TEXT_SECONDARY, fontFamily: 'monospace' }}>{label}</text>

      <view bindtap={decrease} style={buttonStyle(canDecrease)}>
        <text style={{ fontSize: '12px', color: canDecrease ? TEXT_PRIMARY : TEXT_TERTIARY, fontFamily: 'monospace', lineHeight: '14px' }}>
          {'\u2212'}
        </text>
      </view>

      <text
        style={{
          fontSize: '10px',
          color: TEXT_PRIMARY,
          fontFamily: 'monospace',
          minWidth: '40px',
          textAlign: 'center',
        }}
      >
        {`${value}${unit}`}
      </text>

      <view bindtap={increase} style={buttonStyle(canIncrease)}>
        <text style={{ fontSize: '12px', color: canIncrease ? TEXT_PRIMARY : TEXT_TERTIARY, fontFamily: 'monospace', lineHeight: '14px' }}>
          +
        </text>
      </view>
    </view>
  )
}

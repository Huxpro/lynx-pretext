import { useCallback } from '@lynx-js/react'
import { TEXT_PRIMARY, STEPPER_BG, STEPPER_RADIUS } from '../constants'
import type { DevPanelButtonProps } from '../types'

export function DevPanelButton({
  label,
  active = false,
  onPress,
}: DevPanelButtonProps): React.ReactElement {
  const handlePress = useCallback(() => {
    onPress()
  }, [onPress])

  return (
    <view
      bindtap={handlePress}
      style={{
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        height: '28px',
        paddingLeft: '12px',
        paddingRight: '12px',
        borderRadius: STEPPER_RADIUS,
        backgroundColor: active ? 'rgba(255,255,255,0.4)' : STEPPER_BG,
      }}
    >
      <text style={{ fontSize: '13px', color: TEXT_PRIMARY, fontWeight: 'bold' }}>
        {label}
      </text>
    </view>
  )
}

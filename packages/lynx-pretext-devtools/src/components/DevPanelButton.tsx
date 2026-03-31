import { useCallback } from '@lynx-js/react'
import { TEXT_PRIMARY, BUTTON_BG, BUTTON_ACTIVE, STEPPER_RADIUS } from '../constants'
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
        height: '22px',
        paddingLeft: '8px',
        paddingRight: '8px',
        borderRadius: STEPPER_RADIUS,
        backgroundColor: active ? BUTTON_ACTIVE : BUTTON_BG,
      }}
    >
      <text style={{ fontSize: '10px', color: TEXT_PRIMARY, fontFamily: 'monospace' }}>
        {label}
      </text>
    </view>
  )
}

import { useCallback } from '@lynx-js/react'
import { useDevPanelContext } from '../context'
import {
  TRIGGER_SIZE,
  TRIGGER_RADIUS,
  TRIGGER_BG_OPEN,
  TRIGGER_BG_CLOSED,
  TEXT_PRIMARY,
} from '../constants'

export function DevPanelTrigger(): React.ReactElement {
  const { open, setOpen } = useDevPanelContext()

  const toggle = useCallback(() => {
    setOpen(!open)
  }, [open, setOpen])

  return (
    <view
      bindtap={toggle}
      style={{
        position: 'absolute',
        top: '67%',
        right: '8px',
        width: TRIGGER_SIZE,
        height: TRIGGER_SIZE,
        borderRadius: TRIGGER_RADIUS,
        backgroundColor: open ? TRIGGER_BG_OPEN : TRIGGER_BG_CLOSED,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <text
        style={{
          fontSize: '12px',
          color: TEXT_PRIMARY,
          fontFamily: 'monospace',
          lineHeight: '14px',
        }}
      >
        {open ? '\u00D7' : '\u2630'}
      </text>
    </view>
  )
}

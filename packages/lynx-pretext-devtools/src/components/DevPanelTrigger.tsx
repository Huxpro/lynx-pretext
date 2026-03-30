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
        top: '12px',
        right: '12px',
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
          fontSize: '20px',
          color: open ? '#333' : TEXT_PRIMARY,
          fontWeight: 'bold',
        }}
      >
        {open ? '\u00D7' : '\u2261'}
      </text>
    </view>
  )
}

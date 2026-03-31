import type { MainThreadRef } from '@lynx-js/react'
import type { MainThread } from '@lynx-js/types'
import { getFpsColor, TEXT_TERTIARY, TEXT_SECONDARY } from '../constants'

export interface DevPanelFPSProps {
  mtsFpsDisplay: number
  btsFpsDisplay: number
  mtsFpsTextRef?: MainThreadRef<MainThread.Element | null>
}

export function DevPanelFPS({
  mtsFpsDisplay,
  btsFpsDisplay,
  mtsFpsTextRef,
}: DevPanelFPSProps): React.ReactElement {
  return (
    <view
      style={{
        display: 'flex',
        flexDirection: 'row',
        marginTop: '6px',
        gap: '12px',
        alignItems: 'center',
      }}
    >
      {/* MTS FPS */}
      <view style={{ display: 'flex', flexDirection: 'row', alignItems: 'baseline', gap: '3px' }}>
        <text style={{ fontSize: '9px', color: TEXT_TERTIARY, fontFamily: 'monospace' }}>M</text>
        <text
          main-thread:ref={mtsFpsTextRef}
          style={{
            fontSize: '11px',
            fontFamily: 'monospace',
            color: getFpsColor(mtsFpsDisplay),
          }}
        >
          {`${mtsFpsDisplay}`}
        </text>
      </view>

      {/* BTS FPS */}
      <view style={{ display: 'flex', flexDirection: 'row', alignItems: 'baseline', gap: '3px' }}>
        <text style={{ fontSize: '9px', color: TEXT_TERTIARY, fontFamily: 'monospace' }}>B</text>
        <text
          style={{
            fontSize: '11px',
            fontFamily: 'monospace',
            color: getFpsColor(btsFpsDisplay),
          }}
        >
          {`${btsFpsDisplay}`}
        </text>
      </view>
    </view>
  )
}

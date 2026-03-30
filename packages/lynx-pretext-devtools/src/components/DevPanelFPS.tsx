import { getFpsColor, TEXT_TERTIARY } from '../constants'

export interface DevPanelFPSProps {
  mtsFpsDisplay: number
  btsFpsDisplay: number
  mtsFpsTextRef?: React.MutableRefObject<any>
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
        marginTop: '12px',
        gap: '16px',
      }}
    >
      {/* MTS FPS */}
      <view>
        <text style={{ fontSize: '11px', color: TEXT_TERTIARY }}>MTS</text>
        <text
          main-thread:ref={mtsFpsTextRef}
          style={{
            fontSize: '14px',
            fontWeight: 'bold',
            color: getFpsColor(mtsFpsDisplay),
          }}
        >
          {`${mtsFpsDisplay}`}
        </text>
      </view>

      {/* BTS FPS */}
      <view>
        <text style={{ fontSize: '11px', color: TEXT_TERTIARY }}>BTS</text>
        <text
          style={{
            fontSize: '14px',
            fontWeight: 'bold',
            color: getFpsColor(btsFpsDisplay),
          }}
        >
          {`${btsFpsDisplay}`}
        </text>
      </view>
    </view>
  )
}

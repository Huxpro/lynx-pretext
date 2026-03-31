import type { DevPanelStatsProps } from '../types'

export function DevPanelStats({
  children,
}: DevPanelStatsProps): React.ReactElement {
  return (
    <view
      style={{
        display: 'flex',
        flexDirection: 'row',
        gap: '10px',
        marginTop: '6px',
      }}
    >
      {children}
    </view>
  )
}

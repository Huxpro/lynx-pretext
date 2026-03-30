import type { DevPanelStatsProps } from '../types'

export function DevPanelStats({
  children,
}: DevPanelStatsProps): React.ReactElement {
  return (
    <view
      style={{
        display: 'flex',
        flexDirection: 'row',
        gap: '16px',
        marginTop: '12px',
      }}
    >
      {children}
    </view>
  )
}

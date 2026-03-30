import type { DevPanelActionsProps } from '../types'

export function DevPanelActions({
  children,
}: DevPanelActionsProps): React.ReactElement {
  return (
    <view
      style={{
        display: 'flex',
        flexDirection: 'row',
        marginTop: '12px',
        gap: '8px',
      }}
    >
      {children}
    </view>
  )
}

import type { DevPanelActionsProps } from '../types'

export function DevPanelActions({
  children,
}: DevPanelActionsProps): React.ReactElement {
  return (
    <view
      style={{
        display: 'flex',
        flexDirection: 'row',
        marginTop: '6px',
        gap: '6px',
      }}
    >
      {children}
    </view>
  )
}

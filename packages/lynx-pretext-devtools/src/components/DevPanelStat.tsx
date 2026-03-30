import { TEXT_PRIMARY, TEXT_TERTIARY } from '../constants'
import type { DevPanelStatProps } from '../types'

export function DevPanelStat({
  label,
  value,
}: DevPanelStatProps): React.ReactElement {
  return (
    <view>
      <text style={{ fontSize: '11px', color: TEXT_TERTIARY }}>{label}</text>
      <text style={{ fontSize: '14px', fontWeight: 'bold', color: TEXT_PRIMARY }}>
        {`${value}`}
      </text>
    </view>
  )
}

import { TEXT_PRIMARY, TEXT_TERTIARY } from '../constants'
import type { DevPanelStatProps } from '../types'

export function DevPanelStat({
  label,
  value,
}: DevPanelStatProps): React.ReactElement {
  return (
    <view style={{ display: 'flex', flexDirection: 'row', alignItems: 'baseline', gap: '4px' }}>
      <text style={{ fontSize: '9px', color: TEXT_TERTIARY, fontFamily: 'monospace' }}>{label}</text>
      <text style={{ fontSize: '11px', fontFamily: 'monospace', color: TEXT_PRIMARY }}>
        {`${value}`}
      </text>
    </view>
  )
}

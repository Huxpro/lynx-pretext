import { useDevPanelContext } from '../context'
import { PANEL_BG, PANEL_RADIUS, PANEL_PADDING, TEXT_PRIMARY, TEXT_SECONDARY } from '../constants'
import type { DevPanelContentProps } from '../types'

export function DevPanelContent({
  title,
  description,
  children,
}: DevPanelContentProps): React.ReactElement | null {
  const { open } = useDevPanelContext()

  if (!open) return null

  return (
    <view
      style={{
        position: 'absolute',
        top: '56px',
        left: '12px',
        right: '12px',
        backgroundColor: PANEL_BG,
        borderRadius: PANEL_RADIUS,
        padding: PANEL_PADDING,
      }}
    >
      <text style={{ fontSize: '18px', fontWeight: 'bold', color: TEXT_PRIMARY }}>
        {title}
      </text>
      {description && (
        <text
          style={{
            fontSize: '13px',
            color: TEXT_SECONDARY,
            marginTop: '4px',
            lineHeight: '18px',
          }}
        >
          {description}
        </text>
      )}
      {children}
    </view>
  )
}

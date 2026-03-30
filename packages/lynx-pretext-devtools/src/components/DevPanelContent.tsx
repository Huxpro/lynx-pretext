import { useDevPanelContext } from '../context'
import { PANEL_BG, PANEL_RADIUS, PANEL_PADDING, TEXT_PRIMARY, TEXT_SECONDARY, PANEL_TOP } from '../constants'
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
        top: PANEL_TOP,
        right: '8px',
        minWidth: '140px',
        backgroundColor: PANEL_BG,
        borderRadius: PANEL_RADIUS,
        padding: PANEL_PADDING,
      }}
    >
      {title && (
        <text style={{
          fontSize: '10px',
          color: TEXT_SECONDARY,
          fontFamily: 'monospace',
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
          marginBottom: '6px',
        }}>
          {title}
        </text>
      )}
      {description && (
        <text
          style={{
            fontSize: '10px',
            color: TEXT_SECONDARY,
            marginTop: '2px',
            lineHeight: '14px',
          }}
        >
          {description}
        </text>
      )}
      {children}
    </view>
  )
}

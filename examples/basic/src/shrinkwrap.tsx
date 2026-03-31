import { root, useState, useMemo } from '@lynx-js/react'

import { layout, prepareWithSegments, walkLineRanges } from 'lynx-pretext'
import { DevPanel, useDevPanelFPS, DevPanelFPS } from 'lynx-pretext-devtools'

const SAMPLE_TEXT =
  'The quick brown fox jumps over the lazy dog. ' +
  'Pack my box with five dozen liquor jugs. ' +
  'How vexingly quick daft zebras jump.'

const FONT_SIZE = 16
const LINE_HEIGHT = 24
const FONT = `${FONT_SIZE}px`

function getMaxLineWidth(prepared: ReturnType<typeof prepareWithSegments>, maxWidth: number): number {
  let maxLineWidth = 0
  walkLineRanges(prepared, maxWidth, line => {
    if (line.width > maxLineWidth) maxLineWidth = line.width
  })
  return maxLineWidth
}

function findShrinkwrapWidth(prepared: ReturnType<typeof prepareWithSegments>, maxWidth: number): number {
  const initialLineCount = layout(prepared, maxWidth, LINE_HEIGHT).lineCount
  let lo = 1
  let hi = Math.max(1, Math.ceil(maxWidth))
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2)
    if (layout(prepared, mid, LINE_HEIGHT).lineCount <= initialLineCount) {
      hi = mid
    } else {
      lo = mid + 1
    }
  }
  return lo
}

export function ShrinkwrapPage() {
  const [maxWidth, setMaxWidth] = useState(360)

  // FPS monitoring - BTS only
  const { btsFpsTick, btsFpsDisplay } = useDevPanelFPS()

  const contentWidth = Math.max(40, maxWidth - 32)
  const prepared = useMemo(() => prepareWithSegments(SAMPLE_TEXT, FONT), [])

  const cssMaxLineWidth = getMaxLineWidth(prepared, contentWidth)
  const cssWidth = Math.ceil(cssMaxLineWidth)
  const shrinkwrapMaxWidth = findShrinkwrapWidth(prepared, contentWidth)
  const shrinkwrapLineWidth = getMaxLineWidth(prepared, shrinkwrapMaxWidth)
  const shrinkwrapWidth = Math.ceil(shrinkwrapLineWidth)
  const lineCount = layout(prepared, contentWidth, LINE_HEIGHT).lineCount
  const height = lineCount * LINE_HEIGHT
  const wastedPixels = Math.max(0, cssWidth - shrinkwrapMaxWidth) * height

  // BTS FPS tick
  btsFpsTick()

  return (
    <DevPanel.Root>
      <view style={{ flex: 1, backgroundColor: '#fff' }}>
        {/* Demo content */}
        <view style={{ flex: 1, padding: '16px', justifyContent: 'center' }}>
          {/* CSS fit-content container */}
          <text style={{ fontSize: '12px', color: '#e65100', marginBottom: '4px' }}>
            {`CSS fit-content (${cssWidth}px)`}
          </text>
          <view style={{
            width: `${cssWidth}px`,
            borderWidth: '2px',
            borderColor: '#ff9800',
            borderRadius: '4px',
            backgroundColor: '#fff8e1',
            padding: '4px',
            alignSelf: 'flex-start',
          }}>
            <text style={{ fontSize: `${FONT_SIZE}px`, color: '#333' }}>
              {SAMPLE_TEXT}
            </text>
          </view>

          {/* Shrinkwrap container */}
          <text style={{ fontSize: '12px', color: '#2e7d32', marginTop: '16px', marginBottom: '4px' }}>
            {`Shrinkwrap (${shrinkwrapMaxWidth}px)`}
          </text>
          <view style={{
            width: `${shrinkwrapMaxWidth}px`,
            borderWidth: '2px',
            borderColor: '#4caf50',
            borderRadius: '4px',
            backgroundColor: '#e8f5e9',
            padding: '4px',
            alignSelf: 'flex-start',
          }}>
            <text style={{ fontSize: `${FONT_SIZE}px`, color: '#333' }}>
              {SAMPLE_TEXT}
            </text>
          </view>

          {/* Wasted space badge */}
          <view style={{
            marginTop: '16px',
            padding: '12px',
            borderRadius: '8px',
            backgroundColor: wastedPixels > 0 ? '#ffebee' : '#e8f5e9',
          }}>
            <text style={{ fontSize: '14px', fontWeight: 'bold', color: wastedPixels > 0 ? '#c62828' : '#2e7d32' }}>
              {wastedPixels > 0
                ? `Wasted: ${Math.round(wastedPixels).toLocaleString()} px\u00B2`
                : 'No wasted space \u2014 already tight!'}
            </text>
            {wastedPixels > 0 && (
              <text style={{ fontSize: '12px', color: '#c62828', marginTop: '2px' }}>
                {`${cssWidth - shrinkwrapMaxWidth}px \u00D7 ${height}px = ${lineCount} lines saved`}
              </text>
            )}
          </view>
        </view>

        {/* DevPanel Trigger */}
        <DevPanel.Trigger />

        {/* DevPanel Content */}
        <DevPanel.Content title="Shrinkwrap">
          <DevPanelFPS mtsFpsDisplay={0} btsFpsDisplay={btsFpsDisplay} />
          <DevPanel.Stats>
            <DevPanel.Stat label="CSS" value={`${cssWidth}px`} />
            <DevPanel.Stat label="Shrink" value={`${shrinkwrapMaxWidth}px`} />
          </DevPanel.Stats>
          <DevPanel.Stats>
            <DevPanel.Stat label="Lines" value={`${lineCount}`} />
            <DevPanel.Stat label="Waste" value={`${Math.round(wastedPixels)}`} />
          </DevPanel.Stats>
          <DevPanel.Stepper
            label="width"
            value={maxWidth}
            min={40}
            max={1200}
            step={20}
            unit="px"
            onChange={setMaxWidth}
          />
        </DevPanel.Content>
      </view>
    </DevPanel.Root>
  )
}

root.render(<ShrinkwrapPage />)

if (import.meta.webpackHot) {
  import.meta.webpackHot.accept()
}

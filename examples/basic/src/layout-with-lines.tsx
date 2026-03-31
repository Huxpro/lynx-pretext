import { root, useState, useMemo } from '@lynx-js/react'

import { prepareWithSegments, layoutWithLines } from 'lynx-pretext'
import { DevPanel, useDevPanelFPS, DevPanelFPS } from '@lynx-pretext/devtools'

const SAMPLE_TEXT =
  'The quick brown fox jumps over the lazy dog. ' +
  'Pack my box with five dozen liquor jugs. ' +
  'How vexingly quick daft zebras jump.'

const FONT_SIZE = 16
const LINE_HEIGHT = 24
const FONT = `${FONT_SIZE}px`

export function LayoutWithLinesPage() {
  const [maxWidth, setMaxWidth] = useState(360)

  // FPS monitoring - BTS only
  const { btsFpsTick, btsFpsDisplay } = useDevPanelFPS()

  const contentWidth = Math.max(40, maxWidth - 32)
  const prepared = useMemo(() => prepareWithSegments(SAMPLE_TEXT, FONT), [])
  const result = layoutWithLines(prepared, contentWidth, LINE_HEIGHT)

  // BTS FPS tick
  btsFpsTick()

  return (
    <DevPanel.Root>
      <view style={{ flex: 1, backgroundColor: '#fff' }}>
        {/* Demo content */}
        <view style={{ flex: 1, padding: '16px' }}>
          {/* Manually rendered lines */}
          <view style={{
            width: `${contentWidth}px`,
            borderWidth: '1px',
            borderColor: '#1976d2',
            borderRadius: '4px',
            backgroundColor: '#fafafa',
          }}>
            {result.lines.map((line, i) => (
              <view
                key={`line-${i}`}
                style={{ height: `${LINE_HEIGHT}px`, justifyContent: 'center' }}
              >
                <text style={{ fontSize: `${FONT_SIZE}px`, color: '#333' }}>
                  {line.text}
                </text>
              </view>
            ))}
          </view>

          {/* Summary */}
          <view style={{
            marginTop: '12px',
            padding: '10px',
            borderRadius: '8px',
            backgroundColor: '#e3f2fd',
            display: 'flex', flexDirection: 'row',
            gap: '24px',
          }}>
            <view>
              <text style={{ fontSize: '12px', color: '#1565c0' }}>Lines</text>
              <text style={{ fontSize: '20px', fontWeight: 'bold', color: '#0d47a1' }}>
                {`${result.lineCount}`}
              </text>
            </view>
            <view>
              <text style={{ fontSize: '12px', color: '#1565c0' }}>Height</text>
              <text style={{ fontSize: '20px', fontWeight: 'bold', color: '#0d47a1' }}>
                {`${result.height}px`}
              </text>
            </view>
          </view>

          {/* Native comparison */}
          <view style={{
            width: `${contentWidth}px`,
            marginTop: '12px',
            padding: '8px',
            borderWidth: '1px',
            borderColor: '#ddd',
            borderRadius: '4px',
            backgroundColor: '#fafafa',
          }}>
            <text style={{ fontSize: `${FONT_SIZE}px`, lineHeight: `${LINE_HEIGHT}px`, color: '#333' }}>
              {SAMPLE_TEXT}
            </text>
          </view>
        </view>

        {/* DevPanel Trigger */}
        <DevPanel.Trigger />

        {/* DevPanel Content */}
        <DevPanel.Content title="Lines">
          <DevPanelFPS mtsFpsDisplay={0} btsFpsDisplay={btsFpsDisplay} />
          <DevPanel.Stats>
            <DevPanel.Stat label="lines" value={`${result.lineCount}`} />
            <DevPanel.Stat label="height" value={`${result.height}px`} />
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

root.render(<LayoutWithLinesPage />)

if (import.meta.webpackHot) {
  import.meta.webpackHot.accept()
}

import { root, useState, useMemo } from '@lynx-js/react'

import { prepare, layout } from 'lynx-pretext'
import { DevPanel, useDevPanelFPS, DevPanelFPS } from 'lynx-pretext-devtools'

const SAMPLE_TEXT =
  'The quick brown fox jumps over the lazy dog. ' +
  'Pack my box with five dozen liquor jugs. ' +
  'How vexingly quick daft zebras jump.'

const FONT_SIZE = 16
const LINE_HEIGHT = 24
const FONT = `${FONT_SIZE}px`

export function BasicHeightPage() {
  const [maxWidth, setMaxWidth] = useState(360)

  // FPS monitoring - BTS only (no MTS animation)
  const { btsFpsTick, btsFpsDisplay } = useDevPanelFPS()

  const contentWidth = Math.max(40, maxWidth - 32)
  const halfWidth = Math.floor((contentWidth - 12) / 2)
  const prepared = prepare(SAMPLE_TEXT, FONT)
  const result = layout(prepared, contentWidth, LINE_HEIGHT)

  const native = lynx.getTextInfo(SAMPLE_TEXT, {
    fontSize: `${FONT_SIZE}px`,
    maxWidth: `${contentWidth}px`,
  })
  // Debug: log native result
  console.log('[basic-height] native.getTextInfo:', JSON.stringify(native), 'contentWidth:', contentWidth)
  const nativeContent = native.content ?? [SAMPLE_TEXT]
  const nativeLineCount = nativeContent.length
  const nativeHeight = nativeLineCount * LINE_HEIGHT
  const match = result.lineCount === nativeLineCount

  // BTS FPS tick on every render
  btsFpsTick()

  return (
    <DevPanel.Root>
      <view style={{ flex: 1, backgroundColor: '#fff' }}>
        {/* Demo content */}
        <scroll-view scroll-orientation="vertical" style={{ flex: 1 }}>
        <view style={{ padding: '16px' }}>
          {/* Native text rendering */}
          <view style={{
            width: `${contentWidth}px`,
            padding: '8px',
            borderWidth: '1px',
            borderColor: '#e0e0e0',
            borderRadius: '6px',
            backgroundColor: '#fafafa',
          }}>
            <text style={{ fontSize: `${FONT_SIZE}px`, lineHeight: `${LINE_HEIGHT}px`, color: '#333' }}>
              {SAMPLE_TEXT}
            </text>
          </view>

          {/* Comparison cards */}
          <view style={{ display: 'flex', flexDirection: 'row', marginTop: '16px' }}>
            <view style={{ width: `${halfWidth}px`, padding: '12px', borderRadius: '8px', backgroundColor: '#e3f2fd', marginRight: '12px' }}>
              <text style={{ fontSize: '13px', fontWeight: 'bold', color: '#1565c0' }}>Pretext</text>
              <text style={{ fontSize: '28px', fontWeight: 'bold', color: '#0d47a1', marginTop: '4px' }}>
                {`${result.height}px`}
              </text>
              <text style={{ fontSize: '12px', color: '#1976d2', marginTop: '2px' }}>
                {`${result.lineCount} lines`}
              </text>
            </view>
            <view style={{ width: `${halfWidth}px`, padding: '12px', borderRadius: '8px', backgroundColor: '#f3e5f5' }}>
              <text style={{ fontSize: '13px', fontWeight: 'bold', color: '#7b1fa2' }}>Native</text>
              <text style={{ fontSize: '28px', fontWeight: 'bold', color: '#4a148c', marginTop: '4px' }}>
                {`${nativeHeight}px`}
              </text>
              <text style={{ fontSize: '12px', color: '#7b1fa2', marginTop: '2px' }}>
                {`${nativeLineCount} lines`}
              </text>
            </view>
          </view>

          {/* Match status */}
          <view style={{
            marginTop: '12px',
            padding: '12px',
            borderRadius: '8px',
            backgroundColor: match ? '#e8f5e9' : '#fff3e0',
          }}>
            <text style={{
              fontSize: '16px',
              fontWeight: 'bold',
              color: match ? '#2e7d32' : '#e65100',
            }}>
              {match ? 'MATCH' : 'MISMATCH'}
            </text>
            <text style={{ fontSize: '13px', color: '#555', marginTop: '4px' }}>
              {match
                ? `Both agree: ${result.lineCount} lines, ${result.height}px height`
                : `Height diff: ${Math.abs(result.height - nativeHeight)}px | Lines: pretext=${result.lineCount} native=${nativeLineCount}`}
            </text>
          </view>
        </view>
        </scroll-view>

        {/* DevPanel Trigger */}
        <DevPanel.Trigger />

        {/* DevPanel Content */}
        <DevPanel.Content title="Height">
          <DevPanelFPS mtsFpsDisplay={0} btsFpsDisplay={btsFpsDisplay} />
          <DevPanel.Stats>
            <DevPanel.Stat label="width" value={`${maxWidth}px`} />
            <DevPanel.Stat label="match" value={match ? 'yes' : 'no'} />
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

root.render(<BasicHeightPage />)

if (import.meta.webpackHot) {
  import.meta.webpackHot.accept()
}

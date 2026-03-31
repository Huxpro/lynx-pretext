import { root, useState, useMemo } from '@lynx-js/react'

import { prepareWithSegments, layoutNextLine, type LayoutCursor, type LayoutLine } from 'lynx-pretext'
import { DevPanel, useDevPanelFPS, DevPanelFPS } from 'lynx-pretext-devtools'

const SAMPLE_TEXT =
  'The quick brown fox jumps over the lazy dog. ' +
  'Pack my box with five dozen liquor jugs. ' +
  'How vexingly quick daft zebras jump. ' +
  'Sphinx of black quartz, judge my vow. ' +
  'Two driven jocks help fax my big quiz. ' +
  'The five boxing wizards jump quickly. ' +
  'Jackdaws love my big sphinx of quartz. ' +
  'Crazy Frederick bought many very exquisite opal jewels.'

const FONT_SIZE = 16
const LINE_HEIGHT = 24
const FONT = `${FONT_SIZE}px`

// Obstacle dimensions (the "image" block in the top-right)
const OBSTACLE_W = 120
const OBSTACLE_H = 100
const OBSTACLE_GAP = 8

type FlowLine = LayoutLine & { y: number; availableWidth: number }

function layoutVariableFlow(
  prepared: ReturnType<typeof prepareWithSegments>,
  maxWidth: number,
  lineHeight: number,
): FlowLine[] {
  const lines: FlowLine[] = []
  let cursor: LayoutCursor = { segmentIndex: 0, graphemeIndex: 0 }
  let lineIndex = 0

  while (true) {
    const y = lineIndex * lineHeight
    const overlapsObstacle = y < OBSTACLE_H + OBSTACLE_GAP
    const lineWidth = overlapsObstacle
      ? Math.max(60, maxWidth - OBSTACLE_W - OBSTACLE_GAP)
      : maxWidth

    const line = layoutNextLine(prepared, cursor, lineWidth)
    if (line === null) break

    lines.push({ ...line, y, availableWidth: lineWidth })
    cursor = line.end
    lineIndex++
  }

  return lines
}

export function VariableFlowPage() {
  const [maxWidth, setMaxWidth] = useState(360)

  // FPS monitoring - BTS only
  const { btsFpsTick, btsFpsDisplay } = useDevPanelFPS()

  const contentWidth = Math.max(160, maxWidth - 32)
  const prepared = useMemo(() => prepareWithSegments(SAMPLE_TEXT, FONT), [])
  const flowLines = layoutVariableFlow(prepared, contentWidth, LINE_HEIGHT)
  const totalHeight = flowLines.length > 0
    ? flowLines[flowLines.length - 1]!.y + LINE_HEIGHT
    : 0
  const narrowLineCount = flowLines.filter(l => l.availableWidth < contentWidth).length

  // BTS FPS tick
  btsFpsTick()

  return (
    <DevPanel.Root>
      <view style={{ flex: 1, backgroundColor: '#fff' }}>
        {/* Demo content — flow layout with obstacle */}
        <view style={{ flex: 1, padding: '16px' }}>
          <view style={{
            width: `${contentWidth}px`,
            height: `${Math.max(totalHeight, OBSTACLE_H + OBSTACLE_GAP)}px`,
            borderWidth: '1px',
            borderColor: '#5c6bc0',
            borderRadius: '4px',
            backgroundColor: '#fafafa',
            overflow: 'hidden',
          }}>
            {/* Obstacle */}
            <view style={{
              position: 'absolute',
              top: '0px',
              right: '0px',
              width: `${OBSTACLE_W}px`,
              height: `${OBSTACLE_H}px`,
              backgroundColor: '#c5cae9',
              borderBottomLeftRadius: '8px',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <text style={{ fontSize: '14px', fontWeight: 'bold', color: '#3949ab' }}>
                Image
              </text>
              <text style={{ fontSize: '11px', color: '#5c6bc0' }}>
                {`${OBSTACLE_W}\u00D7${OBSTACLE_H}`}
              </text>
            </view>

            {/* Flow lines */}
            {flowLines.map((line, i) => (
              <view
                key={`flow-${i}`}
                style={{
                  position: 'absolute',
                  top: `${line.y}px`,
                  left: '0px',
                  height: `${LINE_HEIGHT}px`,
                }}
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
            backgroundColor: '#e8eaf6',
            display: 'flex', flexDirection: 'row',
            gap: '24px',
          }}>
            <view>
              <text style={{ fontSize: '12px', color: '#283593' }}>Total</text>
              <text style={{ fontSize: '20px', fontWeight: 'bold', color: '#1a237e' }}>
                {`${flowLines.length}`}
              </text>
            </view>
            <view>
              <text style={{ fontSize: '12px', color: '#283593' }}>Narrow</text>
              <text style={{ fontSize: '20px', fontWeight: 'bold', color: '#e65100' }}>
                {`${narrowLineCount}`}
              </text>
            </view>
            <view>
              <text style={{ fontSize: '12px', color: '#283593' }}>Full</text>
              <text style={{ fontSize: '20px', fontWeight: 'bold', color: '#2e7d32' }}>
                {`${flowLines.length - narrowLineCount}`}
              </text>
            </view>
          </view>
        </view>

        {/* DevPanel Trigger */}
        <DevPanel.Trigger />

        {/* DevPanel Content */}
        <DevPanel.Content title="Flow">
          <DevPanelFPS mtsFpsDisplay={0} btsFpsDisplay={btsFpsDisplay} />
          <DevPanel.Stats>
            <DevPanel.Stat label="total" value={`${flowLines.length}`} />
            <DevPanel.Stat label="narrow" value={`${narrowLineCount}`} />
          </DevPanel.Stats>
          <DevPanel.Stats>
            <DevPanel.Stat label="full" value={`${flowLines.length - narrowLineCount}`} />
            <DevPanel.Stat label="height" value={`${totalHeight}px`} />
          </DevPanel.Stats>
          <DevPanel.Stepper
            label="width"
            value={maxWidth}
            min={160}
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

root.render(<VariableFlowPage />)

if (import.meta.webpackHot) {
  import.meta.webpackHot.accept()
}

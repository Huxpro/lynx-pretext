import { root, useState, useCallback, useMemo } from '@lynx-js/react'

import { prepareWithSegments, layoutNextLine, type LayoutCursor, type LayoutLine } from '../src/layout'

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
  const [showControls, setShowControls] = useState(false)

  const onLayout = useCallback((e: any) => {
    setMaxWidth(Math.floor(e.detail.width))
  }, [])
  const toggleControls = useCallback(() => setShowControls(v => !v), [])
  const decrease = useCallback(() => setMaxWidth(w => Math.max(200, w - 20)), [])
  const increase = useCallback(() => setMaxWidth(w => Math.min(1200, w + 20)), [])

  const contentWidth = Math.max(200, maxWidth - 32)
  const prepared = useMemo(() => prepareWithSegments(SAMPLE_TEXT, FONT), [])
  const flowLines = layoutVariableFlow(prepared, contentWidth, LINE_HEIGHT)
  const totalHeight = flowLines.length > 0
    ? flowLines[flowLines.length - 1]!.y + LINE_HEIGHT
    : 0
  const narrowLineCount = flowLines.filter(l => l.availableWidth < contentWidth).length

  return (
    <view style={{ flex: 1, backgroundColor: '#fff' }} bindlayoutchange={onLayout}>
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

      {/* Toggle button */}
      <view
        bindtap={toggleControls}
        style={{
          position: 'absolute',
          top: '12px',
          right: '12px',
          width: '36px',
          height: '36px',
          borderRadius: '18px',
          backgroundColor: showControls ? 'rgba(255,255,255,0.92)' : 'rgba(0,0,0,0.35)',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <text style={{
          fontSize: '20px',
          color: showControls ? '#333' : '#fff',
          fontWeight: 'bold',
        }}>
          {showControls ? '\u00D7' : '\u2261'}
        </text>
      </view>

      {/* Controls overlay */}
      {showControls && (
        <view style={{
          position: 'absolute',
          top: '56px',
          left: '12px',
          right: '12px',
          backgroundColor: 'rgba(0,0,0,0.88)',
          borderRadius: '12px',
          padding: '16px',
        }}>
          <text style={{ fontSize: '18px', fontWeight: 'bold', color: '#fff' }}>
            Variable-Width Flow
          </text>
          <text style={{ fontSize: '13px', color: 'rgba(255,255,255,0.6)', marginTop: '4px' }}>
            layoutNextLine with different maxWidth per line
          </text>

          {/* Width stepper */}
          <view style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', marginTop: '12px', gap: '10px' }}>
            <text style={{ fontSize: '13px', color: 'rgba(255,255,255,0.6)' }}>W:</text>
            <view
              bindtap={decrease}
              style={{
                width: '32px', height: '32px', borderRadius: '16px',
                backgroundColor: 'rgba(255,255,255,0.2)',
                alignItems: 'center', justifyContent: 'center',
              }}
            >
              <text style={{ fontSize: '18px', color: '#fff', fontWeight: 'bold' }}>{'\u2212'}</text>
            </view>
            <text style={{ fontSize: '14px', color: '#fff', minWidth: '70px', textAlign: 'center' }}>
              {`${maxWidth}px`}
            </text>
            <view
              bindtap={increase}
              style={{
                width: '32px', height: '32px', borderRadius: '16px',
                backgroundColor: 'rgba(255,255,255,0.2)',
                alignItems: 'center', justifyContent: 'center',
              }}
            >
              <text style={{ fontSize: '18px', color: '#fff', fontWeight: 'bold' }}>+</text>
            </view>
          </view>

          <text style={{ fontSize: '13px', color: 'rgba(255,255,255,0.6)', marginTop: '12px', lineHeight: '18px' }}>
            {'Each line\'s end cursor becomes the next line\'s start. ' +
             'Lines overlapping the obstacle get narrower width (' +
             (contentWidth - OBSTACLE_W - OBSTACLE_GAP) + 'px), ' +
             'lines below get full width (' + contentWidth + 'px). ' +
             'This is impossible with native <text> layout.'}
          </text>
        </view>
      )}
    </view>
  )
}

root.render(<VariableFlowPage />)

if (import.meta.webpackHot) {
  import.meta.webpackHot.accept()
}

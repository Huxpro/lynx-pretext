import { useState, useCallback, useMemo } from '@lynx-js/react'

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
const MIN_WIDTH = 200
const MAX_WIDTH = 500
const WIDTH_STEP = 20

// Obstacle dimensions (the "image" block in the top-right)
const OBSTACLE_W = 120
const OBSTACLE_H = 100
const OBSTACLE_GAP = 8

type FlowLine = LayoutLine & { y: number; availableWidth: number }

/**
 * Layout text using layoutNextLine with variable width per line.
 * Lines overlapping the obstacle get narrower width; lines below it get full width.
 */
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
    // Lines whose vertical extent overlaps the obstacle get reduced width
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

  const decrease = useCallback(() => {
    setMaxWidth(w => Math.max(MIN_WIDTH, w - WIDTH_STEP))
  }, [])
  const increase = useCallback(() => {
    setMaxWidth(w => Math.min(MAX_WIDTH, w + WIDTH_STEP))
  }, [])

  const prepared = useMemo(() => prepareWithSegments(SAMPLE_TEXT, FONT), [])

  const flowLines = layoutVariableFlow(prepared, maxWidth, LINE_HEIGHT)
  const totalHeight = flowLines.length > 0
    ? flowLines[flowLines.length - 1]!.y + LINE_HEIGHT
    : 0

  // Count how many lines are beside the obstacle
  const narrowLineCount = flowLines.filter(l => l.availableWidth < maxWidth).length

  return (
    <scroll-view style={{ flex: 1 }}>
      <view style={{ padding: 16 }}>
        {/* Header */}
        <text style={{ fontSize: 22, fontWeight: 'bold', color: '#222' }}>
          Variable-Width Flow
        </text>
        <text style={{ fontSize: 13, color: '#888', marginTop: 4 }}>
          layoutNextLine with different maxWidth per line
        </text>

        {/* Width control */}
        <view style={{
          flexDirection: 'row',
          alignItems: 'center',
          marginTop: 16,
          gap: 12,
        }}>
          <view
            style={{
              width: 44,
              height: 44,
              borderRadius: 22,
              backgroundColor: maxWidth <= MIN_WIDTH ? '#ccc' : '#1976d2',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            bindtap={decrease}
          >
            <text style={{ fontSize: 22, color: '#fff', fontWeight: 'bold' }}>−</text>
          </view>
          <text style={{ fontSize: 18, fontWeight: 'bold', color: '#333', minWidth: 80, textAlign: 'center' }}>
            {`${maxWidth}px`}
          </text>
          <view
            style={{
              width: 44,
              height: 44,
              borderRadius: 22,
              backgroundColor: maxWidth >= MAX_WIDTH ? '#ccc' : '#1976d2',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            bindtap={increase}
          >
            <text style={{ fontSize: 22, color: '#fff', fontWeight: 'bold' }}>+</text>
          </view>
        </view>

        {/* Summary */}
        <view style={{
          marginTop: 16,
          padding: 12,
          borderRadius: 8,
          backgroundColor: '#e8eaf6',
          flexDirection: 'row',
          gap: 24,
        }}>
          <view>
            <text style={{ fontSize: 12, color: '#283593' }}>Total lines</text>
            <text style={{ fontSize: 24, fontWeight: 'bold', color: '#1a237e' }}>
              {`${flowLines.length}`}
            </text>
          </view>
          <view>
            <text style={{ fontSize: 12, color: '#283593' }}>Narrow</text>
            <text style={{ fontSize: 24, fontWeight: 'bold', color: '#e65100' }}>
              {`${narrowLineCount}`}
            </text>
          </view>
          <view>
            <text style={{ fontSize: 12, color: '#283593' }}>Full-width</text>
            <text style={{ fontSize: 24, fontWeight: 'bold', color: '#2e7d32' }}>
              {`${flowLines.length - narrowLineCount}`}
            </text>
          </view>
        </view>

        {/* Flow layout with obstacle */}
        <text style={{ fontSize: 14, fontWeight: 'bold', color: '#555', marginTop: 20 }}>
          Text flowing around obstacle:
        </text>
        <view style={{
          width: maxWidth,
          height: Math.max(totalHeight, OBSTACLE_H + OBSTACLE_GAP),
          marginTop: 8,
          borderWidth: 1,
          borderColor: '#5c6bc0',
          borderRadius: 4,
          backgroundColor: '#fafafa',
          overflow: 'hidden',
        }}>
          {/* The rectangular "image" obstacle */}
          <view style={{
            position: 'absolute',
            top: 0,
            right: 0,
            width: OBSTACLE_W,
            height: OBSTACLE_H,
            backgroundColor: '#c5cae9',
            borderBottomLeftRadius: 8,
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <text style={{ fontSize: 14, fontWeight: 'bold', color: '#3949ab' }}>
              Image
            </text>
            <text style={{ fontSize: 11, color: '#5c6bc0' }}>
              {`${OBSTACLE_W}×${OBSTACLE_H}`}
            </text>
          </view>

          {/* Each line as a positioned <text> */}
          {flowLines.map((line, i) => (
            <text
              key={`flow-${i}`}
              style={{
                position: 'absolute',
                top: line.y,
                left: 0,
                fontSize: FONT_SIZE,
                lineHeight: LINE_HEIGHT,
                color: '#333',
              }}
            >
              {line.text}
            </text>
          ))}
        </view>

        {/* Line details */}
        <text style={{ fontSize: 14, fontWeight: 'bold', color: '#555', marginTop: 20 }}>
          Line details:
        </text>
        {flowLines.map((line, i) => {
          const isNarrow = line.availableWidth < maxWidth
          return (
            <view
              key={`detail-${i}`}
              style={{
                flexDirection: 'row',
                marginTop: 4,
                padding: 8,
                borderRadius: 4,
                backgroundColor: isNarrow ? '#fff3e0' : (i % 2 === 0 ? '#f5f5f5' : '#fff'),
                alignItems: 'center',
              }}
            >
              <text style={{
                fontSize: 12,
                fontWeight: 'bold',
                color: isNarrow ? '#e65100' : '#1976d2',
                width: 32,
              }}>
                {`L${i + 1}`}
              </text>
              <view style={{ flex: 1 }}>
                <text style={{ fontSize: 13, color: '#333' }}>
                  {`"${line.text}"`}
                </text>
                <text style={{ fontSize: 11, color: '#888', marginTop: 2 }}>
                  {`width: ${line.width.toFixed(1)}px / ${line.availableWidth}px${isNarrow ? ' (beside obstacle)' : ''}`}
                </text>
              </view>
            </view>
          )
        })}

        {/* Explanation */}
        <view style={{
          marginTop: 20,
          padding: 12,
          borderRadius: 8,
          backgroundColor: '#e8eaf6',
        }}>
          <text style={{ fontSize: 13, color: '#283593', lineHeight: 20 }}>
            {'How it works: layoutNextLine() takes a cursor and maxWidth, returning one line at a time. ' +
             'Each line\'s end cursor becomes the next line\'s start. ' +
             'Lines overlapping the obstacle get a narrower width (' + (maxWidth - OBSTACLE_W - OBSTACLE_GAP) + 'px), ' +
             'lines below it get full width (' + maxWidth + 'px). ' +
             'This variable-width flow is impossible with native <text> layout.'}
          </text>
        </view>
      </view>
    </scroll-view>
  )
}

import { useState, useCallback, useMemo } from '@lynx-js/react'

import { layout, prepareWithSegments, walkLineRanges, layoutWithLines } from '../src/layout'

const SAMPLE_TEXT =
  'The quick brown fox jumps over the lazy dog. ' +
  'Pack my box with five dozen liquor jugs. ' +
  'How vexingly quick daft zebras jump.'

const FONT_SIZE = 16
const LINE_HEIGHT = 24
const FONT = `${FONT_SIZE}px`
const MIN_WIDTH = 80
const MAX_WIDTH = 500
const WIDTH_STEP = 20

/**
 * Find the widest line width at the given maxWidth using walkLineRanges.
 */
function getMaxLineWidth(prepared: ReturnType<typeof prepareWithSegments>, maxWidth: number): number {
  let maxLineWidth = 0
  walkLineRanges(prepared, maxWidth, line => {
    if (line.width > maxLineWidth) maxLineWidth = line.width
  })
  return maxLineWidth
}

/**
 * Binary-search the tightest container width that preserves the same line count.
 */
function findShrinkwrapWidth(prepared: ReturnType<typeof prepareWithSegments>, maxWidth: number): number {
  const initialLineCount = layout(prepared, maxWidth, LINE_HEIGHT).lineCount
  let lo = 1
  let hi = Math.max(1, Math.ceil(maxWidth))

  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2)
    const midLineCount = layout(prepared, mid, LINE_HEIGHT).lineCount
    if (midLineCount <= initialLineCount) {
      hi = mid
    } else {
      lo = mid + 1
    }
  }

  return lo
}

export function ShrinkwrapPage() {
  const [maxWidth, setMaxWidth] = useState(300)

  const decrease = useCallback(() => {
    setMaxWidth(w => Math.max(MIN_WIDTH, w - WIDTH_STEP))
  }, [])
  const increase = useCallback(() => {
    setMaxWidth(w => Math.min(MAX_WIDTH, w + WIDTH_STEP))
  }, [])

  const prepared = useMemo(() => prepareWithSegments(SAMPLE_TEXT, FONT), [])

  // Get max line width at current maxWidth (CSS-style fit-content)
  const cssMaxLineWidth = getMaxLineWidth(prepared, maxWidth)
  const cssWidth = Math.ceil(cssMaxLineWidth)

  // Find tightest width preserving same line count
  const shrinkwrapMaxWidth = findShrinkwrapWidth(prepared, maxWidth)
  const shrinkwrapLineWidth = getMaxLineWidth(prepared, shrinkwrapMaxWidth)
  const shrinkwrapWidth = Math.ceil(shrinkwrapLineWidth)

  const lineCount = layout(prepared, maxWidth, LINE_HEIGHT).lineCount
  const height = lineCount * LINE_HEIGHT
  const wastedPixels = Math.max(0, cssWidth - shrinkwrapWidth) * height

  // Get lines for rendering
  const cssLines = layoutWithLines(prepared, maxWidth, LINE_HEIGHT)
  const shrinkwrapLines = layoutWithLines(prepared, shrinkwrapMaxWidth, LINE_HEIGHT)

  return (
    <scroll-view style={{ flex: 1 }}>
      <view style={{ padding: 16 }}>
        {/* Header */}
        <text style={{ fontSize: 22, fontWeight: 'bold', color: '#222' }}>
          Shrinkwrap Demo
        </text>
        <text style={{ fontSize: 13, color: '#888', marginTop: 4 }}>
          walkLineRanges finds widest line → tightest container width
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
            {`maxWidth: ${maxWidth}px`}
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

        {/* Metrics */}
        <view style={{
          marginTop: 16,
          padding: 12,
          borderRadius: 8,
          backgroundColor: '#fff3e0',
          gap: 8,
        }}>
          <view style={{ flexDirection: 'row', gap: 24 }}>
            <view>
              <text style={{ fontSize: 12, color: '#e65100' }}>CSS Width</text>
              <text style={{ fontSize: 20, fontWeight: 'bold', color: '#bf360c' }}>
                {`${cssWidth}px`}
              </text>
            </view>
            <view>
              <text style={{ fontSize: 12, color: '#2e7d32' }}>Shrinkwrap</text>
              <text style={{ fontSize: 20, fontWeight: 'bold', color: '#1b5e20' }}>
                {`${shrinkwrapWidth}px`}
              </text>
            </view>
            <view>
              <text style={{ fontSize: 12, color: '#555' }}>Lines</text>
              <text style={{ fontSize: 20, fontWeight: 'bold', color: '#333' }}>
                {`${lineCount}`}
              </text>
            </view>
          </view>
          <view style={{
            padding: 8,
            borderRadius: 6,
            backgroundColor: wastedPixels > 0 ? '#ffebee' : '#e8f5e9',
          }}>
            <text style={{ fontSize: 13, color: wastedPixels > 0 ? '#c62828' : '#2e7d32' }}>
              {wastedPixels > 0
                ? `Wasted: ${Math.round(wastedPixels).toLocaleString()} pixels² (${cssWidth - shrinkwrapWidth}px × ${height}px)`
                : 'No wasted space — already tight!'}
            </text>
          </view>
        </view>

        {/* Side-by-side comparison */}
        <text style={{ fontSize: 14, fontWeight: 'bold', color: '#555', marginTop: 20 }}>
          Side-by-side comparison:
        </text>

        <view style={{ flexDirection: 'row', marginTop: 8, gap: 12 }}>
          {/* maxWidth container */}
          <view style={{ flex: 1 }}>
            <text style={{ fontSize: 12, color: '#e65100', marginBottom: 4 }}>
              {`maxWidth (${cssWidth}px)`}
            </text>
            <view style={{
              width: cssWidth,
              height: height,
              borderWidth: 2,
              borderColor: '#ff9800',
              borderRadius: 4,
              backgroundColor: '#fff8e1',
              overflow: 'hidden',
            }}>
              {cssLines.lines.map((line, i) => (
                <text
                  key={`css-${i}`}
                  style={{
                    position: 'absolute',
                    top: i * LINE_HEIGHT,
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
          </view>
        </view>

        <view style={{ flexDirection: 'row', marginTop: 12, gap: 12 }}>
          {/* Shrinkwrap container */}
          <view style={{ flex: 1 }}>
            <text style={{ fontSize: 12, color: '#2e7d32', marginBottom: 4 }}>
              {`Shrinkwrap (${shrinkwrapWidth}px)`}
            </text>
            <view style={{
              width: shrinkwrapWidth,
              height: height,
              borderWidth: 2,
              borderColor: '#4caf50',
              borderRadius: 4,
              backgroundColor: '#e8f5e9',
              overflow: 'hidden',
            }}>
              {shrinkwrapLines.lines.map((line, i) => (
                <text
                  key={`tight-${i}`}
                  style={{
                    position: 'absolute',
                    top: i * LINE_HEIGHT,
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
          </view>
        </view>

        {/* Explanation */}
        <view style={{
          marginTop: 20,
          padding: 12,
          borderRadius: 8,
          backgroundColor: '#e3f2fd',
        }}>
          <text style={{ fontSize: 13, color: '#1565c0', lineHeight: 20 }}>
            {'How it works: walkLineRanges() walks lines without materializing text. ' +
             'The widest line gives the CSS fit-content width. ' +
             'Binary search finds the tightest width preserving the same line count — the shrinkwrap width. ' +
             'This is a capability missing from native Lynx layout.'}
          </text>
        </view>
      </view>
    </scroll-view>
  )
}

import { root, useState, useCallback, useMemo } from '@lynx-js/react'

import { layout, prepareWithSegments, walkLineRanges } from '../src/layout'

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
  const wastedPixels = Math.max(0, cssWidth - shrinkwrapMaxWidth) * height

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
                {`${shrinkwrapMaxWidth}px`}
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
                ? `Wasted: ${Math.round(wastedPixels).toLocaleString()} pixels\u00B2 (${cssWidth - shrinkwrapMaxWidth}px \u00D7 ${height}px)`
                : 'No wasted space \u2014 already tight!'}
            </text>
          </view>
        </view>

        {/* Side-by-side comparison */}
        <text style={{ fontSize: 14, fontWeight: 'bold', color: '#555', marginTop: 20 }}>
          Side-by-side comparison:
        </text>

        {/* maxWidth container */}
        <text style={{ fontSize: 12, color: '#e65100', marginTop: 8, marginBottom: 4 }}>
          {`CSS fit-content (${cssWidth}px)`}
        </text>
        <view style={{
          width: cssWidth,
          borderWidth: 2,
          borderColor: '#ff9800',
          borderRadius: 4,
          backgroundColor: '#fff8e1',
          padding: 4,
          alignSelf: 'flex-start',
        }}>
          <text style={{ fontSize: FONT_SIZE, color: '#333' }}>
            {SAMPLE_TEXT}
          </text>
        </view>

        {/* Shrinkwrap container */}
        <text style={{ fontSize: 12, color: '#2e7d32', marginTop: 12, marginBottom: 4 }}>
          {`Shrinkwrap (${shrinkwrapMaxWidth}px)`}
        </text>
        <view style={{
          width: shrinkwrapMaxWidth,
          borderWidth: 2,
          borderColor: '#4caf50',
          borderRadius: 4,
          backgroundColor: '#e8f5e9',
          padding: 4,
          alignSelf: 'flex-start',
        }}>
          <text style={{ fontSize: FONT_SIZE, color: '#333' }}>
            {SAMPLE_TEXT}
          </text>
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

root.render(<ShrinkwrapPage />)

if (import.meta.webpackHot) {
  import.meta.webpackHot.accept()
}

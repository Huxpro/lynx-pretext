import { root, useState, useCallback, useMemo } from '@lynx-js/react'

import { layout, prepareWithSegments, walkLineRanges } from '../src/layout'

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
  const [showControls, setShowControls] = useState(false)

  const onLayout = useCallback((e: any) => {
    setMaxWidth(Math.floor(e.detail.width))
  }, [])
  const toggleControls = useCallback(() => setShowControls(v => !v), [])
  const decrease = useCallback(() => setMaxWidth(w => Math.max(80, w - 20)), [])
  const increase = useCallback(() => setMaxWidth(w => Math.min(1200, w + 20)), [])

  const contentWidth = Math.max(80, maxWidth - 32)
  const prepared = useMemo(() => prepareWithSegments(SAMPLE_TEXT, FONT), [])

  const cssMaxLineWidth = getMaxLineWidth(prepared, contentWidth)
  const cssWidth = Math.ceil(cssMaxLineWidth)
  const shrinkwrapMaxWidth = findShrinkwrapWidth(prepared, contentWidth)
  const shrinkwrapLineWidth = getMaxLineWidth(prepared, shrinkwrapMaxWidth)
  const shrinkwrapWidth = Math.ceil(shrinkwrapLineWidth)
  const lineCount = layout(prepared, contentWidth, LINE_HEIGHT).lineCount
  const height = lineCount * LINE_HEIGHT
  const wastedPixels = Math.max(0, cssWidth - shrinkwrapMaxWidth) * height

  return (
    <view style={{ flex: 1, backgroundColor: '#fff' }} bindlayoutchange={onLayout}>
      {/* Demo content */}
      <view style={{ flex: 1, padding: 16, justifyContent: 'center' }}>
        {/* CSS fit-content container */}
        <text style={{ fontSize: 12, color: '#e65100', marginBottom: 4 }}>
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
        <text style={{ fontSize: 12, color: '#2e7d32', marginTop: 16, marginBottom: 4 }}>
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

        {/* Wasted space badge */}
        <view style={{
          marginTop: 16,
          padding: 12,
          borderRadius: 8,
          backgroundColor: wastedPixels > 0 ? '#ffebee' : '#e8f5e9',
        }}>
          <text style={{ fontSize: 14, fontWeight: 'bold', color: wastedPixels > 0 ? '#c62828' : '#2e7d32' }}>
            {wastedPixels > 0
              ? `Wasted: ${Math.round(wastedPixels).toLocaleString()} px\u00B2`
              : 'No wasted space \u2014 already tight!'}
          </text>
          {wastedPixels > 0 && (
            <text style={{ fontSize: 12, color: '#c62828', marginTop: 2 }}>
              {`${cssWidth - shrinkwrapMaxWidth}px \u00D7 ${height}px = ${lineCount} lines saved`}
            </text>
          )}
        </view>
      </view>

      {/* Toggle button */}
      <view
        bindtap={toggleControls}
        style={{
          position: 'absolute',
          top: 12,
          right: 12,
          width: 36,
          height: 36,
          borderRadius: 18,
          backgroundColor: showControls ? 'rgba(255,255,255,0.92)' : 'rgba(0,0,0,0.35)',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <text style={{
          fontSize: 20,
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
          top: 56,
          left: 12,
          right: 12,
          backgroundColor: 'rgba(0,0,0,0.88)',
          borderRadius: 12,
          padding: 16,
        }}>
          <text style={{ fontSize: 18, fontWeight: 'bold', color: '#fff' }}>
            Shrinkwrap Demo
          </text>
          <text style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', marginTop: 4 }}>
            walkLineRanges finds widest line, binary search finds tightest width
          </text>

          {/* Width stepper */}
          <view style={{ flexDirection: 'row', alignItems: 'center', marginTop: 12, gap: 10 }}>
            <text style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>W:</text>
            <view
              bindtap={decrease}
              style={{
                width: 32, height: 32, borderRadius: 16,
                backgroundColor: 'rgba(255,255,255,0.2)',
                alignItems: 'center', justifyContent: 'center',
              }}
            >
              <text style={{ fontSize: 18, color: '#fff', fontWeight: 'bold' }}>{'\u2212'}</text>
            </view>
            <text style={{ fontSize: 14, color: '#fff', minWidth: 70, textAlign: 'center' }}>
              {`${maxWidth}px`}
            </text>
            <view
              bindtap={increase}
              style={{
                width: 32, height: 32, borderRadius: 16,
                backgroundColor: 'rgba(255,255,255,0.2)',
                alignItems: 'center', justifyContent: 'center',
              }}
            >
              <text style={{ fontSize: 18, color: '#fff', fontWeight: 'bold' }}>+</text>
            </view>
          </view>

          {/* Metrics */}
          <view style={{ flexDirection: 'row', gap: 20, marginTop: 12 }}>
            <view>
              <text style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>CSS Width</text>
              <text style={{ fontSize: 16, fontWeight: 'bold', color: '#ff9800' }}>{`${cssWidth}px`}</text>
            </view>
            <view>
              <text style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>Shrinkwrap</text>
              <text style={{ fontSize: 16, fontWeight: 'bold', color: '#4caf50' }}>{`${shrinkwrapMaxWidth}px`}</text>
            </view>
            <view>
              <text style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>Lines</text>
              <text style={{ fontSize: 16, fontWeight: 'bold', color: '#fff' }}>{`${lineCount}`}</text>
            </view>
          </view>

          <text style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', marginTop: 12, lineHeight: '18px' }}>
            {'CSS only knows fit-content (widest line after wrapping). ' +
             'Pretext binary-searches the tightest width preserving the same line count \u2014 ' +
             'a capability missing from native layout.'}
          </text>
        </view>
      )}
    </view>
  )
}

root.render(<ShrinkwrapPage />)

if (import.meta.webpackHot) {
  import.meta.webpackHot.accept()
}

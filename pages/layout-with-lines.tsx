import { root, useState, useCallback, useMemo } from '@lynx-js/react'

import { prepareWithSegments, layoutWithLines } from '../src/layout'

const SAMPLE_TEXT =
  'The quick brown fox jumps over the lazy dog. ' +
  'Pack my box with five dozen liquor jugs. ' +
  'How vexingly quick daft zebras jump.'

const FONT_SIZE = 16
const LINE_HEIGHT = 24
const FONT = `${FONT_SIZE}px`

export function LayoutWithLinesPage() {
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
  const result = layoutWithLines(prepared, contentWidth, LINE_HEIGHT)

  return (
    <view style={{ flex: 1, backgroundColor: '#fff' }} bindlayoutchange={onLayout}>
      {/* Demo content */}
      <view style={{ flex: 1, padding: 16 }}>
        {/* Manually rendered lines */}
        <view style={{
          width: contentWidth,
          borderWidth: 1,
          borderColor: '#1976d2',
          borderRadius: 4,
          backgroundColor: '#fafafa',
        }}>
          {result.lines.map((line, i) => (
            <view
              key={`line-${i}`}
              style={{ height: LINE_HEIGHT, justifyContent: 'center' }}
            >
              <text style={{ fontSize: FONT_SIZE, color: '#333' }}>
                {line.text}
              </text>
            </view>
          ))}
        </view>

        {/* Summary */}
        <view style={{
          marginTop: 12,
          padding: 10,
          borderRadius: 8,
          backgroundColor: '#e3f2fd',
          flexDirection: 'row',
          gap: 24,
        }}>
          <view>
            <text style={{ fontSize: 12, color: '#1565c0' }}>Lines</text>
            <text style={{ fontSize: 20, fontWeight: 'bold', color: '#0d47a1' }}>
              {`${result.lineCount}`}
            </text>
          </view>
          <view>
            <text style={{ fontSize: 12, color: '#1565c0' }}>Height</text>
            <text style={{ fontSize: 20, fontWeight: 'bold', color: '#0d47a1' }}>
              {`${result.height}px`}
            </text>
          </view>
        </view>

        {/* Native comparison */}
        <view style={{
          width: contentWidth,
          marginTop: 12,
          padding: 8,
          borderWidth: 1,
          borderColor: '#ddd',
          borderRadius: 4,
          backgroundColor: '#fafafa',
        }}>
          <text style={{ fontSize: FONT_SIZE, lineHeight: `${LINE_HEIGHT}px`, color: '#333' }}>
            {SAMPLE_TEXT}
          </text>
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
            layoutWithLines Demo
          </text>
          <text style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', marginTop: 4 }}>
            {`prepareWithSegments() once, layoutWithLines() on resize | ${FONT_SIZE}px`}
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

          {/* Line details */}
          <text style={{ fontSize: 14, fontWeight: 'bold', color: '#fff', marginTop: 12 }}>
            Line details:
          </text>
          {result.lines.map((line, i) => (
            <text
              key={`detail-${i}`}
              style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 2 }}
            >
              {`L${i + 1}: w=${line.width.toFixed(1)}px seg ${line.start.segmentIndex}\u2192${line.end.segmentIndex}`}
            </text>
          ))}
        </view>
      )}
    </view>
  )
}

root.render(<LayoutWithLinesPage />)

if (import.meta.webpackHot) {
  import.meta.webpackHot.accept()
}

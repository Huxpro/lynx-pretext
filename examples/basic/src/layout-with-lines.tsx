import { root, useState, useCallback, useMemo } from '@lynx-js/react'

import { prepareWithSegments, layoutWithLines } from 'lynx-pretext'

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
            layoutWithLines Demo
          </text>
          <text style={{ fontSize: '13px', color: 'rgba(255,255,255,0.6)', marginTop: '4px' }}>
            {`prepareWithSegments() once, layoutWithLines() on resize | ${FONT_SIZE}px`}
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

          {/* Line details */}
          <text style={{ fontSize: '14px', fontWeight: 'bold', color: '#fff', marginTop: '12px' }}>
            Line details:
          </text>
          {result.lines.map((line, i) => (
            <text
              key={`detail-${i}`}
              style={{ fontSize: '12px', color: 'rgba(255,255,255,0.7)', marginTop: '2px' }}
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

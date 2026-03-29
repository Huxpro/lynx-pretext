import { root, useState, useCallback } from '@lynx-js/react'

import { prepare, layout } from '../src/layout'

const SAMPLE_TEXT =
  'The quick brown fox jumps over the lazy dog. ' +
  'Pack my box with five dozen liquor jugs. ' +
  'How vexingly quick daft zebras jump.'

const FONT_SIZE = 16
const LINE_HEIGHT = 24
const FONT = `${FONT_SIZE}px`

export function BasicHeightPage() {
  const [maxWidth, setMaxWidth] = useState(360)
  const [showControls, setShowControls] = useState(false)

  const onLayout = useCallback((e: any) => {
    setMaxWidth(Math.floor(e.detail.width))
  }, [])
  const toggleControls = useCallback(() => setShowControls(v => !v), [])
  const decrease = useCallback(() => setMaxWidth(w => Math.max(80, w - 20)), [])
  const increase = useCallback(() => setMaxWidth(w => Math.min(1200, w + 20)), [])

  const contentWidth = Math.max(80, maxWidth - 32)
  const halfWidth = Math.floor((contentWidth - 12) / 2)
  const prepared = prepare(SAMPLE_TEXT, FONT)
  const result = layout(prepared, contentWidth, LINE_HEIGHT)

  const native = lynx.getTextInfo(SAMPLE_TEXT, {
    fontSize: `${FONT_SIZE}px`,
    maxWidth: `${contentWidth}px`,
  })
  const nativeLineCount = native.content?.length ?? 1
  const nativeHeight = nativeLineCount * LINE_HEIGHT
  const match = result.lineCount === nativeLineCount

  return (
    <view style={{ flex: 1, backgroundColor: '#fff' }} bindlayoutchange={onLayout}>
      {/* Demo content */}
      <scroll-view style={{ flex: 1 }}>
      <view style={{ padding: 16 }}>
        {/* Native text rendering */}
        <view style={{
          width: contentWidth,
          padding: 8,
          borderWidth: 1,
          borderColor: '#e0e0e0',
          borderRadius: 6,
          backgroundColor: '#fafafa',
        }}>
          <text style={{ fontSize: FONT_SIZE, lineHeight: `${LINE_HEIGHT}px`, color: '#333' }}>
            {SAMPLE_TEXT}
          </text>
        </view>

        {/* Comparison cards */}
        <view style={{ flexDirection: 'row', marginTop: 16 }}>
          <view style={{ width: halfWidth, padding: 12, borderRadius: 8, backgroundColor: '#e3f2fd', marginRight: 12 }}>
            <text style={{ fontSize: 13, fontWeight: 'bold', color: '#1565c0' }}>Pretext</text>
            <text style={{ fontSize: 28, fontWeight: 'bold', color: '#0d47a1', marginTop: 4 }}>
              {`${result.height}px`}
            </text>
            <text style={{ fontSize: 12, color: '#1976d2', marginTop: 2 }}>
              {`${result.lineCount} lines`}
            </text>
          </view>
          <view style={{ width: halfWidth, padding: 12, borderRadius: 8, backgroundColor: '#f3e5f5' }}>
            <text style={{ fontSize: 13, fontWeight: 'bold', color: '#7b1fa2' }}>Native</text>
            <text style={{ fontSize: 28, fontWeight: 'bold', color: '#4a148c', marginTop: 4 }}>
              {`${nativeHeight}px`}
            </text>
            <text style={{ fontSize: 12, color: '#7b1fa2', marginTop: 2 }}>
              {`${nativeLineCount} lines`}
            </text>
          </view>
        </view>

        {/* Match status */}
        <view style={{
          marginTop: 12,
          padding: 12,
          borderRadius: 8,
          backgroundColor: match ? '#e8f5e9' : '#fff3e0',
        }}>
          <text style={{
            fontSize: 16,
            fontWeight: 'bold',
            color: match ? '#2e7d32' : '#e65100',
          }}>
            {match ? 'MATCH' : 'MISMATCH'}
          </text>
          <text style={{ fontSize: 13, color: '#555', marginTop: 4 }}>
            {match
              ? `Both agree: ${result.lineCount} lines, ${result.height}px height`
              : `Height diff: ${Math.abs(result.height - nativeHeight)}px | Lines: pretext=${result.lineCount} native=${nativeLineCount}`}
          </text>
        </view>
      </view>
      </scroll-view>

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
            Basic Height Measurement
          </text>
          <text style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', marginTop: 4 }}>
            {`prepare() + layout() vs native getTextInfo | ${FONT_SIZE}px`}
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

          {/* Native line breakdown */}
          <text style={{ fontSize: 14, fontWeight: 'bold', color: '#fff', marginTop: 12 }}>
            Native line breakdown:
          </text>
          {(native.content ?? [SAMPLE_TEXT]).map((line, i) => (
            <text
              key={`line-${i}`}
              style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 2 }}
            >
              {`L${i + 1}: "${line.trim()}"`}
            </text>
          ))}
        </view>
      )}
    </view>
  )
}

root.render(<BasicHeightPage />)

if (import.meta.webpackHot) {
  import.meta.webpackHot.accept()
}

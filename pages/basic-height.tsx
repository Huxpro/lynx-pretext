import { root, useState, useCallback } from '@lynx-js/react'

import { prepare, layout, clearCache } from '../src/layout'

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

export function BasicHeightPage() {
  const [maxWidth, setMaxWidth] = useState(300)

  const decrease = useCallback(() => {
    setMaxWidth(w => Math.max(MIN_WIDTH, w - WIDTH_STEP))
  }, [])
  const increase = useCallback(() => {
    setMaxWidth(w => Math.min(MAX_WIDTH, w + WIDTH_STEP))
  }, [])

  // Pretext measurement
  const prepared = prepare(SAMPLE_TEXT, FONT)
  const result = layout(prepared, maxWidth, LINE_HEIGHT)

  // Native oracle via getTextInfo
  const native = lynx.getTextInfo(SAMPLE_TEXT, {
    fontSize: `${FONT_SIZE}px`,
    maxWidth: `${maxWidth}px`,
  })
  const nativeLineCount = native.content?.length ?? 1
  const nativeHeight = nativeLineCount * LINE_HEIGHT

  const heightDiff = Math.abs(result.height - nativeHeight)
  const match = result.lineCount === nativeLineCount

  return (
    <scroll-view style={{ flex: 1 }}>
      <view style={{ padding: 16 }}>
        {/* Header */}
        <text style={{ fontSize: 22, fontWeight: 'bold', color: '#222' }}>
          Basic Height Measurement
        </text>
        <text style={{ fontSize: 13, color: '#888', marginTop: 4 }}>
          {`prepare() + layout() vs native getTextInfo | ${FONT_SIZE}px`}
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

        {/* Native text rendering */}
        <text style={{ fontSize: 14, fontWeight: 'bold', color: '#555', marginTop: 20 }}>
          Native &lt;text&gt; rendering:
        </text>
        <view style={{
          width: maxWidth,
          marginTop: 8,
          padding: 8,
          borderWidth: 1,
          borderColor: '#ddd',
          borderRadius: 4,
          backgroundColor: '#fafafa',
        }}>
          <text style={{ fontSize: FONT_SIZE, lineHeight: LINE_HEIGHT, color: '#333' }}>
            {SAMPLE_TEXT}
          </text>
        </view>

        {/* Comparison */}
        <view style={{
          flexDirection: 'row',
          marginTop: 16,
          gap: 12,
        }}>
          {/* Pretext result */}
          <view style={{
            flex: 1,
            padding: 12,
            borderRadius: 8,
            backgroundColor: '#e3f2fd',
          }}>
            <text style={{ fontSize: 13, fontWeight: 'bold', color: '#1565c0' }}>
              Pretext
            </text>
            <text style={{ fontSize: 28, fontWeight: 'bold', color: '#0d47a1', marginTop: 4 }}>
              {`${result.height}px`}
            </text>
            <text style={{ fontSize: 12, color: '#1976d2', marginTop: 2 }}>
              {`${result.lineCount} lines`}
            </text>
          </view>

          {/* Native result */}
          <view style={{
            flex: 1,
            padding: 12,
            borderRadius: 8,
            backgroundColor: '#f3e5f5',
          }}>
            <text style={{ fontSize: 13, fontWeight: 'bold', color: '#7b1fa2' }}>
              Native
            </text>
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
              : `Height diff: ${heightDiff}px | Lines: pretext=${result.lineCount} native=${nativeLineCount}`}
          </text>
        </view>

        {/* Native line content */}
        <text style={{ fontSize: 14, fontWeight: 'bold', color: '#555', marginTop: 20 }}>
          Native line breakdown:
        </text>
        {(native.content ?? [SAMPLE_TEXT]).map((line, i) => (
          <text
            key={`line-${i}`}
            style={{ fontSize: 12, color: '#666', marginTop: 2, paddingLeft: 8 }}
          >
            {`L${i + 1}: "${line.trim()}"`}
          </text>
        ))}
      </view>
    </scroll-view>
  )
}

root.render(<BasicHeightPage />)

if (import.meta.webpackHot) {
  import.meta.webpackHot.accept()
}

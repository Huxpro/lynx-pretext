import { root, useState, useCallback, useMemo } from '@lynx-js/react'

import { prepareWithSegments, layoutWithLines } from '../src/layout'

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

export function LayoutWithLinesPage() {
  const [maxWidth, setMaxWidth] = useState(300)

  const decrease = useCallback(() => {
    setMaxWidth(w => Math.max(MIN_WIDTH, w - WIDTH_STEP))
  }, [])
  const increase = useCallback(() => {
    setMaxWidth(w => Math.min(MAX_WIDTH, w + WIDTH_STEP))
  }, [])

  // prepare() called once — segments + measurements are cached
  const prepared = useMemo(() => prepareWithSegments(SAMPLE_TEXT, FONT), [])

  // layoutWithLines re-runs on width change — pure arithmetic, no native calls
  const result = layoutWithLines(prepared, maxWidth, LINE_HEIGHT)

  return (
    <scroll-view style={{ flex: 1 }}>
      <view style={{ padding: 16 }}>
        {/* Header */}
        <text style={{ fontSize: 22, fontWeight: 'bold', color: '#222' }}>
          layoutWithLines Demo
        </text>
        <text style={{ fontSize: 13, color: '#888', marginTop: 4 }}>
          {`prepareWithSegments() once, layoutWithLines() on resize | ${FONT_SIZE}px`}
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
          backgroundColor: '#e3f2fd',
          flexDirection: 'row',
          gap: 24,
        }}>
          <view>
            <text style={{ fontSize: 12, color: '#1565c0' }}>Lines</text>
            <text style={{ fontSize: 24, fontWeight: 'bold', color: '#0d47a1' }}>
              {`${result.lineCount}`}
            </text>
          </view>
          <view>
            <text style={{ fontSize: 12, color: '#1565c0' }}>Height</text>
            <text style={{ fontSize: 24, fontWeight: 'bold', color: '#0d47a1' }}>
              {`${result.height}px`}
            </text>
          </view>
        </view>

        {/* Manually rendered lines — each as an absolutely positioned <text> */}
        <text style={{ fontSize: 14, fontWeight: 'bold', color: '#555', marginTop: 20 }}>
          Manually rendered lines:
        </text>
        <view style={{
          width: maxWidth,
          marginTop: 8,
          borderWidth: 1,
          borderColor: '#1976d2',
          borderRadius: 4,
          backgroundColor: '#fafafa',
        }}>
          {result.lines.map((line, i) => (
            <view
              key={`line-${i}`}
              style={{
                height: LINE_HEIGHT,
                justifyContent: 'center',
              }}
            >
              <text
                style={{
                  fontSize: FONT_SIZE,
                  color: '#333',
                }}
              >
                {line.text}
              </text>
            </view>
          ))}
        </view>

        {/* Line details */}
        <text style={{ fontSize: 14, fontWeight: 'bold', color: '#555', marginTop: 20 }}>
          Line details:
        </text>
        {result.lines.map((line, i) => (
          <view
            key={`detail-${i}`}
            style={{
              flexDirection: 'row',
              marginTop: 4,
              padding: 8,
              borderRadius: 4,
              backgroundColor: i % 2 === 0 ? '#f5f5f5' : '#fff',
              alignItems: 'center',
            }}
          >
            <text style={{
              fontSize: 12,
              fontWeight: 'bold',
              color: '#1976d2',
              width: 32,
            }}>
              {`L${i + 1}`}
            </text>
            <view style={{ flex: 1 }}>
              <text style={{ fontSize: 13, color: '#333' }}>
                {`"${line.text}"`}
              </text>
              <text style={{ fontSize: 11, color: '#888', marginTop: 2 }}>
                {`width: ${line.width.toFixed(1)}px | seg ${line.start.segmentIndex}→${line.end.segmentIndex}`}
              </text>
            </view>
          </view>
        ))}

        {/* Native comparison */}
        <text style={{ fontSize: 14, fontWeight: 'bold', color: '#555', marginTop: 20 }}>
          Native &lt;text&gt; comparison:
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
      </view>
    </scroll-view>
  )
}

root.render(<LayoutWithLinesPage />)

if (import.meta.webpackHot) {
  import.meta.webpackHot.accept()
}

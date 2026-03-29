import { root, useState, useCallback, useMemo } from '@lynx-js/react'

import {
  computeBubbleRender,
  formatPixelCount,
  prepareBubbleTexts,
  BUBBLE_MAX_RATIO,
  FONT,
  LINE_HEIGHT,
  PADDING_H,
  PADDING_V,
} from './bubbles-shared'
import { layoutWithLines, prepareWithSegments } from '../../src/layout'

const BUBBLE_TEXTS = [
  'Yo did you see the new Pretext library?',
  'yeah! It measures text without the DOM. Pure JavaScript arithmetic',
  'That shrinkwrap demo is wild it finds the exact minimum width for multiline text. CSS can\'t do that.',
  '\uC131\uB2A5 \uCD5C\uC801\uD654\uAC00 \uC815\uB9D0 \uB9CE\uC774 \uB418\uC5C8\uB354\uB77C\uACE0\uC694 \uD83C\uDF89',
  'Oh wow it handles CJK and emoji too??',
  '\u0643\u0644 \u0634\u064A\u0621! Mixed bidi, grapheme clusters, whatever you want. Try resizing',
  'the best part: zero layout reflow. You could shrinkwrap 10,000 bubbles and the browser wouldn\'t even blink',
]

const BUBBLE_DIRECTIONS = [false, true, false, true, false, true, true]
const FONT_SIZE = 15

export function BubblesPage() {
  const [chatWidth, setChatWidth] = useState(360)
  const [showControls, setShowControls] = useState(false)

  const onLayout = useCallback((e: any) => {
    setChatWidth(Math.floor(e.detail.width))
  }, [])
  const toggleControls = useCallback(() => setShowControls(v => !v), [])
  const decrease = useCallback(() => setChatWidth(w => Math.max(220, w - 20)), [])
  const increase = useCallback(() => setChatWidth(w => Math.min(1200, w + 20)), [])

  const preparedBubbles = useMemo(() => prepareBubbleTexts(BUBBLE_TEXTS), [])
  const containerWidth = Math.max(220, chatWidth - 32)
  const renderState = computeBubbleRender(preparedBubbles, containerWidth)
  const bubbleMaxWidth = renderState.bubbleMaxWidth
  const contentMaxWidth = bubbleMaxWidth - PADDING_H * 2

  // Compute CSS-side wasted pixels
  let cssWastedPixels = 0
  for (let i = 0; i < renderState.widths.length; i++) {
    const w = renderState.widths[i]!
    const prepared = preparedBubbles[i]!.prepared
    const lines = layoutWithLines(prepared, contentMaxWidth, LINE_HEIGHT)
    const cssHeight = lines.lineCount * LINE_HEIGHT + PADDING_V * 2
    cssWastedPixels += Math.max(0, w.cssWidth - w.tightWidth) * cssHeight
  }

  return (
    <view style={{ flex: 1, backgroundColor: '#1c1c1e' }} bindlayoutchange={onLayout}>
      <scroll-view style={{ flex: 1 }}>
        <view style={{ padding: 16, gap: 24 }}>
          {/* CSS fit-content chat */}
          <view>
            <view style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <text style={{ fontSize: 13, fontWeight: 'bold', color: '#ff9800' }}>
                CSS fit-content
              </text>
              <view style={{
                paddingLeft: 8, paddingRight: 8, paddingTop: 3, paddingBottom: 3,
                borderRadius: 99, backgroundColor: 'rgba(255,152,0,0.2)',
              }}>
                <text style={{ fontSize: 11, color: '#ff9800' }}>
                  {`${formatPixelCount(cssWastedPixels)} px\u00B2 wasted`}
                </text>
              </view>
            </view>
            <view style={{
              width: containerWidth,
              padding: 12,
              borderRadius: 12,
              backgroundColor: '#2c2c2e',
              gap: 6,
            }}>
              {BUBBLE_TEXTS.map((text, i) => {
                const isSent = BUBBLE_DIRECTIONS[i]!
                const w = renderState.widths[i]!
                return (
                  <view
                    key={`css-${i}`}
                    style={{
                      alignSelf: isSent ? 'flex-end' : 'flex-start',
                      maxWidth: bubbleMaxWidth,
                      width: w.cssWidth,
                      paddingTop: PADDING_V,
                      paddingBottom: PADDING_V,
                      paddingLeft: PADDING_H,
                      paddingRight: PADDING_H,
                      borderRadius: 14,
                      borderBottomRightRadius: isSent ? 4 : 14,
                      borderBottomLeftRadius: isSent ? 14 : 4,
                      backgroundColor: isSent ? '#0b84fe' : '#3a3a3c',
                    }}
                  >
                    <text style={{ fontSize: FONT_SIZE, lineHeight: `${LINE_HEIGHT}px`, color: '#fff' }}>
                      {text}
                    </text>
                  </view>
                )
              })}
            </view>
          </view>

          {/* Pretext shrinkwrap chat */}
          <view>
            <view style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <text style={{ fontSize: 13, fontWeight: 'bold', color: '#4caf50' }}>
                Pretext shrinkwrap
              </text>
              <view style={{
                paddingLeft: 8, paddingRight: 8, paddingTop: 3, paddingBottom: 3,
                borderRadius: 99, backgroundColor: 'rgba(76,175,80,0.2)',
              }}>
                <text style={{ fontSize: 11, color: '#4caf50' }}>
                  0 px² wasted
                </text>
              </view>
            </view>
            <view style={{
              width: containerWidth,
              padding: 12,
              borderRadius: 12,
              backgroundColor: '#2c2c2e',
              gap: 6,
            }}>
              {BUBBLE_TEXTS.map((text, i) => {
                const isSent = BUBBLE_DIRECTIONS[i]!
                const w = renderState.widths[i]!
                return (
                  <view
                    key={`shrink-${i}`}
                    style={{
                      alignSelf: isSent ? 'flex-end' : 'flex-start',
                      maxWidth: bubbleMaxWidth,
                      width: w.tightWidth,
                      paddingTop: PADDING_V,
                      paddingBottom: PADDING_V,
                      paddingLeft: PADDING_H,
                      paddingRight: PADDING_H,
                      borderRadius: 14,
                      borderBottomRightRadius: isSent ? 4 : 14,
                      borderBottomLeftRadius: isSent ? 14 : 4,
                      backgroundColor: isSent ? '#0b84fe' : '#3a3a3c',
                    }}
                  >
                    <text style={{ fontSize: FONT_SIZE, lineHeight: `${LINE_HEIGHT}px`, color: '#fff' }}>
                      {text}
                    </text>
                  </view>
                )
              })}
            </view>
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
          backgroundColor: showControls ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.2)',
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
          backgroundColor: 'rgba(0,0,0,0.92)',
          borderRadius: 12,
          padding: 16,
          borderWidth: 1,
          borderColor: 'rgba(255,255,255,0.1)',
        }}>
          <text style={{ fontSize: 18, fontWeight: 'bold', color: '#fff' }}>
            Shrinkwrap Showdown
          </text>
          <text style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', marginTop: 4, lineHeight: '18px' }}>
            {'CSS fit-content sizes a bubble to its widest wrapped line, leaving dead space. ' +
             'Pretext finds the tightest width that wraps to the same line count.'}
          </text>

          {/* Width stepper */}
          <view style={{ flexDirection: 'row', alignItems: 'center', marginTop: 12, gap: 10 }}>
            <text style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>W:</text>
            <view
              bindtap={decrease}
              style={{
                width: 32, height: 32, borderRadius: 16,
                backgroundColor: 'rgba(255,255,255,0.15)',
                alignItems: 'center', justifyContent: 'center',
              }}
            >
              <text style={{ fontSize: 18, color: '#fff', fontWeight: 'bold' }}>{'\u2212'}</text>
            </view>
            <text style={{ fontSize: 14, color: '#fff', minWidth: 70, textAlign: 'center' }}>
              {`${chatWidth}px`}
            </text>
            <view
              bindtap={increase}
              style={{
                width: 32, height: 32, borderRadius: 16,
                backgroundColor: 'rgba(255,255,255,0.15)',
                alignItems: 'center', justifyContent: 'center',
              }}
            >
              <text style={{ fontSize: 18, color: '#fff', fontWeight: 'bold' }}>+</text>
            </view>
          </view>

          <text style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', marginTop: 12, lineHeight: '18px' }}>
            {'CSS only knows fit-content (the width of the widest line). ' +
             'There\'s no CSS property to say "find the narrowest width that ' +
             'still produces the same line count." That requires measuring text ' +
             'at multiple widths \u2014 exactly what Pretext does.'}
          </text>
        </view>
      )}
    </view>
  )
}

root.render(<BubblesPage />)

if (import.meta.webpackHot) {
  import.meta.webpackHot.accept()
}

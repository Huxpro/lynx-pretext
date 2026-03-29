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
  '성능 최적화가 정말 많이 되었더라고요 🎉',
  'Oh wow it handles CJK and emoji too??',
  'كل شيء! Mixed bidi, grapheme clusters, whatever you want. Try resizing',
  'the best part: zero layout reflow. You could shrinkwrap 10,000 bubbles and the browser wouldn\'t even blink',
]

// true = sent (right-aligned, blue), false = received (left-aligned, gray)
const BUBBLE_DIRECTIONS = [false, true, false, true, false, true, true]

const MIN_WIDTH = 220
const MAX_WIDTH = 500
const WIDTH_STEP = 20

const FONT_SIZE = 15

export function BubblesPage() {
  const [chatWidth, setChatWidth] = useState(340)

  const decrease = useCallback(() => {
    setChatWidth(w => Math.max(MIN_WIDTH, w - WIDTH_STEP))
  }, [])
  const increase = useCallback(() => {
    setChatWidth(w => Math.min(MAX_WIDTH, w + WIDTH_STEP))
  }, [])

  const preparedBubbles = useMemo(() => prepareBubbleTexts(BUBBLE_TEXTS), [])

  // Compute shrinkwrap render state
  const renderState = computeBubbleRender(preparedBubbles, chatWidth)
  const bubbleMaxWidth = renderState.bubbleMaxWidth
  const contentMaxWidth = bubbleMaxWidth - PADDING_H * 2

  // Compute CSS-side wasted pixels (using css widths from renderState)
  let cssWastedPixels = 0
  for (let i = 0; i < renderState.widths.length; i++) {
    const w = renderState.widths[i]!
    const prepared = preparedBubbles[i]!.prepared
    const lines = layoutWithLines(prepared, contentMaxWidth, LINE_HEIGHT)
    const cssHeight = lines.lineCount * LINE_HEIGHT + PADDING_V * 2
    cssWastedPixels += Math.max(0, w.cssWidth - w.tightWidth) * cssHeight
  }

  return (
    <scroll-view style={{ flex: 1, backgroundColor: '#f4f1ea' }}>
      <view style={{ padding: 16 }}>
        {/* Header */}
        <text style={{ fontSize: 11, color: '#955f3b', letterSpacing: 1 }}>
          DEMO
        </text>
        <text style={{ fontSize: 24, fontWeight: 'bold', color: '#201b18', marginTop: 4 }}>
          Shrinkwrap Showdown
        </text>
        <text style={{ fontSize: 14, color: '#6d645d', marginTop: 8, lineHeight: 20 }}>
          {'CSS fit-content sizes a bubble to its widest wrapped line, which leaves dead space. ' +
           'Pretext finds the tightest width that wraps to the same line count.'}
        </text>

        {/* Width control */}
        <view style={{
          flexDirection: 'row',
          alignItems: 'center',
          marginTop: 16,
          gap: 12,
          padding: 12,
          borderRadius: 14,
          backgroundColor: '#fffdf8',
          borderWidth: 1,
          borderColor: '#d8cec3',
        }}>
          <text style={{ fontSize: 12, color: '#6d645d' }}>Container:</text>
          <view
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              backgroundColor: chatWidth <= MIN_WIDTH ? '#ccc' : '#955f3b',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            bindtap={decrease}
          >
            <text style={{ fontSize: 18, color: '#fff', fontWeight: 'bold' }}>−</text>
          </view>
          <text style={{ fontSize: 16, fontWeight: 'bold', color: '#201b18', minWidth: 70, textAlign: 'center' }}>
            {`${chatWidth}px`}
          </text>
          <view
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              backgroundColor: chatWidth >= MAX_WIDTH ? '#ccc' : '#955f3b',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            bindtap={increase}
          >
            <text style={{ fontSize: 18, color: '#fff', fontWeight: 'bold' }}>+</text>
          </view>
        </view>

        {/* CSS fit-content panel */}
        <view style={{
          marginTop: 16,
          padding: 14,
          borderRadius: 16,
          backgroundColor: '#fffdf8',
          borderWidth: 1,
          borderColor: '#d8cec3',
        }}>
          <text style={{ fontSize: 16, fontWeight: 'bold', color: '#201b18' }}>
            CSS fit-content
          </text>
          <text style={{ fontSize: 13, color: '#6d645d', marginTop: 6, lineHeight: 18 }}>
            {'The browser wraps text, then sizes the bubble to the longest line. ' +
             'Shorter lines leave empty space.'}
          </text>
          <view style={{
            flexDirection: 'row',
            alignItems: 'center',
            marginTop: 10,
            padding: 6,
            paddingLeft: 10,
            paddingRight: 10,
            borderRadius: 99,
            backgroundColor: '#f0e4da',
            alignSelf: 'flex-start',
          }}>
            <text style={{ fontSize: 11, color: '#201b18' }}>
              {`Wasted: ${formatPixelCount(cssWastedPixels)} px²`}
            </text>
          </view>
          {/* CSS chat container */}
          <view style={{
            width: chatWidth,
            marginTop: 12,
            padding: 12,
            borderRadius: 12,
            backgroundColor: '#1c1c1e',
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
                    backgroundColor: isSent ? '#0b84fe' : '#2c2c2e',
                  }}
                >
                  <text style={{ fontSize: FONT_SIZE, lineHeight: LINE_HEIGHT, color: '#fff' }}>
                    {text}
                  </text>
                </view>
              )
            })}
          </view>
        </view>

        {/* Pretext shrinkwrap panel */}
        <view style={{
          marginTop: 12,
          padding: 14,
          borderRadius: 16,
          backgroundColor: '#fffdf8',
          borderWidth: 1,
          borderColor: '#d8cec3',
        }}>
          <text style={{ fontSize: 16, fontWeight: 'bold', color: '#201b18' }}>
            Pretext shrinkwrap
          </text>
          <text style={{ fontSize: 13, color: '#6d645d', marginTop: 6, lineHeight: 18 }}>
            {'Binary-searches the tightest width that produces the same line count. ' +
             'Zero wasted pixels.'}
          </text>
          <view style={{
            flexDirection: 'row',
            alignItems: 'center',
            marginTop: 10,
            padding: 6,
            paddingLeft: 10,
            paddingRight: 10,
            borderRadius: 99,
            backgroundColor: '#e8f5e9',
            alignSelf: 'flex-start',
          }}>
            <text style={{ fontSize: 11, color: '#1b5e20' }}>
              Wasted: 0 px²
            </text>
          </view>
          {/* Shrinkwrap chat container */}
          <view style={{
            width: chatWidth,
            marginTop: 12,
            padding: 12,
            borderRadius: 12,
            backgroundColor: '#1c1c1e',
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
                    backgroundColor: isSent ? '#0b84fe' : '#2c2c2e',
                  }}
                >
                  <text style={{ fontSize: FONT_SIZE, lineHeight: LINE_HEIGHT, color: '#fff' }}>
                    {text}
                  </text>
                </view>
              )
            })}
          </view>
        </view>

        {/* Explanation section */}
        <view style={{
          marginTop: 12,
          padding: 14,
          borderRadius: 16,
          backgroundColor: '#fffdf8',
          borderWidth: 1,
          borderColor: '#d8cec3',
        }}>
          <text style={{ fontSize: 17, fontWeight: 'bold', color: '#201b18' }}>
            Why can't CSS do this?
          </text>
          <text style={{ fontSize: 13, color: '#6d645d', marginTop: 8, lineHeight: 20 }}>
            {'CSS only knows fit-content, which is the width of the widest line after wrapping. ' +
             'If a paragraph wraps to 3 lines and the last line is short, CSS still sizes the ' +
             'container to the longest line. There\'s no CSS property to say "find the narrowest ' +
             'width that still produces exactly 3 lines." That requires measuring the text at ' +
             'multiple widths and comparing line counts — exactly what Pretext\'s walkLineRanges() ' +
             'does, without DOM text measurement in the resize path.'}
          </text>
        </view>
      </view>
    </scroll-view>
  )
}

root.render(<BubblesPage />)

if (import.meta.webpackHot) {
  import.meta.webpackHot.accept()
}

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
    <view style={{ width: '100%', height: '100%', backgroundColor: '#1c1c1e' }} bindlayoutchange={onLayout}>
      <scroll-view scroll-orientation="vertical" style={{ width: '100%', height: '100%' }}>
        <view style={{ padding: '16px', gap: '24px' }}>
          {/* CSS fit-content chat */}
          <view>
            <view style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <text style={{ fontSize: '13px', fontWeight: 'bold', color: '#ff9800' }}>
                CSS fit-content
              </text>
              <view style={{
                paddingLeft: '8px', paddingRight: '8px', paddingTop: '3px', paddingBottom: '3px',
                borderRadius: '99px', backgroundColor: 'rgba(255,152,0,0.2)',
              }}>
                <text style={{ fontSize: '11px', color: '#ff9800' }}>
                  {`${formatPixelCount(cssWastedPixels)} px\u00B2 wasted`}
                </text>
              </view>
            </view>
            <view style={{
              width: `${containerWidth}px`,
              padding: '16px',
              borderRadius: '14px',
              backgroundColor: '#1c1c1e',
              gap: '8px',
            }}>
              {BUBBLE_TEXTS.map((text, i) => {
                const isSent = BUBBLE_DIRECTIONS[i]!
                const w = renderState.widths[i]!
                return (
                  <view
                    key={`css-${i}`}
                    style={{
                      alignSelf: isSent ? 'flex-end' : 'flex-start',
                      maxWidth: `${bubbleMaxWidth}px`,
                      width: `${w.cssWidth}px`,
                      paddingTop: `${PADDING_V}px`,
                      paddingBottom: `${PADDING_V}px`,
                      paddingLeft: `${PADDING_H}px`,
                      paddingRight: `${PADDING_H}px`,
                      borderRadius: '16px',
                      borderBottomRightRadius: isSent ? '4px' : '16px',
                      borderBottomLeftRadius: isSent ? '16px' : '4px',
                      backgroundColor: isSent ? '#0b84fe' : '#2c2c2e',
                    }}
                  >
                    <text style={{ fontSize: `${FONT_SIZE}px`, lineHeight: `${LINE_HEIGHT}px`, color: '#fff' }}>
                      {text}
                    </text>
                  </view>
                )
              })}
            </view>
          </view>

          {/* Pretext shrinkwrap chat */}
          <view>
            <view style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <text style={{ fontSize: '13px', fontWeight: 'bold', color: '#4caf50' }}>
                Pretext shrinkwrap
              </text>
              <view style={{
                paddingLeft: '8px', paddingRight: '8px', paddingTop: '3px', paddingBottom: '3px',
                borderRadius: '99px', backgroundColor: 'rgba(76,175,80,0.2)',
              }}>
                <text style={{ fontSize: '11px', color: '#4caf50' }}>
                  0 px² wasted
                </text>
              </view>
            </view>
            <view style={{
              width: `${containerWidth}px`,
              padding: '16px',
              borderRadius: '14px',
              backgroundColor: '#1c1c1e',
              gap: '8px',
            }}>
              {BUBBLE_TEXTS.map((text, i) => {
                const isSent = BUBBLE_DIRECTIONS[i]!
                const w = renderState.widths[i]!
                return (
                  <view
                    key={`shrink-${i}`}
                    style={{
                      alignSelf: isSent ? 'flex-end' : 'flex-start',
                      maxWidth: `${bubbleMaxWidth}px`,
                      width: `${w.tightWidth}px`,
                      paddingTop: `${PADDING_V}px`,
                      paddingBottom: `${PADDING_V}px`,
                      paddingLeft: `${PADDING_H}px`,
                      paddingRight: `${PADDING_H}px`,
                      borderRadius: '16px',
                      borderBottomRightRadius: isSent ? '4px' : '16px',
                      borderBottomLeftRadius: isSent ? '16px' : '4px',
                      backgroundColor: isSent ? '#0b84fe' : '#2c2c2e',
                    }}
                  >
                    <text style={{ fontSize: `${FONT_SIZE}px`, lineHeight: `${LINE_HEIGHT}px`, color: '#fff' }}>
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
          top: '12px',
          right: '12px',
          width: '36px',
          height: '36px',
          borderRadius: '18px',
          backgroundColor: showControls ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.2)',
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
          backgroundColor: 'rgba(0,0,0,0.92)',
          borderRadius: '12px',
          padding: '16px',
          borderWidth: '1px',
          borderColor: 'rgba(255,255,255,0.1)',
        }}>
          <text style={{ fontSize: '18px', fontWeight: 'bold', color: '#fff' }}>
            Shrinkwrap Showdown
          </text>
          <text style={{ fontSize: '13px', color: 'rgba(255,255,255,0.6)', marginTop: '4px', lineHeight: '18px' }}>
            {'CSS fit-content sizes a bubble to its widest wrapped line, leaving dead space. ' +
             'Pretext finds the tightest width that wraps to the same line count.'}
          </text>

          {/* Width stepper */}
          <view style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', marginTop: '12px', gap: '10px' }}>
            <text style={{ fontSize: '13px', color: 'rgba(255,255,255,0.6)' }}>W:</text>
            <view
              bindtap={decrease}
              style={{
                width: '32px', height: '32px', borderRadius: '16px',
                backgroundColor: 'rgba(255,255,255,0.15)',
                alignItems: 'center', justifyContent: 'center',
              }}
            >
              <text style={{ fontSize: '18px', color: '#fff', fontWeight: 'bold' }}>{'\u2212'}</text>
            </view>
            <text style={{ fontSize: '14px', color: '#fff', minWidth: '70px', textAlign: 'center' }}>
              {`${chatWidth}px`}
            </text>
            <view
              bindtap={increase}
              style={{
                width: '32px', height: '32px', borderRadius: '16px',
                backgroundColor: 'rgba(255,255,255,0.15)',
                alignItems: 'center', justifyContent: 'center',
              }}
            >
              <text style={{ fontSize: '18px', color: '#fff', fontWeight: 'bold' }}>+</text>
            </view>
          </view>

          <text style={{ fontSize: '13px', color: 'rgba(255,255,255,0.6)', marginTop: '12px', lineHeight: '18px' }}>
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

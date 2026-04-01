import { root, useState, useMemo } from '@lynx-js/react'

import { prepareWithSegments, layoutWithLines } from 'lynx-pretext'
import { DevPanel, useDevPanelFPS, DevPanelFPS } from 'lynx-pretext-devtools'

const ARABIC_SHORT =
  'مرحبا بالعالم، هذه تجربة لقياس النص العربي وكسر الأسطر بشكل صحيح'
const HEBREW_SHORT =
  'שלום עולם, זוהי בדיקה למדידת טקסט עברי ושבירת שורות'
const MULTI_SCRIPT =
  'Hello مرحبا שלום 你好 こんにちは 안녕하세요 สวัสดี — a greeting in seven scripts!'

const SAMPLES = [
  { label: 'Arabic', text: ARABIC_SHORT },
  { label: 'Hebrew', text: HEBREW_SHORT },
  { label: 'Multi-script', text: MULTI_SCRIPT },
] as const

const FONT_SIZE = 16
const LINE_HEIGHT = 24
const FONT = `${FONT_SIZE}px`

function BidiTestPage() {
  const [maxWidth, setMaxWidth] = useState(360)

  const { btsFpsTick, btsFpsDisplay } = useDevPanelFPS()

  const contentWidth = Math.max(40, maxWidth - 32)

  const results = useMemo(() => {
    return SAMPLES.map(s => ({
      ...s,
      prepared: prepareWithSegments(s.text, FONT),
    }))
  }, [])

  const layouts = results.map(r => ({
    ...r,
    layout: layoutWithLines(r.prepared, contentWidth, LINE_HEIGHT),
  }))

  btsFpsTick()

  return (
    <DevPanel.Root>
      <view style={{ flex: 1, backgroundColor: '#fff' }}>
        <view style={{ flex: 1, padding: '16px' }}>
          <text style={{ fontSize: '20px', fontWeight: 'bold', color: '#333', marginBottom: '16px' }}>
            Bidi Text Demo
          </text>

          {layouts.map((item, idx) => (
            <view key={`sample-${idx}`} style={{ marginBottom: '20px' }}>
              <text style={{ fontSize: '13px', fontWeight: 'bold', color: '#1565c0', marginBottom: '6px' }}>
                {item.label}
              </text>

              {/* Pretext rendered lines */}
              <view style={{
                width: `${contentWidth}px`,
                borderWidth: '1px',
                borderColor: '#1976d2',
                borderRadius: '4px',
                backgroundColor: '#fafafa',
                padding: '4px 8px',
              }}>
                {item.layout.lines.map((line, i) => (
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

              {/* Native comparison */}
              <view style={{
                width: `${contentWidth}px`,
                marginTop: '6px',
                padding: '4px 8px',
                borderWidth: '1px',
                borderColor: '#ddd',
                borderRadius: '4px',
                backgroundColor: '#f5f5f5',
              }}>
                <text style={{ fontSize: '11px', color: '#999', marginBottom: '2px' }}>
                  Native
                </text>
                <text style={{ fontSize: `${FONT_SIZE}px`, lineHeight: `${LINE_HEIGHT}px`, color: '#333' }}>
                  {item.text}
                </text>
              </view>

              {/* Stats */}
              <text style={{ fontSize: '11px', color: '#888', marginTop: '4px' }}>
                {`${item.layout.lineCount} lines, ${item.layout.height}px`}
              </text>
            </view>
          ))}
        </view>

        <DevPanel.Trigger />
        <DevPanel.Content title="Bidi">
          <DevPanelFPS mtsFpsDisplay={0} btsFpsDisplay={btsFpsDisplay} />
          <DevPanel.Stats>
            <DevPanel.Stat label="width" value={`${contentWidth}px`} />
          </DevPanel.Stats>
          <DevPanel.Stepper
            label="width"
            value={maxWidth}
            min={40}
            max={1200}
            step={20}
            unit="px"
            onChange={setMaxWidth}
          />
        </DevPanel.Content>
      </view>
    </DevPanel.Root>
  )
}

root.render(<BidiTestPage />)

if (import.meta.webpackHot) {
  import.meta.webpackHot.accept()
}

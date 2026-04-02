import { root, useState, useMemo } from '@lynx-js/react'

import {
  layoutNextLine,
  prepareWithSegments,
  walkLineRanges,
  type LayoutCursor,
  type PreparedTextWithSegments,
} from 'lynx-pretext'
import { DevPanel, useDevPanelFPS, DevPanelFPS } from 'lynx-pretext-devtools'

// --- Types ---

type TextStyleName = 'body' | 'link' | 'code'
type ChipTone = 'mention' | 'status' | 'priority' | 'time' | 'count'

type RichInlineSpec =
  | { kind: 'text'; text: string; style: TextStyleName }
  | { kind: 'chip'; label: string; tone: ChipTone }

type FontWeight = 'normal' | 'bold' | '100' | '200' | '300' | '400' | '500' | '600' | '700' | '800' | '900'

type TextStyleModel = {
  chromeWidth: number
  font: string
  fontSize: string
  fontWeight: FontWeight
  fontFamily: string
  color: string
  isCode?: boolean
  isLink?: boolean
}

type TextInlineItem = {
  kind: 'text'
  style: TextStyleModel
  chromeWidth: number
  endCursor: LayoutCursor
  fullText: string
  fullWidth: number
  leadingGap: number
  prepared: PreparedTextWithSegments
}

type ChipInlineItem = {
  kind: 'chip'
  tone: ChipTone
  leadingGap: number
  text: string
  width: number
}

type InlineItem = TextInlineItem | ChipInlineItem

type LineFragment = {
  kind: 'text' | 'chip'
  tone?: ChipTone
  style?: TextStyleModel
  leadingGap: number
  text: string
  inlineWidth?: number
}

type RichLine = {
  fragments: LineFragment[]
}

// --- Constants ---

const BODY_FONT = '500 17px "Helvetica Neue", Helvetica, Arial, sans-serif'
const LINK_FONT = '600 17px "Helvetica Neue", Helvetica, Arial, sans-serif'
const CODE_FONT = '600 14px "SF Mono", ui-monospace, Menlo, Monaco, monospace'
const CHIP_FONT = '700 12px "Helvetica Neue", Helvetica, Arial, sans-serif'

const TEXT_STYLES: Record<TextStyleName, TextStyleModel> = {
  body: {
    chromeWidth: 0,
    font: BODY_FONT,
    fontSize: '17px',
    fontWeight: '500',
    fontFamily: 'Helvetica Neue',
    color: '#201b18',
  },
  code: {
    chromeWidth: 14,
    font: CODE_FONT,
    fontSize: '14px',
    fontWeight: '600',
    fontFamily: 'SF Mono',
    color: '#201b18',
    isCode: true,
  },
  link: {
    chromeWidth: 0,
    font: LINK_FONT,
    fontSize: '17px',
    fontWeight: '600',
    fontFamily: 'Helvetica Neue',
    color: '#955f3b',
    isLink: true,
  },
}

const CHIP_COLORS: Record<ChipTone, { bg: string; color: string; border: string }> = {
  mention: { bg: 'rgba(21, 90, 136, 0.12)', color: '#155a88', border: 'rgba(21, 90, 136, 0.12)' },
  status: { bg: 'rgba(196, 129, 20, 0.12)', color: '#916207', border: 'rgba(196, 129, 20, 0.14)' },
  priority: { bg: 'rgba(176, 44, 44, 0.1)', color: '#8e2323', border: 'rgba(176, 44, 44, 0.14)' },
  time: { bg: 'rgba(70, 118, 77, 0.11)', color: '#355f38', border: 'rgba(70, 118, 77, 0.14)' },
  count: { bg: 'rgba(67, 57, 122, 0.1)', color: '#483e83', border: 'rgba(67, 57, 122, 0.13)' },
}

const LINE_START_CURSOR: LayoutCursor = { segmentIndex: 0, graphemeIndex: 0 }

const LINE_HEIGHT = 34
const LAST_LINE_BLOCK_HEIGHT = 24
const NOTE_SHELL_CHROME_X = 40
const BODY_MIN_WIDTH = 200
const BODY_DEFAULT_WIDTH = 400
const BODY_MAX_WIDTH = 760
const CHIP_CHROME_WIDTH = 22
const UNBOUNDED_WIDTH = 100_000

const INLINE_SPECS: RichInlineSpec[] = [
  { kind: 'text', text: 'Ship ', style: 'body' },
  { kind: 'chip', label: '@maya', tone: 'mention' },
  { kind: 'text', text: "'s ", style: 'body' },
  { kind: 'text', text: 'rich-note', style: 'code' },
  { kind: 'text', text: ' card once ', style: 'body' },
  { kind: 'text', text: 'pre-wrap', style: 'code' },
  { kind: 'text', text: ' lands. Status ', style: 'body' },
  { kind: 'chip', label: 'blocked', tone: 'status' },
  { kind: 'text', text: ' by ', style: 'body' },
  { kind: 'text', text: 'vertical text', style: 'link' },
  { kind: 'text', text: ' research, but 北京 copy and Arabic QA are both green ✅. Keep ', style: 'body' },
  { kind: 'chip', label: 'جاهز', tone: 'status' },
  { kind: 'text', text: ' for ', style: 'body' },
  { kind: 'text', text: 'Cmd+K', style: 'code' },
  { kind: 'text', text: ' docs; the review bundle now includes 中文 labels, عربي fallback, and one more launch pass 🚀 for ', style: 'body' },
  { kind: 'chip', label: 'Fri 2:30 PM', tone: 'time' },
  { kind: 'text', text: '. Keep ', style: 'body' },
  { kind: 'text', text: 'layoutNextLine()', style: 'code' },
  { kind: 'text', text: ' public, tag this ', style: 'body' },
  { kind: 'chip', label: 'P1', tone: 'priority' },
  { kind: 'text', text: ', keep ', style: 'body' },
  { kind: 'chip', label: '3 reviewers', tone: 'count' },
  { kind: 'text', text: ', and route feedback to ', style: 'body' },
  { kind: 'text', text: 'design sync', style: 'link' },
  { kind: 'text', text: '.', style: 'body' },
]

// --- Measurement helpers ---

const collapsedSpaceWidthCache = new Map<string, number>()

function measureSingleLineWidth(prepared: PreparedTextWithSegments): number {
  let maxWidth = 0
  walkLineRanges(prepared, UNBOUNDED_WIDTH, line => {
    if (line.width > maxWidth) maxWidth = line.width
  })
  return maxWidth
}

function measureCollapsedSpaceWidth(font: string): number {
  const cached = collapsedSpaceWidthCache.get(font)
  if (cached !== undefined) return cached

  const joinedWidth = measureSingleLineWidth(prepareWithSegments('A A', font))
  const compactWidth = measureSingleLineWidth(prepareWithSegments('AA', font))
  const collapsedWidth = Math.max(0, joinedWidth - compactWidth)
  collapsedSpaceWidthCache.set(font, collapsedWidth)
  return collapsedWidth
}

const INLINE_BOUNDARY_GAP = measureCollapsedSpaceWidth(BODY_FONT)

// --- Inline item preparation ---

function prepareInlineItems(specs: RichInlineSpec[]): InlineItem[] {
  const items: InlineItem[] = []
  let pendingGap = 0

  for (let index = 0; index < specs.length; index++) {
    const spec = specs[index]!

    switch (spec.kind) {
      case 'chip': {
        const prepared = prepareWithSegments(spec.label, CHIP_FONT)
        items.push({
          kind: 'chip',
          tone: spec.tone,
          leadingGap: pendingGap,
          text: spec.label,
          width: Math.ceil(measureSingleLineWidth(prepared)) + CHIP_CHROME_WIDTH,
        })
        pendingGap = 0
        break
      }

      case 'text': {
        const carryGap = pendingGap
        const hasLeadingWhitespace = /^\s/.test(spec.text)
        const hasTrailingWhitespace = /\s$/.test(spec.text)
        const trimmedText = spec.text.trim()
        pendingGap = hasTrailingWhitespace ? INLINE_BOUNDARY_GAP : 0
        if (trimmedText.length === 0) break

        const style = TEXT_STYLES[spec.style]
        const prepared = prepareWithSegments(trimmedText, style.font)
        const wholeLine = layoutNextLine(prepared, LINE_START_CURSOR, UNBOUNDED_WIDTH)
        if (wholeLine === null) break

        items.push({
          kind: 'text',
          style,
          chromeWidth: style.chromeWidth,
          endCursor: wholeLine.end,
          fullText: wholeLine.text,
          fullWidth: wholeLine.width,
          leadingGap: carryGap > 0 || hasLeadingWhitespace ? INLINE_BOUNDARY_GAP : 0,
          prepared,
        })
        break
      }
    }
  }

  return items
}

// --- Layout ---

function cursorsMatch(a: LayoutCursor, b: LayoutCursor): boolean {
  return a.segmentIndex === b.segmentIndex && a.graphemeIndex === b.graphemeIndex
}

function layoutInlineItems(items: InlineItem[], maxWidth: number): RichLine[] {
  const lines: RichLine[] = []
  const safeWidth = Math.max(1, maxWidth)

  let itemIndex = 0
  let textCursor: LayoutCursor | null = null

  while (itemIndex < items.length) {
    const fragments: LineFragment[] = []
    let lineWidth = 0
    let remainingWidth = safeWidth

    lineLoop:
    while (itemIndex < items.length) {
      const item = items[itemIndex]!

      switch (item.kind) {
        case 'chip': {
          const leadingGap = fragments.length === 0 ? 0 : item.leadingGap
          if (fragments.length > 0 && leadingGap + item.width > remainingWidth) break lineLoop

          fragments.push({
            kind: 'chip',
            tone: item.tone,
            leadingGap,
            text: item.text,
            inlineWidth: item.width,
          })
          lineWidth += leadingGap + item.width
          remainingWidth = Math.max(0, safeWidth - lineWidth)
          itemIndex++
          textCursor = null
          continue
        }

        case 'text': {
          if (textCursor !== null && cursorsMatch(textCursor, item.endCursor)) {
            itemIndex++
            textCursor = null
            continue
          }

          const leadingGap = fragments.length === 0 ? 0 : item.leadingGap
          const reservedWidth = leadingGap + item.chromeWidth
          if (fragments.length > 0 && reservedWidth >= remainingWidth) break lineLoop

          if (textCursor === null) {
            const fullWidth = leadingGap + item.fullWidth + item.chromeWidth
            if (fullWidth <= remainingWidth) {
              fragments.push({
                kind: 'text',
                style: item.style,
                leadingGap,
                text: item.fullText,
                inlineWidth: item.chromeWidth > 0 ? item.fullWidth + item.chromeWidth : undefined,
              })
              lineWidth += fullWidth
              remainingWidth = Math.max(0, safeWidth - lineWidth)
              itemIndex++
              continue
            }
          }

          const startCursor = textCursor ?? LINE_START_CURSOR
          const line = layoutNextLine(
            item.prepared,
            startCursor,
            Math.max(1, remainingWidth - reservedWidth),
          )
          if (line === null) {
            itemIndex++
            textCursor = null
            continue
          }
          if (cursorsMatch(startCursor, line.end)) {
            itemIndex++
            textCursor = null
            continue
          }

          fragments.push({
            kind: 'text',
            style: item.style,
            leadingGap,
            text: line.text,
            inlineWidth: item.chromeWidth > 0 ? line.width + item.chromeWidth : undefined,
          })
          lineWidth += leadingGap + line.width + item.chromeWidth
          remainingWidth = Math.max(0, safeWidth - lineWidth)

          if (cursorsMatch(line.end, item.endCursor)) {
            itemIndex++
            textCursor = null
            continue
          }

          textCursor = line.end
          break lineLoop
        }
      }
    }

    if (fragments.length === 0) break
    lines.push({ fragments })
  }

  return lines
}

// --- Component ---

function RichNotePage() {
  const [maxWidth, setMaxWidth] = useState(BODY_DEFAULT_WIDTH)

  const { btsFpsTick, btsFpsDisplay } = useDevPanelFPS()

  const items = useMemo(() => prepareInlineItems(INLINE_SPECS), [])

  const bodyWidth = Math.max(BODY_MIN_WIDTH, Math.min(BODY_MAX_WIDTH, maxWidth))
  const lines = layoutInlineItems(items, bodyWidth)
  const lineCount = lines.length
  const noteWidth = bodyWidth + NOTE_SHELL_CHROME_X
  const noteBodyHeight =
    lineCount === 0 ? LAST_LINE_BLOCK_HEIGHT : (lineCount - 1) * LINE_HEIGHT + LAST_LINE_BLOCK_HEIGHT

  btsFpsTick()

  return (
    <DevPanel.Root>
      <view style={{
        flex: 1,
        backgroundColor: '#f5f1ea',
      }}>
        <view style={{ flex: 1, padding: '16px', alignItems: 'center' }}>
          {/* Title */}
          <text style={{
            fontSize: '20px',
            fontWeight: 'bold',
            color: '#201b18',
            marginBottom: '4px',
          }}>
            Rich Text
          </text>
          <text style={{
            fontSize: '13px',
            color: '#6d645d',
            marginBottom: '16px',
            maxWidth: '400px',
          }}>
            Text runs, links, code spans, and atomic chips laid out by Pretext.
          </text>

          {/* Note card */}
          <view style={{
            width: `${noteWidth}px`,
            borderWidth: '1px',
            borderColor: '#d8cec3',
            borderRadius: '20px',
            padding: '20px',
            backgroundColor: '#fffdf8',
          }}>
            {/* Note body - positioned lines */}
            <view style={{
              width: `${bodyWidth}px`,
              height: `${noteBodyHeight}px`,
            }}>
              {lines.map((line, lineIndex) => (
                <text
                  key={`line-${lineIndex}`}
                  style={{
                    position: 'absolute',
                    top: `${lineIndex * LINE_HEIGHT}px`,
                    left: '0px',
                    fontSize: '17px',
                    fontWeight: '500',
                    color: '#201b18',
                  }}
                >
                  {line.fragments.map((frag, fragIndex) => {
                    if (frag.kind === 'chip' && frag.tone) {
                      const chipColor = CHIP_COLORS[frag.tone]
                      return (
                        <view
                          key={`frag-${fragIndex}`}
                          style={{
                            width: `${Math.ceil(frag.inlineWidth!)}px`,
                            height: '24px',
                            borderRadius: '999px',
                            backgroundColor: chipColor.bg,
                            borderWidth: '1px',
                            borderColor: chipColor.border,
                            alignItems: 'center',
                            justifyContent: 'center',
                            verticalAlign: 'middle',
                            ...(frag.leadingGap > 0 ? { marginLeft: `${frag.leadingGap}px` } : {}),
                          }}
                        >
                          <text style={{
                            fontSize: '12px',
                            fontWeight: '700',
                            lineHeight: '24px',
                            color: chipColor.color,
                          }}>
                            {frag.text}
                          </text>
                        </view>
                      )
                    }

                    const style = frag.style!
                    if (style.isCode) {
                      return (
                        <view
                          key={`frag-${fragIndex}`}
                          style={{
                            width: `${Math.ceil(frag.inlineWidth!)}px`,
                            paddingTop: '2px',
                            paddingBottom: '3px',
                            borderRadius: '9px',
                            backgroundColor: 'rgba(17, 31, 43, 0.08)',
                            alignItems: 'center',
                            justifyContent: 'center',
                            verticalAlign: 'middle',
                            ...(frag.leadingGap > 0 ? { marginLeft: `${frag.leadingGap}px` } : {}),
                          }}
                        >
                          <text style={{
                            fontSize: style.fontSize,
                            fontWeight: style.fontWeight,
                            fontFamily: style.fontFamily,
                            color: style.color,
                          }}>
                            {frag.text}
                          </text>
                        </view>
                      )
                    }

                    return (
                      <text
                        key={`frag-${fragIndex}`}
                        style={{
                          fontSize: style.fontSize,
                          fontWeight: style.fontWeight,
                          fontFamily: style.fontFamily,
                          color: style.color,
                          ...(style.isLink ? { textDecorationLine: 'underline' } : {}),
                          ...(frag.leadingGap > 0 ? { marginLeft: `${frag.leadingGap}px` } : {}),
                        }}
                      >
                        {frag.text}
                      </text>
                    )
                  })}
                </text>
              ))}
            </view>
          </view>

          {/* Stats */}
          <view style={{
            marginTop: '12px',
            padding: '10px',
            borderRadius: '8px',
            backgroundColor: 'rgba(149, 95, 59, 0.08)',
            flexDirection: 'row',
            gap: '24px',
          }}>
            <view>
              <text style={{ fontSize: '12px', color: '#6d645d' }}>Lines</text>
              <text style={{ fontSize: '20px', fontWeight: 'bold', color: '#201b18' }}>
                {`${lineCount}`}
              </text>
            </view>
            <view>
              <text style={{ fontSize: '12px', color: '#6d645d' }}>Width</text>
              <text style={{ fontSize: '20px', fontWeight: 'bold', color: '#955f3b' }}>
                {`${bodyWidth}px`}
              </text>
            </view>
            <view>
              <text style={{ fontSize: '12px', color: '#6d645d' }}>Height</text>
              <text style={{ fontSize: '20px', fontWeight: 'bold', color: '#201b18' }}>
                {`${noteBodyHeight}px`}
              </text>
            </view>
          </view>
        </view>

        <DevPanel.Trigger />
        <DevPanel.Content title="Rich Note">
          <DevPanelFPS mtsFpsDisplay={0} btsFpsDisplay={btsFpsDisplay} />
          <DevPanel.Stats>
            <DevPanel.Stat label="lines" value={`${lineCount}`} />
            <DevPanel.Stat label="height" value={`${noteBodyHeight}px`} />
          </DevPanel.Stats>
          <DevPanel.Stepper
            label="width"
            value={maxWidth}
            min={BODY_MIN_WIDTH}
            max={BODY_MAX_WIDTH}
            step={20}
            unit="px"
            onChange={setMaxWidth}
          />
        </DevPanel.Content>
      </view>
    </DevPanel.Root>
  )
}

root.render(<RichNotePage />)

if (import.meta.webpackHot) {
  import.meta.webpackHot.accept()
}

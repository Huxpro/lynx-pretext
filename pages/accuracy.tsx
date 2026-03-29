import { root, useState, useEffect } from '@lynx-js/react'

import {
  prepareWithSegments,
  layoutWithLines,
  clearCache,
} from '../src/layout'
import { TEXTS, WIDTHS, FONT_SIZE, LINE_HEIGHT } from '../src/test-data'

type TestResult = {
  label: string
  width: number
  pass: boolean
  lineCountMatch: boolean
  nativeLineCount: number
  ourLineCount: number
  firstDivergentLine: number | null
  nativeContent: string[]
  ourContent: string[]
}

type Summary = {
  total: number
  passed: number
  failed: number
  passRate: string
  englishTotal: number
  englishPassed: number
  englishPassRate: string
  results: TestResult[]
}

function runAccuracyCheck(): Summary {
  const results: TestResult[] = []
  let total = 0
  let passed = 0
  let englishTotal = 0
  let englishPassed = 0

  const fontSizeStr = `${FONT_SIZE}px`
  const font = `${FONT_SIZE}px`

  clearCache()

  for (const { label, text } of TEXTS) {
    if (text.length === 0) continue

    const prepared = prepareWithSegments(text, font)

    for (const width of WIDTHS) {
      // Native oracle: getTextInfo with maxWidth
      const native = lynx.getTextInfo(text, {
        fontSize: fontSizeStr,
        maxWidth: `${width}px`,
      })
      const nativeContent = native.content ?? [text]

      // Our implementation
      const { lines } = layoutWithLines(prepared, width, LINE_HEIGHT)
      const ourContent = lines.map(l => l.text)

      // Line-by-line comparison
      const lineCountMatch = nativeContent.length === ourContent.length
      let firstDivergentLine: number | null = null
      const maxLines = Math.max(nativeContent.length, ourContent.length)
      for (let i = 0; i < maxLines; i++) {
        const nativeLine = (nativeContent[i] ?? '').trim()
        const ourLine = (ourContent[i] ?? '').trim()
        if (nativeLine !== ourLine) {
          firstDivergentLine = i
          break
        }
      }

      const pass = lineCountMatch && firstDivergentLine === null
      total++
      if (pass) passed++

      const isEnglish = label.startsWith('English') || label === 'Numbers and punctuation'
      if (isEnglish) {
        englishTotal++
        if (pass) englishPassed++
      }

      results.push({
        label,
        width,
        pass,
        lineCountMatch,
        nativeLineCount: nativeContent.length,
        ourLineCount: ourContent.length,
        firstDivergentLine,
        nativeContent,
        ourContent,
      })

      // Log mismatches for debugging
      if (!pass) {
        console.warn(
          `[MISMATCH] "${label}" @${width}px: ` +
          `native=${nativeContent.length}L vs ours=${ourContent.length}L` +
          (firstDivergentLine !== null
            ? ` | L${firstDivergentLine + 1} native="${(nativeContent[firstDivergentLine] ?? '').slice(0, 40)}" ours="${(ourContent[firstDivergentLine] ?? '').slice(0, 40)}"`
            : '')
        )
      }
    }
  }

  const passRate = total > 0 ? ((passed / total) * 100).toFixed(1) : '0.0'
  const englishPassRate = englishTotal > 0 ? ((englishPassed / englishTotal) * 100).toFixed(1) : '0.0'

  return { total, passed, failed: total - passed, passRate, englishTotal, englishPassed, englishPassRate, results }
}

export function AccuracyPage() {
  const [summary, setSummary] = useState<Summary | null>(null)
  const [showFailuresOnly, setShowFailuresOnly] = useState(false)

  useEffect(() => {
    const result = runAccuracyCheck()
    setSummary(result)
    console.info(`[Accuracy] ${result.passed}/${result.total} pass (${result.passRate}%) | English: ${result.englishPassed}/${result.englishTotal} (${result.englishPassRate}%)`)
  }, [])

  if (!summary) {
    return (
      <view style={{ padding: '20px' }}>
        <text style={{ fontSize: '18px', color: '#666' }}>Running accuracy check...</text>
      </view>
    )
  }

  const displayResults = showFailuresOnly
    ? summary.results.filter(r => !r.pass)
    : summary.results

  return (
    <scroll-view scroll-orientation="vertical" style={{ flex: 1 }}>
      <view style={{ padding: '16px' }}>
        {/* Header */}
        <text style={{ fontSize: '22px', fontWeight: 'bold', color: '#222' }}>
          Accuracy Validation
        </text>
        <text style={{ fontSize: '14px', color: '#888', marginTop: '4px' }}>
          {`${FONT_SIZE}px system font | ${WIDTHS.length} widths (${WIDTHS[0]}-${WIDTHS[WIDTHS.length - 1]}px) | ${TEXTS.length - 1} texts`}
        </text>

        {/* Summary */}
        <view style={{
          marginTop: '12px',
          padding: '12px',
          borderRadius: '8px',
          backgroundColor: summary.failed === 0 ? '#e8f5e9' : '#fff3e0',
        }}>
          <text style={{ fontSize: '28px', fontWeight: 'bold', color: summary.failed === 0 ? '#2e7d32' : '#e65100' }}>
            {`${summary.passRate}%`}
          </text>
          <text style={{ fontSize: '14px', color: '#555', marginTop: '4px' }}>
            {`${summary.passed}/${summary.total} tests pass | ${summary.failed} mismatches`}
          </text>
          <text style={{ fontSize: '14px', color: '#555', marginTop: '2px' }}>
            {`English: ${summary.englishPassRate}% (${summary.englishPassed}/${summary.englishTotal})`}
          </text>
        </view>

        {/* Toggle */}
        <view
          style={{ marginTop: '12px', padding: '8px', backgroundColor: '#f0f0f0', borderRadius: '4px' }}
          bindtap={() => setShowFailuresOnly(!showFailuresOnly)}
        >
          <text style={{ fontSize: '14px', color: '#333' }}>
            {showFailuresOnly ? `Showing ${displayResults.length} failures — tap to show all` : `Showing all ${displayResults.length} results — tap to show failures only`}
          </text>
        </view>

        {/* Results */}
        {displayResults.map((r, idx) => (
          <view
            key={`${r.label}-${r.width}-${idx}`}
            style={{
              marginTop: '8px',
              padding: '8px',
              borderRadius: '4px',
              backgroundColor: r.pass ? '#f1f8e9' : '#fce4ec',
            }}
          >
            <view style={{ display: 'flex', flexDirection: 'row', justifyContent: 'space-between' }}>
              <text style={{ fontSize: '13px', fontWeight: 'bold', color: r.pass ? '#33691e' : '#b71c1c' }}>
                {`${r.pass ? 'PASS' : 'FAIL'} ${r.label}`}
              </text>
              <text style={{ fontSize: '12px', color: '#666' }}>
                {`@${r.width}px`}
              </text>
            </view>
            <text style={{ fontSize: '11px', color: '#777', marginTop: '2px' }}>
              {`Lines: native=${r.nativeLineCount} ours=${r.ourLineCount}`}
            </text>
            {r.firstDivergentLine !== null && (
              <view style={{ marginTop: '4px', padding: '4px', backgroundColor: '#fff', borderRadius: '2px' }}>
                <text style={{ fontSize: '11px', color: '#d32f2f' }}>
                  {`L${r.firstDivergentLine + 1} diverges:`}
                </text>
                <text style={{ fontSize: '10px', color: '#555', marginTop: '2px' }}>
                  {`native: "${(r.nativeContent[r.firstDivergentLine] ?? '').slice(0, 60)}"`}
                </text>
                <text style={{ fontSize: '10px', color: '#555', marginTop: '1px' }}>
                  {`  ours: "${(r.ourContent[r.firstDivergentLine] ?? '').slice(0, 60)}"`}
                </text>
              </view>
            )}
          </view>
        ))}
      </view>
    </scroll-view>
  )
}

root.render(<AccuracyPage />)

if (import.meta.webpackHot) {
  import.meta.webpackHot.accept()
}

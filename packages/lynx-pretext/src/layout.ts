// Text measurement for Lynx using main-thread lynx.getTextInfo().
//
// Two-phase measurement:
//   prepare(text, font) — segments text via Intl.Segmenter polyfill, measures
//     each word via getTextInfo, caches widths. Call once when text first appears.
//   layout(prepared, maxWidth, lineHeight) — walks cached word widths with pure
//     arithmetic to count lines and compute height. Call on every resize.
//
// Based on chenglou/pretext, adapted for Lynx main thread.

import {
  analyzeText,
  clearAnalysisCaches,
  endsWithClosingQuote,
  isCJK,
  kinsokuEnd,
  kinsokuStart,
  leftStickyPunctuation,
  setAnalysisLocale,
  type AnalysisChunk,
  type SegmentBreakKind,
  type TextAnalysis,
  type WhiteSpaceMode,
} from './analysis'
import {
  clearMeasurementCaches,
  getCorrectedSegmentWidth,
  getEngineProfile,
  getFontMeasurementState,
  getSegmentGraphemePrefixWidths,
  getSegmentGraphemeWidths,
  getSegmentMetrics,
  textMayContainEmoji,
} from './measurement'
import {
  countPreparedLines,
  layoutNextLineRange as stepPreparedLineRange,
  walkPreparedLines,
  type InternalLayoutLine,
} from './line-break'

let sharedGraphemeSegmenter: Intl.Segmenter | null = null
// Rich-path only. Reuses grapheme splits while materializing multiple lines
// from the same prepared handle, without pushing that cache into the API.
let sharedLineTextCaches = new WeakMap<PreparedTextWithSegments, Map<number, string[]>>()

function getSharedGraphemeSegmenter(): Intl.Segmenter {
  if (sharedGraphemeSegmenter === null) {
    sharedGraphemeSegmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
  }
  return sharedGraphemeSegmenter
}

// Bidi stub for MVP — returns null (no bidi metadata).
function computeSegmentLevels(
  _normalized: string,
  _segStarts: number[],
): Int8Array | null {
  return null
}

// --- Public types ---

declare const preparedTextBrand: unique symbol

type PreparedCore = {
  widths: number[]
  lineEndFitAdvances: number[]
  lineEndPaintAdvances: number[]
  kinds: SegmentBreakKind[]
  simpleLineWalkFastPath: boolean
  segLevels: Int8Array | null
  breakableWidths: (number[] | null)[]
  breakablePrefixWidths: (number[] | null)[]
  discretionaryHyphenWidth: number
  tabStopAdvance: number
  chunks: PreparedLineChunk[]
}

export type PreparedText = {
  readonly [preparedTextBrand]: true
}

type InternalPreparedText = PreparedText & PreparedCore

export type PreparedTextWithSegments = InternalPreparedText & {
  segments: string[]
}

export type LayoutCursor = {
  segmentIndex: number
  graphemeIndex: number
}

export type LayoutResult = {
  lineCount: number
  height: number
}

export type LayoutLine = {
  text: string
  width: number
  start: LayoutCursor
  end: LayoutCursor
}

export type LayoutLineRange = {
  width: number
  start: LayoutCursor
  end: LayoutCursor
}

export type LayoutLinesResult = LayoutResult & {
  lines: LayoutLine[]
}

export type PrepareOptions = {
  whiteSpace?: WhiteSpaceMode
}

export type PreparedLineChunk = {
  startSegmentIndex: number
  endSegmentIndex: number
  consumedEndSegmentIndex: number
}

// --- Internal helpers ---

function createEmptyPrepared(includeSegments: boolean): InternalPreparedText | PreparedTextWithSegments {
  const base = {
    widths: [],
    lineEndFitAdvances: [],
    lineEndPaintAdvances: [],
    kinds: [],
    simpleLineWalkFastPath: true,
    segLevels: null,
    breakableWidths: [],
    breakablePrefixWidths: [],
    discretionaryHyphenWidth: 0,
    tabStopAdvance: 0,
    chunks: [],
  }
  if (includeSegments) {
    return { ...base, segments: [] } as unknown as PreparedTextWithSegments
  }
  return base as unknown as InternalPreparedText
}

function measureAnalysis(
  analysis: TextAnalysis,
  font: string,
  includeSegments: boolean,
): InternalPreparedText | PreparedTextWithSegments {
  const graphemeSegmenter = getSharedGraphemeSegmenter()
  const engineProfile = getEngineProfile()
  const { cache, emojiCorrection } = getFontMeasurementState(
    font,
    textMayContainEmoji(analysis.normalized),
  )
  const discretionaryHyphenWidth = getCorrectedSegmentWidth('-', getSegmentMetrics('-', cache), emojiCorrection)
  const spaceWidth = getCorrectedSegmentWidth(' ', getSegmentMetrics(' ', cache), emojiCorrection)
  const tabStopAdvance = spaceWidth * 8

  if (analysis.len === 0) return createEmptyPrepared(includeSegments)

  const widths: number[] = []
  const lineEndFitAdvances: number[] = []
  const lineEndPaintAdvances: number[] = []
  const kinds: SegmentBreakKind[] = []
  let simpleLineWalkFastPath = analysis.chunks.length <= 1
  const segStarts = includeSegments ? [] as number[] : null
  const breakableWidths: (number[] | null)[] = []
  const breakablePrefixWidths: (number[] | null)[] = []
  const segments = includeSegments ? [] as string[] : null
  const preparedStartByAnalysisIndex = Array.from<number>({ length: analysis.len })
  const preparedEndByAnalysisIndex = Array.from<number>({ length: analysis.len })

  function pushMeasuredSegment(
    text: string,
    width: number,
    lineEndFitAdvance: number,
    lineEndPaintAdvance: number,
    kind: SegmentBreakKind,
    start: number,
    breakable: number[] | null,
    breakablePrefix: number[] | null,
  ): void {
    if (kind !== 'text' && kind !== 'space' && kind !== 'zero-width-break') {
      simpleLineWalkFastPath = false
    }
    widths.push(width)
    lineEndFitAdvances.push(lineEndFitAdvance)
    lineEndPaintAdvances.push(lineEndPaintAdvance)
    kinds.push(kind)
    segStarts?.push(start)
    breakableWidths.push(breakable)
    breakablePrefixWidths.push(breakablePrefix)
    if (segments !== null) segments.push(text)
  }

  for (let mi = 0; mi < analysis.len; mi++) {
    preparedStartByAnalysisIndex[mi] = widths.length
    const segText = analysis.texts[mi]!
    const segWordLike = analysis.isWordLike[mi]!
    const segKind = analysis.kinds[mi]!
    const segStart = analysis.starts[mi]!

    if (segKind === 'soft-hyphen') {
      pushMeasuredSegment(
        segText,
        0,
        discretionaryHyphenWidth,
        discretionaryHyphenWidth,
        segKind,
        segStart,
        null,
        null,
      )
      preparedEndByAnalysisIndex[mi] = widths.length
      continue
    }

    if (segKind === 'hard-break') {
      pushMeasuredSegment(segText, 0, 0, 0, segKind, segStart, null, null)
      preparedEndByAnalysisIndex[mi] = widths.length
      continue
    }

    if (segKind === 'tab') {
      pushMeasuredSegment(segText, 0, 0, 0, segKind, segStart, null, null)
      preparedEndByAnalysisIndex[mi] = widths.length
      continue
    }

    const segMetrics = getSegmentMetrics(segText, cache)

    if (segKind === 'text' && segMetrics.containsCJK) {
      let unitText = ''
      let unitStart = 0

      for (const gs of graphemeSegmenter.segment(segText)) {
        const grapheme = gs.segment

        if (unitText.length === 0) {
          unitText = grapheme
          unitStart = gs.index
          continue
        }

        if (
          kinsokuEnd.has(unitText) ||
          kinsokuStart.has(grapheme) ||
          leftStickyPunctuation.has(grapheme) ||
          (engineProfile.carryCJKAfterClosingQuote &&
            isCJK(grapheme) &&
            endsWithClosingQuote(unitText))
        ) {
          unitText += grapheme
          continue
        }

        const unitMetrics = getSegmentMetrics(unitText, cache)
        const w = getCorrectedSegmentWidth(unitText, unitMetrics, emojiCorrection)
        pushMeasuredSegment(unitText, w, w, w, 'text', segStart + unitStart, null, null)

        unitText = grapheme
        unitStart = gs.index
      }

      if (unitText.length > 0) {
        const unitMetrics = getSegmentMetrics(unitText, cache)
        const w = getCorrectedSegmentWidth(unitText, unitMetrics, emojiCorrection)
        pushMeasuredSegment(unitText, w, w, w, 'text', segStart + unitStart, null, null)
      }
      preparedEndByAnalysisIndex[mi] = widths.length
      continue
    }

    const w = getCorrectedSegmentWidth(segText, segMetrics, emojiCorrection)
    const lineEndFitAdvance =
      segKind === 'space' || segKind === 'preserved-space' || segKind === 'zero-width-break'
        ? 0
        : w
    const lineEndPaintAdvance =
      segKind === 'space' || segKind === 'zero-width-break'
        ? 0
        : w

    if (segWordLike && segText.length > 1) {
      const graphemeWidths = getSegmentGraphemeWidths(segText, segMetrics, cache, emojiCorrection)
      const graphemePrefixWidths = engineProfile.preferPrefixWidthsForBreakableRuns
        ? getSegmentGraphemePrefixWidths(segText, segMetrics, cache, emojiCorrection)
        : null
      pushMeasuredSegment(
        segText,
        w,
        lineEndFitAdvance,
        lineEndPaintAdvance,
        segKind,
        segStart,
        graphemeWidths,
        graphemePrefixWidths,
      )
    } else {
      pushMeasuredSegment(
        segText,
        w,
        lineEndFitAdvance,
        lineEndPaintAdvance,
        segKind,
        segStart,
        null,
        null,
      )
    }
    preparedEndByAnalysisIndex[mi] = widths.length
  }

  const chunks = mapAnalysisChunksToPreparedChunks(analysis.chunks, preparedStartByAnalysisIndex, preparedEndByAnalysisIndex)
  const segLevels = segStarts === null ? null : computeSegmentLevels(analysis.normalized, segStarts)
  if (segments !== null) {
    return {
      widths,
      lineEndFitAdvances,
      lineEndPaintAdvances,
      kinds,
      simpleLineWalkFastPath,
      segLevels,
      breakableWidths,
      breakablePrefixWidths,
      discretionaryHyphenWidth,
      tabStopAdvance,
      chunks,
      segments,
    } as unknown as PreparedTextWithSegments
  }
  return {
    widths,
    lineEndFitAdvances,
    lineEndPaintAdvances,
    kinds,
    simpleLineWalkFastPath,
    segLevels,
    breakableWidths,
    breakablePrefixWidths,
    discretionaryHyphenWidth,
    tabStopAdvance,
    chunks,
  } as unknown as InternalPreparedText
}

function mapAnalysisChunksToPreparedChunks(
  chunks: AnalysisChunk[],
  preparedStartByAnalysisIndex: number[],
  preparedEndByAnalysisIndex: number[],
): PreparedLineChunk[] {
  const preparedChunks: PreparedLineChunk[] = []
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i]!
    const startSegmentIndex =
      chunk.startSegmentIndex < preparedStartByAnalysisIndex.length
        ? preparedStartByAnalysisIndex[chunk.startSegmentIndex]!
        : preparedEndByAnalysisIndex[preparedEndByAnalysisIndex.length - 1] ?? 0
    const endSegmentIndex =
      chunk.endSegmentIndex < preparedStartByAnalysisIndex.length
        ? preparedStartByAnalysisIndex[chunk.endSegmentIndex]!
        : preparedEndByAnalysisIndex[preparedEndByAnalysisIndex.length - 1] ?? 0
    const consumedEndSegmentIndex =
      chunk.consumedEndSegmentIndex < preparedStartByAnalysisIndex.length
        ? preparedStartByAnalysisIndex[chunk.consumedEndSegmentIndex]!
        : preparedEndByAnalysisIndex[preparedEndByAnalysisIndex.length - 1] ?? 0

    preparedChunks.push({
      startSegmentIndex,
      endSegmentIndex,
      consumedEndSegmentIndex,
    })
  }
  return preparedChunks
}

function prepareInternal(
  text: string,
  font: string,
  includeSegments: boolean,
  options?: PrepareOptions,
): InternalPreparedText | PreparedTextWithSegments {
  const analysis = analyzeText(text, getEngineProfile(), options?.whiteSpace)
  return measureAnalysis(analysis, font, includeSegments)
}

function getInternalPrepared(prepared: PreparedText): InternalPreparedText {
  return prepared as InternalPreparedText
}

// --- Public API ---

export function prepare(text: string, font: string, options?: PrepareOptions): PreparedText {
  return prepareInternal(text, font, false, options) as PreparedText
}

export function prepareWithSegments(text: string, font: string, options?: PrepareOptions): PreparedTextWithSegments {
  return prepareInternal(text, font, true, options) as PreparedTextWithSegments
}

export function layout(prepared: PreparedText, maxWidth: number, lineHeight: number): LayoutResult {
  const lineCount = countPreparedLines(getInternalPrepared(prepared), maxWidth)
  return { lineCount, height: lineCount * lineHeight }
}

// --- Rich-path helpers (used by layoutWithLines, walkLineRanges, layoutNextLine) ---

function getSegmentGraphemes(
  segmentIndex: number,
  segments: string[],
  cache: Map<number, string[]>,
): string[] {
  let graphemes = cache.get(segmentIndex)
  if (graphemes !== undefined) return graphemes

  graphemes = []
  const graphemeSegmenter = getSharedGraphemeSegmenter()
  for (const gs of graphemeSegmenter.segment(segments[segmentIndex]!)) {
    graphemes.push(gs.segment)
  }
  cache.set(segmentIndex, graphemes)
  return graphemes
}

function getLineTextCache(prepared: PreparedTextWithSegments): Map<number, string[]> {
  let cache = sharedLineTextCaches.get(prepared)
  if (cache !== undefined) return cache

  cache = new Map<number, string[]>()
  sharedLineTextCaches.set(prepared, cache)
  return cache
}

function lineHasDiscretionaryHyphen(
  kinds: SegmentBreakKind[],
  startSegmentIndex: number,
  startGraphemeIndex: number,
  endSegmentIndex: number,
): boolean {
  return (
    endSegmentIndex > 0 &&
    kinds[endSegmentIndex - 1] === 'soft-hyphen' &&
    !(startSegmentIndex === endSegmentIndex && startGraphemeIndex > 0)
  )
}

function buildLineTextFromRange(
  segments: string[],
  kinds: SegmentBreakKind[],
  cache: Map<number, string[]>,
  startSegmentIndex: number,
  startGraphemeIndex: number,
  endSegmentIndex: number,
  endGraphemeIndex: number,
): string {
  let text = ''
  const endsWithDiscretionaryHyphen = lineHasDiscretionaryHyphen(
    kinds,
    startSegmentIndex,
    startGraphemeIndex,
    endSegmentIndex,
  )

  for (let i = startSegmentIndex; i < endSegmentIndex; i++) {
    if (kinds[i] === 'soft-hyphen' || kinds[i] === 'hard-break') continue
    if (i === startSegmentIndex && startGraphemeIndex > 0) {
      text += getSegmentGraphemes(i, segments, cache).slice(startGraphemeIndex).join('')
    } else {
      text += segments[i]!
    }
  }

  if (endGraphemeIndex > 0) {
    if (endsWithDiscretionaryHyphen) text += '-'
    text += getSegmentGraphemes(endSegmentIndex, segments, cache).slice(
      startSegmentIndex === endSegmentIndex ? startGraphemeIndex : 0,
      endGraphemeIndex,
    ).join('')
  } else if (endsWithDiscretionaryHyphen) {
    text += '-'
  }

  return text
}

function createLayoutLine(
  prepared: PreparedTextWithSegments,
  cache: Map<number, string[]>,
  width: number,
  startSegmentIndex: number,
  startGraphemeIndex: number,
  endSegmentIndex: number,
  endGraphemeIndex: number,
): LayoutLine {
  return {
    text: buildLineTextFromRange(
      prepared.segments,
      prepared.kinds,
      cache,
      startSegmentIndex,
      startGraphemeIndex,
      endSegmentIndex,
      endGraphemeIndex,
    ),
    width,
    start: {
      segmentIndex: startSegmentIndex,
      graphemeIndex: startGraphemeIndex,
    },
    end: {
      segmentIndex: endSegmentIndex,
      graphemeIndex: endGraphemeIndex,
    },
  }
}

function materializeLayoutLine(
  prepared: PreparedTextWithSegments,
  cache: Map<number, string[]>,
  line: InternalLayoutLine,
): LayoutLine {
  return createLayoutLine(
    prepared,
    cache,
    line.width,
    line.startSegmentIndex,
    line.startGraphemeIndex,
    line.endSegmentIndex,
    line.endGraphemeIndex,
  )
}

function toLayoutLineRange(line: InternalLayoutLine): LayoutLineRange {
  return {
    width: line.width,
    start: {
      segmentIndex: line.startSegmentIndex,
      graphemeIndex: line.startGraphemeIndex,
    },
    end: {
      segmentIndex: line.endSegmentIndex,
      graphemeIndex: line.endGraphemeIndex,
    },
  }
}

function stepLineRange(
  prepared: PreparedTextWithSegments,
  start: LayoutCursor,
  maxWidth: number,
): LayoutLineRange | null {
  const line = stepPreparedLineRange(prepared, start, maxWidth)
  if (line === null) return null
  return toLayoutLineRange(line)
}

function materializeLine(
  prepared: PreparedTextWithSegments,
  line: LayoutLineRange,
): LayoutLine {
  return createLayoutLine(
    prepared,
    getLineTextCache(prepared),
    line.width,
    line.start.segmentIndex,
    line.start.graphemeIndex,
    line.end.segmentIndex,
    line.end.graphemeIndex,
  )
}

export function walkLineRanges(
  prepared: PreparedTextWithSegments,
  maxWidth: number,
  onLine: (line: LayoutLineRange) => void,
): number {
  if (prepared.widths.length === 0) return 0

  return walkPreparedLines(getInternalPrepared(prepared), maxWidth, line => {
    onLine(toLayoutLineRange(line))
  })
}

export function layoutNextLine(
  prepared: PreparedTextWithSegments,
  start: LayoutCursor,
  maxWidth: number,
): LayoutLine | null {
  const line = stepLineRange(prepared, start, maxWidth)
  if (line === null) return null
  return materializeLine(prepared, line)
}

export function layoutWithLines(prepared: PreparedTextWithSegments, maxWidth: number, lineHeight: number): LayoutLinesResult {
  const lines: LayoutLine[] = []
  if (prepared.widths.length === 0) return { lineCount: 0, height: 0, lines }

  const graphemeCache = getLineTextCache(prepared)
  const lineCount = walkPreparedLines(getInternalPrepared(prepared), maxWidth, line => {
    lines.push(materializeLayoutLine(prepared, graphemeCache, line))
  })

  return { lineCount, height: lineCount * lineHeight, lines }
}

export function clearCache(): void {
  clearAnalysisCaches()
  sharedGraphemeSegmenter = null
  sharedLineTextCaches = new WeakMap<PreparedTextWithSegments, Map<number, string[]>>()
  clearMeasurementCaches()
}

export function setLocale(locale?: string): void {
  setAnalysisLocale(locale)
  clearCache()
}

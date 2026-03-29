import { isCJK } from './analysis'

export type SegmentMetrics = {
  width: number
  containsCJK: boolean
  emojiCount?: number
  graphemeWidths?: number[] | null
  graphemePrefixWidths?: number[] | null
}

export type EngineProfile = {
  lineFitEpsilon: number
  carryCJKAfterClosingQuote: boolean
  preferPrefixWidthsForBreakableRuns: boolean
  preferEarlySoftHyphenBreak: boolean
}

// Module-level font context (replaces Canvas ctx.font)
let currentFontSizeStr: string = '16px'
let currentFontFamily: string | undefined = undefined

const segmentMetricCaches = new Map<string, Map<string, SegmentMetrics>>()
let cachedEngineProfile: EngineProfile | null = null

const maybeEmojiRe = /[\p{Emoji_Presentation}\p{Extended_Pictographic}\p{Regional_Indicator}\uFE0F\u20E3]/u
let sharedGraphemeSegmenter: Intl.Segmenter | null = null

export function getSegmentMetricCache(font: string): Map<string, SegmentMetrics> {
  let cache = segmentMetricCaches.get(font)
  if (!cache) {
    cache = new Map()
    segmentMetricCaches.set(font, cache)
  }
  return cache
}

export function getSegmentMetrics(seg: string, cache: Map<string, SegmentMetrics>): SegmentMetrics {
  let metrics = cache.get(seg)
  if (metrics === undefined) {
    const info: { fontSize: string; fontFamily?: string } = { fontSize: currentFontSizeStr }
    if (currentFontFamily) info.fontFamily = currentFontFamily
    const result = lynx.getTextInfo(seg, info)
    metrics = {
      width: result.width,
      containsCJK: isCJK(seg),
    }
    cache.set(seg, metrics)
  }
  return metrics
}

export function getEngineProfile(): EngineProfile {
  if (cachedEngineProfile !== null) return cachedEngineProfile
  cachedEngineProfile = {
    lineFitEpsilon: 0.005,
    carryCJKAfterClosingQuote: false,
    preferPrefixWidthsForBreakableRuns: false,
    preferEarlySoftHyphenBreak: false,
  }
  return cachedEngineProfile
}

export function parseFontSize(font: string): number {
  const m = font.match(/(\d+(?:\.\d+)?)\s*px/)
  return m ? parseFloat(m[1]!) : 16
}

export function parseFontFamily(font: string): string | undefined {
  const m = font.match(/\d+(?:\.\d+)?\s*px\s+(.+)/)
  return m ? m[1]!.trim() : undefined
}

function getSharedGraphemeSegmenter(): Intl.Segmenter {
  if (sharedGraphemeSegmenter === null) {
    sharedGraphemeSegmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
  }
  return sharedGraphemeSegmenter
}

export function textMayContainEmoji(text: string): boolean {
  return maybeEmojiRe.test(text)
}

export function getCorrectedSegmentWidth(seg: string, metrics: SegmentMetrics, emojiCorrection: number): number {
  // Emoji correction is always 0 for Lynx MVP
  return metrics.width
}

export function getSegmentGraphemeWidths(
  seg: string,
  metrics: SegmentMetrics,
  cache: Map<string, SegmentMetrics>,
  emojiCorrection: number,
): number[] | null {
  if (metrics.graphemeWidths !== undefined) return metrics.graphemeWidths

  const widths: number[] = []
  const graphemeSegmenter = getSharedGraphemeSegmenter()
  for (const gs of graphemeSegmenter.segment(seg)) {
    const graphemeMetrics = getSegmentMetrics(gs.segment, cache)
    widths.push(getCorrectedSegmentWidth(gs.segment, graphemeMetrics, emojiCorrection))
  }

  metrics.graphemeWidths = widths.length > 1 ? widths : null
  return metrics.graphemeWidths
}

export function getSegmentGraphemePrefixWidths(
  seg: string,
  metrics: SegmentMetrics,
  cache: Map<string, SegmentMetrics>,
  emojiCorrection: number,
): number[] | null {
  if (metrics.graphemePrefixWidths !== undefined) return metrics.graphemePrefixWidths

  const prefixWidths: number[] = []
  const graphemeSegmenter = getSharedGraphemeSegmenter()
  let prefix = ''
  for (const gs of graphemeSegmenter.segment(seg)) {
    prefix += gs.segment
    const prefixMetrics = getSegmentMetrics(prefix, cache)
    prefixWidths.push(getCorrectedSegmentWidth(prefix, prefixMetrics, emojiCorrection))
  }

  metrics.graphemePrefixWidths = prefixWidths.length > 1 ? prefixWidths : null
  return metrics.graphemePrefixWidths
}

export function getFontMeasurementState(font: string, needsEmojiCorrection: boolean): {
  cache: Map<string, SegmentMetrics>
  fontSize: number
  emojiCorrection: number
} {
  const fontSize = parseFontSize(font)
  const fontFamily = parseFontFamily(font)
  // Set module-level font context for getSegmentMetrics
  currentFontSizeStr = `${fontSize}px`
  currentFontFamily = fontFamily
  const cache = getSegmentMetricCache(font)
  // Emoji correction is 0 for Lynx MVP
  const emojiCorrection = 0
  return { cache, fontSize, emojiCorrection }
}

export function clearMeasurementCaches(): void {
  segmentMetricCaches.clear()
  sharedGraphemeSegmenter = null
}

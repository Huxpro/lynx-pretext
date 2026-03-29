export type WhiteSpaceMode = 'normal' | 'pre-wrap'

export type SegmentBreakKind =
  | 'text'
  | 'space'
  | 'preserved-space'
  | 'tab'
  | 'glue'
  | 'zero-width-break'
  | 'soft-hyphen'
  | 'hard-break'

type SegmentationPiece = {
  text: string
  isWordLike: boolean
  kind: SegmentBreakKind
  start: number
}

export type MergedSegmentation = {
  len: number
  texts: string[]
  isWordLike: boolean[]
  kinds: SegmentBreakKind[]
  starts: number[]
}

export type AnalysisChunk = {
  startSegmentIndex: number
  endSegmentIndex: number
  consumedEndSegmentIndex: number
}

export type TextAnalysis = { normalized: string, chunks: AnalysisChunk[] } & MergedSegmentation

export type AnalysisProfile = {
  carryCJKAfterClosingQuote: boolean
}

const collapsibleWhitespaceRunRe = /[ \t\n\r\f]+/g
const needsWhitespaceNormalizationRe = /[\t\n\r\f]| {2,}|^ | $/

type WhiteSpaceProfile = {
  mode: WhiteSpaceMode
  preserveOrdinarySpaces: boolean
  preserveHardBreaks: boolean
}

export function getWhiteSpaceProfile(whiteSpace?: WhiteSpaceMode): WhiteSpaceProfile {
  const mode = whiteSpace ?? 'normal'
  return mode === 'pre-wrap'
    ? { mode, preserveOrdinarySpaces: true, preserveHardBreaks: true }
    : { mode, preserveOrdinarySpaces: false, preserveHardBreaks: false }
}

export function normalizeWhitespaceNormal(text: string): string {
  if (!needsWhitespaceNormalizationRe.test(text)) return text

  let normalized = text.replace(collapsibleWhitespaceRunRe, ' ')
  if (normalized.charCodeAt(0) === 0x20) {
    normalized = normalized.slice(1)
  }
  if (normalized.length > 0 && normalized.charCodeAt(normalized.length - 1) === 0x20) {
    normalized = normalized.slice(0, -1)
  }
  return normalized
}

export function normalizeWhitespacePreWrap(text: string): string {
  if (!/[\r\f]/.test(text)) return text.replace(/\r\n/g, '\n')
  return text
    .replace(/\r\n/g, '\n')
    .replace(/[\r\f]/g, '\n')
}

export function classifySegmentBreakChar(ch: string, whiteSpaceProfile: WhiteSpaceProfile): SegmentBreakKind {
  if (whiteSpaceProfile.preserveOrdinarySpaces || whiteSpaceProfile.preserveHardBreaks) {
    if (ch === ' ') return 'preserved-space'
    if (ch === '\t') return 'tab'
    if (whiteSpaceProfile.preserveHardBreaks && ch === '\n') return 'hard-break'
  }
  if (ch === ' ') return 'space'
  if (ch === '\u00A0' || ch === '\u202F' || ch === '\u2060' || ch === '\uFEFF') {
    return 'glue'
  }
  if (ch === '\u200B') return 'zero-width-break'
  if (ch === '\u00AD') return 'soft-hyphen'
  return 'text'
}

export function splitSegmentByBreakKind(
  segment: string,
  isWordLike: boolean,
  start: number,
  whiteSpaceProfile: WhiteSpaceProfile,
): SegmentationPiece[] {
  const pieces: SegmentationPiece[] = []
  let currentKind: SegmentBreakKind | null = null
  let currentText = ''
  let currentStart = start
  let currentWordLike = false
  let offset = 0

  for (const ch of segment) {
    const kind = classifySegmentBreakChar(ch, whiteSpaceProfile)
    const wordLike = kind === 'text' && isWordLike

    if (currentKind !== null && kind === currentKind && wordLike === currentWordLike) {
      currentText += ch
      offset += ch.length
      continue
    }

    if (currentKind !== null) {
      pieces.push({
        text: currentText,
        isWordLike: currentWordLike,
        kind: currentKind,
        start: currentStart,
      })
    }

    currentKind = kind
    currentText = ch
    currentStart = start + offset
    currentWordLike = wordLike
    offset += ch.length
  }

  if (currentKind !== null) {
    pieces.push({
      text: currentText,
      isWordLike: currentWordLike,
      kind: currentKind,
      start: currentStart,
    })
  }

  return pieces
}

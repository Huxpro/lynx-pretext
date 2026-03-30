// Lightweight Intl.Segmenter polyfill for PrimJS.
// @formatjs/intl-segmenter crashes PrimJS at load time (too large / unsupported features).
// This provides the minimal interface needed by analysis.ts:
//   - granularity: 'word' — splits on whitespace/punctuation boundaries, marks words as isWordLike
//   - granularity: 'grapheme' — splits into individual characters/surrogate pairs
//
// This is NOT a full UAX#29 implementation. It handles English and basic CJK/emoji
// well enough for MVP. Thai/Khmer/Lao/Myanmar will NOT segment correctly without
// a real dictionary-based segmenter.

if (typeof Intl === 'undefined') {
  ;(globalThis as any).Intl = {}
}

if (typeof Intl.Segmenter === 'undefined') {
  // Word boundary pattern: split before/after whitespace and punctuation
  // This captures runs of word chars vs non-word chars
  const WORD_SPLIT_RE = /([\s]+|[^\s\w])/u

  class SegmenterPolyfill {
    private granularity: 'word' | 'grapheme' | 'sentence'

    constructor(_locale?: string, options?: { granularity?: string }) {
      this.granularity = (options?.granularity as any) || 'grapheme'
    }

    segment(input: string): Iterable<{ segment: string; index: number; isWordLike?: boolean }> & { [Symbol.iterator](): Iterator<{ segment: string; index: number; isWordLike?: boolean }> } {
      const results: { segment: string; index: number; isWordLike?: boolean }[] = []

      if (this.granularity === 'grapheme') {
        // Split into individual grapheme clusters
        // For true grapheme clusters we'd need UAX#29, but for MVP
        // we handle surrogate pairs and common combining sequences
        let i = 0
        while (i < input.length) {
          const code = input.codePointAt(i)!
          let end = i + (code > 0xFFFF ? 2 : 1)

          // Consume combining marks and variation selectors
          while (end < input.length) {
            const nextCode = input.codePointAt(end)!
            // Combining marks: 0x0300-0x036F, 0x1AB0-0x1AFF, 0x1DC0-0x1DFF, 0x20D0-0x20FF, 0xFE00-0xFE0F, 0xFE20-0xFE2F
            // ZWJ: 0x200D
            // Variation selectors: 0xFE00-0xFE0F, 0xE0100-0xE01EF
            // Regional indicators: 0x1F1E6-0x1F1FF
            // Emoji modifiers: 0x1F3FB-0x1F3FF
            // Keycap: 0x20E3
            if (
              (nextCode >= 0x0300 && nextCode <= 0x036F) ||
              (nextCode >= 0x1AB0 && nextCode <= 0x1AFF) ||
              (nextCode >= 0x1DC0 && nextCode <= 0x1DFF) ||
              (nextCode >= 0x20D0 && nextCode <= 0x20FF) ||
              (nextCode >= 0xFE00 && nextCode <= 0xFE0F) ||
              (nextCode >= 0xFE20 && nextCode <= 0xFE2F) ||
              nextCode === 0x200D || // ZWJ
              nextCode === 0x20E3 || // keycap
              (nextCode >= 0x1F3FB && nextCode <= 0x1F3FF) || // skin tone
              (nextCode >= 0xE0100 && nextCode <= 0xE01EF) // variation selectors supplement
            ) {
              end += (nextCode > 0xFFFF ? 2 : 1)
              // After ZWJ, also consume the next character (emoji ZWJ sequence)
              if (nextCode === 0x200D && end < input.length) {
                const afterZwj = input.codePointAt(end)!
                end += (afterZwj > 0xFFFF ? 2 : 1)
              }
              continue
            }
            // Regional indicator pairs
            if (nextCode >= 0x1F1E6 && nextCode <= 0x1F1FF && code >= 0x1F1E6 && code <= 0x1F1FF) {
              end += 2
            }
            break
          }

          results.push({ segment: input.slice(i, end), index: i })
          i = end
        }
      } else {
        // Word segmentation: split on whitespace and punctuation boundaries
        // We need to produce segments that match Intl.Segmenter's word granularity:
        // each segment is either word-like or not, with isWordLike flag
        let pos = 0
        const parts = input.split(WORD_SPLIT_RE)

        for (const part of parts) {
          if (part.length === 0) continue
          const isWord = !(/^[\s]+$/.test(part)) && !(/^[^\s\w]$/.test(part))
          results.push({
            segment: part,
            index: pos,
            isWordLike: isWord,
          })
          pos += part.length
        }
      }

      return results as any
    }
  }

  ;(Intl as any).Segmenter = SegmenterPolyfill
}

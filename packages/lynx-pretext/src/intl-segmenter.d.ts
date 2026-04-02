declare namespace Intl {
  interface SegmenterOptions {
    granularity?: 'grapheme' | 'word' | 'sentence'
  }

  interface SegmentData {
    segment: string
    index: number
    input?: string
    isWordLike?: boolean
  }

  interface Segments extends Iterable<SegmentData> {}

  class Segmenter {
    constructor(locales?: string | string[], options?: SegmenterOptions)
    segment(input: string): Segments
  }
}

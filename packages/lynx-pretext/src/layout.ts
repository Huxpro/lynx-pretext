import './intl-shim'
import './segmenter-polyfill'

import { createPretext } from './pretext/host.js'
import type {
  LayoutCursor,
  LayoutLine,
  LayoutLineRange,
  LayoutLinesResult,
  LayoutResult,
  PrepareOptions,
  PrepareProfile,
  PreparedText,
  PreparedTextWithSegments,
} from './pretext/layout.js'

import { lynxMeasurementHost } from './measurement'

const pretext = createPretext({
  measurement: lynxMeasurementHost,
})

export const profilePrepare = pretext.profilePrepare
export const prepare = pretext.prepare
export const prepareWithSegments = pretext.prepareWithSegments
export const layout = pretext.layout
export const walkLineRanges = pretext.walkLineRanges
export const layoutNextLine = pretext.layoutNextLine
export const layoutWithLines = pretext.layoutWithLines
export const clearCache = pretext.clearCache
export const setLocale = pretext.setLocale

export type {
  LayoutCursor,
  LayoutLine,
  LayoutLineRange,
  LayoutLinesResult,
  LayoutResult,
  PrepareOptions,
  PrepareProfile,
  PreparedText,
  PreparedTextWithSegments,
}

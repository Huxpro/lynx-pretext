export type Rect = {
  x: number
  y: number
  width: number
  height: number
}

export type Interval = {
  left: number
  right: number
}

export type Point = {
  x: number
  y: number
}

export type WrapHullMode = 'mean' | 'envelope'

export type WrapHullOptions = {
  smoothRadius: number
  mode: WrapHullMode
  convexify?: boolean
}

// On Lynx, we cannot rasterize SVGs with OffscreenCanvas.
// Instead, getWrapHull loads precomputed hull data from hull-data.ts.
// The hull data was generated from the original SVGs using scripts/generate-hulls.mjs.

import {
  openaiLayout,
  claudeLayout,
  openaiHit,
  claudeHit,
} from './hull-data'

const hullLookup: Record<string, Point[]> = {}

function registerHull(src: string, options: WrapHullOptions, points: Point[]): void {
  const key = `${src}::${options.mode}::${options.smoothRadius}::${options.convexify ? 'convex' : 'raw'}`
  hullLookup[key] = points
}

export function registerLogoHulls(openaiSrc: string, claudeSrc: string): void {
  registerHull(openaiSrc, { smoothRadius: 6, mode: 'mean' }, openaiLayout)
  registerHull(claudeSrc, { smoothRadius: 6, mode: 'mean' }, claudeLayout)
  registerHull(openaiSrc, { smoothRadius: 3, mode: 'mean' }, openaiHit)
  registerHull(claudeSrc, { smoothRadius: 5, mode: 'mean' }, claudeHit)
}

export function getWrapHull(src: string, options: WrapHullOptions): Promise<Point[]> {
  const key = `${src}::${options.mode}::${options.smoothRadius}::${options.convexify ? 'convex' : 'raw'}`
  const cached = hullLookup[key]
  if (cached !== undefined) return Promise.resolve(cached)
  return Promise.reject(new Error(`No precomputed hull for key: ${key}. Call registerLogoHulls() first.`))
}

export function transformWrapPoints(points: Point[], rect: Rect, angle: number): Point[] {
  if (angle === 0) {
    return points.map(point => ({
        x: rect.x + point.x * rect.width,
        y: rect.y + point.y * rect.height,
    }))
  }

  const centerX = rect.x + rect.width / 2
  const centerY = rect.y + rect.height / 2
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)

  return points.map(point => {
    const localX = (point.x - 0.5) * rect.width
    const localY = (point.y - 0.5) * rect.height
    return {
      x: centerX + localX * cos - localY * sin,
      y: centerY + localX * sin + localY * cos,
    }
  })
}

export function isPointInPolygon(points: Point[], x: number, y: number): boolean {
  let inside = false
  for (let index = 0, prev = points.length - 1; index < points.length; prev = index++) {
    const a = points[index]!
    const b = points[prev]!
    const intersects =
      ((a.y > y) !== (b.y > y)) &&
      (x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x)
    if (intersects) inside = !inside
  }
  return inside
}

export function getPolygonIntervalForBand(
  points: Point[],
  bandTop: number,
  bandBottom: number,
  horizontalPadding: number,
  verticalPadding: number,
): Interval | null {
  const sampleTop = bandTop - verticalPadding
  const sampleBottom = bandBottom + verticalPadding
  const startY = Math.floor(sampleTop)
  const endY = Math.ceil(sampleBottom)

  let left = Infinity
  let right = -Infinity

  for (let y = startY; y <= endY; y++) {
    const xs = getPolygonXsAtY(points, y + 0.5)
    for (let index = 0; index + 1 < xs.length; index += 2) {
      const runLeft = xs[index]!
      const runRight = xs[index + 1]!
      if (runLeft < left) left = runLeft
      if (runRight > right) right = runRight
    }
  }

  if (!Number.isFinite(left) || !Number.isFinite(right)) return null
  return { left: left - horizontalPadding, right: right + horizontalPadding }
}

export function getRectIntervalsForBand(
  rects: Rect[],
  bandTop: number,
  bandBottom: number,
  horizontalPadding: number,
  verticalPadding: number,
): Interval[] {
  const intervals: Interval[] = []
  for (let index = 0; index < rects.length; index++) {
    const rect = rects[index]!
    if (bandBottom <= rect.y - verticalPadding || bandTop >= rect.y + rect.height + verticalPadding) continue
    intervals.push({
      left: rect.x - horizontalPadding,
      right: rect.x + rect.width + horizontalPadding,
    })
  }
  return intervals
}

// Given one allowed horizontal interval and a set of blocked intervals,
// carve out the remaining usable text slots for one text line band.
//
// Example:
// - base:    80..420
// - blocked: 200..310
// - result:  80..200, 310..420
//
// On the dynamic-layout page, the base interval is one full column row,
// the blocked intervals come from the title/logo shapes at that band,
// and the returned intervals are the candidate text slots for that row.
//
// This helper is intentionally page-oriented, not pure geometry:
// it also discards absurdly narrow leftover slivers that we would never
// want to hand to text layout.
export function carveTextLineSlots(base: Interval, blocked: Interval[]): Interval[] {
  let slots: Interval[] = [base]

  for (let blockedIndex = 0; blockedIndex < blocked.length; blockedIndex++) {
    const interval = blocked[blockedIndex]!
    const next: Interval[] = []
    for (let slotIndex = 0; slotIndex < slots.length; slotIndex++) {
      const slot = slots[slotIndex]!
      if (interval.right <= slot.left || interval.left >= slot.right) {
        next.push(slot)
        continue
      }
      if (interval.left > slot.left) next.push({ left: slot.left, right: interval.left })
      if (interval.right < slot.right) next.push({ left: interval.right, right: slot.right })
    }
    slots = next
  }

  return slots.filter(slot => slot.right - slot.left >= 24)
}

function getPolygonXsAtY(points: Point[], y: number): number[] {
  const xs: number[] = []
  let a = points[points.length - 1]
  if (!a) return xs

  for (let index = 0; index < points.length; index++) {
    const b = points[index]!
    if ((a.y <= y && y < b.y) || (b.y <= y && y < a.y)) {
      xs.push(a.x + ((y - a.y) * (b.x - a.x)) / (b.y - a.y))
    }
    a = b
  }

  xs.sort((a, b) => a - b)
  return xs
}

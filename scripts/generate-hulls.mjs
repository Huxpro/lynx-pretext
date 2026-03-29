// Extracts wrap hull points from SVG files using sharp for rasterization.
// Implements the same makeWrapHull logic from pretext/pages/demos/wrap-geometry.ts.
//
// Usage:
//   npm install sharp  (in a temp directory)
//   node scripts/generate-hulls.mjs <openai.svg> <claude.svg> > pages/demos/hull-data.ts

import sharp from 'sharp'
import { readFileSync } from 'fs'

const OPENAI_SVG = readFileSync(process.argv[2] || '../pretext/pages/assets/openai-symbol.svg')
const CLAUDE_SVG = readFileSync(process.argv[3] || '../pretext/pages/assets/claude-symbol.svg')

async function rasterizeSVG(svgBuffer, maxDimension = 320) {
  const metadata = await sharp(svgBuffer).metadata()
  const svgWidth = metadata.width || 100
  const svgHeight = metadata.height || 100
  const aspect = svgWidth / svgHeight

  const width = aspect >= 1
    ? maxDimension
    : Math.max(64, Math.round(maxDimension * aspect))
  const height = aspect >= 1
    ? Math.max(64, Math.round(maxDimension / aspect))
    : maxDimension

  const { data } = await sharp(svgBuffer)
    .resize(width, height, { fit: 'fill' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  return { data, width, height }
}

function makeWrapHull(data, width, height, options) {
  const { smoothRadius, mode, convexify } = options
  const alphaThreshold = 12

  const lefts = new Array(height).fill(null)
  const rights = new Array(height).fill(null)

  for (let y = 0; y < height; y++) {
    let left = -1
    let right = -1
    for (let x = 0; x < width; x++) {
      const alpha = data[(y * width + x) * 4 + 3]
      if (alpha < alphaThreshold) continue
      if (left === -1) left = x
      right = x
    }
    if (left !== -1 && right !== -1) {
      lefts[y] = left
      rights[y] = right + 1
    }
  }

  const validRows = []
  for (let y = 0; y < height; y++) {
    if (lefts[y] !== null && rights[y] !== null) validRows.push(y)
  }
  if (validRows.length === 0) throw new Error('No opaque pixels found')

  let boundLeft = Infinity
  let boundRight = -Infinity
  const boundTop = validRows[0]
  const boundBottom = validRows[validRows.length - 1]
  for (let i = 0; i < validRows.length; i++) {
    const y = validRows[i]
    const left = lefts[y]
    const right = rights[y]
    if (left < boundLeft) boundLeft = left
    if (right > boundRight) boundRight = right
  }
  const boundWidth = Math.max(1, boundRight - boundLeft)
  const boundHeight = Math.max(1, boundBottom - boundTop)

  const smoothedLefts = new Array(height).fill(0)
  const smoothedRights = new Array(height).fill(0)

  for (let i = 0; i < validRows.length; i++) {
    const y = validRows[i]
    let leftSum = 0
    let rightSum = 0
    let count = 0
    let leftEdge = Infinity
    let rightEdge = -Infinity
    for (let offset = -smoothRadius; offset <= smoothRadius; offset++) {
      const sampleIndex = y + offset
      if (sampleIndex < 0 || sampleIndex >= height) continue
      const left = lefts[sampleIndex]
      const right = rights[sampleIndex]
      if (left == null || right == null) continue
      leftSum += left
      rightSum += right
      if (left < leftEdge) leftEdge = left
      if (right > rightEdge) rightEdge = right
      count++
    }

    if (count === 0) {
      smoothedLefts[y] = 0
      smoothedRights[y] = width
      continue
    }

    switch (mode) {
      case 'envelope':
        smoothedLefts[y] = leftEdge
        smoothedRights[y] = rightEdge
        break
      case 'mean':
        smoothedLefts[y] = leftSum / count
        smoothedRights[y] = rightSum / count
        break
    }
  }

  const step = Math.max(1, Math.floor(validRows.length / 52))
  const sampledRows = []
  for (let i = 0; i < validRows.length; i += step) sampledRows.push(validRows[i])
  const lastRow = validRows[validRows.length - 1]
  if (sampledRows[sampledRows.length - 1] !== lastRow) sampledRows.push(lastRow)

  const points = []
  for (let i = 0; i < sampledRows.length; i++) {
    const y = sampledRows[i]
    points.push({
      x: round6((smoothedLefts[y] - boundLeft) / boundWidth),
      y: round6(((y + 0.5) - boundTop) / boundHeight),
    })
  }
  for (let i = sampledRows.length - 1; i >= 0; i--) {
    const y = sampledRows[i]
    points.push({
      x: round6((smoothedRights[y] - boundLeft) / boundWidth),
      y: round6(((y + 0.5) - boundTop) / boundHeight),
    })
  }

  if (!convexify) return points
  return makeConvexHull(points)
}

function round6(n) {
  return Math.round(n * 1000000) / 1000000
}

function cross(origin, a, b) {
  return (a.x - origin.x) * (b.y - origin.y) - (a.y - origin.y) * (b.x - origin.x)
}

function makeConvexHull(points) {
  if (points.length <= 3) return points
  const sorted = [...points].sort((a, b) => (a.x - b.x) || (a.y - b.y))
  const lower = []
  for (let i = 0; i < sorted.length; i++) {
    const point = sorted[i]
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0) {
      lower.pop()
    }
    lower.push(point)
  }
  const upper = []
  for (let i = sorted.length - 1; i >= 0; i--) {
    const point = sorted[i]
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0) {
      upper.pop()
    }
    upper.push(point)
  }
  lower.pop()
  upper.pop()
  return lower.concat(upper)
}

async function main() {
  const openai = await rasterizeSVG(OPENAI_SVG)
  const claude = await rasterizeSVG(CLAUDE_SVG)

  const hulls = {
    openaiLayout: makeWrapHull(openai.data, openai.width, openai.height, { smoothRadius: 6, mode: 'mean' }),
    claudeLayout: makeWrapHull(claude.data, claude.width, claude.height, { smoothRadius: 6, mode: 'mean' }),
    openaiHit: makeWrapHull(openai.data, openai.width, openai.height, { smoothRadius: 3, mode: 'mean' }),
    claudeHit: makeWrapHull(claude.data, claude.width, claude.height, { smoothRadius: 5, mode: 'mean' }),
  }

  let ts = `// Auto-generated hull data from SVG rasterization.\n`
  ts += `// Generated by scripts/generate-hulls.mjs — do not edit manually.\n`
  ts += `import type { Point } from './wrap-geometry'\n\n`

  for (const [name, points] of Object.entries(hulls)) {
    ts += `export const ${name}: Point[] = [\n`
    for (const p of points) {
      ts += `  { x: ${p.x}, y: ${p.y} },\n`
    }
    ts += `]\n\n`
  }

  console.log(ts)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})

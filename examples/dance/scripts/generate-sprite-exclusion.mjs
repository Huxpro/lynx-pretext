#!/usr/bin/env node
/**
 * Generate PNG sprite sheet + exclusion data for Lynx
 * 
 * Input: Video file (MP4)
 * Output:
 *   - sprite.png (sprite sheet with all frames)
 *   - sprite-exclusion.ts (TypeScript exclusion data)
 *   - sprite-meta.json (metadata: frame count, dimensions, fps)
 */

import { createCanvas, loadImage } from 'canvas'
import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'

// ── Configuration ─────────────────────────────────────────────────────

const CONFIG = {
  fps: 12,              // Target FPS for sprite
  sampleRate: 1,        // Sample every N frames (1 = all frames)
  maxFrameWidth: 480,   // Max width per frame
  maxFramesPerRow: 10,  // Frames per row in sprite sheet
  threshold: 34,        // Chroma key threshold
  feather: 28,          // Edge feathering
  minAlpha: 22,         // Minimum alpha for foreground
}

// ── Matte Algorithm (from Matteflow) ──────────────────────────────────

function average(samples) {
  return Math.round(samples.reduce((s, v) => s + v, 0) / samples.length)
}

function estimateBackgroundColor(pixels, width, height) {
  const red = [], green = [], blue = []
  const seen = new Set()
  
  const sample = (x, y) => {
    const key = `${x}:${y}`
    if (seen.has(key)) return
    seen.add(key)
    const offset = (y * width + x) * 4
    red.push(pixels[offset])
    green.push(pixels[offset + 1])
    blue.push(pixels[offset + 2])
  }
  
  for (let x = 0; x < width; x++) {
    sample(x, 0)
    sample(x, height - 1)
  }
  for (let y = 0; y < height; y++) {
    sample(0, y)
    sample(width - 1, y)
  }
  
  return { r: average(red), g: average(green), b: average(blue) }
}

function colorDistance(r, g, b, bg) {
  return Math.sqrt((r - bg.r) ** 2 + (g - bg.g) ** 2 + (b - bg.b) ** 2)
}

function createAlphaMask(pixels, width, height, bg, threshold, feather) {
  const alpha = new Uint8ClampedArray(width * height)
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 4
      const dist = colorDistance(pixels[offset], pixels[offset + 1], pixels[offset + 2], bg)
      const normalized = (dist - threshold) / Math.max(1, feather)
      alpha[y * width + x] = Math.round(Math.max(0, Math.min(1, normalized)) * 255)
    }
  }
  
  return alpha
}

function deriveBounds(alpha, width, height, padding) {
  let left = width, right = -1, top = height, bottom = -1
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (alpha[y * width + x] < CONFIG.minAlpha) continue
      left = Math.min(left, x)
      right = Math.max(right, x)
      top = Math.min(top, y)
      bottom = Math.max(bottom, y)
    }
  }
  
  if (right === -1) return null
  
  return {
    x: Math.max(0, left - padding),
    y: Math.max(0, top - padding),
    width: Math.min(width - 1, right + padding) - Math.max(0, left - padding) + 1,
    height: Math.min(height - 1, bottom + padding) - Math.max(0, top - padding) + 1,
  }
}

function deriveProfile(alpha, width, height, bands = 10) {
  const profile = []
  
  for (let i = 0; i < bands; i++) {
    const startY = Math.floor((i / bands) * height)
    const endY = Math.floor(((i + 1) / bands) * height)
    let left = width, right = -1
    
    for (let y = startY; y < endY; y++) {
      for (let x = 0; x < width; x++) {
        if (alpha[y * width + x] < CONFIG.minAlpha) continue
        left = Math.min(left, x)
        right = Math.max(right, x)
      }
    }
    
    if (right === -1) {
      profile.push({ width: 0.1, offset: 0 })
    } else {
      const w = Math.max(0.1, (right - left + 1) / width)
      const center = (left + right + 1) / 2 / width
      profile.push({ width: w, offset: center - 0.5 })
    }
  }
  
  // Smooth
  return profile.map((band, i) => {
    const prev = profile[i - 1] ?? band
    const next = profile[i + 1] ?? band
    return {
      width: (prev.width + band.width + next.width) / 3,
      offset: (prev.offset + band.offset + next.offset) / 3,
    }
  })
}

function extractPolygon(alpha, width, height, simplify = 4) {
  const points = []
  
  for (let y = 0; y < height; y += simplify) {
    let inShape = false
    for (let x = 0; x < width; x += simplify) {
      const isFg = alpha[y * width + x] >= CONFIG.minAlpha
      if (isFg && !inShape) {
        points.push({ x: x / width, y: y / height })
        inShape = true
      } else if (!isFg && inShape) {
        points.push({ x: x / width, y: y / height })
        inShape = false
      }
    }
  }
  
  if (points.length < 3) return []
  
  // Sort by angle from center
  const cx = points.reduce((s, p) => s + p.x, 0) / points.length
  const cy = points.reduce((s, p) => s + p.y, 0) / points.length
  points.sort((a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx))
  
  return points
}

// ── Frame Extraction ───────────────────────────────────────────────────

function extractFrames(videoPath, tempDir, fps, sampleRate = 1) {
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true })
  }
  
  // Extract at full fps, then sample
  const pattern = path.join(tempDir, 'frame-%04d.png')
  execSync(
    `ffmpeg -i "${videoPath}" -vf "fps=${fps},scale=${CONFIG.maxFrameWidth}:-1" "${pattern}" -y`,
    { stdio: 'pipe' },
  )
  
  const allFrames = fs.readdirSync(tempDir)
    .filter(f => f.endsWith('.png'))
    .sort()
    .map(f => path.join(tempDir, f))
  
  // Sample every N frames
  if (sampleRate > 1) {
    const sampled = allFrames.filter((_, i) => i % sampleRate === 0)
    // Delete unused frames
    for (const fp of allFrames) {
      if (!sampled.includes(fp)) {
        fs.unlinkSync(fp)
      }
    }
    return sampled
  }
  
  return allFrames
}

// ── Sprite Sheet Generation ────────────────────────────────────────────

async function processFrame(framePath, frameIndex) {
  const image = await loadImage(framePath)
  const width = image.width
  const height = image.height
  
  const canvas = createCanvas(width, height)
  const ctx = canvas.getContext('2d')
  ctx.drawImage(image, 0, 0)
  
  const imageData = ctx.getImageData(0, 0, width, height)
  const bg = estimateBackgroundColor(imageData.data, width, height)
  const alpha = createAlphaMask(imageData.data, width, height, bg, CONFIG.threshold, CONFIG.feather)
  
  // Apply alpha to image data
  for (let i = 0; i < alpha.length; i++) {
    imageData.data[i * 4 + 3] = alpha[i]
  }
  ctx.putImageData(imageData, 0, 0)
  
  // Extract exclusion data
  const padding = Math.round(Math.min(width, height) * 0.06)
  const bounds = deriveBounds(alpha, width, height, padding)
  const profile = deriveProfile(alpha, width, height)
  const polygon = extractPolygon(alpha, width, height)
  
  return {
    canvas,
    width,
    height,
    exclusion: {
      frameIndex,
      timestamp: frameIndex / CONFIG.fps,
      profile,
      polygon: polygon.slice(0, 30), // Limit polygon points
      rect: bounds ? {
        x: bounds.x / width,
        y: bounds.y / height,
        width: bounds.width / width,
        height: bounds.height / height,
      } : { x: 0, y: 0, width: 0, height: 0 },
    },
  }
}

async function generateSpriteSheet(frames, outputPath) {
  const frameWidth = frames[0].width
  const frameHeight = frames[0].height
  const cols = Math.min(frames.length, CONFIG.maxFramesPerRow)
  const rows = Math.ceil(frames.length / cols)
  
  const spriteWidth = frameWidth * cols
  const spriteHeight = frameHeight * rows
  
  const spriteCanvas = createCanvas(spriteWidth, spriteHeight)
  const ctx = spriteCanvas.getContext('2d')
  
  // Clear with transparent
  ctx.clearRect(0, 0, spriteWidth, spriteHeight)
  
  // Draw each frame
  for (let i = 0; i < frames.length; i++) {
    const col = i % cols
    const row = Math.floor(i / cols)
    const x = col * frameWidth
    const y = row * frameHeight
    
    ctx.drawImage(frames[i].canvas, x, y)
  }
  
  // Save sprite sheet
  const buffer = spriteCanvas.toBuffer('image/png')
  fs.writeFileSync(outputPath, buffer)
  
  return {
    frameWidth,
    frameHeight,
    cols,
    rows,
    totalFrames: frames.length,
  }
}

// ── Output Generation ──────────────────────────────────────────────────

function generateTypeScriptOutput(exclusions, meta, outputName) {
  const fps = meta.fps || CONFIG.fps
  const lines = [
    '// Auto-generated sprite exclusion data for Lynx',
    `// Source: ${outputName}`,
    `// Frames: ${exclusions.length}, FPS: ${fps}`,
    `// Generated: ${new Date().toISOString()}`,
    '',
    'import type { Point, Rect } from "./wrap-geometry"',
    '',
    '/** Sprite metadata */',
    `export const ${outputName}Meta = ${JSON.stringify(meta, null, 2)}`,
    '',
    '/**',
    ' * Get frame position in sprite sheet',
    ' * @param frameIndex - frame number (0-based)',
    ' * @returns { x, y } position in pixels',
    ' */',
    `export function get${capitalize(outputName)}FramePos(frameIndex: number): { x: number; y: number } {`,
    `  const col = frameIndex % ${meta.cols}`,
    `  const row = Math.floor(frameIndex / ${meta.cols})`,
    `  return {`,
    `    x: col * ${meta.frameWidth},`,
    `    y: row * ${meta.frameHeight},`,
    `  }`,
    '}',
    '',
    '/**',
    ' * Get exclusion data for a frame',
    ' * @param timestamp - time in seconds',
    ' */',
    `export function get${capitalize(outputName)}Exclusion(timestamp: number) {`,
    `  const frameIndex = Math.floor(timestamp * ${fps}) % ${exclusions.length}`,
    `  return ${outputName}Frames[frameIndex]`,
    '}',
    '',
    '/** Frame exclusion data */',
    'export type SpriteExclusionFrame = {',
    '  frameIndex: number',
    '  timestamp: number',
    '  profile: { width: number; offset: number }[]',
    '  polygon: Point[]',
    '  rect: Rect',
    '}',
    '',
    `export const ${outputName}Frames: SpriteExclusionFrame[] = [`,
  ]
  
  for (const exc of exclusions) {
    lines.push('  {')
    lines.push(`    frameIndex: ${exc.frameIndex},`)
    lines.push(`    timestamp: ${exc.timestamp.toFixed(3)},`)
    lines.push(`    profile: ${JSON.stringify(exc.profile)},`)
    lines.push(`    polygon: ${JSON.stringify(exc.polygon)} as Point[],`)
    lines.push(`    rect: ${JSON.stringify(exc.rect)} as Rect,`)
    lines.push('  },')
  }
  
  lines.push(']')
  lines.push('')
  
  // Average profile
  const avgProfile = []
  for (let i = 0; i < 10; i++) {
    const sum = exclusions.reduce((s, f) => ({
      width: s.width + f.profile[i].width,
      offset: s.offset + f.profile[i].offset,
    }), { width: 0, offset: 0 })
    avgProfile.push({
      width: sum.width / exclusions.length,
      offset: sum.offset / exclusions.length,
    })
  }
  
  lines.push(`export const ${outputName}DefaultProfile = ${JSON.stringify(avgProfile, null, 2)}`)
  lines.push('')
  
  return lines.join('\n')
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1)
}

// ── Main ──────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2)
  
  if (args.length === 0) {
    console.log(`
Usage: node generate-sprite-exclusion.mjs <video-path> [output-name] [sample-rate]

Arguments:
  video-path   Path to video file (MP4, MOV, etc.)
  output-name  Base name for output files (default: derived from video)
  sample-rate  Sample every N frames (default: 12 = 1 frame per second at 12fps)

Output:
  - <output-name>-sprite.png      PNG sprite sheet with transparent background
  - <output-name>-exclusion.ts    TypeScript exclusion data
  - <output-name>-meta.json       Metadata (frame count, dimensions, etc.)

Examples:
  node generate-sprite-exclusion.mjs video.mp4 dancer
  → 840 frames at 12fps (full)
  
  node generate-sprite-exclusion.mjs video.mp4 dancer 12
  → 70 frames (sample every 12 frames = 1fps)
  
  node generate-sprite-exclusion.mjs video.mp4 dancer 6
  → 140 frames (sample every 6 frames = 2fps)
`)
    process.exit(0)
  }
  
  const videoPath = path.resolve(args[0])
  const outputName = args[1] || path.basename(videoPath, path.extname(videoPath))
  const sampleRate = parseInt(args[2] || '12')
  
  console.log(`Processing: ${videoPath}`)
  console.log(`Output: ${outputName}-*`)
  console.log(`Sample rate: every ${sampleRate} frames`)
  
  const tempDir = path.join(process.cwd(), '.temp-frames')
  
  // 1. Extract frames
  console.log('\n1. Extracting frames...')
  const framePaths = extractFrames(videoPath, tempDir, CONFIG.fps, sampleRate)
  console.log(`   Extracted ${framePaths.length} frames`)
  
  // 2. Process frames
  console.log('\n2. Processing frames (chroma key + exclusion)...')
  const processed = []
  for (let i = 0; i < framePaths.length; i++) {
    const result = await processFrame(framePaths[i], i)
    processed.push(result)
    if ((i + 1) % 20 === 0 || i === framePaths.length - 1) {
      console.log(`   Processed ${i + 1}/${framePaths.length}`)
    }
  }
  
  // 3. Generate sprite sheet
  console.log('\n3. Generating sprite sheet...')
  const spritePath = path.join(process.cwd(), `${outputName}-sprite.png`)
  const meta = await generateSpriteSheet(processed, spritePath)
  console.log(`   Sprite: ${spritePath}`)
  console.log(`   Size: ${meta.frameWidth}x${meta.frameHeight} × ${meta.cols}x${meta.rows}`)
  
  // 4. Generate TypeScript
  console.log('\n4. Generating exclusion data...')
  const actualFps = CONFIG.fps / sampleRate
  const metaWithFps = { ...meta, fps: actualFps }
  const exclusions = processed.map(p => p.exclusion)
  const tsOutput = generateTypeScriptOutput(exclusions, metaWithFps, outputName)
  const tsPath = path.join(process.cwd(), `${outputName}-exclusion.ts`)
  fs.writeFileSync(tsPath, tsOutput)
  console.log(`   TypeScript: ${tsPath}`)
  
  // 5. Generate JSON metadata
  const jsonMeta = {
    ...meta,
    fps: actualFps,
    sourceFps: CONFIG.fps,
    sampleRate,
    generatedAt: new Date().toISOString(),
    source: path.basename(videoPath),
  }
  const jsonPath = path.join(process.cwd(), `${outputName}-meta.json`)
  fs.writeFileSync(jsonPath, JSON.stringify(jsonMeta, null, 2))
  console.log(`   Metadata: ${jsonPath}`)
  
  // 6. Cleanup
  console.log('\n5. Cleaning up...')
  for (const fp of framePaths) fs.unlinkSync(fp)
  fs.rmdirSync(tempDir)
  
  // Summary
  console.log('\n✓ Done!')
  console.log(`  - Frames: ${processed.length}`)
  console.log(`  - Sprite: ${spritePath} (${(fs.statSync(spritePath).size / 1024).toFixed(0)} KB)`)
  console.log(`  - Exclusion: ${tsPath}`)
}

main().catch(console.error)

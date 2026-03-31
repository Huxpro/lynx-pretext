// Variable Typographic ASCII Art - Pure BTS version for performance comparison
// No MTS - all logic runs on Background Thread

import { root, useState, useEffect, useRef, useCallback } from '@lynx-js/react'
import { DevPanel, useDevPanelFPS, DevPanelFPS } from '@lynx-pretext/devtools'

// --- Constants ---
const FONT_SIZE = 10
const LINE_HEIGHT = 13
const COLS = 50
const ROWS = 28
const TARGET_ROW_W = 440

const CANVAS_W = 220
const CANVAS_H = Math.round(CANVAS_W * ((ROWS * LINE_HEIGHT) / TARGET_ROW_W))
const PARTICLE_N = 120
const SPRITE_R = 14
const ATTRACTOR_R = 12
const LARGE_ATTRACTOR_R = 30
const ATTRACTOR_FORCE_1 = 0.22
const ATTRACTOR_FORCE_2 = 0.05
const FIELD_DECAY = 0.82
const FIELD_OVERSAMPLE = 2

const FIELD_COLS = COLS * FIELD_OVERSAMPLE
const FIELD_ROWS = ROWS * FIELD_OVERSAMPLE
const FIELD_SCALE_X = FIELD_COLS / CANVAS_W
const FIELD_SCALE_Y = FIELD_ROWS / CANVAS_H

const MONO_RAMP = ' .`-_:,;^=+/|)\\!?0oOQ#%@'
const MONO_COLOR = 'rgba(130,155,210,0.7)'

type Particle = { x: number; y: number; vx: number; vy: number }
type FieldStamp = { radiusX: number; radiusY: number; sizeX: number; sizeY: number; values: Float32Array }

// Precompute brightness lookup
const BRIGHTNESS_LOOKUP: string[] = []
for (let b = 0; b < 256; b++) {
  const brightness = b / 255
  const char = MONO_RAMP[Math.min(MONO_RAMP.length - 1, (brightness * MONO_RAMP.length) | 0)]!
  BRIGHTNESS_LOOKUP.push(brightness < 0.03 ? ' ' : char)
}

// Pure functions (no MTS)
function createFieldStamp(radiusPx: number): FieldStamp {
  const fieldRadiusX = radiusPx * FIELD_SCALE_X
  const fieldRadiusY = radiusPx * FIELD_SCALE_Y
  const radiusX = Math.ceil(fieldRadiusX)
  const radiusY = Math.ceil(fieldRadiusY)
  const sizeX = radiusX * 2 + 1
  const sizeY = radiusY * 2 + 1
  const values = new Float32Array(sizeX * sizeY)
  for (let y = -radiusY; y <= radiusY; y++) {
    for (let x = -radiusX; x <= radiusX; x++) {
      const nd = Math.sqrt((x / fieldRadiusX) ** 2 + (y / fieldRadiusY) ** 2)
      const value = nd >= 1 ? 0 : nd <= 0.35 ? 0.45 + (0.15 - 0.45) * (nd / 0.35) : 0.15 * (1 - (nd - 0.35) / 0.65)
      values[(y + radiusY) * sizeX + x + radiusX] = value
    }
  }
  return { radiusX, radiusY, sizeX, sizeY, values }
}

function splatFieldStamp(centerX: number, centerY: number, stamp: FieldStamp, field: Float32Array): void {
  const gridCenterX = Math.round(centerX * FIELD_SCALE_X)
  const gridCenterY = Math.round(centerY * FIELD_SCALE_Y)
  for (let y = -stamp.radiusY; y <= stamp.radiusY; y++) {
    const gridY = gridCenterY + y
    if (gridY < 0 || gridY >= FIELD_ROWS) continue
    const fieldRowOffset = gridY * FIELD_COLS
    const stampRowOffset = (y + stamp.radiusY) * stamp.sizeX
    for (let x = -stamp.radiusX; x <= stamp.radiusX; x++) {
      const gridX = gridCenterX + x
      if (gridX < 0 || gridX >= FIELD_COLS) continue
      const stampValue = stamp.values[stampRowOffset + x + stamp.radiusX]!
      if (stampValue === 0) continue
      const fieldIndex = fieldRowOffset + gridX
      field[fieldIndex] = Math.min(1, field[fieldIndex]! + stampValue)
    }
  }
}

function initParticles(): Particle[] {
  const particles: Particle[] = []
  for (let i = 0; i < PARTICLE_N; i++) {
    const angle = Math.random() * Math.PI * 2
    const radius = Math.random() * 40 + 20
    particles.push({
      x: CANVAS_W / 2 + Math.cos(angle) * radius,
      y: CANVAS_H / 2 + Math.sin(angle) * radius,
      vx: (Math.random() - 0.5) * 0.8,
      vy: (Math.random() - 0.5) * 0.8,
    })
  }
  return particles
}

export function FieldBTSPage() {
  // State for rendered rows
  const [rows, setRows] = useState<string[]>(() => Array(ROWS).fill(''))
  
  // FPS monitoring - BTS mode
  const { btsFpsTick, mtsFpsDisplay, btsFpsDisplay, mtsFpsTextRef } = useDevPanelFPS(false)

  // Refs for simulation state (mutable, don't trigger re-renders)
  const particlesRef = useRef<Particle[]>(initParticles())
  const brightnessFieldRef = useRef<Float32Array>(new Float32Array(FIELD_COLS * FIELD_ROWS))
  const particleStampRef = useRef<FieldStamp>(createFieldStamp(SPRITE_R))
  const largeAttractorStampRef = useRef<FieldStamp>(createFieldStamp(LARGE_ATTRACTOR_R))
  const smallAttractorStampRef = useRef<FieldStamp>(createFieldStamp(ATTRACTOR_R))
  const animRef = useRef<number>(0)

  const renderFrame = useCallback((now: number) => {
    const particles = particlesRef.current
    const brightnessField = brightnessFieldRef.current
    const particleStamp = particleStampRef.current
    const largeAttractorStamp = largeAttractorStampRef.current
    const smallAttractorStamp = smallAttractorStampRef.current

    // Attractors
    const attractor1X = Math.cos(now * 0.0007) * CANVAS_W * 0.25 + CANVAS_W / 2
    const attractor1Y = Math.sin(now * 0.0011) * CANVAS_H * 0.3 + CANVAS_H / 2
    const attractor2X = Math.cos(now * 0.0013 + Math.PI) * CANVAS_W * 0.2 + CANVAS_W / 2
    const attractor2Y = Math.sin(now * 0.0009 + Math.PI) * CANVAS_H * 0.25 + CANVAS_H / 2

    // Update particles
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i]!
      const d1x = attractor1X - p.x, d1y = attractor1Y - p.y
      const d2x = attractor2X - p.x, d2y = attractor2Y - p.y
      const dist1 = d1x * d1x + d1y * d1y, dist2 = d2x * d2x + d2y * d2y
      const ax = dist1 < dist2 ? d1x : d2x, ay = dist1 < dist2 ? d1y : d2y
      const dist = Math.sqrt(Math.min(dist1, dist2)) + 1
      const force = dist1 < dist2 ? ATTRACTOR_FORCE_1 : ATTRACTOR_FORCE_2
      p.vx += ax / dist * force + (Math.random() - 0.5) * 0.25
      p.vy += ay / dist * force + (Math.random() - 0.5) * 0.25
      p.vx *= 0.97; p.vy *= 0.97
      p.x += p.vx; p.y += p.vy
      if (p.x < -SPRITE_R) p.x += CANVAS_W + SPRITE_R * 2
      if (p.x > CANVAS_W + SPRITE_R) p.x -= CANVAS_W + SPRITE_R * 2
      if (p.y < -SPRITE_R) p.y += CANVAS_H + SPRITE_R * 2
      if (p.y > CANVAS_H + SPRITE_R) p.y -= CANVAS_H + SPRITE_R * 2
    }

    // Decay field
    for (let i = 0; i < brightnessField.length; i++) brightnessField[i] = brightnessField[i]! * FIELD_DECAY

    // Splat stamps
    for (let i = 0; i < particles.length; i++) splatFieldStamp(particles[i]!.x, particles[i]!.y, particleStamp, brightnessField)
    splatFieldStamp(attractor1X, attractor1Y, largeAttractorStamp, brightnessField)
    splatFieldStamp(attractor2X, attractor2Y, smallAttractorStamp, brightnessField)

    // Render to rows
    const newRows: string[] = []
    for (let row = 0; row < ROWS; row++) {
      let rowText = ''
      const fieldRowStart = row * FIELD_OVERSAMPLE * FIELD_COLS
      for (let col = 0; col < COLS; col++) {
        const fieldColStart = col * FIELD_OVERSAMPLE
        let brightness = 0
        for (let sy = 0; sy < FIELD_OVERSAMPLE; sy++) {
          const sro = fieldRowStart + sy * FIELD_COLS + fieldColStart
          for (let sx = 0; sx < FIELD_OVERSAMPLE; sx++) brightness += brightnessField[sro + sx]!
        }
        const b = Math.min(255, ((brightness / (FIELD_OVERSAMPLE * FIELD_OVERSAMPLE)) * 255) | 0)
        rowText += BRIGHTNESS_LOOKUP[b]!
      }
      newRows.push(rowText)
    }

    setRows(newRows)
    btsFpsTick()
    animRef.current = requestAnimationFrame(renderFrame)
  }, [btsFpsTick])

  useEffect(() => {
    animRef.current = requestAnimationFrame(renderFrame)
    return () => cancelAnimationFrame(animRef.current)
  }, [renderFrame])

  const canvasWidth = COLS * FONT_SIZE * 0.6
  const canvasHeight = ROWS * LINE_HEIGHT

  return (
    <DevPanel.Root defaultOpen={true}>
      <view style={{ width: '100%', height: '100%', backgroundColor: '#0a0a12' }}>
        <view style={{ width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center' }}>
          <view style={{ width: `${canvasWidth}px`, height: `${canvasHeight}px`, overflow: 'hidden' }}>
            {rows.map((text, i) => (
              <view key={`r-${i}`} style={{ height: `${LINE_HEIGHT}px` }}>
                <text style={{ fontSize: `${FONT_SIZE}px`, lineHeight: `${LINE_HEIGHT}px`, color: MONO_COLOR, fontFamily: 'Courier New, Courier, monospace', letterSpacing: '0px' }}>{text}</text>
              </view>
            ))}
          </view>
        </view>

        <DevPanel.Trigger />

        <DevPanel.Content title="Particles (BTS)">
          <DevPanelFPS mtsFpsDisplay={mtsFpsDisplay} btsFpsDisplay={btsFpsDisplay} mtsFpsTextRef={mtsFpsTextRef} />
          <DevPanel.Stats>
            <DevPanel.Stat label="grid" value={`${COLS}×${ROWS}`} />
            <DevPanel.Stat label="particles" value={`${PARTICLE_N}`} />
          </DevPanel.Stats>
        </DevPanel.Content>
      </view>
    </DevPanel.Root>
  )
}

root.render(<FieldBTSPage />)
if (import.meta.webpackHot) import.meta.webpackHot.accept()

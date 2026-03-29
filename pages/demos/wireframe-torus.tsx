// Wireframe torus rendered as ASCII art using pretext for proportional-font width measurement.
// Ported from somnai-dreams/pretext-demos/wireframe-torus.js
//
// Adaptations for Lynx:
// - No Canvas: torus is software-rasterized into a brightness buffer (pure math)
// - No estimateBrightness: hardcoded character density table
// - MTS animation: all computation + rendering on main thread via shared modules
// - Element pool: one <text> per row, updated via setAttribute('text', ...)

import { root, useState, useCallback, useMainThreadRef, useEffect, runOnMainThread, runOnBackground } from '@lynx-js/react'
import type { MainThread } from '@lynx-js/types'
import { prepareWithSegments } from '../../src/layout' with { runtime: 'shared' }

// --- Constants ---
const FONT_SIZE = 14
const LINE_HEIGHT = 17
const MAX_COLS = 80
const MAX_ROWS = 50
const U_STEPS = 36
const V_STEPS = 18
const MAJOR_R = 0.42
const MINOR_R = 0.14
const TWO_PI = Math.PI * 2

// Character brightness ramp (light → dark). Approximate visual density.
const BRIGHTNESS_RAMP = ' .`\'-,:;~"!^*+<>/\\|(){}[]?7czs1oJCLYt3eax2ESwqkZXdbKW#B8R&NMQ0g@'

// Precompute brightness values (0..1) for each char in ramp
const RAMP_LEN = BRIGHTNESS_RAMP.length
const RAMP_STEP = 1.0 / (RAMP_LEN - 1)

// Precompute base torus vertices
const baseVerts: { x: number; y: number; z: number }[][] = []
for (let i = 0; i < U_STEPS; i++) {
  const row: { x: number; y: number; z: number }[] = []
  const u = (i / U_STEPS) * TWO_PI
  const cu = Math.cos(u), su = Math.sin(u)
  for (let j = 0; j < V_STEPS; j++) {
    const v = (j / V_STEPS) * TWO_PI
    const cv = Math.cos(v), sv = Math.sin(v)
    row.push({ x: (MAJOR_R + MINOR_R * cv) * cu, y: (MAJOR_R + MINOR_R * cv) * su, z: MINOR_R * sv })
  }
  baseVerts.push(row)
}

// --- Component ---
export function WireframeTorusPage() {
  const [pageWidth, setPageWidth] = useState(390)
  const [pageHeight, setPageHeight] = useState(700)
  const [fpsDisplay, setFpsDisplay] = useState(0)

  const onLayout = useCallback((e: any) => {
    setPageWidth(Math.floor(e.detail.width))
    setPageHeight(Math.floor(e.detail.height))
  }, [])

  // Row text refs
  const rowRefs: any[] = []
  for (let i = 0; i < MAX_ROWS; i++) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    rowRefs.push(useMainThreadRef<MainThread.Element>(null))
  }
  const statsRef = useMainThreadRef<MainThread.Element>(null)

  // MTS state
  const pageWidthMT = useMainThreadRef(390)
  const pageHeightMT = useMainThreadRef(700)
  const animatingMT = useMainThreadRef(false)
  const fpsFrameCountMT = useMainThreadRef(0)
  const fpsLastTimeMT = useMainThreadRef(0)
  const charWidthsMT = useMainThreadRef<any>(null) // lazily initialized array of widths
  const colsMT = useMainThreadRef(0)
  const rowsMT = useMainThreadRef(0)
  const avgCharWidthMT = useMainThreadRef(8)

  // ======= MTS FUNCTIONS =======

  function initCharWidths(): void {
    'main thread'
    if (charWidthsMT.current !== null) return
    const font = `${FONT_SIZE}px`
    const widths: number[] = []
    for (let i = 0; i < RAMP_LEN; i++) {
      const ch = BRIGHTNESS_RAMP[i]!
      if (ch === ' ') {
        widths.push(FONT_SIZE * 0.27)
        continue
      }
      const p = prepareWithSegments(ch, font)
      const w = (p as any).widths && (p as any).widths.length > 0 ? (p as any).widths[0] : FONT_SIZE * 0.5
      widths.push(w > 0 ? w : FONT_SIZE * 0.5)
    }
    charWidthsMT.current = widths
    // Compute average char width (excluding space)
    let sum = 0, cnt = 0
    for (let i = 1; i < widths.length; i++) { sum += widths[i]!; cnt++ }
    avgCharWidthMT.current = cnt > 0 ? sum / cnt : FONT_SIZE * 0.5
  }

  function updateGrid(): void {
    'main thread'
    const acw = avgCharWidthMT.current
    colsMT.current = Math.min(MAX_COLS, Math.floor(pageWidthMT.current / acw))
    rowsMT.current = Math.min(MAX_ROWS, Math.floor(pageHeightMT.current / LINE_HEIGHT))
    // Hide unused rows
    for (let r = rowsMT.current; r < MAX_ROWS; r++) {
      const el = rowRefs[r]!.current
      if (el) el.setStyleProperty('display', 'none')
    }
    // Show used rows
    for (let r = 0; r < rowsMT.current; r++) {
      const el = rowRefs[r]!.current
      if (el) el.setStyleProperty('display', 'flex')
    }
  }

  function renderFrame(now: number): void {
    'main thread'
    const t = now / 1000
    const COLS = colsMT.current
    const ROWS = rowsMT.current
    if (COLS <= 0 || ROWS <= 0) return

    const acw = avgCharWidthMT.current
    const aspect = acw / LINE_HEIGHT

    // --- Torus projection ---
    const ay = t * 0.5, ax = t * 0.3 + Math.sin(t * 0.1) * 0.4
    const cw = COLS, ch = ROWS
    const fov = Math.min(cw, ch / aspect) * 0.9
    const camDist = 1.2

    // Project vertices to grid coordinates
    const proj: { x: number; y: number; z: number }[][] = []
    for (let i = 0; i < U_STEPS; i++) {
      const row: { x: number; y: number; z: number }[] = []
      for (let j = 0; j < V_STEPS; j++) {
        let p = baseVerts[i]![j]!
        // rotY
        let ca = Math.cos(ay), sa = Math.sin(ay)
        let px = p.x * ca + p.z * sa, py = p.y, pz = -p.x * sa + p.z * ca
        // rotX
        ca = Math.cos(ax); sa = Math.sin(ax)
        const rx = px, ry = py * ca - pz * sa, rz = py * sa + pz * ca
        const d = rz + camDist
        row.push({ x: cw / 2 + rx * fov / d, y: ch / 2 + ry * fov / d * aspect, z: rz })
      }
      proj.push(row)
    }

    // --- Rasterize torus into brightness buffer ---
    const buf = new Float32Array(COLS * ROWS) // brightness per cell

    // Light direction
    const lx = 0.3, ly = -0.5, lz = 0.8
    const ll = Math.sqrt(lx * lx + ly * ly + lz * lz)
    const ldx = lx / ll, ldy = ly / ll, ldz = lz / ll

    for (let i = 0; i < U_STEPS; i++) {
      const ni = (i + 1) % U_STEPS
      for (let j = 0; j < V_STEPS; j++) {
        const nj = (j + 1) % V_STEPS
        const p00 = proj[i]![j]!, p10 = proj[ni]![j]!, p01 = proj[i]![nj]!, p11 = proj[ni]![nj]!

        // Face normal (rotated space)
        const a = baseVerts[i]![j]!, b = baseVerts[ni]![j]!, c = baseVerts[i]![nj]!
        // rotY then rotX for each
        let ca = Math.cos(ay), sa = Math.sin(ay)
        let ax1 = a.x * ca + a.z * sa, ay1 = a.y, az1 = -a.x * sa + a.z * ca
        let bx1 = b.x * ca + b.z * sa, by1 = b.y, bz1 = -b.x * sa + b.z * ca
        let cx1 = c.x * ca + c.z * sa, cy1 = c.y, cz1 = -c.x * sa + c.z * ca
        ca = Math.cos(ax); sa = Math.sin(ax)
        const rax = ax1, ray = ay1 * ca - az1 * sa, raz = ay1 * sa + az1 * ca
        const rbx = bx1, rby = by1 * ca - bz1 * sa, rbz = by1 * sa + bz1 * ca
        const rcx = cx1, rcy = cy1 * ca - cz1 * sa, rcz = cy1 * sa + cz1 * ca

        const e1x = rbx - rax, e1y = rby - ray, e1z = rbz - raz
        const e2x = rcx - rax, e2y = rcy - ray, e2z = rcz - raz
        const nx = e1y * e2z - e1z * e2y
        const ny = e1z * e2x - e1x * e2z
        const nz = e1x * e2y - e1y * e2x
        const nl = Math.sqrt(nx * nx + ny * ny + nz * nz)
        if (nl < 0.0001) continue

        const dot = (nx * ldx + ny * ldy + nz * ldz) / nl
        const brightness = Math.max(0, dot) * 0.7 + 0.15
        const avgZ = (raz + rbz + rcz) / 3
        const depthFade = Math.max(0.15, Math.min(1, 1 - avgZ * 0.8))
        const alpha = brightness * depthFade

        // Fill quad in buffer (simple bounding-box rasterization)
        const minX = Math.max(0, Math.floor(Math.min(p00.x, p10.x, p01.x, p11.x)))
        const maxX = Math.min(COLS - 1, Math.ceil(Math.max(p00.x, p10.x, p01.x, p11.x)))
        const minY = Math.max(0, Math.floor(Math.min(p00.y, p10.y, p01.y, p11.y)))
        const maxY = Math.min(ROWS - 1, Math.ceil(Math.max(p00.y, p10.y, p01.y, p11.y)))

        for (let ry = minY; ry <= maxY; ry++) {
          for (let rx = minX; rx <= maxX; rx++) {
            // Point-in-quad test (simplified: check if point is inside the convex hull)
            const idx = ry * COLS + rx
            if (alpha > buf[idx]!) buf[idx] = alpha
          }
        }
      }
    }

    // --- Map brightness to characters ---
    for (let r = 0; r < ROWS; r++) {
      let rowText = ''
      for (let c = 0; c < COLS; c++) {
        const b = buf[r * COLS + c]!
        if (b < 0.02) {
          rowText += ' '
        } else {
          const idx = Math.min(RAMP_LEN - 1, Math.floor(b * RAMP_LEN))
          rowText += BRIGHTNESS_RAMP[idx]!
        }
      }
      const el = rowRefs[r]!.current
      if (el) el.setAttribute('text', rowText)
    }
  }

  function tick(ts: number): void {
    'main thread'
    // FPS
    fpsFrameCountMT.current++
    const now = Date.now()
    if (fpsLastTimeMT.current === 0) fpsLastTimeMT.current = now
    const fpsElapsed = now - fpsLastTimeMT.current
    if (fpsElapsed >= 500) {
      const fps = Math.round((fpsFrameCountMT.current / fpsElapsed) * 1000)
      fpsFrameCountMT.current = 0; fpsLastTimeMT.current = now
      if (statsRef.current) statsRef.current.setAttribute('text', `${colsMT.current}\u00D7${rowsMT.current} | ${U_STEPS}\u00D7${V_STEPS} torus | ${fps} fps`)
      runOnBackground(setFpsDisplay)(fps)
    }

    renderFrame(ts)
    requestAnimationFrame(tick)
  }

  function initMTS(): void {
    'main thread'
    initCharWidths()
    updateGrid()
    requestAnimationFrame(tick)
  }

  function syncDims(w: number, h: number): void {
    'main thread'
    pageWidthMT.current = w
    pageHeightMT.current = h
    updateGrid()
  }

  useEffect(() => { void runOnMainThread(initMTS)() }, [])
  useEffect(() => { void runOnMainThread(syncDims)(pageWidth, pageHeight) }, [pageWidth, pageHeight])

  return (
    <view style={{ flex: 1, backgroundColor: '#0a0a0f' }} bindlayoutchange={onLayout}>
      {/* Row pool */}
      {Array.from({ length: MAX_ROWS }, (_, i) => (
        <view key={`r-${i}`} style={{ height: `${LINE_HEIGHT}px`, display: 'none' }}>
          <text
            main-thread:ref={rowRefs[i]}
            style={{
              fontSize: `${FONT_SIZE}px`,
              lineHeight: `${LINE_HEIGHT}px`,
              color: '#c8c0b0',
              fontFamily: 'Menlo, Courier, monospace',
              letterSpacing: '0px',
            }}
          > </text>
        </view>
      ))}

      {/* Stats overlay */}
      <view style={{
        position: 'absolute', bottom: '12px', left: '12px', right: '12px',
        backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: '8px', padding: '8px 12px',
      }}>
        <text
          main-thread:ref={statsRef}
          style={{ fontSize: '11px', color: 'rgba(200,192,176,0.7)', fontFamily: 'Menlo, Courier, monospace' }}
        >loading...</text>
      </view>
    </view>
  )
}

root.render(<WireframeTorusPage />)

if (import.meta.webpackHot) {
  import.meta.webpackHot.accept()
}

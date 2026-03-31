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
import { prepareWithSegments } from 'lynx-pretext' with { runtime: 'shared' }
import { DevPanel, useDevPanelFPS, DevPanelFPS } from 'lynx-pretext-devtools'

// --- Constants ---
const FONT_SIZE = 10
const LINE_HEIGHT = 13
const MAX_COLS = 120
const MAX_ROWS = 80
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
  const [gridDisplay, setGridDisplay] = useState('0×0')

  // DevPanel FPS hook - MTS direct update mode
  const { mtsFpsTick, mtsFpsDisplay, btsFpsDisplay, mtsFpsTextRef } = useDevPanelFPS(true)

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

  // MTS state
  const pageWidthMT = useMainThreadRef(390)
  const pageHeightMT = useMainThreadRef(700)
  const charWidthsMT = useMainThreadRef<any>(null) // lazily initialized array of widths
  const colsMT = useMainThreadRef(0)
  const rowsMT = useMainThreadRef(0)
  const avgCharWidthMT = useMainThreadRef(8)
  const maxCharWidthMT = useMainThreadRef(12)

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
    let sum = 0, cnt = 0, maxW = 0
    for (let i = 1; i < widths.length; i++) {
      sum += widths[i]!; cnt++
      if (widths[i]! > maxW) maxW = widths[i]!
    }
    avgCharWidthMT.current = cnt > 0 ? sum / cnt : FONT_SIZE * 0.5
    maxCharWidthMT.current = maxW > 0 ? maxW : FONT_SIZE * 0.8
  }

  function updateGrid(): void {
    'main thread'
    // avg width + 10% margin — occasional minor overflow is acceptable
    colsMT.current = Math.min(MAX_COLS, Math.floor(pageWidthMT.current / (avgCharWidthMT.current * 1.1)))
    rowsMT.current = Math.min(MAX_ROWS, Math.floor(pageHeightMT.current / LINE_HEIGHT))
    // Sync to BTS for display
    runOnBackground(setGridDisplay)(`${colsMT.current}×${rowsMT.current}`)
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
    const fov = Math.min(cw, ch / aspect) * 0.82
    const camDist = 1.25

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

    // Light direction (slightly from top-left-front)
    const lx = 0.3, ly = -0.5, lz = 0.8
    const ll = Math.sqrt(lx * lx + ly * ly + lz * lz)
    const ldx = lx / ll, ldy = ly / ll, ldz = lz / ll

    // Precompute rotated normals for each vertex (reuse in both fill and wireframe)
    const cosAy = Math.cos(ay), sinAy = Math.sin(ay)
    const cosAx = Math.cos(ax), sinAx = Math.sin(ax)

    // Pass 1: Filled quads with Lambertian shading
    for (let i = 0; i < U_STEPS; i++) {
      const ni = (i + 1) % U_STEPS
      for (let j = 0; j < V_STEPS; j++) {
        const nj = (j + 1) % V_STEPS
        const p00 = proj[i]![j]!, p10 = proj[ni]![j]!, p01 = proj[i]![nj]!, p11 = proj[ni]![nj]!

        // Face normal from cross product (in rotated 3D space)
        const a = baseVerts[i]![j]!, b = baseVerts[ni]![j]!, c = baseVerts[i]![nj]!
        // rotY then rotX
        let ax1 = a.x * cosAy + a.z * sinAy, ay1 = a.y, az1 = -a.x * sinAy + a.z * cosAy
        let bx1 = b.x * cosAy + b.z * sinAy, by1 = b.y, bz1 = -b.x * sinAy + b.z * cosAy
        let cx1 = c.x * cosAy + c.z * sinAy, cy1 = c.y, cz1 = -c.x * sinAy + c.z * cosAy
        const rax = ax1, ray = ay1 * cosAx - az1 * sinAx, raz = ay1 * sinAx + az1 * cosAx
        const rbx = bx1, rby = by1 * cosAx - bz1 * sinAx, rbz = by1 * sinAx + bz1 * cosAx
        const rcx = cx1, rcy = cy1 * cosAx - cz1 * sinAx, rcz = cy1 * sinAx + cz1 * cosAx

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

        // Fill quad bounding box
        const minX = Math.max(0, Math.floor(Math.min(p00.x, p10.x, p01.x, p11.x)))
        const maxX = Math.min(COLS - 1, Math.ceil(Math.max(p00.x, p10.x, p01.x, p11.x)))
        const minY = Math.max(0, Math.floor(Math.min(p00.y, p10.y, p01.y, p11.y)))
        const maxY = Math.min(ROWS - 1, Math.ceil(Math.max(p00.y, p10.y, p01.y, p11.y)))

        for (let ry = minY; ry <= maxY; ry++) {
          for (let rx = minX; rx <= maxX; rx++) {
            const idx = ry * COLS + rx
            if (alpha > buf[idx]!) buf[idx] = alpha
          }
        }
      }
    }


    // --- Map brightness to characters + per-row glow color ---
    for (let r = 0; r < ROWS; r++) {
      let rowText = ''
      let maxB = 0
      for (let c = 0; c < COLS; c++) {
        const b = buf[r * COLS + c]!
        if (b > maxB) maxB = b
        if (b < 0.02) {
          rowText += ' '
        } else {
          const idx = Math.min(RAMP_LEN - 1, Math.floor(b * RAMP_LEN))
          rowText += BRIGHTNESS_RAMP[idx]!
        }
      }
      const el = rowRefs[r]!.current
      if (el) {
        el.setAttribute('text', rowText)
        // Glow: bright rows get vivid cyan, dim rows get muted blue-grey
        const glow = Math.max(0.15, Math.min(1, maxB * 1.5))
        const rr = Math.round(20 + glow * 60)
        const gg = Math.round(60 + glow * 195)
        const bb = Math.round(80 + glow * 140)
        el.setStyleProperty('color', `rgba(${rr},${gg},${bb},1)`)
      }
    }
  }

  function tick(ts: number): void {
    'main thread'
    mtsFpsTick()
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
    <DevPanel.Root defaultOpen={true}>
      <view style={{ width: '100%', height: '100%', backgroundColor: '#000000' }} bindlayoutchange={onLayout}>
        {/* Row pool — overflow hidden so extra rows beyond screen don't add height */}
        <view style={{ width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center' }}>
          <view style={{ width: '100%', height: `${pageHeight}px`, overflow: 'hidden' }}>
            {Array.from({ length: MAX_ROWS }, (_, i) => (
              <view key={`r-${i}`} style={{ height: `${LINE_HEIGHT}px` }}>
                <text
                  main-thread:ref={rowRefs[i]}
                  style={{
                    fontSize: `${FONT_SIZE}px`,
                    lineHeight: `${LINE_HEIGHT}px`,
                    color: 'rgba(60,195,140,1)',
                    fontFamily: 'Menlo, Courier, monospace',
                    letterSpacing: '0px',
                  }}
                > </text>
              </view>
            ))}
          </view>
        </view>

        {/* DevPanel Trigger */}
        <DevPanel.Trigger />

        {/* DevPanel Content */}
        <DevPanel.Content title="Torus">
          <DevPanelFPS mtsFpsDisplay={mtsFpsDisplay} btsFpsDisplay={btsFpsDisplay} mtsFpsTextRef={mtsFpsTextRef} />
          <DevPanel.Stats>
            <DevPanel.Stat label="grid" value={gridDisplay} />
            <DevPanel.Stat label="mesh" value={`${U_STEPS}×${V_STEPS}`} />
          </DevPanel.Stats>
        </DevPanel.Content>
      </view>
    </DevPanel.Root>
  )
}

root.render(<WireframeTorusPage />)

if (import.meta.webpackHot) {
  import.meta.webpackHot.accept()
}

import { useRef, useMainThreadRef, runOnBackground, useState } from '@lynx-js/react'
import type { MainThread } from '@lynx-js/types'

export interface UseDevPanelFPSReturn {
  mtsFpsTick: () => void
  btsFpsTick: () => void
  mtsFpsDisplay: number
  btsFpsDisplay: number
  mtsFpsTextRef: React.MutableRefObject<MainThread.Element | null>
}

export function useDevPanelFPS(mtsDirectUpdate = false): UseDevPanelFPSReturn {
  // Display state (for React render)
  const [mtsFpsDisplay, setMtsFpsDisplay] = useState(0)
  const [btsFpsDisplay, setBtsFpsDisplay] = useState(0)

  // MTS refs for frame counting
  const mtsFrameCountRef = useMainThreadRef(0)
  const mtsLastTimeRef = useMainThreadRef(0)

  // BTS refs for frame counting
  const btsFrameCountRef = useRef(0)
  const btsLastTimeRef = useRef(0)

  // MTS direct update ref (for mtsDirectUpdate mode)
  const mtsFpsTextRef = useRef<MainThread.Element | null>(null)

  // MTS tick function - must have 'main thread' directive first
  function mtsFpsTick(): void {
    'main thread'
    mtsFrameCountRef.current++
    const now = Date.now()
    if (mtsLastTimeRef.current === 0) {
      mtsLastTimeRef.current = now
    }
    const elapsed = now - mtsLastTimeRef.current

    if (elapsed >= 500) {
      const fps = Math.round((mtsFrameCountRef.current / elapsed) * 1000)
      mtsFrameCountRef.current = 0
      mtsLastTimeRef.current = now

      // Direct update mode: update text element directly on MTS
      if (mtsDirectUpdate && mtsFpsTextRef.current) {
        mtsFpsTextRef.current.setAttribute('text', `${fps}`)
      }

      // Push to BTS for state (used by color coding)
      runOnBackground(setMtsFpsDisplay)(fps)
    }
  }

  // BTS tick function - plain function
  function btsFpsTick(): void {
    btsFrameCountRef.current++
    const now = Date.now()
    if (btsLastTimeRef.current === 0) {
      btsLastTimeRef.current = now
    }
    const elapsed = now - btsLastTimeRef.current

    if (elapsed >= 500) {
      const fps = Math.round((btsFrameCountRef.current / elapsed) * 1000)
      btsFrameCountRef.current = 0
      btsLastTimeRef.current = now
      setBtsFpsDisplay(fps)
    }
  }

  return {
    mtsFpsTick,
    btsFpsTick,
    mtsFpsDisplay,
    btsFpsDisplay,
    mtsFpsTextRef,
  }
}

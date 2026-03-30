# DevPanel — Composable DevTool Panel for Demos

## Goal

A reusable, composable React component that provides a consistent floating debug overlay for all lynx-pretext demo pages. Radix/lynx-ui-style compound component API.

## Usage

```tsx
import { DevPanel, useDevPanelFPS } from '../../components/dev-panel'

export function MyDemo() {
  const [width, setWidth] = useState(390)
  const [height, setHeight] = useState(700)
  const [autoSpin, setAutoSpin] = useState(false)
  const { mtsFpsTick, btsFpsTick } = useDevPanelFPS()

  // In MTS rAF loop:
  function tick() {
    'main thread'
    mtsFpsTick()
    // ... layout work ...
  }

  // In BTS render body (for BTS demos):
  btsFpsTick()

  return (
    <view style={{ flex: 1 }} bindlayoutchange={onLayout}>
      {/* ... demo content ... */}

      <DevPanel.Root>
        <DevPanel.Trigger />
        <DevPanel.Content
          title="Dynamic Layout (MTS)"
          description="Full text reflow on main thread at 60fps via shared modules."
        >
          <DevPanel.FPS />
          <DevPanel.Stats>
            <DevPanel.Stat label="Mode" value={isNarrow ? 'Single' : 'Two-col'} />
            <DevPanel.Stat label="Lines" value={`${totalLines}`} />
          </DevPanel.Stats>
          <DevPanel.Stepper label="W" value={width} min={360} max={1200} step={40} onChange={setWidth} />
          <DevPanel.Stepper label="H" value={height} min={400} max={1200} step={40} onChange={setHeight} />
          <DevPanel.Actions>
            <DevPanel.Button label="Auto-spin" active={autoSpin} onPress={() => setAutoSpin(v => !v)} />
          </DevPanel.Actions>
        </DevPanel.Content>
      </DevPanel.Root>
    </view>
  )
}
```

## File Structure

```
components/
  dev-panel/
    index.ts                — barrel re-export: DevPanel namespace + useDevPanelFPS
    context.ts              — React context for open/close state + FPS refs
    types.ts                — shared prop types
    DevPanelRoot.tsx         — Context provider, owns open state
    DevPanelTrigger.tsx      — ≡ toggle button, position: absolute top-right
    DevPanelContent.tsx      — Overlay panel with title + description + children
    DevPanelFPS.tsx          — Renders MTS + BTS fps values from context refs
    DevPanelStats.tsx        — Horizontal row container for Stat items
    DevPanelStat.tsx         — Single label/value pair
    DevPanelStepper.tsx      — − value + horizontal stepper control
    DevPanelActions.tsx      — Horizontal row container for action buttons
    DevPanelButton.tsx       — Single labeled button with active/inactive state
    useDevPanelFPS.ts        — Hook returning mtsFpsTick + btsFpsTick functions
```

## Component API

### DevPanel.Root

Context provider. Owns open/close state.

```tsx
type DevPanelRootProps = {
  children: React.ReactNode
  defaultOpen?: boolean  // default: false
}
```

### DevPanel.Trigger

Toggle button. Renders ≡ when closed, × when open. Position: absolute, top-right.

```tsx
// No props — reads context
```

Styles: 36×36px circle, semi-transparent background, white icon.

### DevPanel.Content

Overlay panel. Only renders when open (from context).

```tsx
type DevPanelContentProps = {
  title: string
  description?: string
  children?: React.ReactNode
}
```

Styles: position absolute, top: 56px, left/right: 12px, dark translucent background, rounded corners, padding 16px.

### DevPanel.FPS

Reads MTS and BTS fps values from context refs (populated by `useDevPanelFPS` hook). Renders as a stats row.

```tsx
// No props — reads context
// Renders: "MTS [60]  BTS [60]" with color coding
//   green >= 50, orange >= 30, red < 30
```

### DevPanel.Stats

Container for Stat items. Horizontal flex row with gap.

```tsx
type DevPanelStatsProps = {
  children: React.ReactNode
}
```

### DevPanel.Stat

Single metric display.

```tsx
type DevPanelStatProps = {
  label: string
  value: string | number
}
```

Renders: small label on top, bold value below.

### DevPanel.Stepper

Horizontal stepper: `label: − [value] +`

```tsx
type DevPanelStepperProps = {
  label: string
  value: number
  min?: number
  max?: number
  step?: number       // default: 1
  unit?: string       // default: 'px'
  onChange: (value: number) => void
}
```

### DevPanel.Actions

Container for action buttons. Horizontal flex row.

```tsx
type DevPanelActionsProps = {
  children: React.ReactNode
}
```

### DevPanel.Button

Action button with active state toggle.

```tsx
type DevPanelButtonProps = {
  label: string
  active?: boolean
  onPress: () => void
}
```

Styles: pill shape, different background when active.

## FPS Measurement: useDevPanelFPS

The trickiest part. FPS must be measured **inside the demo's own loops**, not in a separate rAF.

```tsx
function useDevPanelFPS(): {
  mtsFpsTick: () => void    // call in MTS rAF — has 'main thread' directive
  btsFpsTick: () => void    // call in BTS render body
}
```

### How it works

The hook creates:
- `useMainThreadRef` for MTS frame count, last time, current fps
- `useRef` for BTS frame count, last time, current fps
- A shared context ref that `<DevPanel.FPS>` reads to display values

`mtsFpsTick()` is a `'main thread'` function:
```ts
function mtsFpsTick(): void {
  'main thread'
  mtsFrameCount.current++
  const now = Date.now()
  if (mtsLastTime.current === 0) mtsLastTime.current = now
  const elapsed = now - mtsLastTime.current
  if (elapsed >= 500) {
    mtsFps.current = Math.round((mtsFrameCount.current / elapsed) * 1000)
    mtsFrameCount.current = 0
    mtsLastTime.current = now
    // Push to BTS for display (low frequency — every 500ms)
    runOnBackground(setMtsFpsState)(mtsFps.current)
  }
}
```

`btsFpsTick()` is a plain function:
```ts
function btsFpsTick(): void {
  btsFrameCount.current++
  const now = Date.now()
  if (btsLastTime.current === 0) btsLastTime.current = now
  const elapsed = now - btsLastTime.current
  if (elapsed >= 500) {
    btsFps.current = Math.round((btsFrameCount.current / elapsed) * 1000)
    btsFrameCount.current = 0
    btsLastTime.current = now
    setBtsFpsState(btsFps.current)
  }
}
```

### MTS-only FPS display optimization

For pure MTS demos (editorial-mts, wireframe-torus), the FPS text element can have a `main-thread:ref` and be updated directly via `setAttribute` without going through React. The `<DevPanel.FPS>` component should support this:

```tsx
<DevPanel.FPS mtsDirectUpdate />
```

When `mtsDirectUpdate` is true, the MTS fps text gets a `main-thread:ref` and `mtsFpsTick` updates it via `setAttribute('text', fps)` directly, skipping `runOnBackground`.

## Styling Constants

All hardcoded — no theme system:

```ts
const PANEL_BG = 'rgba(0,0,0,0.88)'
const PANEL_RADIUS = '12px'
const PANEL_PADDING = '16px'
const TRIGGER_SIZE = '36px'
const TRIGGER_RADIUS = '18px'
const TRIGGER_BG_OPEN = 'rgba(255,255,255,0.92)'
const TRIGGER_BG_CLOSED = 'rgba(0,0,0,0.25)'
const TEXT_PRIMARY = '#fff'
const TEXT_SECONDARY = 'rgba(255,255,255,0.6)'
const TEXT_TERTIARY = 'rgba(255,255,255,0.5)'
const FPS_GREEN = '#4caf50'
const FPS_ORANGE = '#ff9800'
const FPS_RED = '#f44336'
const STEPPER_BG = 'rgba(255,255,255,0.2)'
const STEPPER_SIZE = '28px'
const STEPPER_RADIUS = '14px'
```

## Demos to Migrate

| Demo | Current overlay lines | Has MTS FPS | Has BTS FPS | Has Stepper | Has Actions |
|------|----------------------|-------------|-------------|-------------|-------------|
| dynamic-layout | ~80 lines | yes | yes | W + H | no |
| dynamic-layout-bts | ~60 lines | no | yes | W + H | no |
| dynamic-layout-mts | ~50 lines | yes | no | W + H | no (add auto-spin) |
| bubbles | ~50 lines | no | no | W | no |
| editorial-mts | 0 (no panel) | no | no | no | add orb pause |
| wireframe-torus | stats bar only | yes (MTS direct) | no | no | no |

## Implementation Order

1. `context.ts` + `types.ts`
2. `DevPanelRoot` + `DevPanelTrigger` + `DevPanelContent` — minimal open/close
3. `DevPanelStat` + `DevPanelStats`
4. `DevPanelStepper`
5. `DevPanelButton` + `DevPanelActions`
6. `useDevPanelFPS` + `DevPanelFPS`
7. `index.ts` barrel export
8. Migrate `dynamic-layout-mts` as proof of concept
9. Migrate remaining demos one by one

## Design Constraints

- All style values must be strings with 'px' units (Lynx requirement)
- `display: 'flex'` required for any `flexDirection: 'row'` (Lynx requirement)
- `'main thread'` directive must be first statement in MTS functions
- `useMainThreadRef` cannot be called in loops (unroll if needed)
- `runOnBackground` must be called inline in MTS functions, not at component level

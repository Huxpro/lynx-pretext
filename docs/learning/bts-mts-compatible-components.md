# 编写 BTS/MTS 双兼容组件

本文档记录如何编写可同时被纯 BTS、纯 MTS 和混合模式使用的 React 组件，基于 `@lynx-pretext/devtools` 的 `DevPanel` 组件实战经验。

## 问题背景

在 `@lynx-pretext/devtools` 包中，`DevPanel` 组件需要支持三种使用场景：

1. **纯 BTS** (`dynamic-layout-bts.tsx`)：不使用 MTS 直接更新
2. **纯 MTS** (`dynamic-layout-mts.tsx`)：MTS 动画循环中直接更新 FPS 显示
3. **混合模式** (`dynamic-layout.tsx`)：MTS 动画 + BTS 渲染

最初的实现只考虑了 BTS 场景，导致在 MTS 和混合模式下报错：

```
Error: MainThreadRef: main-thread:ref must be of type MainThreadRef or main-thread function.
```

## 核心原则

### 1. Ref 类型必须正确

**问题**：`main-thread:ref` 只接受 `MainThreadRef` 类型，不接受普通 React ref。

```tsx
// ❌ 错误：useRef 创建的 ref 不能传给 main-thread:ref
const textRef = useRef<MainThread.Element | null>(null)
<text main-thread:ref={textRef} />

// ✅ 正确：useMainThreadRef 创建的 ref 可以传给 main-thread:ref
const textRef = useMainThreadRef<MainThread.Element | null>(null)
<text main-thread:ref={textRef} />
```

**解决方案**：如果组件可能被 MTS 使用，**始终使用 `useMainThreadRef`**。

### 2. 类型导入来源

```tsx
// MainThreadRef 来自 @lynx-js/react
import type { MainThreadRef } from '@lynx-js/react'

// MainThread 来自 @lynx-js/types
import type { MainThread } from '@lynx-js/types'
```

### 3. 条件性 MTS 功能

通过参数控制是否启用 MTS 直接更新模式：

```tsx
export interface UseDevPanelFPSReturn {
  mtsFpsTick: () => void      // MTS 中调用的 tick 函数
  btsFpsTick: () => void      // BTS 中调用的 tick 函数
  mtsFpsDisplay: number       // BTS state，用于颜色编码
  btsFpsDisplay: number       // BTS state
  mtsFpsTextRef: MainThreadRef<MainThread.Element | null>  // 必须是 MainThreadRef
}

export function useDevPanelFPS(mtsDirectUpdate = false): UseDevPanelFPSReturn {
  // 显示状态 (用于 React 渲染和颜色编码)
  const [mtsFpsDisplay, setMtsFpsDisplay] = useState(0)
  const [btsFpsDisplay, setBtsFpsDisplay] = useState(0)

  // MTS refs - 必须用 useMainThreadRef
  const mtsFrameCountRef = useMainThreadRef(0)
  const mtsLastTimeRef = useMainThreadRef(0)
  const mtsFpsTextRef = useMainThreadRef<MainThread.Element | null>(null)

  // BTS refs - 用 useRef
  const btsFrameCountRef = useRef(0)
  const btsLastTimeRef = useRef(0)

  // MTS tick 函数 - 必须有 'main thread' 指令
  function mtsFpsTick(): void {
    'main thread'
    mtsFrameCountRef.current++
    const now = Date.now()
    // ... 计算逻辑

    if (elapsed >= 500) {
      const fps = Math.round((mtsFrameCountRef.current / elapsed) * 1000)

      // 直接更新模式：MTS 中直接操作 DOM
      if (mtsDirectUpdate && mtsFpsTextRef.current) {
        mtsFpsTextRef.current.setAttribute('text', `${fps}`)
      }

      // 推送到 BTS 用于状态 (颜色编码)
      runOnBackground(setMtsFpsDisplay)(fps)
    }
  }

  // BTS tick 函数 - 普通函数
  function btsFpsTick(): void {
    btsFrameCountRef.current++
    // ... 计算逻辑
    setBtsFpsDisplay(fps)
  }

  return {
    mtsFpsTick,
    btsFpsTick,
    mtsFpsDisplay,
    btsFpsDisplay,
    mtsFpsTextRef,
  }
}
```

### 4. 组件使用方式

```tsx
// DevPanelFPS 组件
export interface DevPanelFPSProps {
  mtsFpsDisplay: number
  btsFpsDisplay: number
  mtsFpsTextRef?: MainThreadRef<MainThread.Element | null>  // 可选
}

export function DevPanelFPS({
  mtsFpsDisplay,
  btsFpsDisplay,
  mtsFpsTextRef,
}: DevPanelFPSProps): React.ReactElement {
  return (
    <view>
      <text main-thread:ref={mtsFpsTextRef} style={{ color: getFpsColor(mtsFpsDisplay) }}>
        {`${mtsFpsDisplay}`}
      </text>
      {/* ... */}
    </view>
  )
}
```

## 三种使用场景

### 场景 1：纯 BTS

不启用 MTS 直接更新，不传递 `mtsFpsTextRef`：

```tsx
// dynamic-layout-bts.tsx
export function DynamicLayoutBTSPage() {
  // 不传参数，默认 mtsDirectUpdate = false
  const { btsFpsTick, mtsFpsDisplay, btsFpsDisplay } = useDevPanelFPS()

  // BTS 动画循环
  const tick = useCallback(() => {
    btsFpsTick()
    // ... BTS 动画逻辑
    setOpenaiAngle(nextAngle)
    rafRef.current = requestAnimationFrame(tick)
  }, [btsFpsTick])

  return (
    <DevPanel.Root>
      {/* 不传 mtsFpsTextRef，main-thread:ref 接收 undefined，不会报错 */}
      <DevPanelFPS mtsFpsDisplay={mtsFpsDisplay} btsFpsDisplay={btsFpsDisplay} />
    </DevPanel.Root>
  )
}
```

### 场景 2：纯 MTS

启用 MTS 直接更新，传递 `mtsFpsTextRef`，在 MTS 动画循环中调用 `mtsFpsTick`：

```tsx
// dynamic-layout-mts.tsx
export function DynamicLayoutMTSPage() {
  // 启用 MTS 直接更新
  const { mtsFpsTick, mtsFpsDisplay, btsFpsDisplay, mtsFpsTextRef } = useDevPanelFPS(true)

  // MTS 动画循环
  function spinTick(ts: number): void {
    'main thread'
    // MTS FPS tick - 直接更新 DOM
    mtsFpsTick()
    // ... MTS 动画逻辑
    requestAnimationFrame(spinTick)
  }

  return (
    <DevPanel.Root>
      {/* 传递 mtsFpsTextRef，MTS 中直接更新 */}
      <DevPanelFPS
        mtsFpsDisplay={mtsFpsDisplay}
        btsFpsDisplay={btsFpsDisplay}
        mtsFpsTextRef={mtsFpsTextRef}
      />
    </DevPanel.Root>
  )
}
```

### 场景 3：混合模式

启用 MTS 直接更新，MTS 动画 + BTS 渲染：

```tsx
// dynamic-layout.tsx
export function DynamicLayoutPage() {
  // 启用 MTS 直接更新
  const { mtsFpsTick, btsFpsTick, mtsFpsDisplay, btsFpsDisplay, mtsFpsTextRef } = useDevPanelFPS(true)

  // MTS 动画循环
  function spinTick(_timestamp: number): void {
    'main thread'
    // MTS FPS tick
    mtsFpsTick()
    // ... MTS 动画逻辑
    // 同步到 BTS
    runOnBackground(setOpenaiSettledAngle)(openaiAngleMT.current)
    requestAnimationFrame(spinTick)
  }

  // BTS render 中调用 btsFpsTick
  btsFpsTick()

  return (
    <DevPanel.Root>
      <DevPanelFPS
        mtsFpsDisplay={mtsFpsDisplay}
        btsFpsDisplay={btsFpsDisplay}
        mtsFpsTextRef={mtsFpsTextRef}
      />
    </DevPanel.Root>
  )
}
```

## 注意事项清单

### Ref 相关

| 问题 | 解决方案 |
|------|---------|
| `main-thread:ref` 接收了普通 ref | 使用 `useMainThreadRef` 而不是 `useRef` |
| 类型导入错误 | `MainThreadRef` 来自 `@lynx-js/react`，`MainThread` 来自 `@lynx-js/types` |
| ref 可能为 undefined | 设计时让 `main-thread:ref` 接受 `undefined`，组件不传时不报错 |

### 函数相关

| 问题 | 解决方案 |
|------|---------|
| MTS 函数未标记 | 添加 `'main thread'` 指令作为函数体第一行 |
| TDZ 问题 | MTS 函数按 callee-before-caller 顺序声明 |
| 跨线程调用 | BTS → MTS 用 `runOnMainThread`，MTS → BTS 用 `runOnBackground` |

### 性能相关

| 场景 | 建议 |
|------|------|
| 纯 BTS | 不启用 MTS 直接更新，减少不必要的 ref 创建 |
| 纯 MTS | 启用 MTS 直接更新，避免跨线程同步延迟 |
| 混合模式 | 启用 MTS 直接更新用于 FPS 显示，BTS 用于复杂布局 |

## 完整示例

```tsx
// hooks/useDevPanelFPS.ts
import { useRef, useMainThreadRef, runOnBackground, useState } from '@lynx-js/react'
import type { MainThreadRef } from '@lynx-js/react'
import type { MainThread } from '@lynx-js/types'

export interface UseDevPanelFPSReturn {
  mtsFpsTick: () => void
  btsFpsTick: () => void
  mtsFpsDisplay: number
  btsFpsDisplay: number
  mtsFpsTextRef: MainThreadRef<MainThread.Element | null>
}

export function useDevPanelFPS(mtsDirectUpdate = false): UseDevPanelFPSReturn {
  const [mtsFpsDisplay, setMtsFpsDisplay] = useState(0)
  const [btsFpsDisplay, setBtsFpsDisplay] = useState(0)

  // 关键：必须用 useMainThreadRef
  const mtsFrameCountRef = useMainThreadRef(0)
  const mtsLastTimeRef = useMainThreadRef(0)
  const mtsFpsTextRef = useMainThreadRef<MainThread.Element | null>(null)

  const btsFrameCountRef = useRef(0)
  const btsLastTimeRef = useRef(0)

  function mtsFpsTick(): void {
    'main thread'  // 关键：必须有此指令
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

      // MTS 直接更新模式
      if (mtsDirectUpdate && mtsFpsTextRef.current) {
        mtsFpsTextRef.current.setAttribute('text', `${fps}`)
      }

      // 推送到 BTS
      runOnBackground(setMtsFpsDisplay)(fps)
    }
  }

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
```

```tsx
// components/DevPanelFPS.tsx
import type { MainThreadRef } from '@lynx-js/react'
import type { MainThread } from '@lynx-js/types'

export interface DevPanelFPSProps {
  mtsFpsDisplay: number
  btsFpsDisplay: number
  mtsFpsTextRef?: MainThreadRef<MainThread.Element | null>  // 可选
}

export function DevPanelFPS({
  mtsFpsDisplay,
  btsFpsDisplay,
  mtsFpsTextRef,
}: DevPanelFPSProps): React.ReactElement {
  return (
    <view style={{ display: 'flex', flexDirection: 'row', gap: '16px' }}>
      <view>
        <text style={{ fontSize: '11px', color: '#999' }}>MTS</text>
        <text
          main-thread:ref={mtsFpsTextRef}
          style={{ fontSize: '14px', fontWeight: 'bold', color: getFpsColor(mtsFpsDisplay) }}
        >
          {`${mtsFpsDisplay}`}
        </text>
      </view>
      <view>
        <text style={{ fontSize: '11px', color: '#999' }}>BTS</text>
        <text style={{ fontSize: '14px', fontWeight: 'bold', color: getFpsColor(btsFpsDisplay) }}>
          {`${btsFpsDisplay}`}
        </text>
      </view>
    </view>
  )
}
```

## 相关文档

- [mts-bts-architecture-patterns.md](./mts-bts-architecture-patterns.md) - MTS/BTS 架构模式对比
- [mts-shared-module-pitfalls.md](./mts-shared-module-pitfalls.md) - Shared module 的坑

# MTS/BTS 架构模式对比

本文档对比 Lynx 中 Main Thread Script (MTS) 和 Background Thread (BTS/React) 的不同使用方式，以 `dynamic-layout-*` 和 `editorial-*` 系列为案例。

## 基础概念

### 线程模型

```
┌─────────────────────────────────────────────────────────────┐
│                    Main Thread (MTS)                        │
│  - UI 渲染、触摸事件、动画                                    │
│  - 零延迟响应触摸                                            │
│  - 可以直接操作 DOM (通过 useMainThreadRef<Element>)          │
│  - 不能访问 React state/hooks                               │
└─────────────────────────────────────────────────────────────┘
                            ↕
              runOnMainThread / runOnBackground (异步)
                            ↕
┌─────────────────────────────────────────────────────────────┐
│                  Background Thread (BTS)                    │
│  - React 运行环境                                            │
│  - useState, useCallback, useMemo 等 hooks                  │
│  - JSX 声明式渲染                                            │
│  - 文本布局计算 (pretext)                                    │
└─────────────────────────────────────────────────────────────┘
```

### 关键 API

| API | 调用位置 | 作用 |
|-----|---------|------|
| `runOnMainThread(fn)(...args)` | BTS | 从 BTS 调用 MTS 函数 |
| `runOnBackground(fn)(...args)` | MTS | 从 MTS 调用 BTS 函数 |
| `useMainThreadRef<T>(initial)` | BTS | 创建 MTS 可访问的 ref |
| `'main thread'` 指令 | MTS 函数内 | 标记函数在 MTS 执行 |

### TDZ 陷阱

MTS 函数会被 SWC 转换为 `let` 绑定，必须按 **callee-before-caller** 顺序声明：

```tsx
// ❌ 错误：caller 在 callee 之前
function initMT() {
  'main thread'
  requestAnimationFrame(tickMT) // tickMT 未初始化！
}
function tickMT() { 'main thread' }

// ✅ 正确：callee 在 caller 之前
function tickMT() { 'main thread' }
function initMT() {
  'main thread'
  requestAnimationFrame(tickMT)
}
```

---

## 三种架构模式

### 模式 1：纯 BTS (dynamic-layout-bts.tsx)

```
BTS requestAnimationFrame → React setState → React render → 文本布局 → JSX
```

**特点**：
- 动画循环在 BTS (`requestAnimationFrame` 在 React 组件内)
- 每帧触发 React 重渲染
- 文本布局在 BTS render 中计算
- 完全依赖 Lynx React reconciliation 性能

**适用场景**：
- 测试 Lynx reconciliation 是否能跑 60fps
- 简单动画，不需要零延迟触摸响应

**代码示例**：
```tsx
useEffect(() => {
  let rafId: number
  function tick() {
    // BTS 动画逻辑
    setAngle(a => a + 0.1)
    rafId = requestAnimationFrame(tick)
  }
  rafId = requestAnimationFrame(tick)
  return () => cancelAnimationFrame(rafId)
}, [])
```

---

### 模式 2：纯 MTS (dynamic-layout-mts.tsx, editorial-mts.tsx)

```
MTS rAF → 文本布局 (shared module) → 直接操作 DOM → 零跨线程同步
```

**特点**：
- 动画循环在 MTS (`requestAnimationFrame` 在 MTS 函数内)
- 文本布局在 MTS (通过 `with { runtime: 'shared' }` 导入)
- 直接操作 DOM (`useMainThreadRef<Element>.setStyleProperty`)
- React 只渲染固定元素池，不参与每帧更新
- **零跨线程调用，无同步延迟**

**适用场景**：
- 需要最高性能
- 需要零延迟触摸响应
- 动画和触摸交互紧密耦合

**代码示例**：
```tsx
// 导入 shared module (BTS 和 MTS 都能用)
import { layoutNextLine } from '../../src/layout' with { runtime: 'shared' }

// MTS refs 用于直接操作 DOM
const lineViewRefs = useRefArray<MainThread.Element>(POOL_SIZE)
const lineTextRefs = useRefArray<MainThread.Element>(POOL_SIZE)

function tickMT(): void {
  'main thread'
  // 文本布局在 MTS 计算
  const lines = evaluateLayout(orbsMT.current, viewportW, viewportH)

  // 直接操作 DOM，不经过 React
  for (let i = 0; i < lines.length; i++) {
    lineViewRefs[i].current?.setStyleProperties({
      left: `${lines[i].x}px`,
      top: `${lines[i].y}px`,
    })
    lineTextRefs[i].current?.setAttribute('text', lines[i].text)
  }

  requestAnimationFrame(tickMT)
}

// 触摸处理也在 MTS，零延迟
function handleTouchStartMT(event: MainThread.TouchEvent): void {
  'main thread'
  // 直接读取 MTS 状态，无延迟
  const orbs = orbsMT.current
  // ...hit test and start drag
}
```

---

### 模式 3：混合模式 (dynamic-layout.tsx, editorial-engine.tsx)

```
MTS: 动画 + 触摸 → runOnBackground → BTS: React render + 文本布局
```

**特点**：
- 动画循环在 MTS
- 触摸处理在 MTS (零延迟响应)
- 文本布局在 BTS (React render 中)
- 每帧调用 `runOnBackground` 同步状态到 BTS
- **存在 1-2 帧同步延迟**

**适用场景**：
- 文本布局逻辑复杂，不想搬到 MTS
- React 声明式渲染更易维护
- 可以容忍轻微延迟

**代码示例**：
```tsx
// MTS 状态
const orbsMT = useMainThreadRef<Orb[]>([])
const viewportWMT = useMainThreadRef(0)

// BTS state (用于 React 渲染)
const [orbs, setOrbs] = useState<Orb[]>([])
const [viewportW, setViewportW] = useState(0)

// MTS 动画循环
function tickMT(): void {
  'main thread'
  // 更新 MTS 状态
  for (const orb of orbsMT.current) {
    orb.x += orb.vx * dt
  }

  // 同步到 BTS (异步！有延迟)
  runOnBackground(setOrbs)(orbsMT.current.map(o => ({ ...o })))

  requestAnimationFrame(tickMT)
}

// MTS 触摸处理 (零延迟)
function handleTouchStartMT(event: MainThread.TouchEvent): void {
  'main thread'
  // 问题：读取的是 MTS 状态
  // 但用户看到的是 BTS 渲染 (可能有 1-2 帧延迟)
  const orbs = orbsMT.current
  // ...hit test
}

// BTS 文本布局 (在 render 中)
function Component() {
  // 使用 BTS state 计算布局
  const obstacles = orbs.map(orb => ({ cx: orb.x, cy: orb.y, ... }))
  const lines = layoutColumn(text, obstacles, ...)

  return (
    <view>
      {lines.map(line => <text>{line.text}</text>)}
    </view>
  )
}
```

**已知问题**：
- MTS 状态和 BTS 渲染不同步
- 触摸检测位置和视觉位置可能有偏差
- 解决方案：增大 grab 区域，或改用纯 MTS 模式

---

## 对比总结

| 方面 | 纯 BTS | 纯 MTS | 混合模式 |
|------|--------|--------|----------|
| 动画位置 | BTS | MTS | MTS |
| 文本布局 | BTS | MTS (shared) | BTS |
| 触摸处理 | BTS (有延迟) | MTS (零延迟) | MTS (零延迟) |
| 跨线程同步 | 无 | 无 | 每帧 `runOnBackground` |
| 同步延迟 | - | - | 1-2 帧 |
| 代码复杂度 | 低 | 高 | 中 |
| 性能 | 依赖 reconciliation | 最高 | 高 |
| 维护性 | 最好 | 较差 | 中等 |

---

## 文件对照

| 文件 | 模式 | 说明 |
|------|------|------|
| `dynamic-layout-bts.tsx` | 纯 BTS | 测试 React reconciliation 性能 |
| `dynamic-layout-mts.tsx` | 纯 MTS | Logo 旋转 + 文本绕排，最高性能 |
| `dynamic-layout.tsx` | 混合 | Logo 旋转在 MTS，文本在 BTS |
| `editorial-mts.tsx` | 纯 MTS | 完整 editorial 演示，orbs 拖拽 + 文本绕排 |
| `editorial-engine.tsx` | 混合 | orbs 动画在 MTS，文本在 BTS |

---

## 项目详细对比

### 1. dynamic-layout-bts.tsx (纯 BTS)

**功能**：Logo 旋转 + 文本绕排

**架构**：
```
BTS: requestAnimationFrame → setState → React render → 文本布局 → JSX
```

**关键点**：
- 完全依赖 React reconciliation
- 触摸事件有延迟（经过 BTS 事件循环）
- 代码最简单，适合测试 Lynx 性能上限

---

### 2. dynamic-layout-mts.tsx (纯 MTS)

**功能**：Logo 旋转 + 文本绕排

**架构**：
```
MTS: rAF → 文本布局 (shared) → 直接操作 DOM
MTS: 触摸事件 → 零延迟响应
```

**关键点**：
- Logo 旋转通过 `setStyleProperty('transform', ...)` 直接操作
- 文本布局使用 shared module (`with { runtime: 'shared' }`)
- 固定元素池，通过 `display: none` 隐藏未使用的元素
- **零跨线程调用，最高性能**

---

### 3. dynamic-layout.tsx (混合)

**功能**：Logo 旋转 + 文本绕排

**架构**：
```
MTS: Logo 旋转 + 触摸 → runOnBackground → BTS: 文本布局 + React render
```

**关键点**：
- Logo 旋转在 MTS，触摸响应零延迟
- 文本布局在 BTS，通过 `runOnBackground(setAngle)` 同步
- 存在 1-2 帧延迟，但代码更易维护

---

### 4. editorial-mts.tsx (纯 MTS)

**功能**：Orbs 物理动画 + 拖拽 + 文本绕排

**架构**：
```
MTS: rAF → 物理模拟 → 文本布局 (shared) → 直接操作 DOM
MTS: 触摸事件 → 零延迟拖拽
```

**关键实现细节**：

```tsx
// 1. Shared module 导入文本布局函数
import { layoutNextLine, prepareWithSegments } from '../../src/layout' with { runtime: 'shared' }

// 2. MTS refs 用于直接操作 DOM
const orbGlowRefs = useRefArray<MainThread.Element>(ORB_COUNT)
const orbCoreRefs = useRefArray<MainThread.Element>(ORB_COUNT)
const bodyViewRefs = useRefArray<MainThread.Element>(BODY_POOL)
const bodyTextRefs = useRefArray<MainThread.Element>(BODY_POOL)

// 3. 动画循环完全在 MTS
function tickMT(timestamp: number): void {
  'main thread'
  // 物理模拟
  for (const orb of orbsMT.current) {
    if (!orb.paused) {
      orb.x += orb.vx * dt
      orb.y += orb.vy * dt
    }
  }
  // 文本布局 + DOM 更新
  applyEditorialLayoutMT()
  requestAnimationFrame(tickMT)
}

// 4. 触摸处理：直接用 event.touches[0]，不匹配 identifier
function handleTouchMoveMT(event: MainThread.TouchEvent): void {
  'main thread'
  const touch = event.touches.length > 0 ? event.touches[0]! : null
  if (!touch) return

  const orb = orbsMT.current[dragIndex]
  orb.x = dragStartOrbX + (touch.clientX - dragStartX)
  orb.y = dragStartOrbY + (touch.clientY - dragStartY)

  // 立即更新 DOM，不等 rAF
  positionOrb(orbGlowRefs[dragIndex], orb.x, orb.y, ...)
  applyEditorialLayoutMT()
}
```

**踩过的坑**：
- `MainThread.Touch.identifier` 匹配不可靠，直接用 `event.touches[0]`
- 拖拽时需要 `orb.paused = true` 暂停物理模拟
- `applyEditorialLayoutMT()` 会 clamp 所有 orb，需确保拖拽的 orb 不被覆盖

---

### 5. editorial-engine.tsx (混合)

**功能**：Orbs 物理动画 + 拖拽 + 文本绕排

**架构**：
```
MTS: rAF → 物理模拟 → runOnBackground → BTS: React render + 文本布局
MTS: 触摸事件 → 零延迟拖拽 → 更新 MTS 状态
```

**关键点**：
- Orbs 真相源在 MTS (`orbsMT`)
- 每帧通过 `runOnBackground(setOrbs)` 同步到 BTS
- 文本布局在 BTS render 中计算
- **已知问题**：MTS 状态和 BTS 渲染有 1-2 帧延迟，导致触摸检测位置和视觉位置偏差

**适用场景**：
- 想保留 React 声明式渲染的便利性
- 可以容忍轻微的触摸-视觉偏差
- 文本布局逻辑复杂，不想搬到 MTS

---

## 选择建议

1. **需要零延迟触摸响应** → 纯 MTS
2. **简单动画，触摸不重要** → 纯 BTS
3. **复杂文本布局 + 需要触摸** → 混合模式 (可容忍延迟) 或 纯 MTS (零延迟)

## 相关文档

- [mts-shared-module-pitfalls.md](./mts-shared-module-pitfalls.md) - Shared module 的坑
- [mts-touch-event-pitfalls.md](./mts-touch-event-pitfalls.md) - MTS 触摸事件陷阱 (identifier 问题)
- [../superpowers/specs/2026-03-29-editorial-mts-design.md](../superpowers/specs/2026-03-29-editorial-mts-design.md) - Editorial MTS 设计

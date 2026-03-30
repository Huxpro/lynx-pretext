# MainThread Touch Event 陷阱

本文档记录在使用 Lynx Main Thread Script (MTS) 处理触摸事件时遇到的问题，特别是 `MainThread.Touch.identifier` 相关的陷阱。

## 问题现象

在 MTS 中实现拖拽功能时，拖拽过程中 orb 不会跟随手指移动，而是在手指抬起时 "jump" 到最终位置。

## 问题代码

```tsx
function handleTouchStartMT(event: MainThread.TouchEvent): void {
  'main thread'
  const touch = event.touches[0]
  if (!touch) return

  // 保存 touch identifier 用于后续匹配
  touchIdMT.current = touch.identifier
  // ...
}

function handleTouchMoveMT(event: MainThread.TouchEvent): void {
  'main thread'
  const dragIndex = dragOrbIndexMT.current
  if (dragIndex === -1) return

  // ❌ 问题：通过 identifier 匹配 touch 失败
  let touch = null
  for (let i = 0; i < event.touches.length; i++) {
    const candidate = event.touches[i]!
    if (candidate.identifier === touchIdMT.current) {
      touch = candidate
      break
    }
  }
  if (touch === null) {
    // 匹配失败，跳过位置更新！
    return
  }

  // 更新位置...
  orb.x = dragStartOrbXMT.current + (touch.clientX - dragStartXMT.current)
  orb.y = dragStartOrbYMT.current + (touch.clientY - dragStartYMT.current)
}
```

## 根本原因

`MainThread.Touch.identifier` 在 `touchmove` 事件中**无法正确匹配**，可能原因：

1. **类型问题**：`identifier` 可能是 `string` 而非 `number`，比较时类型不匹配
2. **值不稳定**：不同事件中同一个 touch 的 identifier 可能不一致
3. **Lynx 实现问题**：MTS 触摸事件的 identifier 行为与 Web 标准不一致

## 解决方案

对于单指拖拽场景，直接使用 `event.touches[0]`，不依赖 identifier 匹配：

```tsx
function handleTouchMoveMT(event: MainThread.TouchEvent): void {
  'main thread'
  const dragIndex = dragOrbIndexMT.current
  if (dragIndex === -1) return

  // ✅ 直接用第一个 touch，单指拖拽足够
  const touch = event.touches.length > 0 ? event.touches[0]! : null
  if (touch === null) return

  const orb = orbsMT.current[dragIndex]
  if (!orb) return
  orb.x = dragStartOrbXMT.current + (touch.clientX - dragStartXMT.current)
  orb.y = dragStartOrbYMT.current + (touch.clientY - dragStartYMT.current)
}
```

## 相关文件

- `pages/demos/editorial-mts.tsx` - 已修复
- `pages/demos/editorial-engine.tsx` - 已修复

## 建议 Lynx 改进

1. **文档说明**：在 MTS 文档中明确说明 `MainThread.Touch.identifier` 的行为和限制
2. **类型检查**：确保 `identifier` 类型一致（建议统一为 `number`）
3. **行为对齐**：MTS 触摸事件行为应与 Web 标准对齐

## 其他 MTS 触摸事件注意事项

### 1. 必须使用 `main-thread:` 前缀

```tsx
// ❌ 错误：事件在 BTS 触发，有延迟
<view bindtouchstart={handleTouchStartMT} />

// ✅ 正确：事件在 MTS 触发，零延迟
<view main-thread:bindtouchstart={handleTouchStartMT} />
```

### 2. TDZ 问题 - 函数声明顺序

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

### 3. `runOnMainThread` vs `runOnBackground`

| API | 调用位置 | 目标线程 |
|-----|---------|----------|
| `runOnMainThread(fn)` | BTS | BTS → MTS |
| `runOnBackground(fn)` | MTS | MTS → BTS |

**常见错误**：在 BTS 中调用 `runOnBackground`：

```tsx
// ❌ 错误：在 BTS (handleLayout) 中调用 runOnBackground
const handleLayout = useCallback((e: any) => {
  // ...
  void runOnBackground(initMT)(...) // Error!
}, [])

// ✅ 正确：在 BTS 中调用 runOnMainThread
const handleLayout = useCallback((e: any) => {
  // ...
  void runOnMainThread(initMT)(...)
}, [])
```

## 参考文档

- [mts-bts-architecture-patterns.md](./mts-bts-architecture-patterns.md) - MTS/BTS 架构模式对比
- [mts-shared-module-pitfalls.md](./mts-shared-module-pitfalls.md) - Shared module 的坑

# Lynx MTS ASCII Art 渲染技术细节

> 基于 `wireframe-torus.tsx` 的实现经验

## 概述

在 Lynx 中实现 ASCII Art 实时渲染需要解决几个关键问题：
1. 没有 Canvas，需要用 DOM 元素（`<text>`）来显示字符
2. 等宽字体的字符实际宽度可能不一致，需要测量
3. 所有动画计算需要在 MTS 完成以保证 60fps

---

## 1. 字符宽度测量与自适应布局

### 问题
ASCII Art 依赖精确的字符网格，但即使是等宽字体，不同字符的实际宽度也可能有细微差异（如空格 vs 字母）。

### 解决方案
使用 pretext 的 `prepareWithSegments` 在 MTS 中测量每个字符的实际宽度：

```ts
import { prepareWithSegments } from '../../src/layout' with { runtime: 'shared' }

function initCharWidths(): void {
  'main thread'
  if (charWidthsMT.current !== null) return
  const font = `${FONT_SIZE}px`
  const widths: number[] = []
  for (let i = 0; i < RAMP_LEN; i++) {
    const ch = BRIGHTNESS_RAMP[i]!
    if (ch === ' ') {
      widths.push(FONT_SIZE * 0.27)  // 空格特殊处理
      continue
    }
    const p = prepareWithSegments(ch, font)
    const w = (p as any).widths && (p as any).widths.length > 0 
      ? (p as any).widths[0] 
      : FONT_SIZE * 0.5
    widths.push(w > 0 ? w : FONT_SIZE * 0.5)
  }
  charWidthsMT.current = widths
  
  // 计算平均宽度和最大宽度
  let sum = 0, cnt = 0, maxW = 0
  for (let i = 1; i < widths.length; i++) {
    sum += widths[i]!; cnt++
    if (widths[i]! > maxW) maxW = widths[i]!
  }
  avgCharWidthMT.current = cnt > 0 ? sum / cnt : FONT_SIZE * 0.5
  maxCharWidthMT.current = maxW > 0 ? maxW : FONT_SIZE * 0.8
}
```

### 自适应列数计算
根据容器宽度和平均字符宽度动态计算列数：

```ts
function updateGrid(): void {
  'main thread'
  // 平均宽度 + 10% 边距 — 偶尔轻微溢出可接受
  colsMT.current = Math.min(MAX_COLS, Math.floor(pageWidthMT.current / (avgCharWidthMT.current * 1.1)))
  rowsMT.current = Math.min(MAX_ROWS, Math.floor(pageHeightMT.current / LINE_HEIGHT))
}
```

---

## 2. 元素池模式

### 问题
每帧创建/销毁 DOM 元素代价太高，需要复用固定数量的元素。

### 解决方案
创建固定大小的 `<text>` 元素池（一行一个），通过 `setAttribute('text', ...)` 更新内容：

```tsx
// 创建 80 行的元素池
const MAX_ROWS = 80
const rowRefs: any[] = []
for (let i = 0; i < MAX_ROWS; i++) {
  rowRefs.push(useMainThreadRef<MainThread.Element>(null))
}

// 渲染时更新每一行的文本
function renderFrame(now: number): void {
  'main thread'
  const ROWS = rowsMT.current
  const COLS = colsMT.current
  
  for (let r = 0; r < ROWS; r++) {
    let rowText = ''
    for (let c = 0; c < COLS; c++) {
      const brightness = buf[r * COLS + c]!
      if (brightness < 0.02) {
        rowText += ' '
      } else {
        const idx = Math.min(RAMP_LEN - 1, Math.floor(brightness * RAMP_LEN))
        rowText += BRIGHTNESS_RAMP[idx]!
      }
    }
    const el = rowRefs[r]!.current
    if (el) {
      el.setAttribute('text', rowText)
    }
  }
}
```

### JSX 结构
```tsx
<view style={{ width: '100%', height: `${pageHeight}px`, overflow: 'hidden' }}>
  {Array.from({ length: MAX_ROWS }, (_, i) => (
    <view key={`r-${i}`} style={{ height: `${LINE_HEIGHT}px` }}>
      <text
        main-thread:ref={rowRefs[i]}
        style={{
          fontSize: `${FONT_SIZE}px`,
          lineHeight: `${LINE_HEIGHT}px`,
          color: '#3c9c78',
          fontFamily: 'Menlo, Courier, monospace',
        }}
      > </text>
    </view>
  ))}
</view>
```

**注意**：不需要 `display: 'none'`，空行在黑色背景上天然不可见。

---

## 3. 逐行动态辉光效果

### 实现
根据每行的最大亮度动态设置颜色：

```ts
function renderFrame(now: number): void {
  'main thread'
  // ... 计算亮度缓冲区 ...
  
  for (let r = 0; r < ROWS; r++) {
    let rowText = ''
    let maxB = 0  // 记录该行最大亮度
    for (let c = 0; c < COLS; c++) {
      const b = buf[r * COLS + c]!
      if (b > maxB) maxB = b
      // ... 构建 rowText ...
    }
    const el = rowRefs[r]!.current
    if (el) {
      el.setAttribute('text', rowText)
      
      // 辉光效果：亮行用鲜艳青色，暗行用暗淡蓝灰色
      const glow = Math.max(0.15, Math.min(1, maxB * 1.5))
      const rr = Math.round(20 + glow * 60)
      const gg = Math.round(60 + glow * 195)
      const bb = Math.round(80 + glow * 140)
      el.setStyleProperty('color', `rgb(${rr},${gg},${bb})`)
    }
  }
}
```

---

## 4. 预计算优化

### 问题
甜甜圈的顶点计算涉及大量三角函数，每帧计算会浪费 CPU。

### 解决方案
在模块级别（BTS 执行）预计算基础顶点：

```ts
// 模块级别预计算（只执行一次）
const baseVerts: { x: number; y: number; z: number }[][] = []
for (let i = 0; i < U_STEPS; i++) {
  const row: { x: number; y: number; z: number }[] = []
  const u = (i / U_STEPS) * TWO_PI
  const cu = Math.cos(u), su = Math.sin(u)
  for (let j = 0; j < V_STEPS; j++) {
    const v = (j / V_STEPS) * TWO_PI
    const cv = Math.cos(v), sv = Math.sin(v)
    row.push({
      x: (MAJOR_R + MINOR_R * cv) * cu,
      y: (MAJOR_R + MINOR_R * cv) * su,
      z: MINOR_R * sv
    })
  }
  baseVerts.push(row)
}
```

然后在 MTS 中只进行旋转和投影：

```ts
function renderFrame(now: number): void {
  'main thread'
  const t = now / 1000
  const ay = t * 0.5, ax = t * 0.3 + Math.sin(t * 0.1) * 0.4
  
  // 使用预计算的 baseVerts 进行旋转和投影
  for (let i = 0; i < U_STEPS; i++) {
    for (let j = 0; j < V_STEPS; j++) {
      let p = baseVerts[i]![j]!
      // 只进行旋转矩阵乘法...
    }
  }
}
```

---

## 5. FPS 统计的跨线程同步

### 实现
同时在 MTS 和 BTS 显示 FPS：

```ts
const fpsFrameCountMT = useMainThreadRef(0)
const fpsLastTimeMT = useMainThreadRef(0)
const statsRef = useMainThreadRef<MainThread.Element>(null)

function tick(ts: number): void {
  'main thread'
  fpsFrameCountMT.current++
  const now = Date.now()
  if (fpsLastTimeMT.current === 0) fpsLastTimeMT.current = now
  const fpsElapsed = now - fpsLastTimeMT.current
  
  if (fpsElapsed >= 500) {
    const fps = Math.round((fpsFrameCountMT.current / fpsElapsed) * 1000)
    fpsFrameCountMT.current = 0
    fpsLastTimeMT.current = now
    
    // MTS 直接更新 DOM
    if (statsRef.current) {
      statsRef.current.setAttribute('text', `${colsMT.current}×${rowsMT.current} | ${fps} fps`)
    }
    
    // 同步到 BTS state（用于 React 渲染）
    runOnBackground(setFpsDisplay)(fps)
  }
  
  renderFrame(ts)
  requestAnimationFrame(tick)
}
```

---

## 6. 字符亮度映射表

ASCII Art 的核心是根据亮度选择合适密度的字符：

```ts
// 从暗到亮的字符表（按视觉密度排序）
const BRIGHTNESS_RAMP = ' .`\'-,:;~"!^*+<>/\\|(){}[]?7czs1oJCLYt3eax2ESwqkZXdbKW#B8R&NMQ0g@'

// 映射亮度到字符
const idx = Math.min(RAMP_LEN - 1, Math.floor(brightness * RAMP_LEN))
const char = BRIGHTNESS_RAMP[idx]!
```

---

## 总结

| 技术点 | 实现方式 |
|--------|----------|
| 字符宽度测量 | `prepareWithSegments` + MTS 懒初始化 |
| 自适应布局 | 根据平均字符宽度动态计算行列数 |
| 元素池 | 固定数量 `<text>`，通过 `setAttribute('text', ...)` 更新 |
| 动态样式 | `setStyleProperty('color', ...)` 实现逐行辉光 |
| 性能优化 | 模块级别预计算顶点，MTS 只做旋转投影 |
| FPS 统计 | MTS 更新 DOM + `runOnBackground` 同步 BTS |

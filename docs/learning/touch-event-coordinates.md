# 触摸事件坐标系统：clientX/Y vs pageX/Y

本文档详细解释 Web 和 Lynx 中触摸事件坐标系统的差异，以及如何正确选择 `clientX/Y` 和 `pageX/Y`。

## 问题背景

在开发 `examples/editorial` 时发现，在非全屏模式下，使用 `clientX/clientY` 处理触摸事件存在坐标偏差问题。通过对比 `vue-lynx/examples/7guis/circle-drawer` 的实现，发现使用 `pageX/pageY` 可以获得更一致的行为。

## Web 标准中的坐标系统

### clientX / clientY

- **参考系**：浏览器视口（viewport）
- **原点**：视口左上角 (0, 0)
- **特点**：不受页面滚动影响，坐标始终相对于当前可见区域
- **适用场景**：fixed 定位元素、全屏应用、相对移动计算

### pageX / pageY

- **参考系**：整个文档（document）
- **原点**：文档左上角 (0, 0)
- **特点**：受页面滚动影响，包含滚动偏移量
- **计算关系**：`pageY = clientY + window.scrollY`
- **适用场景**：absolute 定位元素、可滚动页面、绘图应用

### 示例对比

```javascript
// 页面滚动前
clientY: 100, scrollY: 0, pageY: 100

// 页面向下滚动 200px 后
clientY: 100, scrollY: 200, pageY: 300
```

## 使用场景指南

### 应该使用 clientX/Y 的场景

#### 1. Fixed 定位元素

```javascript
// 拖拽一个 fixed 定位的模态框
function onDrag(e) {
  const modal = document.querySelector('.fixed-modal');
  modal.style.left = e.clientX + 'px';
  modal.style.top = e.clientY + 'px';
}
```

#### 2. 相对移动计算（差值计算）

```javascript
// 只关心移动距离，不关心绝对位置
let startX, startY;

function onTouchStart(e) {
  startX = e.clientX; // 或 e.pageX，差值相同
  startY = e.clientY;
}

function onTouchMove(e) {
  const deltaX = e.clientX - startX;
  const deltaY = e.clientY - startY;
  // 使用 deltaX, deltaY 更新位置
}
```

#### 3. 全屏应用或无滚动页面

```javascript
// 游戏画布、全屏展示等
canvas.addEventListener('touchstart', (e) => {
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
});
```

### 应该使用 pageX/Y 的场景

#### 1. 可滚动页面中的绝对定位

```javascript
// 在长页面中创建元素
function createPopup(e) {
  const popup = document.createElement('div');
  popup.style.position = 'absolute';
  popup.style.left = e.pageX + 'px';
  popup.style.top = e.pageY + 'px';
  document.body.appendChild(popup);
}
```

#### 2. 绘图应用、标注工具

```javascript
// 在可滚动画布上绘制
function onDraw(e) {
  const x = e.pageX - canvas.offsetLeft;
  const y = e.pageY - canvas.offsetTop;
  drawPoint(x, y);
}
```

#### 3. 需要保存/恢复位置的场景

```javascript
// 保存点击位置，后续可能滚动页面
function saveClickPosition(e) {
  localStorage.setItem('lastClick', JSON.stringify({
    x: e.pageX,
    y: e.pageY
  }));
}
```

## Lynx 中的特殊情况

### 全屏模式 (`?fullscreen=true`)

在全屏模式下：
- `clientX/Y` 和 `pageX/Y` 通常**值相同**
- 因为没有浏览器 UI，视口 = 文档
- 两者可以互换使用

### 非全屏模式

在非全屏模式下：
- 可能存在视口偏移（Lynx 视口可能不是从屏幕左上角开始）
- `pageX/Y` 行为更稳定，因为它相对于整个页面
- **推荐使用 `pageX/Y`**

### 实际案例：editorial 示例

#### 问题代码（使用 clientX/Y）

```typescript
// examples/editorial/src/editorial-engine-mts.tsx
function handleTouchStartMT(event: MainThread.TouchEvent): void {
  'main thread'
  const touch = event.touches[0]
  if (!touch) return

  // ❌ 在非全屏模式下可能有偏差
  const hitIndex = hitTestOrbIndex(touch.clientX, touch.clientY)
  dragStartXMT.current = touch.clientX
  dragStartYMT.current = touch.clientY
}
```

#### 修复后（使用 pageX/Y）

```typescript
function handleTouchStartMT(event: MainThread.TouchEvent): void {
  'main thread'
  const touch = event.touches[0]
  if (!touch) return

  // ✅ 在全屏和非全屏模式下行为一致
  const hitIndex = hitTestOrbIndex(touch.pageX, touch.pageY)
  dragStartXMT.current = touch.pageX
  dragStartYMT.current = touch.pageY
}
```

## 决策流程图

```
开始
  │
  ├─ 页面是否可滚动？
  │   ├─ 是 → 使用 pageX/Y
  │   └─ 否 ↓
  │
  ├─ 元素是否 fixed 定位？
  │   ├─ 是 → 使用 clientX/Y
  │   └─ 否 ↓
  │
  ├─ 是否只需要相对移动距离？
  │   ├─ 是 → 两者皆可（推荐 clientX/Y）
  │   └─ 否 ↓
  │
  └─ 是否在 Lynx 环境中？
      ├─ 是 → 使用 pageX/Y（跨模式一致性更好）
      └─ 否 → 根据定位方式选择
```

## 最佳实践总结

### 通用原则

| 场景 | 推荐使用 | 原因 |
|------|---------|------|
| 固定元素拖拽 | `clientX/Y` | 相对于视口定位 |
| 可滚动页面中的绝对定位 | `pageX/Y` | 包含滚动偏移 |
| 相对移动计算 | 两者皆可 | 差值相同 |
| 全屏应用 | 两者皆可 | 值相同 |
| **Lynx 应用** | **`pageX/Y`** | **跨模式一致性更好** |
| Canvas 绘图（无滚动） | `clientX/Y` | 相对于视口 |
| Canvas 绘图（有滚动） | `pageX/Y` | 相对于文档 |

### Lynx 特定建议

```typescript
// ✅ 推荐：命中测试、绝对定位、跨全屏/非全屏一致性场景优先使用 pageX/Y
function handleTouch(e: MainThread.TouchEvent): void {
  'main thread'
  const touch = e.touches[0]
  if (!touch) return

  const x = touch.pageX
  const y = touch.pageY
  // ...
}
```

### 相对移动的特殊情况

对于拖拽等只需要相对移动的场景，如果手势期间页面滚动和视口偏移保持不变，使用差值计算时两者等效：

```typescript
// 当手势期间 scroll/viewport offset 不变时，以下两种写法效果相同
const deltaX1 = e.clientX - startX  // 使用 clientX
const deltaX2 = e.pageX - startX    // 使用 pageX

// 因为 scrollX 在差值计算中被抵消
// pageX - startX = (clientX + scrollX) - (startClientX + scrollX) = clientX - startClientX
```

如果页面可能在手势过程中滚动，或者容器的视口偏移会变化，那么两者的差值就不再等效：

```typescript
// 手势开始后页面向右滚动了 30px
const clientDeltaX = move.clientX - start.clientX
const pageDeltaX = move.pageX - start.pageX

// 此时 pageDeltaX = clientDeltaX + 30
```

因此：

- 只做相对位移，且能保证手势期间不会滚动：`clientX/Y` 和 `pageX/Y` 都可以
- 需要绝对坐标、命中测试、保存位置，或希望兼容全屏/非全屏模式：优先使用 `pageX/Y`

## 相关文件

- `examples/editorial/src/editorial-engine-mts.tsx` - 已修复，使用 `pageX/Y`
- `examples/editorial/src/main.tsx` - 已修复，使用 `pageX/Y`
- `docs/learning/mts-touch-event-pitfalls.md` - MTS 触摸事件其他陷阱

## 参考资料

- [MDN: Touch.clientX](https://developer.mozilla.org/en-US/docs/Web/API/Touch/clientX)
- [MDN: Touch.pageY](https://developer.mozilla.org/en-US/docs/Web/API/Touch/pageY)
- [Lynx Main Thread Script 文档](https://lynxjs.org/next/guide/interaction/main-thread-script/quick-start.html)

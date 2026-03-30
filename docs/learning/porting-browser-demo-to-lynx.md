# 从浏览器 Demo 移植到 Lynx 的实战教训

> 2026-03-29 ~ 03-30 | 项目：lynx-pretext editorial-engine demo

## 背景

把 `~/github/lynx-pretext-editorial` 的 editorial-engine demo（一个带动画光球、双栏文字回流、pull quote 的杂志排版页面）移植到 Lynx。原始代码面向浏览器 React，需要适配 ReactLynx 的双线程架构。

---

## 问题 1：白屏 — 空 view 的 `flex: 1` 在 Lynx 里高度为 0

### 现象

页面完全白屏。`pnpm build` 通过，TypeScript 无报错。

### 排查过程

1. 第一反应猜 CSS 数值缺 `'px'`，修了但仍然白屏
2. 猜测动画模式（`setTimeout` vs `requestAnimationFrame`）有问题，对比 dynamic-layout demo 花了大量时间。用户指出 dynamic-layout-bts 也用 setState 每帧更新且正常 → 排除
3. 砍到最小化组件仍然白屏，但 devtool 截图超时让我误以为是组件问题（实际是 devtool 本身坏了）
4. **转折点：加 `console.info` 定位**。发现 `bindlayoutchange` 回调参数是 `{width: 393, height: 0}`

### 根因

组件初始化时条件渲染了一个空的 `<view />`（自闭合，无子元素）：

```tsx
if (viewportW <= 0 || viewportH <= 0) {
  return <view style={{ flex: 1, backgroundColor: '#0c0c10' }} bindlayoutchange={handleLayout} />
}
```

在 Lynx 中，`flex: 1` 等价于 `flexGrow: 1, flexShrink: 1, flexBasis: 0`。无子元素 + `flexBasis: 0` = 高度 0。`bindlayoutchange` 报 `height: 0`，handler 里 `if (height <= 0) return` 直接跳过，组件永远不会进入第二次渲染。

对比：所有正常工作的 demo 的根 view 都有子元素，不存在"空 view + flex: 1"的情况。

### 解法

```tsx
<view style={{ flex: 1, height: '100%', backgroundColor: '#0c0c10' }} bindlayoutchange={handleLayout} />
```

加 `height: '100%'` 让空 view 也能获得父容器高度。两处都要加（初始渲染 + 正式渲染）。

### 教训

- **白屏 ≠ 渲染错误。白屏 = 没渲染。** 应先确认组件是否执行到渲染阶段。
- **不要猜，先 `console.info`。** 在关键路径加日志（module load、render start、handler fired + 参数），5 分钟就定位了前面 2 小时没找到的问题。
- **Lynx 的 flexbox 行为和浏览器有细微差异。** 空 view 的 `flex: 1` 不能假设会自动撑满。

---

## 问题 2：渲染了但看不到 — CSS 数值缺 `'px'` 单位

### 现象

`console.info` 显示 "full render 393 764"（组件正常执行），但屏幕上什么都没有。

### 根因

Lynx 的样式系统要求所有长度值为字符串 + `'px'` 后缀。裸数字不生效：

```tsx
// 不生效 ❌
left: 42, top: 100, fontSize: 16

// 正确 ✅
left: '42px', top: '100px', fontSize: '16px'
```

所有绝对定位的文字行和光球都定位在 (0, 0) 或者尺寸为 0，所以视觉上不可见。

### 解法

所有 JSX 中的 `left`、`top`、`width`、`height`、`fontSize`、`lineHeight`、`borderRadius`、`letterSpacing`、`borderLeftWidth`、`paddingLeft` 等属性改用模板字符串：

```tsx
left: `${line.x}px`,
top: `${line.y}px`,
fontSize: `${BODY_FONT_SIZE}px`,
```

### 教训

- 项目 git history 里已经有一个 commit `fix: add 'px' units to all bare numeric CSS values`。应该先检查已有的修复历史。
- `flex: 1` 不需要 `'px'`（它不是长度属性），但几乎所有其他数值型样式属性都需要。

---

## 问题 3：Main-thread touch + Background-thread render 的跨线程状态同步

### 现象

拖拽光球时，background-thread touch handler 延迟严重（球已经移走了才响应），很难抓住。

### 第一次修复（不完整）

直接把 touch handler 搬到 main thread，用 `useMainThreadRef` 存 drag state，用 `main-thread:bindtouchstart/move/end` 绑定。

**新问题：** 两处跨线程 MainThreadRef 违规：

1. `orbsMT.current = orbs` — background thread（handleLayout）写 MainThreadRef → 报错 `MainThreadRef: value of a MainThreadRef cannot be accessed in the background thread`
2. `dragOrbIndexMT.current` — background thread（animation tick）读 MainThreadRef → 同上

### 第二次修复（错误方向）

用 `runOnMainThread` 序列化传递 orbs 数组。但 **序列化创建了副本**，主线程 touch handler 修改的是副本，background-thread render 读的是原数组 → 拖拽位置变化传不过去。

### 正确的架构

Main-thread touch 处理命中判定和 drag 计算（零延迟），通过 `runOnBackground` 把结果同步回 background-thread state：

```
┌─────────────────────────────────────────────┐
│ Main Thread                                  │
│                                              │
│  touchstart → hit test on orbsMT             │
│             → set dragOrbIndexMT             │
│             → runOnBackground(onDragStart)   │
│                                              │
│  touchmove  → compute new x,y from drag      │
│             → update orbsMT[i].x/y           │
│             → runOnBackground(onDragMove)    │
│                                              │
│  touchend   → clear drag state               │
│             → runOnBackground(onDragEnd)     │
└──────────────────────┬──────────────────────┘
                       │ runOnBackground (async, ~1 frame)
┌──────────────────────▼──────────────────────┐
│ Background Thread                            │
│                                              │
│  onDragStart → dragIdxRef.current = index    │
│  onDragMove  → orbsRef.current[i].x/y = ... │
│  onDragEnd   → dragIdxRef.current = -1       │
│                                              │
│  animation tick (setTimeout 16ms):           │
│    read dragIdxRef (普通 useRef, BTS 可读)   │
│    skip dragged orb in physics               │
│    setRenderTick(n+1) → React re-render      │
└─────────────────────────────────────────────┘
```

关键点：
- `orbsMT`（MainThreadRef）和 `orbsRef`（useRef）是**两份独立的数据**，通过 `runOnBackground` 显式同步
- `dragIdxRef` 是普通 `useRef`，animation tick 可以直接读
- 延迟最多一帧（16ms），但 touch 事件本身在主线程即时处理

### 教训

- **`useMainThreadRef` 的 `.current` 不能在 background thread 读写。** 这不是 warning，是硬错误，会中断执行。
- **跨线程传对象会序列化。** `runOnMainThread(fn)(obj)` 传递的是 JSON 副本，不是共享引用。不能靠 "同一个对象" 实现跨线程通信。
- **需要两套 state + 显式桥接。** Main thread 用 `useMainThreadRef`，background thread 用 `useRef`，通过 `runOnBackground` / `runOnMainThread` 同步。

---

## 问题 4：全量 MTS 重写失败 — `TypeError: not a function`

### 现象

把整个组件改成纯 MTS（所有布局计算和动画都在 main thread，React 只渲染一次静态 element pool）后报错：

```
main-thread.js exception: TypeError: not a function
```

### 没有解决

错误指向编译后的 `main-thread.js:391:159`，无法映射回源码。尝试过：
- 把 `fitHeadline` 从模块级搬到组件内（消除 callback 参数）
- 改变函数定义顺序

但错误行号不变，说明问题在其他位置。由于 MTS 无法直接调试（参见 `mts-shared-module-pitfalls.md`），暂时放弃 MTS 方案，保留 BTS + main-thread touch 的混合架构。

---

## 总结：Debug 方法论

### ❌ 失败的方法

| 做法 | 为什么失败 |
|------|-----------|
| 凭直觉猜原因（猜 px、猜动画模式） | 跳过了定位步骤，浪费大量时间在错误方向 |
| 对比两个 codebase 找差异 | 差异太多，无法确定哪个是关键差异 |
| 砍代码到最小化 + devtool 截图验证 | devtool 截图本身坏了，导致误判 |
| 假设 warning 不影响功能 | Lynx 的 MainThreadRef 跨线程访问是硬错误 |
| 假设跨线程传对象是共享引用 | 实际是 JSON 序列化副本 |

### ✅ 有效的方法

| 做法 | 为什么有效 |
|------|-----------|
| `console.info` 在关键路径打日志 | 5 分钟定位到 `height: 0` 问题 |
| 打印 event handler 参数的实际值 | 立刻看到 `{width: 393, height: 0}` |
| 分层验证（先确认渲染，再确认样式，再确认交互） | 每层独立验证，不混淆问题 |
| 参考同项目已有的 working demo 的模式 | `editorial-mts.tsx` 提供了正确的 MTS 架构参考 |

### 核心原则

> **先定位，后分析。** 不要猜原因。加日志确认执行到了哪一步、关键变量的值是什么，然后根据事实分析。

# Lynx Pretext Agent Guide

> 本文档为 AI Agent 提供项目学习资源的导航入口。

## Learning Materials Catalog

详细的技术文档位于 [`docs/learning/`](docs/learning/) 目录：

### 架构与模式

| 文档 | 描述 |
|------|------|
| [mts-bts-architecture-patterns.md](docs/learning/mts-bts-architecture-patterns.md) | MTS/BTS 双线程架构模式对比，包含 `runOnMainThread`/`runOnBackground` API 使用 |
| [bts-mts-compatible-components.md](docs/learning/bts-mts-compatible-components.md) | 编写 BTS/MTS 双兼容组件的最佳实践，`main-thread:ref` 类型陷阱 |
| [mts-shared-module-pitfalls.md](docs/learning/mts-shared-module-pitfalls.md) | `with { runtime: 'shared' }` 共享模块的实战踩坑记录 |

### 渲染技术

| 文档 | 描述 |
|------|------|
| [ascii-art-rendering.md](docs/learning/ascii-art-rendering.md) | MTS ASCII Art 渲染技术：字符宽度测量、自适应布局、60fps 动画 |
| [lynx-flexbox-centering-pitfall.md](docs/learning/lynx-flexbox-centering-pitfall.md) | Flexbox 居中陷阱：`flex: 1` vs `height: '100%'` |

### 事件处理

| 文档 | 描述 |
|------|------|
| [mts-touch-event-pitfalls.md](docs/learning/mts-touch-event-pitfalls.md) | MainThread 触摸事件陷阱，特别是 `MainThread.Touch.identifier` 相关问题 |
| [touch-event-coordinates.md](docs/learning/touch-event-coordinates.md) | 触摸事件坐标系统：`clientX/Y` vs `pageX/Y` 的选择指南 |

### 移植指南

| 文档 | 描述 |
|------|------|
| [porting-browser-demo-to-lynx.md](docs/learning/porting-browser-demo-to-lynx.md) | 从浏览器 Demo 移植到 Lynx 的实战教训：布局、样式、动画适配 |

---

## Quick Reference

### 关键 API

```ts
// 线程间通信
runOnMainThread(fn)()  // BTS → MTS
runOnBackground(fn)()  // MTS → BTS

// 共享模块
import { prepareWithSegments } from 'lynx-pretext' with { runtime: 'shared' }

// 主线程函数声明
function myMTSFunction(): void {
  'main thread'
  // ...
}
```

### 常见陷阱

1. **TDZ 问题**: `'main thread'` 函数内访问闭包变量可能触发 "lexical variable is not initialized"
2. **空 view 高度**: Lynx 中空 `<view style={{ flex: 1 }} />` 高度为 0
3. **Touch identifier**: MTS 中 `touch.identifier` 可能不稳定，建议用 index 匹配
4. **Flexbox 居中**: `flex: 1` 不能正确撑开高度，需用 `height: '100%'` 配合 `justifyContent: 'center'`
5. **触摸坐标**: Lynx 中做命中测试、绝对定位或跨全屏/非全屏兼容时优先用 `pageX/pageY`；若只做相对位移且手势期间不会滚动，`clientX/clientY` 也可

---

详见各文档获取完整信息。

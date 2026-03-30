# lynx-pretext

将 [chenglou/pretext](https://github.com/chenglou/pretext) 文本布局引擎移植到 Lynx 平台的项目。

## 项目概述

这是一个纯 JavaScript 文本测量与布局库，运行在 Lynx 主线程上。它提供了浏览器端 Pretext 的核心功能，但针对 Lynx 平台进行了适配。

## 核心差异对比

### 1. 测量后端（关键差异）

| 特性 | 原始 Pretext (Browser) | Lynx Pretext |
|------|------------------------|--------------|
| **测量 API** | Canvas `measureText()` | `lynx.getTextInfo()` |
| **运行环境** | 浏览器主线程/Worker | Lynx 主线程 |
| **字体设置** | `ctx.font = font` | 通过 `fontSize`/`fontFamily` 参数 |
| **Emoji 校正** | 自动检测并校正 Canvas/DOM 差异 | 暂不支持（MVP 版本） |

### 2. 代码文件对比

| 文件 | 原始 Pretext | Lynx Pretext | 复用率 |
|------|-------------|--------------|--------|
| `analysis.ts` | 1,008 行 | ~1,016 行 | ~95% |
| `line-break.ts` | ~1,056 行 | ~1,056 行 | ~98% |
| `layout.ts` | 718 行 | 621 行 | ~85% |
| `measurement.ts` | 232 行 | 149 行 | ~60%（主要适配点） |

### 3. 平台适配层

Lynx Pretext 新增了以下适配文件：

- **`intl-shim.ts`** (6 行): 为 PrimJS 提供 `Intl` 全局对象 polyfill
- **`segmenter-polyfill.ts`** (102 行): 轻量级 `Intl.Segmenter` 替代实现（PrimJS 的 `@formatjs/intl-segmenter` 会崩溃）
- **`rspeedy-env.d.ts`** (12 行): Lynx/Rspeedy 环境 TypeScript 声明

### 4. 功能差异

| 功能 | 原始 Pretext | Lynx Pretext |
|------|-------------|--------------|
| **双向文本 (Bidi)** | 完整支持 | MVP 版本返回 `null`（stub） |
| **Emoji 宽度校正** | 支持（Canvas vs DOM 差异） | 暂不支持（返回 0） |
| **浏览器引擎配置** | Safari/Chromium 差异化处理 | 固定默认值 |
| **系统字体检测** | 支持 `system-ui` 等 | 依赖 Lynx 底层实现 |

### 5. 架构一致性

两个项目共享相同的两阶段架构：

```
┌─────────────────┐     ┌─────────────────┐
│  Prepare Phase  │ ──▶ │  Layout Phase   │
│  (文本首次出现)  │     │  (每次 resize)  │
└─────────────────┘     └─────────────────┘
        │                        │
        ▼                        ▼
  - 文本分析/分段            纯算术计算
  - 测量每个片段宽度          遍历缓存的宽度
  - 缓存结果                 计算行数和高度
```

核心类型定义保持一致：
- `SegmentBreakKind`: `'text' | 'space' | 'preserved-space' | 'tab' | 'glue' | 'zero-width-break' | 'soft-hyphen' | 'hard-break'`
- `PreparedText` / `PreparedTextWithSegments`
- `LayoutCursor` / `LayoutLine` / `LayoutResult`

### 6. API 兼容性

主要 API 保持一致：

```typescript
// 准备阶段（两个项目相同）
const prepared = prepare(text, font, options)
const preparedWithSegments = prepareWithSegments(text, font, options)

// 布局阶段（两个项目相同）
const result = layout(prepared, maxWidth, lineHeight)
const { lines } = layoutWithLines(preparedWithSegments, maxWidth, lineHeight)

// 逐行布局（两个项目相同）
const line = layoutNextLine(preparedWithSegments, cursor, maxWidth)
```

## 核心代码复用率总结

- **分析层 (`analysis.ts`)**: ~95% 复用，主要是导入路径调整
- **断行层 (`line-break.ts`)**: ~98% 复用，几乎直接移植
- **布局层 (`layout.ts`)**: ~85% 复用，移除浏览器特定功能
- **测量层 (`measurement.ts`)**: ~60% 复用，主要适配点（Canvas → Lynx API）

**整体复用率**: 约 85-90% 的核心逻辑直接复用，主要差异集中在平台适配层。

## 技术细节

### 原始 Pretext 测量方式
```typescript
// 浏览器版本使用 Canvas
const ctx = getMeasureContext() // OffscreenCanvas 或 DOM Canvas
ctx.font = font
const width = ctx.measureText(segment).width
```

### Lynx Pretext 测量方式
```typescript
// Lynx 版本使用主线程 API
const info = { fontSize: currentFontSizeStr }
if (currentFontFamily) info.fontFamily = currentFontFamily
const result = lynx.getTextInfo(segment, info)
const width = result.width
```

### 验证策略

使用 Lynx 原生 `getTextInfo` 的 `maxWidth` 模式作为验证基准：

```typescript
// 原生 oracle
const native = lynx.getTextInfo(text, { fontSize, fontFamily, maxWidth })
// native.content = ['line 1 text', 'line 2 text', ...]

// 我们的实现
const { lines } = layoutWithLines(prepared, maxWidthPx, lineHeight)
// lines[i].text 应该与 native.content[i] 匹配
```

## 项目结构

```
lynx-pretext/
├── src/
│   ├── analysis.ts          # 文本分析/分段（复用 pretext）
│   ├── line-break.ts        # 断行算法（复用 pretext）
│   ├── layout.ts            # 布局 API（复用 pretext）
│   ├── measurement.ts       # 测量层（Lynx 适配）
│   ├── intl-shim.ts         # PrimJS Intl polyfill（新增）
│   ├── segmenter-polyfill.ts # Intl.Segmenter 替代（新增）
│   └── ...
├── pages/
│   └── demos/               # 示例页面（移植中）
└── docs/
    └── learning/            # 学习笔记和迁移指南
```

## 相关项目

- [chenglou/pretext](https://github.com/chenglou/pretext) - 原始浏览器端文本布局引擎
- [Lynx](https://lynxjs.org/) - 跨端框架

## License

与原始 Pretext 项目保持一致

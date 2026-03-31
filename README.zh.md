# lynx-pretext

将 [chenglou/pretext](https://github.com/chenglou/pretext) 文本布局引擎移植到 [Lynx](https://lynxjs.org/) 平台。

## 安装

```bash
npm install lynx-pretext
# 或
pnpm add lynx-pretext
```

## 示例

在线演示：[lynx-pretext.vercel.app](https://lynx-pretext.vercel.app/)

包含：
- **ASCII 艺术**：甜甜圈、粒子（纯 MTS 动画）
- **动态布局**：Logo 旋转 + 文本绕排（三种架构：BTS/MTS/混合）
- **Editorial**：杂志排版布局，可拖拽光球与文本排除
- **基础示例**：API 用法和精度验证

## 保持一致的部分

### API 兼容性

原始 Pretext 和 Lynx Pretext 的主要 API 保持一致：

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

### 架构一致性

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

### 代码复用

| 文件 | 原始 Pretext | Lynx Pretext | 复用率 |
|------|-------------|--------------|--------|
| `analysis.ts` | 1,008 行 | ~1,016 行 | ~95% |
| `line-break.ts` | ~1,056 行 | ~1,056 行 | ~98% |
| `layout.ts` | 718 行 | 621 行 | ~85% |
| `measurement.ts` | 232 行 | 149 行 | ~60%（主要适配点） |

**整体复用率**: 约 85-90% 的核心逻辑直接复用，主要差异集中在平台适配层。

- **分析层**: ~95% 复用，主要是导入路径调整
- **断行层**: ~98% 复用，几乎直接移植
- **布局层**: ~85% 复用，移除浏览器特定功能
- **测量层**: ~60% 复用，主要适配点（Canvas → Lynx API）

---

## 差异部分

### 1. 测量后端（关键差异）

| 特性 | 原始 Pretext (Browser) | Lynx Pretext |
|------|------------------------|--------------|
| **测量 API** | Canvas `measureText()` | `lynx.getTextInfo()` |
| **运行环境** | 浏览器主线程/Worker | Lynx 主线程 |
| **字体设置** | `ctx.font = font` | 通过 `fontSize`/`fontFamily` 参数 |
| **Emoji 校正** | 自动检测并校正 Canvas/DOM 差异 | 暂不支持（MVP 版本） |

**原始 Pretext 测量方式：**
```typescript
// 浏览器版本使用 Canvas
const ctx = getMeasureContext() // OffscreenCanvas 或 DOM Canvas
ctx.font = font
const width = ctx.measureText(segment).width
```

**Lynx Pretext 测量方式：**
```typescript
// Lynx 版本使用主线程 API
const info = { fontSize: currentFontSizeStr }
if (currentFontFamily) info.fontFamily = currentFontFamily
const result = lynx.getTextInfo(segment, info)
const width = result.width
```

### 2. 平台适配层

Lynx Pretext 新增了以下适配文件：

- **`intl-shim.ts`** (6 行): 为 PrimJS 提供 `Intl` 全局对象 polyfill
- **`segmenter-polyfill.ts`** (102 行): 轻量级 `Intl.Segmenter` 替代实现（PrimJS 的 `@formatjs/intl-segmenter` 会崩溃）
- **`rspeedy-env.d.ts`** (12 行): Lynx/Rspeedy 环境 TypeScript 声明

### 3. 功能差异

| 功能 | 原始 Pretext | Lynx Pretext |
|------|-------------|--------------|
| **双向文本 (Bidi)** | 完整支持 | MVP 版本返回 `null`（stub） |
| **Emoji 宽度校正** | 支持（Canvas vs DOM 差异） | 暂不支持（返回 0） |
| **浏览器引擎配置** | Safari/Chromium 差异化处理 | 固定默认值 |
| **系统字体检测** | 支持 `system-ui` 等 | 依赖 Lynx 底层实现 |

### 4. 验证策略

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
├── src/                        # 核心库
│   ├── analysis.ts             # 文本分析/分段（~95% 复用）
│   ├── line-break.ts           # 断行算法（~98% 复用）
│   ├── layout.ts               # 布局 API（~85% 复用）
│   ├── measurement.ts          # 测量层（Lynx 适配）
│   ├── intl-shim.ts            # PrimJS Intl polyfill
│   └── segmenter-polyfill.ts   # Intl.Segmenter 替代
│
├── packages/                   # Monorepo 包
│   └── devtools/               # @lynx-pretext/devtools（DevPanel 组件）
│
├── examples/                   # 示例项目
│   ├── basic/                  # 基础 API 用法演示
│   ├── ascii-arts/             # ASCII 艺术渲染（甜甜圈、粒子）
│   ├── bubble/                 # 气泡文本布局
│   ├── dance/                  # 舞蹈精灵动画与文本排除
│   ├── dynamic-layout/         # 动态布局（三种架构：BTS/MTS/混合）
│   └── editorial/              # 杂志排版布局（可拖拽光球）
│
├── docs/                       # 文档
│   ├── blog.md                 # 项目概述与探索之旅
│   └── learning/               # 学习笔记和迁移指南
│       ├── mts-bts-architecture-patterns.md
│       ├── ascii-art-rendering.md
│       ├── bts-mts-compatible-components.md
│       └── ...
│
├── website/                    # 项目网站
└── scripts/                    # 构建和工具脚本
```

## License

与原始 Pretext 项目保持一致

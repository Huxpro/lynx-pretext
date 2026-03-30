# Dance Example - Video Sprite + Text Exclusion

这个示例演示如何使用 PNG Sprite Sheet + Exclusion 数据实现视频人物周围的文字排版效果。

## 文件结构

```
examples/dance/
├── package.json           # 项目配置
├── lynx.config.ts         # Lynx 配置
├── tsconfig.json          # TypeScript 配置
├── assets/
│   └── dancer-sprite.png  # PNG sprite sheet (70帧, 1.5MB)
├── src/
│   ├── index.tsx          # 主组件
│   └── dancer-exclusion.ts # Exclusion 数据
└── scripts/
    └── generate-sprite-exclusion.mjs # 生成脚本
```

## 快速开始

```bash
cd examples/dance
pnpm install
pnpm dev
```

## 核心概念

### 1. PNG Sprite Sheet

由于 Lynx 没有 video 组件，我们使用 PNG sprite sheet 来模拟视频：

```
Sprite Sheet 结构 (480x270 × 10x7):
┌─────────────────────────────────────────────┐
│ [帧0] [帧1] [帧2] [帧3] [帧4] [帧5] [帧6] [帧7] [帧8] [帧9] │
│ [帧10][帧11][帧12][帧13][帧14][帧15][帧16][帧17][帧18][帧19]│
│ ...                                                         │
│ [帧60][帧61][帧62][帧63][帧64][帧65][帧66][帧67][帧68][帧69]│
└─────────────────────────────────────────────┘

每帧 480x270 像素
共 70 帧 = 10 列 × 7 行
背景已透明（绿幕已去除）
```

### 2. Exclusion 数据结构

```typescript
type SpriteExclusionFrame = {
  frameIndex: number      // 帧索引
  timestamp: number        // 时间戳（秒）
  profile: {               // 10 个水平带
    width: number          // 该带中人物的相对宽度 (0-1)
    offset: number         // 人物中心相对于画面中心的偏移 (-0.5 ~ 0.5)
  }[]
  polygon: Point[]        // 轮廓点（归一化坐标）
  rect: Rect              // 包围盒（归一化坐标）
}
```

### 3. 使用流程

```typescript
// 1. 导入数据
import { dancerFrames, dancerMeta, getDancerFramePos } from './dancer-exclusion'
import dancerSprite from '../assets/dancer-sprite.png'

// 2. 获取当前帧
const frameIndex = Math.floor(currentTime * 12) % 70
const currentFrame = dancerFrames[frameIndex]

// 3. 获取帧在 sprite 中的位置
const spritePos = getDancerFramePos(frameIndex)
// → { x: 480 * (frameIndex % 10), y: 270 * Math.floor(frameIndex / 10) }

// 4. 显示 sprite 中的当前帧
<image
  src={dancerSprite}
  style={{
    position: 'absolute',
    left: `${-spritePos.x}px`,
    top: `${-spritePos.y}px`,
    width: '480px',
    height: '270px',
  }}
/>

// 5. 使用 profile 计算文字排除区域
for (let lineY = 0; lineY < articleHeight; lineY += lineHeight) {
  const bandIndex = Math.floor((lineY / videoHeight) * 10)
  const band = currentFrame.profile[bandIndex]
  
  // 计算排除区域
  const exclusionCenter = videoX + videoWidth/2 + band.offset * videoWidth
  const exclusionWidth = band.width * videoWidth
  
  // 文字放置在左右两侧
  // ...
}
```

## 关键 API

### `getDancerFramePos(frameIndex)`

获取帧在 sprite sheet 中的位置：

```typescript
const pos = getDancerFramePos(25)
// → { x: 480 * 5, y: 270 * 2 } = { x: 2400, y: 540 }
```

### `getDancerExclusion(timestamp)`

根据时间戳获取 exclusion 数据：

```typescript
const exclusion = getDancerExclusion(2.5)  // 2.5 秒
```

### `dancerMeta`

Sprite 元数据：

```typescript
{
  frameWidth: 480,
  frameHeight: 270,
  cols: 10,
  rows: 7,
  totalFrames: 70
}
```

## 生成自己的 Sprite 数据

### 步骤 1: 准备视频

```bash
# 将视频放到 scripts 目录
cp /path/to/your/video.mp4 scripts/
```

### 步骤 2: 运行生成脚本

```bash
# 生成精简版（每秒1帧）
node scripts/generate-sprite-exclusion.mjs scripts/video.mp4 myvideo 12

# 或生成完整版（全部帧）
node scripts/generate-sprite-exclusion.mjs scripts/video.mp4 myvideo 1
```

### 步骤 3: 输出文件

```
myvideo-sprite.png     # PNG sprite sheet
myvideo-exclusion.ts   # TypeScript exclusion 数据
myvideo-meta.json      # 元数据
```

## 绿幕去除算法

脚本使用颜色距离法自动去除背景：

```
1. 估计背景色（采样视频帧四周边缘）
2. 计算每个像素与背景的"欧几里得距离"
3. 距离 < threshold → 透明
   距离 > threshold + feather → 不透明
```

适用于：
- ✅ 纯色背景（绿幕、白墙）
- ✅ 渐变背景（天空）
- ⚠️ 复杂背景（效果一般）

## 性能优化建议

1. **采样率**：根据视频长度选择合适的采样率
   - 短视频（<10秒）：12fps（每秒12帧）
   - 中等视频（10-30秒）：6fps（每秒6帧）
   - 长视频（>30秒）：1fps（每秒1帧）

2. **帧尺寸**：根据目标设备调整
   - 移动端：320px 宽度
   - 平板：480px 宽度
   - 桌面：640px 宽度

3. **动画帧率**：根据需求调整
   - 流畅动画：12fps
   - 一般效果：6fps
   - 演示用途：1fps

## 架构模式

本示例采用 **纯 BTS 模式**，所有逻辑都在 Background Thread (React) 中运行。

### 特点

| 方面 | 实现 |
|------|------|
| 动画循环 | BTS (`setInterval` in `useEffect`) |
| 文本布局 | BTS (`useMemo` in render) |
| 触摸处理 | BTS (`bindtap`) |
| 跨线程同步 | 无 |

### 关键代码

**动画在 BTS**：
```tsx
useEffect(() => {
  if (!isPlaying) return
  const fps = config.meta.fps || 12
  const intervalId = setInterval(tick, 1000 / fps)
  return () => clearInterval(intervalId)
}, [isPlaying, ...])
```

**文本布局在 BTS render 中**：
```tsx
const textLines = useMemo(() => {
  // 在 BTS 计算文本绕排
  const line = layoutNextLine(preparedText, cursor, regionWidth)
  ...
}, [preparedText, currentFrame, ...])
```

### 适用场景

- 视频精灵动画帧率较低 (12fps)，不需要 60fps 高性能
- 没有需要零延迟响应的触摸拖拽交互
- 代码简单易维护

### 与其他架构模式对比

详见 [mts-bts-architecture-patterns.md](../../docs/learning/mts-bts-architecture-patterns.md)。

| 模式 | 示例 | 动画位置 | 文本布局 | 触摸处理 |
|------|------|---------|---------|---------|
| 纯 BTS | **dance**, dynamic-layout-bts | BTS | BTS | BTS |
| 纯 MTS | dynamic-layout-mts, editorial-mts | MTS | MTS | MTS |
| 混合 | dynamic-layout, editorial-engine | MTS | BTS | MTS |

## 与其他示例的关系

- `basic/` - Pretext 基础用法
- `dynamic-layout/` - 静态图片 exclusion
- `editorial/` - 动态圆形障碍物
- **`dance/`** - 视频 sprite + 动态 exclusion

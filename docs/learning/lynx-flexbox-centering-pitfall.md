# Lynx Flexbox 居中陷阱

> 2026-03-30 | 项目：lynx-pretext ASCII Art demo

## 问题现象

在 Lynx 中使用 flexbox 居中内容时，`flex: 1` 配合 `justifyContent: 'center'` 无法正确垂直居中子元素。

## 问题代码

```tsx
// ❌ 不会居中
<view style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
  <view style={{ width: '300px', height: '400px' }}>
    {/* content */}
  </view>
</view>
```

## 正确做法

必须显式设置 `height: '100%'`，而不是使用 `flex: 1`：

```tsx
// ✅ 正确居中
<view style={{ width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center' }}>
  <view style={{ width: '300px', height: '400px' }}>
    {/* content */}
  </view>
</view>
```

## 原因分析

在 Lynx 中，`flex: 1` 似乎不能正确撑开高度来让 `justifyContent: 'center'` 生效。需要显式设置 `height: '100%'` 才能让 flexbox 居中正常工作。

## 完整示例

```tsx
// 全屏容器 + 居中内容
return (
  <view style={{ width: '100%', height: '100%', backgroundColor: '#0a0a12' }}>
    {/* 覆盖层 (absolute) */}
    <view style={{ position: 'absolute', top: '10px', left: '10px', zIndex: 100 }}>
      <text>Stats</text>
    </view>

    {/* 居中容器 */}
    <view style={{ width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center' }}>
      <view style={{ width: `${canvasWidth}px`, height: `${canvasHeight}px` }}>
        {/* 居中内容 */}
      </view>
    </view>
  </view>
)
```

## 参考

- `examples/ascii-arts/src/field-mono.tsx`
- `examples/ascii-arts/src/field-prop.tsx`
- `lynx-examples/examples/event/src/event_emitter_toggle/index.tsx`

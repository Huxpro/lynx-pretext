# Lynx Main Thread Script + Shared Module 实战踩坑记录

> 2026-03-29 | 项目：lynx-pretext MTS 动态排版 & ASCII 甜甜圈

## 背景

我们要做两个 demo：

1. **`dynamic-layout-mts.tsx`** — 纯 MTS 版编辑器排版动画。pretext 排版引擎完全在主线程运行，Logo 旋转时文字以 60fps 实时回流，零跨线程通信。
2. **`wireframe-torus.tsx`** — ASCII 艺术 3D 旋转甜甜圈。所有 3D 投影 + 亮度计算 + 字符映射在 MTS 运行，带逐行动态辉光效果。

核心挑战：pretext 的排版函数（`prepareWithSegments`、`layoutNextLine` 等）需要在主线程上运行，这要求使用 `with { runtime: 'shared' }` 把这些模块同时打包进 BTS 和 MTS。

---

## 问题 1：`with { runtime: 'shared' }` 不生效（最大的坑）

### 现象

MTS 函数调用 `prepareWithSegments()` 时报错：

```
main-thread.js exception: not a function
```

### 排查过程

1. **第一次尝试：把 MTS 函数放到独立模块** — 创建 `mts/editorial-layout.ts`，每个函数加 `'main thread'` 指令，内部用 `with { runtime: 'shared' }` 导入 pretext。结果：同样报 `not a function`。外部模块的 `'main thread'` 函数不能被组件直接调用。

2. **第二次尝试：内联到组件内** — 把所有 MTS 函数搬进组件函数体，在组件文件顶层写 `with { runtime: 'shared' }` 导入。结果：还是 `not a function`。

3. **检查 bundle** — 用 `strings` + `python3` 分析产物，发现 `prepareWithSegments` 只出现在 `(react:background)` 模块里，**没有** `(react:main-thread)` 版本。说明 `with { runtime: 'shared' }` 被静默忽略了。

4. **第三次尝试：MTS→BTS→MTS 三角跳架构** — 绕过 shared module，MTS 只做旋转，每帧通过 `runOnBackground` 把角度发给 BTS，BTS 计算排版后再通过 `runOnMainThread` 把结果发回 MTS。能跑，但性能最差（比纯 BTS 还多两次跨线程通信）。

5. **对比 `~/github/lynx-examples`** — 发现 examples 用 `@lynx-js/react-rsbuild-plugin@0.12.9`，shared module 正常工作。我们用的是 `0.13.0`。

### 根因

**`@lynx-js/react-rsbuild-plugin@0.13.0`（当时的 latest）不支持 `with { runtime: 'shared' }`，而旧版 `0.12.9` 支持。** 文档描述的能力超前于实际发布版本。

### 解法

降级到和 lynx-examples 一致的版本：

```json
{
  "@lynx-js/react": "0.116.4",
  "@lynx-js/react-rsbuild-plugin": "0.12.9",
  "@lynx-js/rspeedy": "0.13.4"
}
```

### 验证方法

分析 bundle 产物确认 shared module 生效：

```python
with open("dist/dynamic-layout-mts.lynx.bundle", "rb") as f:
    data = f.read()
card_pos = data.find(b"__Card__")
for needle in [b"prepareWithSegments", b"carveTextLineSlots", b"getTextInfo"]:
    bts_count = data[:card_pos].count(needle)
    mts_count = data[card_pos:].count(needle)
    print(f"{needle}: BTS={bts_count} MTS={mts_count}")
```

正确的输出应该在 MTS 区域看到这些函数。

---

## 问题 2：`useMainThreadRef(new Map())` 崩溃

### 现象

MTS 运行时报 `not a function`，崩溃在 `cache.get(key)` 这一行。

### 根因

`useMainThreadRef` 的初始值需要通过 `JSON.stringify()` 跨线程传递。`Map` 对象序列化后变成 `{}`（空对象），`{}.get()` 不存在。

### 解法

```ts
// 错误 ❌
const preparedCacheMT = useMainThreadRef(new Map<string, any>())

// 正确 ✅
const preparedCacheMT = useMainThreadRef<any>(null)

function getPreparedMTS(text: string, font: string): any {
  'main thread'
  if (preparedCacheMT.current === null) preparedCacheMT.current = new Map()
  const cache = preparedCacheMT.current as Map<string, any>
  // ...
}
```

### 规则

**`useMainThreadRef` 的初始值必须是 JSON 可序列化的。** 如果需要 `Map`、`Set`、`RegExp` 等不可序列化类型，用 `null` 初始化，在 MTS 函数内懒创建。

---

## 问题 3：`setAttribute('textContent', ...)` 不更新文字

### 现象

通过 DevTool 检查 DOM，发现元素上有两个属性：
- `text=" "`（初始值，这是 Lynx 实际渲染的）
- `textContent="LYNX PRETEXT"`（我们设的，被忽略）

屏幕上只看到空白。

### 根因

Lynx 的 `<text>` 元素用 **`text` 属性** 存储和渲染文字内容，不是 Web 的 `textContent`。`setAttribute('textContent', ...)` 设置了一个 Lynx 不认识的属性。

### 解法

```ts
// 错误 ❌
text.setAttribute('textContent', line.text)

// 正确 ✅
text.setAttribute('text', line.text)
```

### 排查方法

用 DevTool CDP 命令检查实际 DOM 属性：

```bash
node devtool/scripts/index.mjs cdp -m DOM.getDocument -s <session> --client <client>
```

然后在 JSON 输出中搜索 `text` 元素的 `attributes` 数组，观察实际属性名。

---

## 问题 4：wireframe-torus 白屏

### 现象

页面完全白色，LynxExplorer 的默认白色背景透出来。

### 根因

行容器 `<view>` 有 `display: 'none'` 初始样式，但 `main-thread:ref` 绑在子元素 `<text>` 上。MTS 函数中调用 `el.setStyleProperty('display', 'flex')` 修改的是 `<text>` 的 display，而父 `<view>` 的 `display: 'none'` 一直没变。

```tsx
// 错误结构 ❌ — ref 在 text 上，但 display:none 在 view 上
<view style={{ display: 'none' }}>
  <text main-thread:ref={rowRefs[i]}> </text>
</view>
```

### 解法

去掉 `display: 'none'`。空行（只有空格字符）在黑色背景上天然不可见，不需要显式隐藏。

```tsx
// 正确 ✅
<view style={{ height: `${LINE_HEIGHT}px` }}>
  <text main-thread:ref={rowRefs[i]}> </text>
</view>
```

---

## 为什么前面失败了那么多次

### 1. 文档超前于发布

`with { runtime: 'shared' }` 写在官方文档里，Lynx Docs MCP 也能查到完整用法和示例。但 latest 版本（0.13.0）并不支持，反而是旧版（0.12.9）支持。**没有任何编译错误或警告** — 语法被静默忽略，运行时才报 `not a function`。

### 2. 所有问题都报同一个错

`not a function` 这个错误消息覆盖了至少三个完全不同的根因：
- shared module 未生效（版本问题）
- `Map` 序列化失败
- 属性名错误

没有具体到哪个函数 "not a function"，也没有源码行号（MTS 代码是编译后的 worklet），只能靠排除法。

### 3. MTS 无法直接调试

MTS 代码运行在独立的 JS 上下文中：
- 没有 `console.log`（或者有但看不到输出）
- 不能设断点
- 只能通过 DevTool CDP 检查 DOM 状态来间接推断执行结果
- 错误堆栈指向编译后的 `main-thread.js` 偏移量，无法映射回源码

### 4. 跨线程序列化的隐式约束

以下约束不在编译期检查，只在运行时无声地失败：
- `useMainThreadRef` 初始值必须 JSON 可序列化
- worklet 捕获的闭包变量必须 JSON 可序列化
- `with { runtime: 'shared' }` 只对直接导入的标识符有效，赋值给新变量会丢失 shared 特性

---

## Checklist：开发 Lynx MTS 功能前的检查清单

1. **确认 `@lynx-js/react-rsbuild-plugin` 版本支持 shared module** — 对比 `lynx-examples` 的版本
2. **`useMainThreadRef` 初始值只用原始类型** — `number`、`string`、`boolean`、`null`，不用 `Map`/`Set`/`Date`/`RegExp`
3. **Lynx `<text>` 用 `setAttribute('text', ...)` 更新内容** — 不是 `textContent`
4. **`main-thread:ref` 绑在你需要操作的元素上** — 不要隔着父元素操作
5. **`with { runtime: 'shared' }` 只对直接 import 的标识符有效** — 不要赋值给中间变量
6. **构建后分析 bundle** — 确认 shared module 代码出现在 `__Card__` 后面的 MTS 区域
7. **MTS 函数内的函数声明按 callee-before-caller 排列** — SWC 会把 function declaration 转成 `let`，打破 hoisting

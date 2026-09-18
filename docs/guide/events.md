# 方法事件

`SnailMethod` 上有**五个**事件订阅方法：`onSuccess`、`onError`、`onCodeError`、`onFinish`、
`onHitCache`。它们观察同一次 `send()` 的不同侧面，每个都返回一个取消订阅函数。

```ts
const method = userApi.getUser("42");

const off = method.onSuccess((result) => {
  console.log(result.data);
});

await method.send();
off();                          // 不再需要时取消订阅
```

## 五个事件一览

| 方法 | 底层事件 | 触发条件 | 载荷 |
| --- | --- | --- | --- |
| `onSuccess(listener)` | `success` | 请求成功、`SnailResult` 已经组装好 | `SnailResult` |
| `onError(listener)` | `error` | 非业务码的任何失败，**包括取消** | `unknown` |
| `onCodeError(listener)` | `codeError` | 失败原因是 `SnailResponseError`（业务码被 `validateCode` 拒绝） | `{ code, payload, error }` |
| `onFinish(listener)` | `finish` | **总是**触发，成功、失败、取消皆然（在 `finally` 里） | `undefined` |
| `onHitCache(listener)` | `cache` | 成功路径上、响应由缓存提供（插件调用了 `ctx.markCacheHit()`） | `undefined` |

`onError` 与 `onCodeError` **互斥**：一次失败只会有其中一个触发。五个事件的名字与载荷形状由
`SnailMethodEventMap` 固定。

## 相对请求生命周期的位置

```text
send()
  │
  ├─ beforeCreate                      ← 插件钩子
  ├─ beforeRequest 链
  ├─ 网络步骤（缓存命中时跳过）
  ├─ afterResponse 链                  ← 网络响应与缓存命中都跑
  │
  ├─ 成功路径                              ├─ 失败路径
  │    ├─ 写 meta.data / code / message    │    ├─ 写 meta.error
  │    ├─ 命中时 emit "cache"              │    ├─ onError 插件钩子（反向）
  │    ├─ emit "success"                   │    └─ emit "codeError" 或 "error"
  │    └─ return SnailResult               │       （业务码失败 → codeError，
  │                                        │        其它失败 → error）
  │   ─────────────────────────────────────┘
  │
  ├─ afterRequest 插件钩子（在 finally 里）
  ├─ 写 meta.loading = false
  └─ emit "finish"
```

三条值得单独记住的规则：

- **`cache` 早于 `success`**：缓存命中也是一次成功，`onHitCache` 只是比 `onSuccess` 先说一句。
- **`success` 早于 `finish`**：成功路径上监听器先拿到结果，再收到「结束了」。
- **`finish` 一定最后**：它在 `finally` 里，也是 `meta.loading` 已经回到 `false` 之后 ——
  这正是 UI 用它来关闭加载态的原因。

## `onSuccess`

```ts
method.onSuccess((result) => {
  // result 与 await method.send() 拿到的是同一个对象
  result.data;
  result.code;
  result.fromCache;      // 缓存命中时为 true
});
```

句柄已经被写入：监听器读 `method.meta.data` 时看到的**就是这一次**响应的值，而不是上一次的。

## `onError`

```ts
method.onError((error) => console.error(error));
```

`SnailCancelledError` 也走这里 —— 取消不是业务失败，但它确实是一次「没有成功」。策略层会自己
把它识别为预期控制流而忽略；裸用 `SnailMethod` 时请自行区分：

```ts
import { SnailCancelledError } from "@snail-js/api";

method.onError((error) => {
  if (error instanceof SnailCancelledError) return;   // 组件卸载导致的取消
  toast("请求失败");
});
```

## `onCodeError` —— 只能观察，不能恢复

```ts
method.onCodeError(({ code, payload, error }) => {
  toast(String((payload as { message?: string })?.message ?? `业务失败：${code}`));
});
```

回调跑完之后，`send()` **仍然会以 `SnailResponseError` reject**。这个事件是给「弹一个提示」
用的，不是给「接住失败」用的：

```ts
try {
  await method.send();
} catch (error) {
  // 即使 onCodeError 已经跑过，这里依然会进 catch
}
```

想真正拦住一个请求，唯一的位置是插件钩子 `beforeRequest`（写入 `ctx.response` 并
`ctx.interrupt()`）—— 这也是缓存命中做的事。细节见[错误处理](./errors.md#onerror-与-oncodeerror)。

## `onFinish`

```ts
method.onFinish(() => {
  spinner.hidden = true;        // 成功、失败、取消，三条路都会到这里
});
```

`onFinish` 是关闭加载态的**唯一可靠位置**。在 `onSuccess` 与 `onError` 里各写一遍，会漏掉
取消；只依赖 `meta.loading` 也要注意它是在 `finish` 之前被复位的。

## `onHitCache`

```ts
method.onHitCache(() => console.log("这次走的是缓存"));
```

它只在缓存命中时触发，所以「命中与未命中」可以在这里分流，而不必读 `result.fromCache`。
标记缓存命中的是缓存插件（`ctx.markCacheHit()`），核心没有别的地方会发出这个事件。

## 监听器挂在**一个** method 实例上

事件由 `SnailMethod` 实例持有，不是全局广播。这带来两个直接后果：

```ts
// 每个 method 各自持有自己的监听器
const a = userApi.getUser("1");
const b = userApi.getUser("2");
a.onSuccess(() => console.log("a"));
await b.send();                 // 不会触发 a 的监听器
```

- **重新构造 method 就要重新注册**。`userApi.getUser(id)` 每次调用都返回**新的**
  `SnailMethod`；UI 在重新渲染时重建 method（例如 `useMemo` 的依赖变了），上一次注册的监听器
  不会跟过来，必须在新实例上重新订阅。策略 hook 正是靠内部持有唯一实例（[为什么](./strategies.md#一个方法-多次发送)）
  来避免这个问题。
- **取消订阅是显式的**。五个方法都返回 `() => void`；不调用它，监听器就一直留在那个实例上，
  直到实例被回收。

## 插件钩子与事件的关系

方法事件是**调用方可见**的表面；插件看到的是另一套钩子。两者容易混淆，这里说清楚：

| 关注的时机 | 用什么 |
| --- | --- |
| 真实网络响应 **和** 缓存命中 | 插件的 `afterResponse`（每个响应恰好跑一次） |
| 成功、失败、取消之后 | 插件的 `afterRequest`（在 `finish` 事件**之前**执行） |
| 失败 | 插件的 `onError`（反向顺序，无法恢复） |
| UI 里的成功 / 失败 / 结束 / 缓存命中 | 本页的五个方法事件 |

- `afterResponse` 是**响应**钩子，不是网络钩子：缓存命中虽然跳过了传输，但依然会产生一次
  `afterResponse`，所以响应校验与转换在命中时照常工作。
- `afterRequest` 跑在 `finish` 事件之前，这样调用方的 `onFinish` 看到的 `meta.loading` 已经
  是 `false`。
- **没有 `afterSuccess` 插件钩子**，而且是刻意的：需要「只在成功时做点什么」的插件应当用
  `afterResponse`（成功与缓存命中都会跑，并且早于信封校验）或 `onError`，而不是新增一个钩子
  与事件重复。完整的钩子清单见[插件生命周期](./plugin-lifecycle.md)。

## 相关

- [响应与类型](./responses.md)：`SnailResult` 的全部字段
- [错误处理](./errors.md)：`onError` / `onCodeError` 与错误层次
- [框架适配器](./adapters.md)：`method.meta` 上的五个状态句柄
- [插件生命周期](./plugin-lifecycle.md)：`afterResponse` / `afterRequest` 的位置与顺序

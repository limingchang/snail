# 请求策略 `useTokenAuth`

Bearer token + **单飞刷新**。它不是状态 hook，而是返回一个**插件**（外加三个 token 操作）。

```ts
function useTokenAuth(options: TokenAuthOptions): TokenAuthHandle;

interface TokenAuthHandle {
  readonly plugin: SnailPluginObject<TokenAuthOptions>;
  setToken(token: string | null | undefined): void;
  getToken(): string | undefined;
  clearToken(): void;
}
```

::: tip 它返回的是**插件**，不是一个状态 hook
token 是**全局**的：service 的每个请求都要带上它，任何一个请求上的 401 都要让**所有**请求失效。
一个 per-method 的 hook 看不到其它请求，根本无法协调刷新。所以这里用插件（名字 `token-auth`、
`priority: 20` —— 第三方区间，高于默认的 `0`，好让它包住 `beforeRequest` 链的其余部分）。
:::

## 选项

```ts
interface TokenAuthOptions {
  token: () => string | null | undefined | Promise<string | null | undefined>;   // 必填
  refresh: () => Promise<string>;                                                // 必填
  header?: string;                    // 默认 "authorization"
  scheme?: string;                    // 默认 "Bearer"
  onUnauthorized?: (error: unknown) => void;
}
```

| 选项 | 类型 | 真实默认值 | 说明 |
| --- | --- | --- | --- |
| `token` | `() => string \| null \| undefined \| Promise<...>` | 必填 | 当前 token 的来源，可以是异步的；返回空表示「未登录」，不注入 header |
| `refresh` | `() => Promise<string>` | 必填 | 获取新 token。**每波 401 最多调用一次**；reject 会让整条队列失败 |
| `header` | `string` | `"authorization"` | 写入的 header 名 |
| `scheme` | `string` | `"Bearer"` | token 前缀；传 `""` 得到裸 token |
| `onUnauthorized` | `(error: unknown) => void` | 未设置 | 401 无法恢复时调用（刷新失败，或重放又 401） |

## 返回

| 成员 | 说明 |
| --- | --- |
| `plugin` | 用 `Service.use(auth.plugin)` 安装 |
| `setToken(token)` | 替换缓存 token（例如登录成功后）。非空字符串才缓存，其它值等同于清除 |
| `getToken()` | 同步读取缓存 token（异步的 `token()` 在这里无法 await） |
| `clearToken()` | 忘掉缓存，下一次请求重新询问 `token()` |

## 示例

```ts
import { useTokenAuth } from "@snail-js/api/strategies";
import { Service, api } from "./service";

const auth = useTokenAuth({
  token: () => localStorage.getItem("token"),
  refresh: async () => (await api.refresh().send()).token,
  onUnauthorized: () => router.push("/login")
});

Service.use(auth.plugin);
auth.setToken(readFromLoginForm());
```

## 每波 401 只刷新一次

三个并发请求、一个过期 token、三个 401：per-request 刷新会触发三次刷新，而轮换式 refresh token 下
其中两次会失败并把用户登出。两个机制防止它：

1. 在刷新已经在飞时收到 401 的请求**加入**那次刷新，而不是再起一次；
2. 401 是由一个**已经被替换掉**的 token 产生的请求直接重放，不再刷新。

每个请求实际发出的 token 记在 `ctx.state` 里（核心每次 send 都会清空），这就是规则 2 无需保留定时器
就能判定的原因。

## 诚实地说，它的边界

- 重放会重跑 `requestInterceptor` reduce、传输、以及 `afterResponse` 链，所以插件签名的 header 会在
  重试的那次调用里被重新计算。`beforeRequest` 钩子**刻意不重新进入**：刷新决策已经做出，重新进入会
  成环。
- 刷新失败时抛的是**原始 401**，不是刷新错误 —— 后者是实现细节，应用无法对它做出反应。
- 安装是同步的；卸载（`Service.remove("token-auth")` 或 `Service.dispose()`）会让在等的 401 队列
  立刻结束，不会留下永远等不到结果的请求。
- 一次 `refresh()` 的拒绝不会变成 unhandled rejection（没有等待者时它的拒绝被显式标记为已观察）。

::: danger 只恢复**传输层** 401
只有 HTTP 401 能被这里恢复。后端用 HTTP 200 返回 `{ code: 401 }` 时，`SnailResponseError` 是在
`SnailMethod.finalize` 里产生的，也就是 `beforeRequest` 链**已经返回之后** —— 没有任何 hook 能在那
里恢复（`onError` 按设计只能观察）。这种响应会原样交给调用方。
:::

## 相关

- [策略概览](../strategies.md)：适配器与公共选项
- [使用插件](../plugins.md)：`use()` / `remove()` / 优先级
- [插件生命周期](../plugin-lifecycle.md)：`beforeRequest` 的链式契约
- [`useRequest`](./use-request.md)：调用方如何消费失败

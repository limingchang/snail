# 从 0.1.x 迁移

这一页对照旧的 `@snail-js/api`（`0.1.x`，`reflect-metadata` 时代）与这次重写后的 API，
并逐条列出**刻意的行为变更**。旧版的源码保留在仓库的 `api/src` 下，可随时对照。

::: tip 迁移的三步
1. 卸载 `reflect-metadata`，删掉 tsconfig 里的 `types` / `emitDecoratorMetadata`；
2. 按下面的对照表改装饰器与服务选项；
3. 把 `method.request().send()` 改成 `method.send()`，并开始使用 `SnailResult`。
:::

## 安装与 TypeScript

```diff
- pnpm add @snail-js/api axios reflect-metadata
+ pnpm add @snail-js/api axios
```

```diff
  {
    "compilerOptions": {
      "experimentalDecorators": true,
-     "emitDecoratorMetadata": true,
-     "types": ["reflect-metadata"],
-     "strictPropertyInitialization": false
+     "useDefineForClassFields": false
    }
  }
```

`reflect-metadata` 被彻底移除，因为库从来不读 `design:*` 元数据，而 TypeScript 7 也已经不再
产出它们。细节与完整配置见 [TypeScript 配置](/guide/typescript)。

## 装饰器对照

| 旧（0.1.x） | 新 | 说明 |
| --- | --- | --- |
| `@Server(options)` | `@Server(options \| baseURL)` | 选项集合变了（见下一节），新增字符串简写 |
| `@Api(url)` | `@Api(url \| options)` | 新增 `name`/`timeout`/`adapter`/`responseType`/`withCredentials` |
| `@Get` `@Post` … | `@Get` `@Post` … | 名称不变；第二个参数仍是 axios 选项 |
| `@Param("id")` | `@Params("id")` | 旧 README 写的是 `@Param`，但旧源码导出的是 `Params`；新版统一为 `@Params` |
| `@Query("page")` / `@Query()` | 同左 | 语义不变；不带 key 时**必须**是普通对象，否则抛错 |
| `@Data()` / `@Data("k")` | 同左 | 不带 key 且非普通对象时**整体替换**请求体（旧版是合并/忽略） |
| （没有 header 参数装饰器） | `@HeaderValue("authorization")` | 新增；`@HeaderParam` 是它的别名 |
| `@Header({...})` | `@Header({...})` | 语义不变（类/方法级静态头），类级 + 方法级合并，方法级优先 |
| `@UploadProgress` / `@DownloadProgress` | 同左 | 语义不变；需要 `xhr` adapter，见[上传示例](/examples/upload) |
| `@Before([...])` / `@After([...])` | 用 `Interceptor` 插件 | 旧的是「往方法/类上挂拦截器数组」的新机制，新版是插件 + 两条方向的钩子 |
| `@Version("1.0.0")` | `Versioning` 插件 | 不再改写共享的 `server.baseURL`，见下文变更表 |
| `@Cache(...)` / `@NoCache` / `@HitSource` | `Cache` 插件 | 缓存成为插件，配置从 `@Server({ cache })` 移到插件选项 |
| `@Transform(Class)` | `Transform` 插件 | 不再依赖 class-validator |
| `createSnailDecorator` / 空的 `createParamDecorator` | `createClassDecorator` / `createMethodDecorator` / `createParamDecorator` / `createPropertyDecorator` / `customMetadataKey` | 旧版这两个是占位实现，新版是可用工厂 |
| `@Sse` `@SseEvent` `@OnSseOpen` `@OnSseError` | 同左 | 传输实现改为 `fetch` + 流读取器，支持 header / POST / withCredentials |
| `@WebSocket` `@OnWs*` | 同左 | 新增退避重连与「握手前发送入队」 |
| `@HttpStream(path, options)` | 同左 | 通过代理方法直接返回流控制器；类型与选项更明确 |

::: tip 内置插件与策略的文档
`Cache`、`Interceptor`、`Versioning`、`Validate`、`Transform` 现在从 `@snail-js/api/plugins`
导入；框架适配器不是插件，它通过 `@Server({ stateAdapter })` 声明（装饰器里不再出现适配器
函数），`VueRef` / `ReactState` 分别从 `@snail-js/api/adapter/vue` 与
`@snail-js/api/adapter/react` 导入；`useRequest` 等策略统一从 `@snail-js/api/strategies` 导入
（唯一的策略入口，不 import 任何框架）。从[使用插件](/guide/plugins)开始，
[策略概览](/guide/strategies)接着看。
:::

## 服务选项对照

| 旧（`SnailServiceOptions`） | 新（`SnailServerOptions`） | 备注 |
| --- | --- | --- |
| `baseURL: string`（必填） | `baseURL?: string`（默认 `"/"`） | 空字符串现在会抛 `SnailOptionsError` |
| `timeout`（默认 `3000`） | `timeout`（默认 `10000`） | 默认值变了 |
| `adapter`（默认 `"fetch"`） | `adapter`（默认未设置） | 交给 axios 自行探测（浏览器 `xhr`/`fetch`，Node `http`） |
| `enableLog`（默认 `import.meta.env.DEV`） | `logLevel`（默认 `"silent"`） | 从布尔开关变成 5 级；默认**不打印**任何东西 |
| `lang` | `setLocale(...)` | 见下文 |
| `stateHook` | `@Server({ stateAdapter })` 选项（默认 `SnailAdapter`；`VueRef` 来自 `@snail-js/api/adapter/vue`，`ReactState` 来自 `@snail-js/api/adapter/react`） | 响应式适配器从「全局注册」变成 server 选项：核心按它创建 `method.meta` 上的五个句柄，策略也读同一份声明 |
| `cache` / `cacheFor` | `Cache` 插件 | 从 server 选项移除 |
| `versionManage` | `Versioning` 插件 | 从 server 选项移除 |
| `validateCode` | 同左 | 签名仍是 `(code, data) => boolean`；默认接受 `0` 与 `200` |
| `codeKey` / `messageKey` / `dataKey` | 同左 | 默认值不变，仍是 `code` / `message` / `data` |
| `DEFAULT_SERVICE_CONFIG` | `DEFAULT_SERVER_OPTIONS` / `DEFAULT_API_OPTIONS` / `DEFAULT_RESPONSE_KEYS` / `DEFAULT_ACCEPTED_CODES` / `LOG_LEVEL_WEIGHT` | 常量拆得更细 |
| `SnailServer.defaults`（裸 axios 配置） | `Service.options`（`ResolvedServerOptions`） | axios 实例不再共享，见变更表 |
| `set baseURL(url)` | 无 setter | 运行期改 `baseURL` 不再是受支持的用法 |

## 调用方式对照

旧版：`createApi` 的代理方法返回一个 `SnailMethod`，要先 `.request()` 拿到
`{ send, data, isLoading, error }`，再调 `send()`。

```ts
// 旧
const { request, onSuccess, onError } = userApi.getUserList();
const { send, isLoading, data } = request();
onSuccess((res) => console.log(res.data));
send();
```

新版：代理方法直接返回 `SnailMethod`，`send()` 解析成 `SnailResult`。

```ts
// 新
const method = userApi.getUserList();
method.onSuccess((result) => console.log(result.data));
const { data } = await method.send();
```

| 旧 | 新 |
| --- | --- |
| `api.getX()` → `SnailMethod`（含 `request()`） | `api.getX()` → `SnailMethod`（直接用） |
| `method.request()` → `{ send, data, isLoading, error }` | 无此方法；用 `method.meta` / `method.result` / `method.pending`，或给 server 声明 `@Server({ stateAdapter })` |
| `await method.request().send()` → `AxiosResponse` | `await method.send()` → `SnailResult` |
| `onSuccess((envelope) => …)` | `onSuccess((result: SnailResult) => …)` |
| `onCodeError((code, data) => …)` | `onCodeError(({ code, payload, error }) => …)` |
| `onError((axiosError) => …)` | `onError((error: unknown) => …)` |
| （无） | **新增** `onFinish(() => …)`、`onHitCache(() => …)` |
| `method.abort()` | 同左（`abort(reason?)` 可选原因） |
| `method.onUpload(cb)` / `onDownload(cb)` | 用 `@UploadProgress` / `@DownloadProgress`，或方法装饰器的 `onUploadProgress` / `onDownloadProgress` 选项 |
| 订阅无返回值 | `onSuccess` / `onError` / `onCodeError` / `onFinish` / `onHitCache` 都返回**取消订阅函数** |

## 错误处理对照

| 旧 | 新 |
| --- | --- |
| 基本只有一个 `OptionsNotFoundError`（`Error` 子类） | 完整的 `SnailError` 层次，每个子类都有稳定的 `code` 字段 |
| 业务码失败只走 `onCodeError`，异常被吞掉 | `send()` **以 `SnailResponseError` reject**；`onCodeError` 只观察 |
| 取消没有专门类型 | `SnailCancelledError`（`code: "SNAIL_CANCELLED"`），策略会刻意忽略 |
| 超时没有专门类型 | `SnailTimeoutError`（带 `timeout` 字段） |
| 业务码校验失败拿不到响应体 | `SnailResponseError.payload` 保留完整信封 |

完整的层次与每条消息见 [错误处理](/guide/errors)。

## 本地化对照

| 旧 | 新 |
| --- | --- |
| 目录在 `src/loacl/` | 目录在 `src/locale/`（`loacl` 是旧版拼写错误） |
| `localization.expand(record)` | `registerMessages(record)` |
| `localization.setLocale(lang \| { lang })` | `setLocale(tag \| catalogue)`；直接传目录对象表示**合并** |
| 缺失 key 返回 `""` | 缺失 key 返回 **key 本身**，拼写错误可见 |
| 无条件读 `navigator.language`（Node/SSR 会抛 `ReferenceError`） | 逐项探测并兜底 `"en"`，同时支持 `SNAIL_LOCALE` / `LC_ALL` / `LC_MESSAGES` / `LANG` |
| 语言只有 `zh` / `en` | 同样是 `zh` / `en`（`languages` 常量） |

## 刻意的行为变更

这些是重写时**故意**改掉的语义，升级时需要复查自己的代码。

### 1. 去掉 `reflect-metadata`

不再需要安装或 import polyfill。库改用自带的元数据仓库（`WeakMap` 结构，支持沿类原型链查找），
`dependencies` 里只剩 axios。类型层面完全不受影响。

### 2. `Reflect.getMetadata` 换成库自己的元数据 API

旧版所有装饰器都写 `Reflect.defineMetadata` / `Reflect.getMetadata`。新版提供
`defineMetadata` / `getMetadata` / `getOwnMetadata` / `appendMetadata` / `mergeMetadata` /
`hasMetadata` / `deleteMetadata` / `collectMethodKeys` / `resolveOwner` / `clearMetadataRegistry`。

同时元数据键从 `Symbol("…")` 改为 `Symbol.for("@snail-js/api:…")`：monorepo 里出现两份包副本时，
全局符号注册能保证它们读写**同一批**元数据槽。你的自定义装饰器请用
`customMetadataKey("acme/xxx")`。

### 3. 全局 `PluginManager` + `switchServer()` 换成「每个 server 一个」

旧版是单例 `PluginManager`，外加一个可变的 `_server` 指针，`getHooks()` 之前必须先
`switchServer(server)` 或 `PluginManager.switchServer(this)`。任何两个 server 交错 `await`
都会静默读到**另一个** server 的插件。

新版每个 `SnailServer` 拥有自己的 `PluginManager`（构造时传入 server 名与解析后的选项），
这类 bug 在类型上已经不可表达。`switchServer` 不存在了。

### 4. `onCodeError` 不再吞掉错误

旧实现的失败路径在 `catch` 里只调用 `onError` 回调，然后什么都不返回（`undefined`），于是
`await send()` 会「成功」解析为 `undefined`，调用方以为请求成功了；`onCodeError` 注册的回调
在旧实现里甚至不会被触发，业务码也从来没被校验过。

新版：业务码被拒绝时抛 `SnailResponseError`，`send()` 必然 reject。`onCodeError` 是纯观察者
（也修好了参数形状：从 `(code, data)` 变成 `({ code, payload, error })`）。
插件的 `onError` 钩子同理 —— 只观察，错误会在其之后重新抛出。

### 5. 方法事件新增 `onFinish` / `onHitCache`

旧版只有 `onSuccess` / `onError` / `onCodeError`。新版补齐了两个必需的事件：

- `onFinish`：在 `finally` 里触发，成功、失败、**取消**都会触发 —— 这是关闭 loading 的唯一可靠位置；
- `onHitCache`：响应由缓存提供时触发（配合 `SnailMethod.result.fromCache`）。

### 6. `@Version` 不再改写共享的 `server.baseURL`

旧版的 `Versioning` 插件在第一次请求时执行
`server.defaults.baseURL = urlBuild(server.defaults.baseURL, "v" + defaultVersion)`，
之后按请求做字符串替换。也就是说**版本状态挂在 server 的共享配置上**：两个版本交替请求时，
谁先跑谁就改了别人的 `baseURL`；同一 server 上不同 `@Version` 的方法互相污染。

新版把版本处理留在**请求级 config** 上，`Service.options.baseURL` 在运行期不再被改写。
版本能力的具体选项与行为会在插件文档批次里说明。

### 7. `loacl` → `locale`

目录重命名，并顺手修掉了「无条件读 `navigator`」与「缺失 key 返回空字符串」两个问题。
`expand()` 更名为 `registerMessages()`。见[本地化](/guide/localization)。

### 8. `createApi` 返回的代理只构造请求，不发送

旧版 `createApi` 的代理 `get` handler 在**取属性时**就创建 axios 实例（`createAxios(...)`），
并返回 `() => new SnailMethod(...)`；`SnailMethod` 还要再 `.request()` 一次才拿到 `send`。

新版的代理是**每次调用**才构造一个 `SnailMethod`（`createApi` 的结果本身按 api 类缓存），
它携带请求配置、参数描述符与路由，`send()` 才真正进入管线。带来三个直接结果：

- `api.getUser("1")` 不发任何请求，可以安全地先订阅事件再发送；
- `send()` 可以覆盖代理时传入的参数（`bound.send("2")`）；
- 每次 `send()` 都从干净的配置开始，上一次发送里插件的改动不会泄漏到下一次。

### 9. 其它值得注意的变更

| 变更 | 说明 |
| --- | --- |
| 每个 server 一个 axios 实例 | 旧版 `axiosManager` 是单例，按名字复用实例；新版 `Service.axios` 由该 server 独占 |
| 请求配置在构建函数里一次性合并 | 旧版把 server 的 `defaults` 与 api/method 选项 `Object.assign` 混在一起，默认值有两个来源；新版只在 `buildBaseRequestConfig` 一处应用 |
| 错误/参数消息更具体 | 旧版多处 `console.error` 后继续执行；新版直接抛错，且消息里带方法与参数名 |
| 无 key 参数必须普通对象 | 旧版对非对象值会带着错误继续拼装；新版抛 `SnailDecoratorError` |
| 占位符缺值必抛错 | 旧版先 `console.error` 再抛出一条不含路由名的消息 |
| 进度装饰器 | 旧版把 `@UploadProgress` 的元数据读在 `api.constructor` 上（类级）；新版存在**方法**级，并按方法选项 → 装饰器顺序取值 |

## 迁移检查清单

- [ ] `pnpm remove reflect-metadata`，并从应用入口删掉 `import "reflect-metadata"`
- [ ] 从 tsconfig 删除 `types: ["reflect-metadata"]` 与 `emitDecoratorMetadata`，确认 `experimentalDecorators: true`
- [ ] 把 `@Param` 改成 `@Params`
- [ ] `enableLog: true` 改成 `logLevel: "info"`（或按需 `"warn"` / `"debug"`）
- [ ] 把 `@Server({ cache, cacheFor, versionManage })` 拆成对应的插件安装，并把 `stateHook` 改成 `@Server({ stateAdapter })`（默认 `SnailAdapter`，Vue 用 `VueRef`、React 用 `ReactState`）
- [ ] `@Before` / `@After` / `@Cache` / `@NoCache` / `@HitSource` / `@Version` / `@Transform` 的引用改到插件文档描述的写法
- [ ] 把 `method.request().send()` 改成 `await method.send()`
- [ ] 把 `onSuccess((res) => res.data…)` 改成 `onSuccess((result) => result.data…)`
- [ ] 把 `onCodeError((code, data) => …)` 改成 `onCodeError(({ code, payload }) => …)`
- [ ] 复查所有「依赖 `onCodeError` 吞掉异常才能继续」的调用点 —— 现在必须 `try/catch`
- [ ] 用 `onFinish` 关闭 loading，而不是在成功/失败两条路里各写一遍
- [ ] 把「读 `localization.expand`」改成 `registerMessages`

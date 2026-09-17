# 本地化

库里所有面向用户的文本（错误消息、日志）都来自一个消息目录，使用 `%s` 占位符，
并可以在运行时切换语言或覆盖任意一条措辞。

```ts
import { getLocale, registerMessages, setLocale, t } from "@snail-js/api";

setLocale("zh");                    // 切换到内置中文目录（"zh-CN"、"zh_TW" 都行）
getLocale();                        // "zh"

t("error.response.code", "SVC.UserApi.list", "500");
// "[SVC.UserApi.list] 业务状态码校验未通过：code=500"
```

## 模块级 API

| 导出 | 签名 | 说明 |
| --- | --- | --- |
| `setLocale` | `(input: SnailLocaleInput) => void` | 切换语言，或合并一份自定义目录 |
| `getLocale` | `() => SnailLanguage` | 当前语言标签 |
| `t` | `(key: string, ...args: Array<string \| number>) => string` | 翻译一条消息 |
| `registerMessages` | `(messages: SnailMessages) => void` | 追加/覆盖消息 |
| `localization` | `Localization` 实例 | 上面这些函数背后的共享实例 |
| `Localization` | `class` | 想隔离目录时可以自己 `new` 一个 |
| `zh` / `en` | `SnailMessages` | 内置目录对象 |
| `languages` | `string[]` | 内置目录名：`["zh", "en"]` |

```ts
type SnailLanguage = "zh" | "en" | (string & {});
type SnailMessages = Record<string, string>;
type SnailLocaleInput = SnailLanguage | SnailMessages;
```

## `setLocale` 的两种形态

```ts
// 形态一：语言标签 → 选中一个内置目录（zh* → zh，en* → en）
setLocale("zh-CN");
setLocale("en-US");

// 形态二：一份目录对象 → 合并到当前目录之上（适合应用自定义措辞）
setLocale({
  "error.response.code": "[%s] 后端返回了业务错误 code=%s"
});
```

::: warning 两个容易踩的点
1. **`setLocale("zh")` 会替换整个目录**，而不是合并。在它之前用 `registerMessages` 加的消息
   会被内置目录覆盖掉。要么先切换语言再注册，要么用 `setLocale({ ... })` 的合并形态。
2. **传一个不认识的标签**（例如 `"fr"`）只会记录 `getLocale() === "fr"`，目录保持为切换前的
   那一个 —— 库只内置了 `zh` 与 `en`。要支持别的语言，请用形态二灌一整套目录。
:::

## 语言探测

`localization` 是模块加载时创建的，初始语言按下面的顺序探测：

```text
1. navigator.languages[0] ?? navigator.language
2. process.env.SNAIL_LOCALE
3. process.env.LC_ALL
4. process.env.LC_MESSAGES
5. process.env.LANG
6. "en"
```

每一步都做了存在性判断，因此在 Node、Worker、SSR 里都不会抛 `ReferenceError`（这是相对旧版
的修复：旧实现无条件读 `navigator.language`）。只在浏览器里跑的应用通常不必调用
`setLocale`。

## 占位符

- 模板里的每个 `%s` 按出现顺序被参数替换；
- 参数是 `undefined` 时替换为空字符串；
- key 不存在时 `t()` **返回 key 本身**，而不是空字符串 —— 拼写错误会显式暴露，而不是变成
  一条空白错误消息（旧实现返回 `""`，把 typo 静默吞掉了）。

```ts
t("nope.not.exists");                          // "nope.not.exists"
t("error.request.timeout", "SVC.UserApi.get", 10000);
// "[SVC.UserApi.get] 请求超时（10000ms）"
```

## 内置 key 的分类

| 前缀 | 用途 |
| --- | --- |
| `error.decorator.*` | 装饰器用法错误（请求方式重复、参数装饰器位置、空 key 等） |
| `error.options.*` | 配置错误（缺 `@Server`、`baseURL` 非法、插件未注册/重名/依赖缺失） |
| `error.hook.*` | 生命周期链不变量（`next()` 多次调用、未知钩子名） |
| `error.request.*` | 传输层失败（失败、超时、取消） |
| `error.response.*` | 响应层失败（业务码、信封结构、JSON 解析） |
| `error.path.missing` | 路由占位符缺值 |
| `error.plugin.*` | 内置插件自己贡献的消息（校验、转换、缓存适配器） |
| `info.request.*` | `logLevel` 打开后的请求日志 |
| `info.cache.*` / `info.version.*` / `warn.version.change` | 缓存与版本插件贡献的消息 |
| `info.sse.*` / `info.ws.*` | 实时连接日志 |

`error.response.shape`（`[%s] 服务端返回数据不符合约定结构：缺少字段[%s]`）与
`error.response.json`（`[%s] 服务端返回的 JSON 解析失败：%s`）在当前核心中已提供措辞，
但核心本身不抛这两个错误 —— 它们留给需要做信封结构校验 / JSON 容错解析的插件使用。

## 贡献消息

插件在 `setup` 里用 `api.addMessages({...})` 贡献自己的消息，任意位置也可以用
`registerMessages({...})`：

```ts
import { createPlugin } from "@snail-js/api";

export const Cacheish = createPlugin({
  name: "cacheish",
  setup(_options, api) {
    api.addMessages({
      "cache.hit": "[%s] 缓存命中",
      "cache.miss": "[%s] 缓存未命中"
    });
    return {};
  }
});
```

建议给你的 key 加插件名前缀（`cache.*`、`trace.*`），避免与核心或别的插件撞车。

## 用独立的目录实例

需要同时保留多套措辞（例如给不同子系统用不同文案）时，自己 `new Localization(...)`：

```ts
import { Localization } from "@snail-js/api";

const adminLocale = new Localization("en");
adminLocale.setLocale({ "error.response.code": "[admin] code %s" });

adminLocale.t("error.response.code", "500"); // "[admin] code 500"
adminLocale.messages;                        // 目录快照（副本）
adminLocale.locale;                          // "en"
```

`new Localization(input?)` 的 `input` 与 `setLocale` 接受的东西一样；省略时执行上面那套
语言探测。

::: tip 与错误消息的关系
每个错误类抛出的 `message` 就是在抛出前用 `t(...)` 渲染好的字符串，所以**切换语言只影响之后
才抛出的错误**。已经捕获的错误对象保留当时的措辞。错误消息的 key 与模板见
[错误处理](/guide/errors#各错误的中文措辞)。
:::

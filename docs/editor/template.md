# 模板的来源与保存

## 来源：`TemplateSource`

设计模式下，列表出现在**「模板」页签**里（第一个页签，见[工具栏分组](#工具栏分组)）：点「加载模板」
重新拉取列表，选中一条再点它的「载入」，或者用「新建模板」从空白文档开始。填写模式里这个页签只在
`template` 没有把模板定死时才出现，里面的按钮换成本地载入。

| `kind` | 字段 | 行为 |
| --- | --- | --- |
| `local` | `content?` | 直接把文档交给编辑器，最简单的一种 |
| `remote` | `url`、`headers?` | 启动时用 `GET` 拉一次该 URL，响应可以是 JSON 文档、JSON 字符串或 HTML |
| `remote-list` | `url`、`headers?`、`contentUrl?`、`load?` | 拉一个模板列表，选中后再拉某一个条目的内容 |

`load` 只有两个取值，这是明确的产品规则：

- **`"auto"`**：编辑器就绪后立刻请求列表，并渲染列表里的**第一条**。适合「只有一个模板，
  打开就是这个」的场景。
- **`"manual"`（默认）**：什么都不请求。列表渲染出来之后在下面出现一个「载入」按钮，
  由人挑一条再放进来。这也是填写模式想要的：打印员自己选模板，页面不能在背后替他选。

```ts
const template = {
  kind: "remote-list",
  url: "/api/contract-templates",
  contentUrl: (item) => `/api/contract-templates/${item.id}/content`,
  load: "manual"
} as const;
```

列表响应可以是裸数组，也可以是 `{ data: [...] }`；每个条目需要 `id` 和 `name`
（`description`、`updatedAt` 可选，`updatedAt` 原样显示不做本地化）。条目里直接带
`doc` / `content` / `template` 时，选中它不会再发一次请求。一条读不出来的条目会被跳过，
而不是让整个列表变空。

## 保存：`TemplateSaveTarget`

保存有**两种方式**，选哪一种只取决于 `save` prop 给的是什么：

| 方式 | `save` | 结果 |
| --- | --- | --- |
| 存成本地字符 | `{ kind: "local" }`（或干脆不给 `save`，只用 `onSave`） | 序列化后的模板写进 `localStorage`（`session: true` 则 `sessionStorage`），默认键 `snail-editor-template`；不给 `save` 时由 `onSave` 自己收下这份字符 |
| 向远程发送 | `{ kind: "remote", url, … }` | 把模板 `POST`（或 `PUT`）给后端 |

```ts
// 方式一：本地字符。本仓库的文档站示例就是这一种 —— 保存后不离开页面，刷新还在。
const saveLocal = { kind: "local" } as const;

// 方式二：发给远程。
const saveRemote = { kind: "remote", url: "/api/contract-templates", method: "PUT" } as const;
```

本机保存下来的那份模板可以在**填写模式**里载回来：「模板」页签里的「加载本地模板」读的就是同一个
槽位（`save` 给的是本地目标时用它的 `storageKey`，否则用默认键），所以「先设计、存本地、再打开填写」
是一条闭环的路径，不需要后端。

| `kind` | 字段 | 写入位置 |
| --- | --- | --- |
| `local` | `storageKey?`、`session?` | `session: true` 写 `sessionStorage`，否则写 `localStorage`；默认键是 `snail-editor-template` |
| `remote` | `url`、`method?`、`headers?`、`structured?` | `POST`（默认）或 `PUT` 到 `url` |

`structured` 决定请求体是什么，这一条必须说清楚：

- **`structured: true`（默认）**：请求体是整份 `TemplateDocument` 的 JSON，
  `Content-Type: application/json`。
- **`structured: false`**：请求体是序列化后的 **HTML 字符串**，`Content-Type: text/html`。
  给只存 markup 的后端用。

两种情况的响应都不会被解析，只有 `status` 会进 `SaveResult`；非 2xx 会在 `SaveResult.error`
上带一个码，同时 `save()` 会把它重新抛出。

```ts
const save = { kind: "remote", url: "/api/contract-templates", method: "PUT" } as const;
```

`onSave` 无论有没有配置保存目标都会被调用，所以「用自己的后端存」只需要给 `onSave`。

## 存下来的东西：`TemplateDocument`

```ts
interface TemplateDocument {
  version: number;              // 写入时的 TEMPLATE_VERSION，当前是 1
  doc: JSONContent;             // ProseMirror 文档本身
  variables?: TemplateVariableSummary[];
  page?: TemplatePageSetup;
  watermark?: TemplateWatermark;
  meta?: Record<string, unknown>;
}
```

刻意**不只是** `doc`：

- `variables` 是模板声明的变量清单（`key` / `label` / `type` / `required`）。
  一个只想校验模板、预览、或列出模板的后端，不应该为了知道「这份模板要填什么」
  去遍历一棵 ProseMirror 树。
- `page` 是纸张、方向、页边距和页数，`watermark` 是水印设置。有了它们，
  渲染方不需要编辑器就能把这张纸画出来 —— 因为水印不在 `doc` 里（见[水印](#水印)）。
- `version` 让未来的版本有东西可以迁移。写入时会剥掉所有下划线开头的易变属性
  （历史遗留的 `_updateTimestamp` 就是这样一个属性），否则同一份模板每次序列化都会不同，
  「文档变了吗」这个问题就永远答不上来。

模板内容也可能是 HTML 字符串或一整份 `TemplateDocument`，`parseTemplateInput` 三种都收。
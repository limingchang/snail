# TypeScript 配置

结论先说：**你只需要一个 `experimentalDecorators: true`**。不需要 `reflect-metadata`，
不需要 `emitDecoratorMetadata`，也不需要为这个库做任何 entry-point 注入。

## 最小可用配置

::: code-group

```json [最小可用]
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "preserve",
    "moduleResolution": "bundler",
    "strict": true,
    "experimentalDecorators": true
  }
}
```

```json [与库自身一致的推荐配置]
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "preserve",
    "moduleResolution": "bundler",
    "moduleDetection": "force",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "esModuleInterop": true,
    "strict": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "skipLibCheck": true,
    "experimentalDecorators": true,
    "useDefineForClassFields": false
  }
}
```

:::

推荐配置里的其它开关都不是本库的要求，只是它与 axios 一起在现代打包器下工作得最顺的组合。

## `experimentalDecorators: true` 是必须的

装饰器是这个库唯一的声明方式：

```ts
@Server({ baseURL: "/api" })
class BackEnd extends SnailServer {}

@Api("/user")
class UserApi {
  @Get("/:id")
  getUser(@Params("id") id: string): Promise<User> {
    return null!;
  }
}
```

`@Get(...)` 是**方法装饰器**，`@Params("id")` 是**参数装饰器**。参数装饰器只在 legacy
装饰器（`experimentalDecorators`）语义下可用，这也是 NestJS 生态一直使用的模式。
本库类型定义里的装饰器签名（`MethodDecorator`、`ParameterDecorator`、`ClassDecorator`）
同样按 legacy 语义书写。

::: warning 不加会怎样
类型检查会直接报错：类装饰器/方法装饰器无法解析为表达式，并提示需要开启 decorators 的
实验性支持；参数装饰器还会报「装饰器在此处无效」。把 `experimentalDecorators: true`
加上即可，无需改动任何业务代码。
:::

## 为什么不需要 `reflect-metadata`

`reflect-metadata` 提供的能力是「读取 TypeScript 编译产物里注入的 `design:type` /
`design:paramtypes` 等类型元数据」。这个库**从来不读这些元数据**：

- 参数归位靠的是它自己的装饰器写下的描述符（`@Query("page")` 里的 key 是显式写出来的）；
- 请求方式、路由、静态 header 都是显式声明；
- 类型信息全部停留在类型层面，由 `SnailApiProxy` 从方法声明的返回类型里推导，运行时不参与。

所以依赖它只是白白多一个必须在应用入口 `import "reflect-metadata"` 的 polyfill。
本库改用一个内部元数据仓库（`WeakMap<owner, Map<slot, Map<key, value>>>`），并支持沿类原型链
查找，因此基类 api / 基类 server 依然能把配置传给子类。相关 API 见
[API 参考](/api/reference#元数据仓库)。

顺带一提：在 TypeScript 7 中，`emitDecoratorMetadata` 已被接受但**不再真正产出**
`design:*` 元数据。即使你想用 `reflect-metadata`，这条路也已经关闭了。

::: tip 于是你得到三件事
1. 不需要安装、不需要 import polyfill；
2. `dependencies` 里只剩 axios；
3. 浏览器、Node、Worker、边缘运行时里的行为完全一致 —— 因为没有 polyfill 参与。
:::

## 那些你可能从旧配置里抄过来的东西

旧版（`0.1.x`）文档让你这样配：

```json
{
  "compilerOptions": {
    "types": ["reflect-metadata"],
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    "strictPropertyInitialization": false
  }
}
```

现在逐条说明：

| 旧写法 | 现在 | 说明 |
| --- | --- | --- |
| `"types": ["reflect-metadata"]` | **删除** | `reflect-metadata` 不是依赖，也没被安装，类型检查会报找不到类型定义文件 |
| `emitDecoratorMetadata: true` | **删除** | TypeScript 7 里是 no-op，留着只会误导 |
| `strictPropertyInitialization: false` | 视需要保留 | 只在用「声明字段、靠装饰器赋值」的 DTO 类时才需要，本库核心不强制 |
| `"baseUrl": "."` | **删除** | TypeScript 7 已弃用并停止支持 `baseUrl`，留着会直接报废弃错误；路径别名请改用 `paths` + `moduleResolution: "bundler"` |

::: warning 关于 `rootDir`
TypeScript 7 在需要 emit 时要求显式 `rootDir`（旧的隐式推断不再生效）。这只影响**发布
产物的库/应用**：`@snail-js/api` 自己通过 `exports` 映射发布 `dist/*.js` 与 `dist/*.d.ts`，
消费者不参与它的编译，**不需要**设置 `rootDir`，`baseUrl` 也不需要。如果你是在给自己的
包配 `tsc` 构建，才需要补上它。
:::

## 模块解析

本库的 `package.json` 提供标准 `exports` 映射：

```json
{
  "exports": {
    ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" },
    "./plugins": { "types": "./dist/plugins/index.d.ts", "import": "./dist/plugins/index.js" },
    "./strategies": { "types": "./dist/strategies/index.d.ts", "import": "./dist/strategies/index.js" },
    "./adapter/vue": { "types": "./dist/adapter/vue.d.ts", "import": "./dist/adapter/vue.js" },
    "./adapter/react": { "types": "./dist/adapter/react.d.ts", "import": "./dist/adapter/react.js" },
    "./package.json": "./package.json"
  }
}
```

`./adapter/vue` 与 `./adapter/react` 是独立子路径，不是任何 barrel 的再导出：核心、
`./plugins` 与 `./strategies` 都必须保持不静态引入 `vue` / `react`，否则只想要 `Cache` 的
React 应用会因为解析不到 `vue` 而构建失败，与框架无关的应用则会把两个框架都打进 bundle。框架
的选择是 server 选项 `@Server({ stateAdapter })`，默认的 `SnailAdapter` 从包根导出。详见
[框架适配器](./adapters.md)。

因此 `moduleResolution` 用 `"bundler"`（打包器 / Vite / Next）或 `"node16"`/`"nodenext"`
（Node 原生 ESM）都能正确解析到类型。别再使用已废弃的 `"node"`/`"node10"` 解析模式。

## 与 `verbatimModuleSyntax` / `isolatedModules` 共存

库的类型全部可以从包根按需 `import type`，配合 `verbatimModuleSyntax: true` 时请把纯类型导入
写成 `import type`：

```ts
import { Api, Get, Server, SnailServer } from "@snail-js/api";
import type { SnailResult, SnailServerOptions } from "@snail-js/api";
```

如果打开了 `isolatedModules`，不要 re-export 一个只用作类型的符号而不加 `type` 修饰符 ——
这与本库无关，但会让 `export { SnailResult }` 这类代码在单文件转译时失败。

## 环境要求

| 项 | 要求 |
| --- | --- |
| Node | `>= 20.19.0`（仓库 `engines` 字段；流式传输用到 `fetch` + `ReadableStream`） |
| TypeScript | 在 5.x 与 7.x 上均可使用 legacy 装饰器与参数装饰器 |
| axios | `^1.20.0`（peer dependency，必须由应用安装） |
| 可选 peer | `vue >= 3.4.0`、`react >= 18`、`zod >= 3.23`，仅在使用 `@snail-js/api/adapter/vue`、`@snail-js/api/adapter/react` 或校验插件时需要 |

## 常见报错速查

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| 「无法解析类装饰器/方法装饰器签名，需要开启实验性装饰器支持」 | 缺少 `experimentalDecorators` | 打开该开关 |
| 「装饰器在此处无效」（指向参数） | 同上，或参数装饰器用在了构造函数 / 静态成员上 | 打开开关；把参数装饰器移到实例方法参数上 |
| `Cannot find type definition file for 'reflect-metadata'` | 抄了旧 tsconfig 的 `types` | 删掉 `"types": ["reflect-metadata"]` |
| `Option 'baseUrl' is deprecated and will stop functioning in TypeScript 7` | 抄了旧 tsconfig 的 `baseUrl` | 删掉 `baseUrl`，改用 `paths` |
| `TS2352`/推断异常：`data` 不是期望类型 | 装饰方法的返回类型写成了 `void`/`any` | 声明 `Promise<T>`，或调用处显式写泛型 `<T>` |
| `experimentalDecorators` 已开但 `.vue` 文件里装饰器报错 | SFC 没走同一份 tsconfig | 让编辑器/构建使用包含该开关的 tsconfig（如 `vue-tsc` 指向的配置） |

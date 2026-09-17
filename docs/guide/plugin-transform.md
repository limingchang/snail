# 转换插件 `Transform`

把 `JSON.parse` 出来的普通对象变成**类实例**，好让 `result.data instanceof UserDto` 成立、
DTO 上的方法可以直接调用。

```ts
import { Api, Get, Params } from "@snail-js/api";
import { ExposeName, PropertyType, Transform } from "@snail-js/api/plugins";
import { Service } from "./service";

Service.use(Transform());

class UserDto {
  @ExposeName("user_name") userName!: string;
  @PropertyType(() => Date) createdAt!: Date;
}

@Api("/user")
@Transform(UserDto)
class UserApi {
  @Get("/:id")
  getUser(@Params("id") id: string): Promise<UserDto> {
    return null!;
  }
}

const { data } = await Service.createApi(UserApi).getUser("1").send();
data instanceof UserDto;   // true
```

## 为什么是手写的

这个插件**没有** `class-transformer`，**没有** `reflect-metadata`，也没有任何 design-time 类型
发射：

- `class-transformer` 会是 axios 旁边的第二个运行时依赖；
- `reflect-metadata` 在这里根本帮不上忙 —— TypeScript 7 从不发射 `design:type`，所以**任何**
  库都无法在没有编译器插件的情况下发现一个属性的类型。

因此 `@PropertyType()` 声明的不是「变通方案」，而是运行时唯一可得的类型真相。

```ts
interface TransformOptions {
  dto?: DtoType;          // 没有 @Transform() 装饰器时使用的 DTO
  keepUnknown?: boolean;  // 默认 false
  maxDepth?: number;      // 默认 32
}

type DtoType<T = unknown> = (new () => T) & {
  fromJSON?: (raw: unknown, ctx?: SnailContext) => T;
};
```

`Transform` 这个名字同样是「一物两用」：传一个构造函数是装饰器（`@Transform(UserDto)`），传
选项（或什么都不传）是插件工厂（`Service.use(Transform())`）—— 靠 `typeof input === "function"`
区分。

## 三个装饰器

| 装饰器 | 作用 | 错误 |
| --- | --- | --- |
| `@Transform(DtoClass)` | 选择这个类 / 方法的载荷要被水合成什么 | 不是函数 → `SnailDecoratorError`（「expects a DTO class, not an instance or a plain object」） |
| `@PropertyType(() => X, { array?: boolean })` | 声明一个属性的运行时类型 | 不是函数 → `@PropertyType() expects a lazy type resolver` |
| `@ExposeName("json_key")` | 从另一个名字的 JSON 键读取属性 | 非空字符串之外 → `@ExposeName() requires a non-empty JSON key` |

`@PropertyType` 的解析器**必须**是惰性的（`() => X`），这不是审美问题：两个互相引用的 DTO
如果直接写 `@PropertyType(ChildDto)`，会在类定义阶段撞上暂时性死区。

```ts
class OrderDto {
  @PropertyType(() => UserDto) user!: UserDto;
  @PropertyType(() => ItemDto, { array: true }) items!: ItemDto[];
  @PropertyType(() => Date) createdAt!: Date;
}
```

`{ array: true }` 必须显式声明而不是推断：一个空的 JSON 数组无法告诉插件里面装的是 DTO 还是
原始值，猜的结果在两种情况下都是 `[]`，只会把错误藏起来。

没有 `@PropertyType` 的属性按原样赋值，所以原始值、普通对象、原始值数组都不需要声明 —— 但
它们**仍然需要让属性可见**，否则下面的未知键规则会把它们丢掉。

排除一个键不需要任何装饰器：未声明的 JSON 键本来就会被丢掉。

## 水合模型

```text
hydrate(raw, DtoClass)
  raw 是原始值 / null / 超过深度  → 原样返回
  raw 是数组                     → 逐项水合
  DtoClass 有 static fromJSON    → fromJSON(raw, ctx) 直接胜出
  其它                           → new DtoClass() + 已声明的属性
```

### `static fromJSON` 优先

```ts
class MoneyDto {
  cents!: number;

  static fromJSON(raw: { amount: string }): MoneyDto {
    const dto = new MoneyDto();
    dto.cents = Math.round(Number(raw.amount) * 100);
    return dto;
  }
}
```

手写工厂知道的东西比装饰器多，所以它**完全胜出**，并且绕过白名单 —— 字段由类自己决定，而不是
由 JSON 的形状决定。

### 「什么都没声明」的 DTO 会复制每一个键

属性的已知名字来自两个来源，两个都必要：

1. **属性装饰器** —— 这是唯一能看见 `field!: T` 声明的途径（TypeScript 在编译期把它擦掉了）；
2. **实例自己的键** —— 覆盖初始化过的字段与构造函数赋值，让一个只被部分装饰的 DTO 继续可用。

::: tip 为什么下面的 DTO 能拿到全部字段
```ts
class UserDto {
  id!: number;
  name!: string;
}
```
`tsconfig` 里 `useDefineForClassFields: false` 时，`field!: T` 这种**只声明不初始化**的写法不会
产生任何自己的键，也没有属性装饰器 —— 于是「已知属性集合」是空的，而空集合的含义是
「这个类什么都没声明」：**JSON 的每一个自有键都会被赋值**。这正是为这个写法准备的行为。

一旦类里出现了**任意一个**被装饰的属性或初始化字段，白名单就生效了，未声明的键会被丢掉。
:::

### `keepUnknown`

```ts
interface TransformOptions {
  keepUnknown?: boolean;   // 默认 false
}
```

默认 `false`：DTO 是一张白名单，把未声明的键带到实例上，正是后端内部字段泄漏进模板的路径。
设为 `true` 时，所有未被消费的 JSON 键都会被复制过来。

```ts
Service.use(Transform({ keepUnknown: true }));
```

## 深度与环

```ts
const DEFAULT_MAX_DEPTH = 32;
```

递归里有三道闸，每一道都在修一种会让它挂掉或撒谎的方式：

| 闸 | 作用 |
| --- | --- |
| 非对象原样返回 | 原始值载荷直接穿过 |
| `depth > maxDepth` | 拦住**自引用**的 `@PropertyType` 链 |
| `seen: WeakSet` | 拦住**成环**的 JSON 图 —— 只看深度只会推迟爆炸（分支递归是指数级的，不是线性的） |

`seen` 里的元素在 `finally` 里被移除，所以被两处引用的同一个值仍会在两处各自水合；只有**当前
路径上**的环会被短路。

## 优先级与响应改写

`priority: 0`。反向链里它排在 `-50` 的校验插件**之后**，原因见
[校验插件](./plugin-validate.md)：先校验原始 JSON，再水合成实例。

改写发生在 `afterResponse`，也就是响应还是唯一真相的时候 —— 信封校验、`buildResult` 与
`success` 事件都读 `ctx.response`，所以 `result.data` 与后续步骤天然一致，不需要第二条代码
路径。

```ts
const envelope = response.data;
const payload = unwrapEnvelope(envelope, dataKey);
const hydrated = hydrate(payload, Dto, { keepUnknown, maxDepth, ctx });

ctx.setResponse({
  ...response,
  data: looksLikeEnvelope(envelope, dataKey)
    ? { ...envelope, [dataKey]: hydrated }   // 信封：只替换 data 字段，兄弟字段保留
    : hydrated                               // 裸载荷：整段替换
});
```

::: warning 水合失败不会污染响应
DTO 构造函数抛错、`fromJSON` 写错，都只会记一条 `error.plugin.transform` 警告，**原始 JSON
原样保留**。部分水合的响应体比完全没水合的更糟。
:::

没有 DTO（既没有装饰器也没有 `dto` 选项）时，插件是一个 **no-op**，载荷保持 `JSON.parse`
产出的普通对象。

::: warning 缓存命中不会经过这里
水合发生在 `afterResponse` 里，而缓存命中会停在下游 `dispatch` 之前，`afterResponse` 链根本
不运行。所以一个 `@Cacheable()` + `@Transform(UserDto)` 的方法，**第二次调用拿回的是普通
对象**，不是 `UserDto` 实例。要么在业务代码里用 `hydrate(data, UserDto)` 补一次，要么让该
方法不参与缓存。见[缓存插件](./plugin-cache.md)。
:::

## 独立使用 `hydrate`

```ts
import { hydrate } from "@snail-js/api/plugins";

interface HydrateOptions {
  keepUnknown?: boolean;   // 默认 false
  maxDepth?: number;       // 默认 32
  ctx?: SnailContext;      // 转发给 DTO 的 static fromJSON(raw, ctx)
}

const user = hydrate(raw, UserDto);
user instanceof UserDto;   // true
```

`hydrate` 是公开导出的，所以数据来自别处（本地存储、SSR 载荷、WebSocket 消息）时也能复用同一
套规则。原始值、`null`、未知的类或超深的输入都会**原样返回**而不是被包成一个空实例：调用方要
的是一个类，但一个看起来不像对象值的响应，保持原样比变成一个空壳有用。

## 相关

- [校验插件](./plugin-validate.md)：为什么校验必须在水合之前
- [TypeScript 配置](./typescript.md)：`experimentalDecorators` 与不需要 `reflect-metadata` 的原因
- [装饰器](./decorators.md)：`createPropertyDecorator` 与自定义元数据键

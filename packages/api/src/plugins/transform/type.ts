import type { SnailContext } from "../../core/context";

/**
 * JSON → 类的转换类型。
 *
 * 这里的一切都是刻意手写的：没有 `class-transformer`，没有 `reflect-metadata`，也没有
 * 设计期类型发射。TypeScript 7 根本无法发射构造函数参数类型，所以插件依赖 DTO 作者显式
 * 写下的 `@PropertyType()` 声明——这也是在没有编译器插件的情况下，运行时唯一能看见嵌套
 * 类型的方式。
 *
 * JSON → class transform types.
 *
 * Everything here is deliberately hand-rolled: no `class-transformer`, no
 * `reflect-metadata`, no design-time type emission. TypeScript 7 cannot emit
 * constructor parameter types at all, so the plugin relies on the explicit
 * `@PropertyType()` declarations the DTO author writes — which is also the only
 * way nested types are visible at runtime without a compiler plugin.
 */

/**
 * 转换插件可以水合进的类。
 *
 * `fromJSON` 是可选的、手写的：DTO 一旦声明它，它就优先于自动水合，因为一个知道如何从
 * JSON 构建自身的类，才是自身不变量的权威。
 *
 * A class the transform plugin can hydrate into.
 *
 * `fromJSON` is optional and hand-written: when a DTO declares it, it wins over
 * automatic hydration, because a class that knows how to build itself from JSON
 * is the authority on its own invariants.
 */
export type DtoType<T = unknown> = (new () => T) & {
  /**
   * 手写工厂。接收原始 JSON 值与实时上下文。
   *
   * Hand-written factory. Receives the raw JSON value and the live context.
   */
  fromJSON?: (raw: unknown, ctx?: SnailContext) => T;
};

/**
 * 单次 `@PropertyType()` 应用所接受的选项。
 *
 * Options for one `@PropertyType()` application.
 */
export interface PropertyTypeOptions {
  /**
   * 水合 `type` 的数组，而不是单个值。
   *
   * 必须显式声明而不能推断：空的 JSON 数组无法告诉插件里面装的是 DTO 还是基本类型，
   * 猜出来的结果在两种情况下都是 `[]`，却把错误藏了起来。
   *
   * Hydrate an array of `type` instead of a single value.
   *
   * Explicit rather than inferred: an empty JSON array cannot tell the plugin
   * whether it holds DTOs or primitives, so guessing would produce `[]` either
   * way while hiding the mistake.
   */
  array?: boolean;
}

/**
 * `@PropertyType()` 为某个属性存下的内容。
 *
 * What a `@PropertyType()` decorator stores for one property.
 */
export interface PropertyTypeSpec {
  /**
   * 惰性类型解析器，例如 `() => ChildDto`。
   *
   * 惰性是必需而非装饰性的：两个互相引用的 DTO 否则会在类定义阶段撞上暂时性死区。
   *
   * Lazy type resolver, e.g. `() => ChildDto`.
   *
   * Lazy is required, not cosmetic: two DTOs that reference each other would
   * otherwise hit a temporal dead zone at class-definition time.
   */
  type: () => unknown;

  /**
   * 额外选项，仅在装饰器传入过时存在。
   *
   * Extra options, when the decorator was given any.
   */
  options?: PropertyTypeOptions;
}

/**
 * `Transform` 插件工厂接受的选项。
 *
 * Options accepted by the `Transform` plugin factory.
 */
export interface TransformOptions {
  /**
   * 方法与 api 类都没有声明 DTO 时使用的 DTO。
   *
   * DTO used when neither the method nor the api class declares one.
   */
  dto?: DtoType;

  /**
   * 保留 DTO 未声明的 JSON 键。
   *
   * 默认 `false`：DTO 是一份白名单，把未声明的键带到实例上正是后端内部字段泄漏进模板的
   * 途径。什么都没声明的 DTO 是例外——没有白名单可施加，于是 JSON 的每个自有键都会被
   * 赋值。
   *
   * Keep JSON keys the DTO does not declare.
   *
   * Defaults to `false`: a DTO is a whitelist, and carrying undeclared keys onto
   * the instance is how internal backend fields leak into templates. A DTO that
   * declares *nothing* is the exception — there is no whitelist to apply, so every
   * own key of the JSON is assigned.
   */
  keepUnknown?: boolean;

  /**
   * 向下递归的最大对象深度。
   *
   * 默认 `32`。自我引用的 `@PropertyType` 加上深层嵌套（或循环）的 JSON 否则会一直递归
   * 到栈溢出，把整个请求一起带走。
   *
   * Maximum object depth to descend.
   *
   * Defaults to `32`. A self-referencing `@PropertyType` plus deeply nested (or
   * cyclic) JSON would otherwise recurse until the stack blew, taking the whole
   * request with it.
   */
  maxDepth?: number;
}

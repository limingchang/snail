import type { SnailContext } from "../core/context";

/**
 * 内置参数来源。
 *
 * `"params"` → 路径占位符，`"query"` → 查询字符串，`"data"` → 请求体，
 * `"header"` → 请求头。
 *
 * Built-in parameter sources.
 *
 * `"params"` → path placeholders, `"query"` → query string, `"data"` → request
 * body, `"header"` → request header.
 */
export type SnailBuiltinParamSource = "params" | "query" | "data" | "header";

/**
 * 参数来源 —— 某个内置名称，或插件通过 `createParamDecorator` 注册的任意字符串。
 *
 * A parameter source — a built-in name, or any string a plugin registered
 * through `createParamDecorator`.
 */
export type SnailParamSource = SnailBuiltinParamSource | (string & {});

/**
 * 参数解析器放置单个参数所需的全部信息。
 *
 * Everything a parameter resolver needs to place one argument.
 */
export interface SnailParamResolverInput {
  /**
   * 实时请求上下文；修改 `ctx.request` 即可影响即将发出的请求。
   *
   * Live request context; mutate `ctx.request` to affect the outgoing request.
   */
  ctx: SnailContext;
  /**
   * 位于 `index` 处的运行时参数值。
   *
   * The runtime argument value at `index`.
   */
  value: unknown;
  /**
   * 传给装饰器的 key（若已给出）。
   *
   * The key passed to the decorator, when one was given.
   */
  key: string | undefined;
  /**
   * 传给装饰器的额外选项（若有）。
   *
   * Extra options passed to the decorator, when any.
   */
  options: unknown;
  /**
   * 参数在方法签名中的位置。
   *
   * Position of the argument in the method signature.
   */
  index: number;
  /**
   * 该参数所属的方法名。
   *
   * Method name the argument belongs to.
   */
  methodName: string;
}

/**
 * 把一个被装饰的参数应用到请求上下文上。
 *
 * 内置来源使用 `core/args.ts` 中的解析器；插件通过 `createParamDecorator` 添加
 * 自己的解析器。
 *
 * Applies one decorated argument to the request context.
 *
 * Built-in sources use the resolvers in `core/args.ts`; plugins add their own
 * through `createParamDecorator`.
 */
export type SnailParamResolver = (input: SnailParamResolverInput) => void;

/**
 * 一次 `@Query()` / `@Params()` / 自定义参数装饰器的应用。
 *
 * One `@Query()` / `@Params()` / custom parameter decorator application.
 */
export interface SnailParamDescriptor {
  /**
   * 例如 `"query"`、`"params"`、`"data"`、`"header"`，或插件的来源名。
   *
   * e.g. `"query"`, `"params"`, `"data"`, `"header"`, or a plugin's source name.
   */
  readonly source: SnailParamSource;
  /**
   * 在方法签名中的位置。
   *
   * Position in the method signature.
   */
  readonly index: number;
  /**
   * 传给装饰器的 key（若有）。
   *
   * Key passed to the decorator, if any.
   */
  readonly key?: string;
  /**
   * 传给装饰器的额外选项（若有）。
   *
   * Extra options passed to the decorator, if any.
   */
  readonly options?: unknown;
  /**
   * 如何把这个参数应用到上下文。
   *
   * How to apply this argument to the context.
   */
  readonly resolve: SnailParamResolver;
}

/**
 * 贡献给请求的一种记录型（键值对）值。
 *
 * A record-shaped value contributed to the request.
 */
export type SnailParamRecord = Record<string, unknown>;

import { AxiosHeaders } from "axios";
import { SnailDecoratorError } from "../error/decorator";
import { t } from "../locale";
import type {
  SnailBuiltinParamSource,
  SnailParamDescriptor,
  SnailParamResolver,
  SnailParamResolverInput
} from "../typings/args";
import { capitalize } from "../utils/url";
import { isPlainObject } from "../utils/is";
import { replacePathParams } from "../utils/url";
import type { SnailContext } from "./context";

/**
 * 内置参数解析器。
 *
 * 每个解析器都直接改写上下文上的实时请求，这样参数装饰器就不必了解请求最终如何发出。
 * 无 key 的装饰器（`@Query() query: SomeShape`）会展开整个对象；带 key 的装饰器
 * （`@Query("page") page: number`）只放置单个值。用错属于程序错误，会立即抛错，
 * 错误信息中带上方法名和出错的参数名。
 *
 * Built-in parameter resolvers.
 *
 * Each one mutates the live request on the context, which keeps the argument
 * decorators free of any knowledge about how the request is eventually sent.
 *
 * A key-less decorator (`@Query() query: SomeShape`) spreads the whole object;
 * a keyed one (`@Query("page") page: number`) places a single value. Getting
 * that wrong is a programmer error and throws immediately, with a message that
 * names the method and the offending parameter.
 */

function assertPlainObject(
  input: SnailParamResolverInput,
  source: string
): asserts input is SnailParamResolverInput & { value: Record<string, unknown> } {
  if (!isPlainObject(input.value)) {
    throw new SnailDecoratorError(
      t("error.decorator.param.empty", `${input.methodName}.${source}`)
    );
  }
}

/**
 * 把一个值放进可变的请求头容器，容器不存在时先创建。
 *
 * Place a value into the mutable header bag, creating it when absent.
 *
 * @param ctx 当前请求上下文 / The current request context.
 * @returns 可写的 `AxiosHeaders` 实例 / The writable `AxiosHeaders` instance.
 */
function headerBag(ctx: SnailContext): AxiosHeaders {
  if (!(ctx.request.headers instanceof AxiosHeaders)) {
    ctx.request.headers = AxiosHeaders.from(ctx.request.headers ?? {});
  }
  return ctx.request.headers;
}

/**
 * `@Params()` —— 填充用于拼装最终 url 的 `:placeholder` 占位值。
 *
 * `@Params()` — fills `:placeholder` values used to build the final url.
 */
export const resolvePathParams: SnailParamResolver = (input) => {
  if (input.key !== undefined) {
    input.ctx.pathParams[input.key] = input.value;
    return;
  }
  assertPlainObject(input, "params");
  Object.assign(input.ctx.pathParams, input.value);
};

/**
 * `@Query()` —— 合并到查询字符串中。
 *
 * `@Query()` — merges into the query string.
 */
export const resolveQuery: SnailParamResolver = (input) => {
  const current = input.ctx.request.params;
  if (input.key !== undefined) {
    input.ctx.request.params = { ...(isPlainObject(current) ? current : {}), [input.key]: input.value };
    return;
  }
  assertPlainObject(input, "query");
  input.ctx.request.params = {
    ...(isPlainObject(current) ? current : {}),
    ...input.value
  };
};

/**
 * `@Data()` —— 构造请求体。
 *
 * 带 key 时把值合并进对象形式的请求体。不带 key 时，普通对象同样合并，
 * 而其他任何值（`FormData`、`Blob`、原始字符串、数组）都会**替换**请求体，
 * 以此保留非 JSON 上传的能力。
 *
 * `@Data()` — builds the request body.
 *
 * With a key the value is merged into an object body. Without a key a plain
 * object is merged, while anything else (`FormData`, `Blob`, a raw string,
 * an array) *replaces* the body so non-JSON uploads stay possible.
 */
export const resolveBody: SnailParamResolver = (input) => {
  const current = input.ctx.request.data;
  if (input.key !== undefined) {
    const base = isPlainObject(current) ? current : {};
    input.ctx.request.data = { ...base, [input.key]: input.value };
    return;
  }
  if (isPlainObject(input.value)) {
    const base = isPlainObject(current) ? current : {};
    input.ctx.request.data = { ...base, ...input.value };
    return;
  }
  input.ctx.request.data = input.value;
};

/**
 * `@Header()` —— 合并到请求头中。
 *
 * `@Header()` — merges into the request headers.
 */
export const resolveHeader: SnailParamResolver = (input) => {
  const headers = headerBag(input.ctx);
  if (input.key !== undefined) {
    headers.set(input.key, input.value as never);
    return;
  }
  assertPlainObject(input, "header");
  for (const [key, value] of Object.entries(input.value)) {
    headers.set(key, value as never);
  }
};

/**
 * 解析器注册表。
 *
 * `createParamDecorator` 会在这里查找 source，因此插件既可以复用内置 source，
 * 也可以注册自己的 source。
 *
 * The resolver registry.
 *
 * `createParamDecorator` looks sources up here, so a plugin can either reuse a
 * built-in source or register its own.
 */
export const paramResolvers: Record<string, SnailParamResolver> = {
  /** `@Params()`：填充 `:placeholder` 路径参数 / `@Params()`: `:placeholder` path values. */
  params: resolvePathParams,
  /** `@Query()`：合并进查询串 / `@Query()`: merged into the query string. */
  query: resolveQuery,
  /** `@Data()`：作为请求体 / `@Data()`: used as the request body. */
  data: resolveBody,
  /** `@HeaderValue()`：合并进请求头 / `@HeaderValue()`: merged into the request headers. */
  header: resolveHeader
};

/**
 * 以自定义 source 名称注册一个解析器。
 *
 * Register a resolver under a custom source name.
 *
 * @param source source 名称，供装饰器引用 / Source name referenced by decorators.
 * @param resolver 处理该 source 的解析函数 / The resolver handling that source.
 */
export function registerParamResolver(source: string, resolver: SnailParamResolver): void {
  paramResolvers[source] = resolver;
}

/**
 * 装饰器错误信息中使用的人类可读标签。
 *
 * Human-readable label used in decorator error messages.
 *
 * @param source source 名称 / Source name.
 * @returns 首字母大写的标签 / The label with its first letter capitalized.
 */
export function sourceLabel(source: string): string {
  return capitalize(source);
}

/**
 * `source` 已注册解析器时返回 `true`。
 *
 * `true` when `source` has a registered resolver.
 *
 * @param source 待检查的 source 名称 / Source name to check.
 * @returns 已注册解析器时为 `true` / `true` when a resolver is registered.
 */
export function hasParamResolver(source: string): boolean {
  return typeof paramResolvers[source] === "function";
}

/**
 * 所有已注册参数 source 的名称。
 *
 * Names of every registered parameter source.
 *
 * @returns source 名称列表 / The list of source names.
 */
export function paramSources(): string[] {
  return Object.keys(paramResolvers);
}

/**
 * 供自定义装饰器工厂使用的类型守卫。
 *
 * Type guard used by the custom-decorator factory.
 *
 * @param value 待检查的 source 名称 / Source name to check.
 * @returns 该 source 已注册时为 `true` / `true` when the source is registered.
 */
export function isBuiltinParamSource(value: string): value is SnailBuiltinParamSource {
  return value in paramResolvers;
}

/**
 * 把所有被装饰的参数应用到请求上。
 *
 * 描述符按参数下标升序执行：无论装饰器的求值顺序如何，`@Data("a") a` 与
 * `@Data("b") b` 都会得到 `{ a, b }`。TypeScript 是按参数下标**逆序**应用
 * 参数装饰器的。
 *
 * Apply every decorated argument to the request.
 *
 * Descriptors run in ascending parameter-index order so `@Data("a") a` followed
 * by `@Data("b") b` produces `{ a, b }` regardless of decorator evaluation order
 * (TypeScript applies parameter decorators in *reverse* index order).
 *
 * @param ctx 当前请求上下文 / The current request context.
 * @param args 调用方传入的实参 / The arguments supplied by the caller.
 */
export function applyParamDescriptors(
  ctx: SnailContext,
  args: readonly unknown[]
): void {
  if (ctx.descriptors.length === 0) return;

  const ordered = [...ctx.descriptors].sort((a, b) => a.index - b.index);

  for (const descriptor of ordered) {
    descriptor.resolve({
      ctx,
      value: args[descriptor.index],
      key: descriptor.key,
      options: descriptor.options,
      index: descriptor.index,
      methodName: ctx.methodName
    });
  }
}

/**
 * 替换 `:placeholder` 段，并把最终 url 写入请求。
 *
 * 它在参数装饰器之后运行，因为这里的全部意义就是拿到那些值。
 *
 * Substitute `:placeholder` segments and write the final url onto the request.
 *
 * Runs after the argument decorators, because the whole point is to have their
 * values available.
 *
 * @param ctx 当前请求上下文 / The current request context.
 */
export function finalizeRequestURL(ctx: SnailContext): void {
  const route = ctx.route;
  if (!route.includes(":")) {
    ctx.request.url = route;
    return;
  }

  const missing: string[] = [];
  const resolved = replacePathParams(route, ctx.pathParams, (name) => {
    missing.push(name);
    throw new SnailDecoratorError(t("error.path.missing", route, name, name));
  });

  if (missing.length === 0) ctx.request.url = resolved;
}

/**
 * 由普通记录构造 `AxiosHeaders` 实例。
 *
 * Build an `AxiosHeaders` instance from a plain record.
 *
 * @param headers 普通对象、已有的 `AxiosHeaders` 或 `undefined` /
 *   A plain record, an existing `AxiosHeaders`, or `undefined`.
 * @returns 可直接交给 axios 配置的实例 / An instance ready for the axios config.
 */
export function toAxiosHeaders(
  headers: Record<string, unknown> | AxiosHeaders | undefined
): AxiosHeaders {
  if (headers instanceof AxiosHeaders) return headers;
  return AxiosHeaders.from((headers ?? {}) as Record<string, string>);
}

/**
 * 从描述符列表中筛出属于某个 source 的项。
 *
 * Narrow a `SnailParamDescriptor` list to one source.
 *
 * @param descriptors 全部描述符 / All captured descriptors.
 * @param source 目标 source 名称 / The source name to keep.
 * @returns 匹配 source 的描述符 / The descriptors matching `source`.
 */
export function descriptorsOf(
  descriptors: readonly SnailParamDescriptor[],
  source: string
): SnailParamDescriptor[] {
  return descriptors.filter((descriptor) => descriptor.source === source);
}

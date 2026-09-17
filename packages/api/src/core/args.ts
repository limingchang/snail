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

/** Place a value into the mutable header bag, creating it when absent. */
function headerBag(ctx: SnailContext): AxiosHeaders {
  if (!(ctx.request.headers instanceof AxiosHeaders)) {
    ctx.request.headers = AxiosHeaders.from(ctx.request.headers ?? {});
  }
  return ctx.request.headers;
}

/** `@Params()` — fills `:placeholder` values used to build the final url. */
export const resolvePathParams: SnailParamResolver = (input) => {
  if (input.key !== undefined) {
    input.ctx.pathParams[input.key] = input.value;
    return;
  }
  assertPlainObject(input, "params");
  Object.assign(input.ctx.pathParams, input.value);
};

/** `@Query()` — merges into the query string. */
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

/** `@Header()` — merges into the request headers. */
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
 * The resolver registry.
 *
 * `createParamDecorator` looks sources up here, so a plugin can either reuse a
 * built-in source or register its own.
 */
export const paramResolvers: Record<string, SnailParamResolver> = {
  params: resolvePathParams,
  query: resolveQuery,
  data: resolveBody,
  header: resolveHeader
};

/** Register a resolver under a custom source name. */
export function registerParamResolver(source: string, resolver: SnailParamResolver): void {
  paramResolvers[source] = resolver;
}

/** Human-readable label used in decorator error messages. */
export function sourceLabel(source: string): string {
  return capitalize(source);
}

/** `true` when `source` has a registered resolver. */
export function hasParamResolver(source: string): boolean {
  return typeof paramResolvers[source] === "function";
}

/** Names of every registered parameter source. */
export function paramSources(): string[] {
  return Object.keys(paramResolvers);
}

/** Type guard used by the custom-decorator factory. */
export function isBuiltinParamSource(value: string): value is SnailBuiltinParamSource {
  return value in paramResolvers;
}

/**
 * Apply every decorated argument to the request.
 *
 * Descriptors run in ascending parameter-index order so `@Data("a") a` followed
 * by `@Data("b") b` produces `{ a, b }` regardless of decorator evaluation order
 * (TypeScript applies parameter decorators in *reverse* index order).
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
 * Substitute `:placeholder` segments and write the final url onto the request.
 *
 * Runs after the argument decorators, because the whole point is to have their
 * values available.
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

/** Build an `AxiosHeaders` instance from a plain record. */
export function toAxiosHeaders(
  headers: Record<string, unknown> | AxiosHeaders | undefined
): AxiosHeaders {
  if (headers instanceof AxiosHeaders) return headers;
  return AxiosHeaders.from((headers ?? {}) as Record<string, string>);
}

/** Narrow a `SnailParamDescriptor` list to one source. */
export function descriptorsOf(
  descriptors: readonly SnailParamDescriptor[],
  source: string
): SnailParamDescriptor[] {
  return descriptors.filter((descriptor) => descriptor.source === source);
}

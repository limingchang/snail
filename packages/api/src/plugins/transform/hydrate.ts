import { collectMethodKeys, getMetadata } from "../../core/metadata";
import { EXPOSE_NAME_KEY, PROPERTY_TYPE_KEY } from "./decorators";
import type { SnailContext } from "../../core/context";
import type { DtoType, PropertyTypeSpec } from "./type";

/**
 * JSON → 类的水合引擎。
 *
 * 刻意手写：`class-transformer` 会成为 axios 之外的第二份运行时依赖，而
 * `reflect-metadata` 在这里毫无帮助——TypeScript 7 从不发射 `design:type`，因此**没有
 * 任何**库能在缺少编译器插件的情况下发现属性类型。本插件读取的声明（`@PropertyType`）
 * 因此不是权宜之计，而是运行时唯一可用的真相来源。
 *
 * ## 模型
 *
 * 基本类型、`null` 或深度超限的值原样返回；数组会为每一项生成实例；DTO 上若存在静态
 * `fromJSON`，它直接胜出；否则新建实例并只填充已声明的属性。
 *
 * The JSON → class hydration engine.
 *
 * Hand-written on purpose: `class-transformer` would be a second runtime
 * dependency next to axios, and `reflect-metadata` cannot help at all here —
 * TypeScript 7 never emits `design:type`, so *no* library can discover a property
 * type without a compiler plugin. The declarations this plugin reads
 * (`@PropertyType`) are therefore not a workaround but the only runtime source of
 * truth available.
 *
 * ## Model
 *
 * ```text
 * hydrate(raw, DtoClass)
 *   raw is a primitive / null / too deep → returned unchanged
 *   raw is an array                     → one instance per item
 *   DtoClass has static fromJSON        → fromJSON(raw, ctx) wins outright
 *   otherwise                           → new DtoClass() + declared properties
 * ```
 */

/**
 * 调用方未设置 `maxDepth` 时使用的深度。
 *
 * Depth used when the caller does not set `maxDepth`.
 */
export const DEFAULT_MAX_DEPTH = 32;

/**
 * {@link hydrate} 接受的选项。
 *
 * Options accepted by {@link hydrate}.
 */
export interface HydrateOptions {
  /**
   * 保留 DTO 未声明的 JSON 键。默认 `false`。
   *
   * Keep JSON keys the DTO does not declare. Defaults to `false`.
   */
  keepUnknown?: boolean;

  /**
   * 向下递归的最大对象深度。默认 {@link DEFAULT_MAX_DEPTH}。
   *
   * Maximum object depth to descend. Defaults to {@link DEFAULT_MAX_DEPTH}.
   */
  maxDepth?: number;

  /**
   * 转发给 DTO 的 `static fromJSON(raw, ctx)`。
   *
   * Forwarded to a DTO's `static fromJSON(raw, ctx)`.
   */
  ctx?: SnailContext;
}

/** {@link HydrateOptions} with every default applied. */
interface ResolvedHydrateOptions {
  keepUnknown: boolean;
  maxDepth: number;
  ctx: SnailContext | undefined;
}

/** `true` for an own (not inherited) property. */
function hasOwn(target: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(target, key);
}

/**
 * Revive a JSON date.
 *
 * A string that `new Date()` rejects is returned unchanged: an `Invalid Date` is
 * truthy, serialises to `null` and fails every later check somewhere far from the
 * cause, so keeping the original string at least leaves the bug where it is.
 */
function reviveDate(value: unknown): unknown {
  if (value instanceof Date) return value;
  if (typeof value !== "string" && typeof value !== "number") return value;

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date;
}

/**
 * The property names a DTO declares.
 *
 * Two sources, and both are needed:
 * - the property decorators, which are the only way to see a `field!: T`
 *   declaration (TypeScript erases those at compile time);
 * - the instance's own keys, which cover initialised fields and constructor
 *   assignments and let a partially decorated DTO keep working.
 *
 * An empty result means the class declares nothing at all — see
 * {@link buildInstance}.
 */
function knownPropertyNames(DtoClass: DtoType, instance: object): Set<string> {
  const names = new Set<string>([
    ...collectMethodKeys(PROPERTY_TYPE_KEY, DtoClass),
    ...collectMethodKeys(EXPOSE_NAME_KEY, DtoClass)
  ]);

  for (const key of Object.keys(instance)) names.add(key);
  return names;
}

/** Shallow-copy every own key of the JSON onto the instance. */
function copyOwnKeys(
  target: Record<string, unknown>,
  source: Record<string, unknown>
): void {
  for (const key of Object.keys(source)) target[key] = source[key];
}

/**
 * Hydrate one property value using the type declared for it.
 *
 * `childDepth` is the depth of `value` itself, so the depth guard in
 * {@link hydrateInto} can stop the descent before the stack does.
 */
function hydrateProperty(
  value: unknown,
  spec: PropertyTypeSpec | undefined,
  options: ResolvedHydrateOptions,
  childDepth: number,
  seen: WeakSet<object>
): unknown {
  if (!spec || value === null || value === undefined) return value;

  const resolved = spec.type();

  if (spec.options?.array === true) {
    if (!Array.isArray(value)) return value;
    return value.map((item) =>
      hydrateValue(item, resolved, options, childDepth, seen)
    );
  }

  return hydrateValue(value, resolved, options, childDepth, seen);
}

/**
 * Hydrate a single value against a resolved constructor.
 *
 * Primitives need no work — `JSON.parse` already produced the right JavaScript
 * type — and a non-function resolver is treated as "no type declared" rather than
 * a crash, because a typo in a decorator must not break every response.
 */
function hydrateValue(
  value: unknown,
  resolved: unknown,
  options: ResolvedHydrateOptions,
  depth: number,
  seen: WeakSet<object>
): unknown {
  if (value === null || value === undefined) return value;
  if (resolved === Date) return reviveDate(value);
  if (resolved === String || resolved === Number || resolved === Boolean) return value;
  if (typeof resolved !== "function") return value;

  return hydrateInto(value, resolved as DtoType, options, depth, seen);
}

/**
 * Build one instance, honouring `fromJSON`, the declared properties and
 * `keepUnknown`.
 */
function buildInstance<T>(
  raw: Record<string, unknown>,
  DtoClass: DtoType<T>,
  options: ResolvedHydrateOptions,
  depth: number,
  seen: WeakSet<object>
): T {
  // A hand-written factory knows more than the decorators do, so it wins. It also
  // bypasses the whitelist: the class, not the JSON shape, decides its own fields.
  if (typeof DtoClass.fromJSON === "function") {
    return DtoClass.fromJSON(raw, options.ctx);
  }

  const instance = new DtoClass() as Record<string, unknown>;
  const known = knownPropertyNames(DtoClass, instance);

  // Nothing is declared: there is no whitelist to apply, so every own key of the
  // JSON is assigned. This is the documented behaviour for a DTO written as a bare
  // `class UserDto { id!: number }`.
  if (known.size === 0) {
    copyOwnKeys(instance, raw);
    return instance as T;
  }

  const consumed = new Set<string>();

  for (const property of known) {
    const jsonKey =
      getMetadata<string>(EXPOSE_NAME_KEY, DtoClass, property) ?? property;
    if (!hasOwn(raw, jsonKey)) continue;

    consumed.add(jsonKey);
    const spec = getMetadata<PropertyTypeSpec>(
      PROPERTY_TYPE_KEY,
      DtoClass,
      property
    );
    instance[property] = hydrateProperty(
      raw[jsonKey],
      spec,
      options,
      depth + 1,
      seen
    );
  }

  if (options.keepUnknown) {
    for (const key of Object.keys(raw)) {
      if (consumed.has(key)) continue;
      instance[key] = raw[key];
    }
  }

  return instance as T;
}

/**
 * Recursive worker behind {@link hydrate}.
 *
 * Three guards, each fixing a way this could hang or lie:
 * - a non-object is returned unchanged, so a primitive payload passes through;
 * - `depth > maxDepth` stops a self-referencing `@PropertyType` chain;
 * - `seen` stops a *cyclic* JSON graph, which depth alone would only delay
 *   (branching recursion is exponential, not linear).
 */
function hydrateInto<T>(
  raw: unknown,
  DtoClass: DtoType<T>,
  options: ResolvedHydrateOptions,
  depth: number,
  seen: WeakSet<object>
): T {
  if (raw === null || typeof raw !== "object") return raw as T;
  if (depth > options.maxDepth) return raw as T;

  if (Array.isArray(raw)) {
    return raw.map((item) =>
      hydrateInto(item, DtoClass, options, depth + 1, seen)
    ) as T;
  }

  if (seen.has(raw)) return raw as T;

  seen.add(raw);
  try {
    return buildInstance(raw as Record<string, unknown>, DtoClass, options, depth, seen);
  } finally {
    // Removed again so a value referenced from two places is still hydrated in
    // both; only a cycle on the current path is short-circuited.
    seen.delete(raw);
  }
}

/**
 * 把普通 JSON 载荷变成 `DtoClass` 的实例。
 *
 * 基本类型、`null`、未知的类或过深的值都会原样返回而不是被包装：调用方要的是一个类实例，
 * 但一个看起来不像实例的响应，保持原样比变成一个空实例更有用。
 *
 * Turn a plain JSON payload into an instance of `DtoClass`.
 *
 * A primitive, `null`, an unknown class or an over-deep value is returned
 * unchanged rather than wrapped: the caller asked for a class, but a response that
 * does not look like one is more useful as-is than as an empty instance.
 *
 * ```ts
 * const user = hydrate(raw, UserDto);
 * user instanceof UserDto; // true
 * ```
 *
 * @param raw 原始 JSON 载荷 / The raw JSON payload.
 * @param DtoClass 要水合成的 DTO 类 / The DTO class to hydrate into.
 * @param options 水合选项 / Hydration options.
 * @returns `DtoClass` 的实例，或原样返回的 `raw` / An instance of `DtoClass`, or `raw` unchanged.
 */
export function hydrate<T>(
  raw: unknown,
  DtoClass: DtoType<T>,
  options: HydrateOptions = {}
): T {
  return hydrateInto(
    raw,
    DtoClass,
    {
      keepUnknown: options.keepUnknown ?? false,
      maxDepth: options.maxDepth ?? DEFAULT_MAX_DEPTH,
      ctx: options.ctx
    },
    0,
    new WeakSet<object>()
  );
}

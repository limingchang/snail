/**
 * `reflect-metadata` 的无依赖替代实现。
 *
 * TypeScript 7 取消了发出 `design:*` 元数据的能力：打开 `emitDecoratorMetadata`
 * 会被接受，但不会发出任何东西（对 `tsc` 7.0.2 实测：`__metadata` 辅助函数会生成，
 * 调用不会）。这恰好去掉了 `reflect-metadata` 为本库提供的唯一能力 —— 我们从来
 * 不需要推断构造函数参数类型，只需要自己的装饰器写入的元数据。
 *
 * 去掉它换来三件事：
 *   1. 应用入口不必安装或导入任何运行时 polyfill；
 *   2. `dependencies` 里少一项 —— axios 仍是唯一的一项；
 *   3. 在所有运行时（浏览器、Node、worker、边缘）行为一致，因为完全不涉及
 *      polyfill 的 `Reflect.defineMetadata`。
 *
 * 传统装饰器（`experimentalDecorators: true`）与参数装饰器仍由 TypeScript 7 完整支持。
 *
 * 存储结构为 `WeakMap<owner, Map<slot, Map<key, value>>>`：`slot` 是装饰器的
 * symbol 键，`owner` 永远是**类**（构造函数）。类级元数据放在内部 `CLASS_SLOT` 上，
 * 其余按方法名分槽；方法或参数上的装饰器收到的是原型，由 `resolveOwner` 映射回类。
 *
 * 装饰器的应用顺序很重要：参数装饰器（下标逆序）→ 方法装饰器 → 类装饰器。因此下面
 * 每个写入函数都只做**合并**，任何一个都不能覆盖已有值；数组形态的元数据只会追加，
 * 绝不替换。
 *
 * A dependency-free replacement for `reflect-metadata`.
 *
 * ## Why not `reflect-metadata`?
 *
 * TypeScript 7 dropped the ability to emit `design:*` metadata: enabling
 * `emitDecoratorMetadata` is accepted but silently emits nothing (verified
 * against `tsc` 7.0.2 — the `__metadata` helper is emitted, the calls are not).
 * That removes the only capability `reflect-metadata` ever provided to this
 * library: we have never needed inferred constructor parameter types, only the
 * metadata our *own* decorators write.
 *
 * Dropping it buys three things:
 *   1. no runtime polyfill to install or import at the app entry point;
 *   2. one fewer entry in `dependencies` — axios stays the only one;
 *   3. deterministic behaviour on every runtime (browser, Node, worker, edge)
 *      because the polyfill's `Reflect.defineMetadata` is not involved at all.
 *
 * Legacy decorators (`experimentalDecorators: true`) and parameter decorators
 * remain fully supported by TypeScript 7.
 *
 * ## Storage model
 *
 * ```text
 * WeakMap<owner, Map<slot, Map<key, value>>>
 *                 │       └── the decorator's symbol key
 *                 └── CLASS_SLOT for class metadata, else the method name
 * ```
 *
 * `owner` is always a *class* (constructor function). A decorator applied to a
 * method or parameter receives the prototype, so {@link resolveOwner} maps it
 * back to the class.
 *
 * ## Decorator application order (important)
 *
 * For `@Api("/u") class U { @Get() list(@Query("a") a: string) {} }` the
 * runtime order is:
 *
 * ```text
 *   1. parameter decorators   (reverse index order)
 *   2. method decorators
 *   3. class decorators
 * ```
 *
 * Every writer below therefore *merges*; none of them may clobber an existing
 * value. Array-shaped metadata is appended, never replaced.
 */

/**
 * 类级（非方法专属）元数据使用的内部槽位。
 *
 * Internal slot used for class-level (non method-specific) metadata.
 */
const CLASS_SLOT = Symbol.for("@snail-js/api:class-slot");

type OwnerRecord = Map<PropertyKey, Map<symbol, unknown>>;

let registry = new WeakMap<object, OwnerRecord>();

/**
 * 把装饰器收到的任意对象归一化成拥有该元数据的类。
 *
 * 类装饰器直接得到构造函数本身；方法或参数装饰器得到原型，这里取其
 * `prototype.constructor`；手工传入裸原型也同样处理。
 *
 * Normalise whatever a decorator receives into the class that owns the metadata.
 *
 * - class decorator → the constructor itself
 * - method / parameter decorator → `prototype.constructor`
 * - a bare prototype passed by hand → `prototype.constructor`
 *
 * @param target 装饰器收到的目标 / The target the decorator received.
 * @returns 拥有元数据的类 / The class that owns the metadata.
 * @throws 目标既不是类也不是原型时抛出 `TypeError` /
 *   `TypeError` when the target is neither a class nor a prototype.
 */
export function resolveOwner(target: unknown): object {
  if (typeof target === "function") return target;
  if (target !== null && typeof target === "object") {
    const ctor = (target as { constructor?: unknown }).constructor;
    if (typeof ctor === "function") return ctor;
  }
  throw new TypeError(
    "[snail] metadata target must be a class, a prototype or a constructor function"
  );
}

function slotOf(propertyKey?: PropertyKey): PropertyKey {
  return propertyKey ?? CLASS_SLOT;
}

function findSlotMap(owner: object, slot: PropertyKey): Map<symbol, unknown> | undefined {
  return registry.get(owner)?.get(slot);
}

function ensureSlotMap(owner: object, slot: PropertyKey): Map<symbol, unknown> {
  let record = registry.get(owner);
  if (!record) {
    record = new Map<PropertyKey, Map<symbol, unknown>>();
    registry.set(owner, record);
  }
  let slotMap = record.get(slot);
  if (!slotMap) {
    slotMap = new Map<symbol, unknown>();
    record.set(slot, slotMap);
  }
  return slotMap;
}

/**
 * 写入元数据，会替换同一个 (owner, slot, key) 三元组上原有的值。
 *
 * Write metadata, replacing any value previously written for the same
 * (owner, slot, key) triple.
 *
 * @param key 装饰器的 symbol 键 / The decorator's symbol key.
 * @param value 要写入的值 / The value to write.
 * @param target 类或原型 / The class or the prototype.
 * @param propertyKey 方法名；省略表示类级元数据 /
 *   Method name; omitted means class-level metadata.
 */
export function defineMetadata(
  key: symbol,
  value: unknown,
  target: unknown,
  propertyKey?: PropertyKey
): void {
  ensureSlotMap(resolveOwner(target), slotOf(propertyKey)).set(key, value);
}

/**
 * 只从该 owner 自身读取元数据，不沿原型链查找。
 *
 * Read metadata from exactly this owner, ignoring the prototype chain.
 *
 * @param key 装饰器的 symbol 键 / The decorator's symbol key.
 * @param target 类或原型 / The class or the prototype.
 * @param propertyKey 方法名；省略表示类级元数据 /
 *   Method name; omitted means class-level metadata.
 * @returns 已写入的值，或 `undefined` / The stored value, or `undefined`.
 */
export function getOwnMetadata<T = unknown>(
  key: symbol,
  target: unknown,
  propertyKey?: PropertyKey
): T | undefined {
  return findSlotMap(resolveOwner(target), slotOf(propertyKey))?.get(key) as T | undefined;
}

/**
 * 读取元数据，并沿类原型链向上查找，因此基类 api 或基类服务器可以给子类提供默认值。
 *
 * Read metadata, walking the class prototype chain so a base api class or a base
 * server class can supply defaults to its subclasses.
 *
 * @param key 装饰器的 symbol 键 / The decorator's symbol key.
 * @param target 类或原型 / The class or the prototype.
 * @param propertyKey 方法名；省略表示类级元数据 /
 *   Method name; omitted means class-level metadata.
 * @returns 沿原型链找到的第一个值，或 `undefined` /
 *   The first value found along the chain, or `undefined`.
 */
export function getMetadata<T = unknown>(
  key: symbol,
  target: unknown,
  propertyKey?: PropertyKey
): T | undefined {
  const slot = slotOf(propertyKey);
  let owner: object | null = resolveOwner(target);

  while (owner && owner !== Function.prototype && owner !== Object.prototype) {
    const slotMap = findSlotMap(owner, slot);
    if (slotMap?.has(key)) return slotMap.get(key) as T;
    owner = Object.getPrototypeOf(owner) as object | null;
  }
  return undefined;
}

/**
 * {@link getMetadata} 能找到内容时为 `true`。
 *
 * `true` when {@link getMetadata} would find something.
 *
 * @param key 装饰器的 symbol 键 / The decorator's symbol key.
 * @param target 类或原型 / The class or the prototype.
 * @param propertyKey 方法名；省略表示类级元数据 /
 *   Method name; omitted means class-level metadata.
 * @returns 能找到元数据时为 `true` / `true` when metadata can be found.
 */
export function hasMetadata(
  key: symbol,
  target: unknown,
  propertyKey?: PropertyKey
): boolean {
  return getMetadata(key, target, propertyKey) !== undefined;
}

/**
 * 向数组形态的元数据追加一项，并且总是创建新数组。
 *
 * 写时复制很重要：多个装饰器可以合法地贡献同一个键（四个 `@Query()` 参数、
 * 一个类级 `@Header()` 加一个方法级 `@Header()`），而这个数组绝不能与基类共享。
 *
 * Append to array-shaped metadata, always creating a fresh array.
 *
 * Copy-on-write matters: several decorators legitimately contribute to one key
 * (four `@Query()` parameters, a class-level `@Header()` plus a method-level
 * one) and the array must never be shared with a base class.
 *
 * @param key 装饰器的 symbol 键 / The decorator's symbol key.
 * @param value 要追加的一项 / The item to append.
 * @param target 类或原型 / The class or the prototype.
 * @param propertyKey 方法名；省略表示类级元数据 /
 *   Method name; omitted means class-level metadata.
 */
export function appendMetadata<T>(
  key: symbol,
  value: T,
  target: unknown,
  propertyKey?: PropertyKey
): void {
  const previous = getOwnMetadata<T[]>(key, target, propertyKey);
  defineMetadata(key, previous ? [...previous, value] : [value], target, propertyKey);
}

/**
 * 把一个记录合并进记录形态的元数据（类级 `@Header` 等）。
 *
 * Merge a record into record-shaped metadata (class-level `@Header` and friends).
 *
 * @param key 装饰器的 symbol 键 / The decorator's symbol key.
 * @param value 要合并的记录 / The record to merge in.
 * @param target 类或原型 / The class or the prototype.
 * @param propertyKey 方法名；省略表示类级元数据 /
 *   Method name; omitted means class-level metadata.
 */
export function mergeMetadata<T extends object>(
  key: symbol,
  value: T,
  target: unknown,
  propertyKey?: PropertyKey
): void {
  const previous = getOwnMetadata<T>(key, target, propertyKey);
  defineMetadata(key, previous ? { ...previous, ...value } : { ...value }, target, propertyKey);
}

/**
 * 只从该 owner 自身删除元数据。
 *
 * Delete metadata from exactly this owner. Returns whether anything was removed.
 *
 * @param key 装饰器的 symbol 键 / The decorator's symbol key.
 * @param target 类或原型 / The class or the prototype.
 * @param propertyKey 方法名；省略表示类级元数据 /
 *   Method name; omitted means class-level metadata.
 * @returns 确实删掉了内容时为 `true` / `true` when something was removed.
 */
export function deleteMetadata(
  key: symbol,
  target: unknown,
  propertyKey?: PropertyKey
): boolean {
  return findSlotMap(resolveOwner(target), slotOf(propertyKey))?.delete(key) ?? false;
}

/**
 * 收集所有携带指定 `key` 元数据的方法名，沿类原型链从基类到派生类遍历，
 * 因此子类可以覆盖父类的定义。
 *
 * Collect every method name that carries metadata for `key`, walking the class
 * prototype chain from base to derived so subclasses may override.
 *
 * @param key 装饰器的 symbol 键 / The decorator's symbol key.
 * @param target 类或原型 / The class or the prototype.
 * @returns 去重后的方法名列表 / The de-duplicated method names.
 */
export function collectMethodKeys(key: symbol, target: unknown): string[] {
  const chain: object[] = [];
  let owner: object | null = resolveOwner(target);
  while (owner && owner !== Function.prototype && owner !== Object.prototype) {
    chain.unshift(owner);
    owner = Object.getPrototypeOf(owner) as object | null;
  }

  const result: string[] = [];
  const seen = new Set<string>();
  for (const current of chain) {
    const record = registry.get(current);
    if (!record) continue;
    for (const [slot, slotMap] of record) {
      if (slot === CLASS_SLOT || !slotMap.has(key)) continue;
      const name = String(slot);
      if (seen.has(name)) continue;
      seen.add(name);
      result.push(name);
    }
  }
  return result;
}

/**
 * 仅测试用的逃生通道：把注册表换成全新的 `WeakMap`。原有的 owner 随即不可达，
 * 会被垃圾回收。
 *
 * Test-only escape hatch: swap the registry for a fresh `WeakMap`. Existing
 * owners become unreachable and are garbage collected.
 */
export function clearMetadataRegistry(): void {
  registry = new WeakMap<object, OwnerRecord>();
}

/**
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

/** Internal slot used for class-level (non method-specific) metadata. */
const CLASS_SLOT = Symbol.for("@snail-js/api:class-slot");

type OwnerRecord = Map<PropertyKey, Map<symbol, unknown>>;

let registry = new WeakMap<object, OwnerRecord>();

/**
 * Normalise whatever a decorator receives into the class that owns the metadata.
 *
 * - class decorator → the constructor itself
 * - method / parameter decorator → `prototype.constructor`
 * - a bare prototype passed by hand → `prototype.constructor`
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
 * Write metadata, replacing any value previously written for the same
 * (owner, slot, key) triple.
 */
export function defineMetadata(
  key: symbol,
  value: unknown,
  target: unknown,
  propertyKey?: PropertyKey
): void {
  ensureSlotMap(resolveOwner(target), slotOf(propertyKey)).set(key, value);
}

/** Read metadata from exactly this owner, ignoring the prototype chain. */
export function getOwnMetadata<T = unknown>(
  key: symbol,
  target: unknown,
  propertyKey?: PropertyKey
): T | undefined {
  return findSlotMap(resolveOwner(target), slotOf(propertyKey))?.get(key) as T | undefined;
}

/**
 * Read metadata, walking the class prototype chain so a base api class or a base
 * server class can supply defaults to its subclasses.
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

/** `true` when {@link getMetadata} would find something. */
export function hasMetadata(
  key: symbol,
  target: unknown,
  propertyKey?: PropertyKey
): boolean {
  return getMetadata(key, target, propertyKey) !== undefined;
}

/**
 * Append to array-shaped metadata, always creating a fresh array.
 *
 * Copy-on-write matters: several decorators legitimately contribute to one key
 * (four `@Query()` parameters, a class-level `@Header()` plus a method-level
 * one) and the array must never be shared with a base class.
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

/** Merge a record into record-shaped metadata (class-level `@Header` and friends). */
export function mergeMetadata<T extends object>(
  key: symbol,
  value: T,
  target: unknown,
  propertyKey?: PropertyKey
): void {
  const previous = getOwnMetadata<T>(key, target, propertyKey);
  defineMetadata(key, previous ? { ...previous, ...value } : { ...value }, target, propertyKey);
}

/** Delete metadata from exactly this owner. Returns whether anything was removed. */
export function deleteMetadata(
  key: symbol,
  target: unknown,
  propertyKey?: PropertyKey
): boolean {
  return findSlotMap(resolveOwner(target), slotOf(propertyKey))?.delete(key) ?? false;
}

/**
 * Collect every method name that carries metadata for `key`, walking the class
 * prototype chain from base to derived so subclasses may override.
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
 * Test-only escape hatch: swap the registry for a fresh `WeakMap`. Existing
 * owners become unreachable and are garbage collected.
 */
export function clearMetadataRegistry(): void {
  registry = new WeakMap<object, OwnerRecord>();
}

import type { CacheAdapter } from "../type";

/** One persisted record, mirroring the in-memory shape. */
interface StoredRecord {
  value: unknown;
  /** Absolute ms timestamp; `0` means "never expires". */
  expiresAt: number;
}

/** Options accepted by {@link WebStorageCacheAdapter}. */
export interface WebStorageCacheAdapterOptions {
  /** Prefix applied to every key, so two adapters can share one storage area. */
  prefix?: string;

  /** Name used in diagnostics, e.g. `"localStorage"`. */
  label?: string;
}

/**
 * L2 adapter over any Web Storage area.
 *
 * One class drives both `localStorage` and `sessionStorage`: they share the
 * `Storage` interface, and wrapping them twice would duplicate every guard below.
 *
 * ## Why the area is resolved through a getter
 *
 * `localStorage` does not exist in Node, and in a browser it *throws* on access
 * when the user has blocked site data. Reading it in the constructor would make
 * `import`-time behaviour environment-dependent — and a Node test could not even
 * construct the adapter to assert that it degrades. The getter is therefore
 * called per operation and its failure is swallowed; the store behaves as an
 * always-empty cache, which the manager turns into "L1 only".
 */
export class WebStorageCacheAdapter implements CacheAdapter {
  private readonly resolveStorage: () => Storage | undefined;
  private readonly prefix: string;

  /** Name used in diagnostics. */
  readonly label: string;

  constructor(
    resolveStorage: () => Storage | undefined,
    options: WebStorageCacheAdapterOptions = {}
  ) {
    this.resolveStorage = resolveStorage;
    this.prefix = options.prefix ?? "[snail-cache]";
    this.label = options.label ?? "web storage";
  }

  /** `false` when the backing area is missing — the manager then drops L2. */
  get available(): boolean {
    return this.storage() !== undefined;
  }

  async get<T = unknown>(key: string): Promise<T | undefined> {
    const storage = this.storage();
    if (!storage) return undefined;

    const raw = storage.getItem(this.key(key));
    if (raw === null) return undefined;

    const record = this.parse(raw);
    if (record === undefined) {
      // Someone else wrote that key, or the JSON is corrupt. Removing it keeps a
      // broken entry from being re-parsed on every request.
      storage.removeItem(this.key(key));
      return undefined;
    }

    if (record.expiresAt !== 0 && record.expiresAt <= Date.now()) {
      storage.removeItem(this.key(key));
      return undefined;
    }

    return record.value as T;
  }

  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    const storage = this.storage();
    if (!storage) return;

    const record: StoredRecord = {
      value,
      expiresAt: ttlSeconds > 0 ? Date.now() + ttlSeconds * 1000 : 0
    };

    // Let a quota error propagate: the manager logs it and continues, which is
    // the only place that knows the request must not fail because of it.
    storage.setItem(this.key(key), JSON.stringify(record));
  }

  async delete(key: string): Promise<void> {
    this.storage()?.removeItem(this.key(key));
  }

  async clear(): Promise<void> {
    const storage = this.storage();
    if (!storage) return;

    for (const key of this.keysOf(storage)) {
      storage.removeItem(key);
    }
  }

  async keys(): Promise<string[]> {
    const storage = this.storage();
    if (!storage) return [];

    return this.keysOf(storage).map((key) => key.slice(this.prefix.length));
  }

  private storage(): Storage | undefined {
    try {
      return this.resolveStorage();
    } catch {
      // Accessing `localStorage` can throw a SecurityError in a locked-down
      // browser; that is a missing area, not a crash.
      return undefined;
    }
  }

  private key(key: string): string {
    return `${this.prefix}${key}`;
  }

  /** Every storage key this adapter owns, prefix included. */
  private keysOf(storage: Storage): string[] {
    const owned: string[] = [];
    for (let index = 0; index < storage.length; index++) {
      const key = storage.key(index);
      if (key !== null && key.startsWith(this.prefix)) owned.push(key);
    }
    return owned;
  }

  private parse(raw: string): StoredRecord | undefined {
    try {
      const parsed = JSON.parse(raw) as StoredRecord | null;
      if (parsed === null || typeof parsed !== "object") return undefined;
      if (!("value" in parsed) || !("expiresAt" in parsed)) return undefined;
      return parsed;
    } catch {
      return undefined;
    }
  }
}

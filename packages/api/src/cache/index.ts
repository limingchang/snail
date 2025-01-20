import MemoryCache from "./memoryCache";
import LocalStorageCache from "./localstorageCache";
import IndexDBCache from "./indexDBCache";
import { CacheType } from "../typings";

export function createCache(type: CacheType, ttl: number) {
  if (type === CacheType.Memory) {
    return new MemoryCache(ttl);
  }
  if (type === CacheType.LocalStorage) {
    return new LocalStorageCache(ttl);
  }
  if (type === CacheType.IndexDB) {
    const db = new IndexDBCache(ttl);
    db.init();
    return db;
  }
  return undefined;
}

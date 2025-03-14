import { AdapterConstructor } from "./cache.type";

export enum CacheType {
  Memory,
  IndexDB,
  LocalStorage,
  Custom,
}

export type MemoryCacheOption = {
  type: CacheType.Memory;
} & CacheCommonOption;

export type IndexDBCacheOption = {
  type: CacheType.IndexDB;
} & CacheCommonOption;

export type LocalStorageCacheOption = {
  type: CacheType.LocalStorage;
} & CacheCommonOption;

export type CustomCacheOption ={
  type: CacheType.Custom;
  adapter: AdapterConstructor;
  options?: any;
}& CacheCommonOption;

export interface CacheCommonOption {
  ttl?: number;
}

export type CacheManagementOption =
  | MemoryCacheOption
  | IndexDBCacheOption
  | LocalStorageCacheOption
  | CustomCacheOption;

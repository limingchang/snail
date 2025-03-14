import { CacheManagementOption } from "./cache.management.option";
import { RequestMethod } from "./request.method";

// import { VersioningOption } from "./versioning.option";
export type CacheForType = "All" | "all" | RequestMethod | RequestMethod[];

export interface SnailOption {
  name?: string;
  baseURL?: string;
  cacheManage?: CacheManagementOption;
  cacheFor?: CacheForType
  enableLog?: boolean;
  timeout?: number;
}

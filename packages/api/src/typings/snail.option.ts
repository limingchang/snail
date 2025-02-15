import { CacheManagementOption } from "./cache.management.option";

// import { VersioningOption } from "./versioning.option";

export interface SnailOption {
  baseURL?: string;
  CacheManage?: CacheManagementOption;
  enableLog?: boolean;
  timeout?: number;
}

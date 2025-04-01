import { CacheManagementOption } from "./cache.management.option";
import { Method } from "axios";

// import { VersioningOption } from "./versioning.option";
export type CacheForType = "All" | "all" | Method | Method[];

export class SnailServerStatusCodeRuleOptions {
  key?: string;
  rule: (status: number) => boolean;
}

export interface SnailOption {
  name?: string;
  baseURL?: string;
  cacheManage?: CacheManagementOption;
  cacheFor?: CacheForType;
  enableLog?: boolean;
  timeout?: number;
  serverStatusCodeRule?: SnailServerStatusCodeRuleOptions;
}

import { AxiosInterceptorOptions } from "axios";
import { CacheManagementConfig } from "./cache.management.config";

import { VersioningConfig } from "./versioning.config";

export type AxiosRequestInterceptor<T = any> = {
  onFulfilled?: ((value: T) => T | Promise<T>) | null;
  onRejected?: ((error: any) => any) | null;
  options?: AxiosInterceptorOptions;
};

export type AxiosResponseInterceptor<T = any> = {
  onFulfilled?: ((value: T) => T | Promise<T>) | null;
  onRejected?: ((error: any) => any) | null;
};

export interface SnailConfig {
  baseURL?: string;
  Versioning?: VersioningConfig;
  CacheManage?: CacheManagementConfig;
  enableLog?: boolean;
  timeout?: number;
  requestInterceptors?: AxiosRequestInterceptor;
  responseInterceptors?: AxiosResponseInterceptor;
}

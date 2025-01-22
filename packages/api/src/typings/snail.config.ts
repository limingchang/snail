import {
  AxiosInterceptorOptions,
  AxiosResponse,
  InternalAxiosRequestConfig,
} from "axios";
import { CacheManagementConfig } from "./cache.management.config";

import { VersioningConfig } from "./versioning.config";

export type AxiosRequestInterceptor<T = any> = {
  onFulfilled?:
    | ((
        value: InternalAxiosRequestConfig<T>
      ) =>
        | InternalAxiosRequestConfig<T>
        | Promise<InternalAxiosRequestConfig<T>>)
    | null;
  onRejected?: ((error: any) => any) | null;
  options?: AxiosInterceptorOptions;
};

export type AxiosResponseInterceptor<T = any> = {
  onFulfilled?:
    | ((
        response: AxiosResponse<T>
      ) => AxiosResponse<T> | Promise<AxiosResponse<T>>)
    | null;
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

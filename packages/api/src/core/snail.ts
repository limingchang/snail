import axios, { AxiosInstance } from "axios";
import { Api } from "./api";
import { createCache } from "../cache";
import {
  SnailConfig,
  VersioningConfig,
  CacheType,
  ApiConfig,
  RequestMethod,
  CacheStorage,
} from "../typings";

const DEFAULT_CONFIG: SnailConfig = {
  timeout: 5000,
  // 默认开启内存缓存
  CacheManage: {
    type: CacheType.Memory,
    // 默认缓存时间为5分钟(单位秒)
    ttl: 300,
  },
};

export class Snail {
  public axiosInstance: AxiosInstance;
  public baseURL: string = "";

  public versioning?: VersioningConfig;

  public options: SnailConfig;

  public cacheStorage?: CacheStorage = undefined;

  constructor(options: SnailConfig) {
    const instance = this;
    // 合并配置
    const SnailOptions = {
      ...DEFAULT_CONFIG,
      ...options,
    };
    this.baseURL = SnailOptions.baseURL || "";
    this.versioning = SnailOptions.Versioning;
    this.options = SnailOptions;

    // 1. 创建axios实例
    instance.axiosInstance = axios.create({
      baseURL: instance.baseURL,
      timeout: instance.options.timeout || 5000,
    });

    // 2. 配置拦截器
    if (SnailOptions.requestInterceptors) {
      instance.axiosInstance.interceptors.request.use(
        (config) => {
          const result =
            SnailOptions.requestInterceptors?.onFulfilled?.(config);
          return result ? result : config;
        },
        SnailOptions.requestInterceptors.onRejected,
        SnailOptions.requestInterceptors.options
      );
    }
    if (SnailOptions.responseInterceptors) {
      instance.axiosInstance.interceptors.response.use(
        (response) => {
          const result =
            SnailOptions.responseInterceptors?.onFulfilled?.(response);
          return result ? result : response;
        },
        (error) => {
          const result = SnailOptions.responseInterceptors?.onRejected?.(error);
          return Promise.reject(result || error);
        }
      );
    }

    // 3. 初始化缓存管理器
    if (instance.options.CacheManage) {
      const { type, ttl } = instance.options.CacheManage;
      instance.cacheStorage = createCache(type, ttl || 300);
    }
  }

  Get<T = any, E = any, D = any>(url: string, options?: ApiConfig) {
    return new Api<T, E, D>(RequestMethod.GET, url, this, options);
  }

  Post<T = any, E = any, D = any>(url: string, options?: ApiConfig) {
    return new Api<T, E, D>(RequestMethod.POST, url, this, options);
  }

  Put<T = any, E = any, D = any>(url: string, options?: ApiConfig) {
    return new Api<T, E, D>(RequestMethod.PUT, url, this, options);
  }

  Delete<T = any, E = any, D = any>(url: string, options?: ApiConfig) {
    return new Api<T, E, D>(RequestMethod.DELETE, url, this, options);
  }

  Patch<T = any, E = any, D = any>(url: string, options?: ApiConfig) {
    return new Api<T, E, D>(RequestMethod.PATCH, url, this, options);
  }

  Head<T = any, E = any, D = any>(url: string, options?: ApiConfig) {
    return new Api<T, E, D>(RequestMethod.HEAD, url, this, options);
  }

  Options<T = any, E = any, D = any>(url: string, options?: ApiConfig) {
    return new Api<T, E, D>(RequestMethod.OPTIONS, url, this, options);
  }
}

export const createSnail = (option: SnailConfig) => {
  return new Snail(option);
};

import axios, { AxiosInstance } from "axios";
import { Api } from "./api";
import { createCache } from "../cache";
import {
  SnailConfig,
  VersioningConfig,
  CacheType,
  ApiConfig,
  RequestMethod,
  RequestBody,
  CacheStorage,
} from "../typings";

const DEFAULT_CONFIG: SnailConfig = {
  timeout: 5000,
  // 默认开启内存缓存
  CacheManage: {
    type: CacheType.Memory,
    // 默认缓存时间为5分钟
    ttl: 300000,
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
          const result = SnailOptions.requestInterceptors?.onFulfilled?.(config);
          return result ? result : config;
        },
        SnailOptions.requestInterceptors.onRejected,
        SnailOptions.requestInterceptors.options
      );
    }
    if (SnailOptions.responseInterceptors) {
      instance.axiosInstance.interceptors.response.use(
        (response) => {
          const result = SnailOptions.responseInterceptors?.onFulfilled?.(response);
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
      instance.cacheStorage = createCache(type, ttl || 300000);
    }
  }

  Get(url: string, options?: ApiConfig) {
    return new Api(RequestMethod.GET, url, this, options);
  }

  Post(url: string, data?: RequestBody, options?: ApiConfig) {
    return new Api(RequestMethod.POST, url, this, options, data);
  }

  Put(url: string, data?: RequestBody, options?: ApiConfig) {
    return new Api(RequestMethod.PUT, url, this, options, data);
  }

  Delete(url: string, data?: RequestBody, options?: ApiConfig) {
    return new Api(RequestMethod.DELETE, url, this, options, data);
  }

  Patch(url: string, data?: RequestBody, options?: ApiConfig) {
    return new Api(RequestMethod.PATCH, url, this, options, data);
  }

  Head(url: string, data?: RequestBody, options?: ApiConfig) {
    return new Api(RequestMethod.HEAD, url, this, options, data);
  }

  Options(url: string, data?: RequestBody, options?: ApiConfig) {
    return new Api(RequestMethod.OPTIONS, url, this, options, data);
  }
}

export const createSnail = (option: SnailConfig) => {
  return new Snail(option);
};

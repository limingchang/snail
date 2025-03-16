import "reflect-metadata";

import axios, { AxiosInstance, CreateAxiosDefaults } from "axios";
import { createCache } from "../cache";
import {
  SnailOption,
  Strategy,
  ApiInstanceOptions,
  VersioningOption,
  CacheManagementOption,
  CacheStorage,
  MethodOption,
  ApiProxy,
  ResponseData,
  StandardResponseData,
  ResponseJsonData,
  RegisterSseEvent,
  CacheType,
  RequestMethod,
  CacheForType,
} from "../typings";

import { resolveUrl } from "../utils";
// import keys
import { METHOD_KEY } from "../decorators/api";
import { SERVER_CONFIG_KEY } from "../decorators/server";
import { STRATEGY_KEY } from "../decorators/strategy";

import { VERSIONING_KEY } from "../decorators/versioning";
import { NO_CACHE_KEY, CACHE_EXPIRE_SOURCE_KEY } from "../decorators/cache";

import { SnailApi } from "./snailApi";
import { SnailMethod } from "./snailMethod";

export const CacheStorageMap = new Map<string, CacheStorage>();
export const CacheTtlMap = new Map<string, number>();
export const CacheForMap = new Map<string, CacheForType>();
export const ExpireSourceMap = new Map<string, Set<string>>();
export const AxiosInstanceMap = new Map<string, AxiosInstance>();
export const StrategyMap = new Map<string, Array<new () => Strategy>>();
export const VersioningMap = new Map<string, VersioningOption>();

const defaultCacheManageOptions: CacheManagementOption = {
  type: CacheType.Memory,
  ttl: 500,
};
const defaultServerOptions: SnailOption = {
  baseURL: "",
  timeout: 5000,
  cacheManage: defaultCacheManageOptions,
  cacheFor: "get",
  enableLog: false,
};

import {
  EVENT_SOURCE_OPTION_KEY,
  EVENT_SOURCE_OPEN_KEY,
  EVENT_SOURCE_ERROR_KEY,
  EVENT_SOURCE_EVENTS_KEY,
} from "../decorators/sse";

export class SnailServer<
  RT extends ResponseData = StandardResponseData<ResponseJsonData>,
  DK extends string = "data",
  SK extends string = "code",
  MK extends string = "message"
> {
  private Name: string;
  private BaseURL: string;
  private Version: string;
  private EnableLog: boolean = false;
  // private sourceMap: Map<string, string[]> = new Map();
  private eventSource: EventSource;

  constructor() {
    const serverOptions = Reflect.getMetadata(
      SERVER_CONFIG_KEY,
      this.constructor
    ) as SnailOption;
    if (!serverOptions) {
      throw new Error(
        "Create SnailServer must be used for @Server() decoration"
      );
    }
    const options = Object.assign({}, defaultServerOptions, serverOptions);
    // console.log("constructor", options);
    this.Name = options.name ?? this.constructor.name;
    // console.log("create server:", this.Name);
    this.init(options);
  }

  private init(options: SnailOption) {
    const { baseURL, timeout, cacheManage, enableLog, cacheFor } = options;
    this.BaseURL = baseURL ?? resolveUrl("");
    this.initAxios({ baseURL, timeout });
    this.initStrategy();
    this.initCacheManage(cacheManage, cacheFor);
    this.initVersioning();
    // 设置Server的失效源
    this.initExpireSource(this);
    this.EnableLog = enableLog ?? false;
    this.initLog(enableLog);
  }

  private initLog(enableLog?: boolean) {
    if (enableLog) {
      const axiosInstance = AxiosInstanceMap.get(this.Name) as AxiosInstance;
      axiosInstance.interceptors.request.use((config) => {
        console.log("Request:", config);
        return config;
      });
      axiosInstance.interceptors.response.use((response) => {
        console.log("Response:", response);
        return response;
      });
    }
  }

  private initStrategy() {
    const serverStrategies =
      Reflect.getMetadata(STRATEGY_KEY, this.constructor) || [];
    StrategyMap.set(this.Name, serverStrategies);
  }

  private initVersioning() {
    // 版本管理器
    const versioning = Reflect.getMetadata(
      VERSIONING_KEY,
      this.constructor
    ) as VersioningOption;
    if (versioning) {
      VersioningMap.set(this.Name, versioning);
    }
  }

  registerStrategys(...strategys: Array<new () => Strategy>) {
    const serverStrategies = StrategyMap.get(this.Name) ?? [];
    serverStrategies.push(...strategys);
    StrategyMap.set(this.Name, serverStrategies);
  }

  createApi<T extends SnailApi>(
    constructor: new (options: ApiInstanceOptions) => T
  ): ApiProxy<T, RT, DK, SK, MK> {
    const serverVersioning = Reflect.getMetadata(
      VERSIONING_KEY,
      this.constructor
    ) as VersioningOption;
    if (serverVersioning) {
      this.Version = serverVersioning.defaultVersion || "";
    }
    const apiInstanceOptions: ApiInstanceOptions = {
      serverInstance: this,
      enableLog: this.EnableLog,
    };
    const apiInstance = new constructor(apiInstanceOptions);
    // 设置api的失效源
    this.initExpireSource(apiInstance);
    return new Proxy(apiInstance, {
      get: (target: object, propertyKey: string | symbol) => {
        // this.EnableLog &&
        // console.log("ApiProxy:", target.constructor.name, "|", propertyKey);
        // target.constructor.name;
        // 忽略symbol类型
        if (typeof propertyKey !== "string")
          return (target as any)[propertyKey];
        // propertyKey string类型
        const methodConfig = Reflect.getMetadata(
          METHOD_KEY,
          target,
          propertyKey
        ) as MethodOption;
        // 未被@Method装饰的方法直接返回
        if (!methodConfig) return (target as any)[propertyKey];

        return <RD extends ResponseData = ResponseJsonData>(...args: []) => {
          const method = new SnailMethod<RD>(
            apiInstance,
            target,
            propertyKey,
            [...args]
          );
          this.initExpireSource(method, propertyKey);
          return method;
          // const url =
          //   methodConfig.path == ""
          //     ? apiConfig.url
          //     : apiConfig.url + `/${methodConfig.path}`;
          // enableLog && console.log("url:", url);
          // let request: AxiosRequestConfig = {
          //   // baseURL: serverConfig.baseURL,
          //   url,
          //   method: methodConfig.method,
          //   timeout: apiConfig.timeout
          //     ? apiConfig.timeout
          //     : serverConfig.timeout,
          // };
          // 版本管理
          // request = {
          //   ...request,
          //   ...this.applyVersion(request, target, propertyKey),
          // };
          // enableLog && console.log("版本管理参数:", request);
          // 获取策略
          // const strategies = this.getStrategies(target, propertyKey);
          // 构建请求参数
          // const { params, data, querys } = this.buildRequestArgs(
          //   target,
          //   propertyKey,
          //   args
          // );
          // request = {
          //   ...request,
          //   url: replacePlaceholders(url, params),
          //   params: querys,
          //   data,
          // };
          // enableLog && console.log("构建请求参数：", request);
          // // 应用请求策略
          // const requestStrategies = strategies.filter(
          //   (strategy) => strategy.applyRequest
          // );
          // request = await this.applyStrategies(
          //   request,
          //   requestStrategies,
          //   "request"
          // );
          // 处理失效源
          // expireSource
          // const hitSource = this.getExpireSource(target, propertyKey);
          // enableLog && console.log("hitSource:", hitSource);
          // 设置了当前方法的失效源
          // if (typeof hitSource == "string") {
          //   await this.setExpireSource(request, hitSource);
          // }
          // 未定义失效源，未设置null失效缓存
          // 处理缓存
          // if (hitSource !== null) {
          //   // 获取缓存
          //   const cachedResponse = await this.getCache(request, strategies);
          //   if (cachedResponse) {
          //     enableLog && console.warn("数据从缓存获取");
          //     return this.handleResponse(cachedResponse, true);
          //   }
          // }
          // const onUploadProgress = Reflect.getMetadata(
          //   UPLOAD_PROGRESS_KEY,
          //   target,
          //   propertyKey
          // );
          // const onDownloadProgress = Reflect.getMetadata(
          //   DOWNLOAD_PROGRESS_KEY,
          //   target,
          //   propertyKey
          // );
          // 发送请求
          // try {
          //   enableLog && console.log("send request:", request);
          //   const response = await this.axiosInstance({
          //     ...request,
          //     onUploadProgress,
          //     onDownloadProgress,
          //   });
          //   // 应用响应策略
          //   const responseStrategies = strategies.filter(
          //     (strategy) => strategy.applyResponse
          //   );
          //   const strategyResponse = await this.applyStrategies(
          //     response,
          //     responseStrategies,
          //     "response"
          //   );
          //   // 设置缓存
          //   hitSource !== null && this.setCache(request, response);
          //   // 请求成功后，处理应失效的缓存
          //   this.expireCache(propertyKey);
          //   return this.handleResponse(strategyResponse, false);
          // } catch (error) {
          //   return this.handleError(error);
          // }
        };
      },
    }) as ApiProxy<T, RT, DK, SK, MK>; //as ApiProxy<T, R, DK>;
  }

  private initCacheManage(
    options?: CacheManagementOption,
    cacheFor?: CacheForType
  ) {
    const noCache = Reflect.getMetadata(
      NO_CACHE_KEY,
      this.constructor
    ) as boolean;
    if (noCache && options !== defaultCacheManageOptions) {
      console.warn("you configured cache manage, but you set noCache");
      return;
    }
    // 如果未创建缓存管理
    const cacheStorage = CacheStorageMap.get(this.Name);
    if (!cacheStorage && options !== undefined) {
      const storage = createCache(options);
      CacheStorageMap.set(this.Name, storage);
      CacheTtlMap.set(this.Name, options.ttl || 500);
    }
    // 设置开启缓存的方法
    if (cacheFor) {
      CacheForMap.set(this.Name, cacheFor);
    }
  }

  private initExpireSource(target: any, propertyKey?: string | symbol) {
    if (propertyKey) {
      // 设置method的失效源
      const expireSource = Reflect.getMetadata(
        CACHE_EXPIRE_SOURCE_KEY,
        target.target,
        propertyKey
      ) as string[];
      // console.log("init-method-expireSource:", expireSource);
      if (expireSource && expireSource.length > 0) {
        expireSource.map((source) => {
          const invalidSources = ExpireSourceMap.get(source) ?? new Set();
          invalidSources.add(target.name);
          ExpireSourceMap.set(source, invalidSources);
        });
      }
      return;
    }
    // 设置Api或Server的失效源
    const expireSources =
      (Reflect.getMetadata(
        CACHE_EXPIRE_SOURCE_KEY,
        target.constructor
      ) as string[]) ?? [];
    // console.log("init-expireSources:", expireSources);
    if (expireSources.length > 0) {
      expireSources.map((source) => {
        const invalidSources = ExpireSourceMap.get(source) ?? new Set();
        invalidSources.add(target.name);
        ExpireSourceMap.set(source, invalidSources);
      });
    }
  }

  private initAxios(config: CreateAxiosDefaults) {
    // 如果未创建axiosInstance，创建axiosInstance
    const axiosInstance = AxiosInstanceMap.get(this.Name);
    if (!axiosInstance) {
      const axiosInstance = axios.create({
        baseURL: resolveUrl(config.baseURL),
        timeout: config.timeout,
      });
      AxiosInstanceMap.set(this.Name, axiosInstance);
    }
    // if (!this.axiosInstance) {
    //   this.axiosInstance = axios.create({
    //     baseURL: resolveUrl(config.baseURL),
    //     timeout: config.timeout,
    //   });
    // }
  }

  private generateSseUrl(baseURL?: string, url?: string): string {
    if (!baseURL && !url) {
      return "/";
    }
    if (!baseURL && url) {
      return `/${url}`;
    }
    return `${baseURL}/${url}`;
  }

  private handleResponse(response: any, hitCache: boolean) {
    // console.log("Response:", response);
    return {
      data: response.data,
      error: null,
      hitCache,
    };
  }

  private handleError(error: any) {
    return {
      data: null,
      error,
    };
  }

  // createSse<T extends object>(constructor: new () => T): SseProxy<T> {
  //   const instance = new constructor();
  //   const serverConfig = this.getServerConfig();
  //   const { baseURL, enableLog } = serverConfig;
  //   const apiConfig = this.getApiConfig(constructor);
  //   enableLog && console.log("ApiConfig:", apiConfig);
  //   //  配置类版本号
  //   this.version = apiConfig.version;

  //   return new Proxy(instance, {
  //     get: (target: object, propertyKey: string | symbol) => {
  //       enableLog && console.log("proxy:", target, "|", propertyKey);
  //       if (typeof propertyKey !== "string") return;
  //       // 处理SSE连接
  //       const sseOption = Reflect.getMetadata(
  //         EVENT_SOURCE_OPTION_KEY,
  //         target,
  //         propertyKey
  //       ) as { path: string; withCredentials: boolean };
  //       // 如果被@sse装饰
  //       if (sseOption) {
  //         const url =
  //           sseOption.path == ""
  //             ? apiConfig.url
  //             : apiConfig.url + `/${sseOption.path}`;
  //         const { url: versionUrl } = this.applyVersion(
  //           { url },
  //           target,
  //           propertyKey
  //         );
  //         const sseUrl = this.generateSseUrl(baseURL, versionUrl || url);
  //         enableLog && console.log("sse-url:", sseUrl);
  //         return () => this.initSse(sseUrl, sseOption, target);
  //       }
  //     },
  //   }) as SseProxy<T>;
  // }

  private initSse(
    url: string,
    options: { path: string; withCredentials: boolean },
    target: any
  ) {
    return () => {
      const eventSource = new EventSource(url, {
        withCredentials: options.withCredentials
          ? options.withCredentials
          : false,
      });
      this.eventSource = eventSource;
      // 处理其OnSseOpen,OnSseError函数
      this.setSse(target);
      // 注册事件处理
      this.registerSseEvent(target);
      return {
        eventSource,
        close: eventSource.close,
      };
    };
  }

  private setSse(target: any) {
    // 如果被@OnSseOpen装饰
    const onOpenFunc = Reflect.getMetadata(EVENT_SOURCE_OPEN_KEY, target);
    // console.log("sse-proxy[open]:", onOpenFunc);
    if (typeof onOpenFunc == "function") {
      this.eventSource && (this.eventSource.onopen = onOpenFunc);
    }
    // 如果被@OnSseOpen装饰
    const onErrorFunc = Reflect.getMetadata(EVENT_SOURCE_ERROR_KEY, target);
    // console.log("sse-proxy[error]:", onErrorFunc);
    if (typeof onErrorFunc == "function") {
      this.eventSource && (this.eventSource.onerror = onErrorFunc);
    }
  }

  private registerSseEvent(target: any) {
    const eventSource = this.eventSource;
    if (!eventSource) return;
    const events = Reflect.getMetadata(
      EVENT_SOURCE_EVENTS_KEY,
      target
    ) as RegisterSseEvent[];
    // console.log('registerSseEvent:',events)
    events.map((event) => {
      eventSource.addEventListener(event.eventName, event.emit, event.options);
    });
  }

  get version() {
    return this.Version;
  }

  get name() {
    return this.Name;
  }

  get enableLog() {
    return this.EnableLog;
  }

  get baseURL() {
    return this.BaseURL;
  }
}

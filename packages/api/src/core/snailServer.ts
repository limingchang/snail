import "reflect-metadata";

import axios, { AxiosInstance, CreateAxiosDefaults,Method } from "axios";
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
  StandardResponseWithoutData,
  CacheType,
  CacheForType,
  SnailServerStatusCodeRuleOptions,
  ResponseJsonData,
} from "../typings";

import { resolveUrl } from "../utils";
// import keys
import { METHOD_KEY } from "../decorators/method";
import { SERVER_CONFIG_KEY } from "../decorators/server";
import { STRATEGY_KEY } from "../decorators/strategy";

import { VERSIONING_KEY } from "../decorators/versioning";
import { NO_CACHE_KEY, CACHE_EXPIRE_SOURCE_KEY } from "../decorators/cache";

import { SnailApi } from "./snailApi";
import { SnailMethod } from "./snailMethod";
import { SnailSse } from "./snailSse";

export const CacheStorageMap = new Map<string, CacheStorage>();
export const CacheTtlMap = new Map<string, number>();
export const CacheForMap = new Map<string, string[]>();
export const ExpireSourceMap = new Map<string, Set<string>>();
export const AxiosInstanceMap = new Map<string, AxiosInstance>();
export const StrategyMap = new Map<string, Array<new () => Strategy>>();
export const VersioningMap = new Map<string, VersioningOption>();
export const ServerStatusCodeRuleMap = new Map<
  string,
  SnailServerStatusCodeRuleOptions
>();

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

export class SnailServer<
  RT extends
    | StandardResponseWithoutData
    | ResponseJsonData = StandardResponseWithoutData,
  DK extends string = "data"
> {
  private Name: string;
  private BaseURL: string;
  private Version: string;
  private EnableLog: boolean = false;

  constructor() {
    const options = this.getServerOptions();
    // console.log("constructor", options);
    this.Name = options.name ?? this.constructor.name;
    // console.log("create server:", this.Name);
    this.init();
  }

  private init() {
    const options = this.getServerOptions();
    const {
      baseURL,
      timeout,
      cacheManage,
      enableLog,
      cacheFor,
      serverStatusCodeRule,
    } = options;
    this.BaseURL = baseURL ?? resolveUrl("");
    this.initAxios({ baseURL, timeout });
    // 设置服务端状态码规则
    if (serverStatusCodeRule) {
      this.initServerStatusCodeRule(serverStatusCodeRule);
    }
    this.initStrategy();
    this.initCacheManage(cacheManage, cacheFor);
    this.initVersioning();
    // 设置Server的失效源
    this.initExpireSource(this);
    this.EnableLog = enableLog ?? false;
    this.initLog(enableLog);
  }

  private initServerStatusCodeRule(
    ruleOptions: SnailServerStatusCodeRuleOptions
  ) {
    ServerStatusCodeRuleMap.set(this.name, ruleOptions);
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

  registerStrategies = (...strategys: Array<new () => Strategy>) => {
    const serverStrategies = StrategyMap.get(this.Name) ?? [];
    serverStrategies.push(...strategys);
    StrategyMap.set(this.Name, serverStrategies);
  };

  createApi<TApiClass extends SnailApi>(
    constructor: new (options: ApiInstanceOptions) => TApiClass
  ): ApiProxy<TApiClass, RT, DK> {
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

        return () => {
          const method = new SnailMethod<RT>(apiInstance, target, propertyKey);
          this.initExpireSource(method, propertyKey);
          return method;
        };
      },
    }) as ApiProxy<TApiClass, RT, DK>; //as ApiProxy<T, R, DK>;
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
      if (Array.isArray(cacheFor)) {
        CacheForMap.set(
          this.Name,
          cacheFor.map((method) => method.toLowerCase()) as Method[]
        );
        return;
      }
      CacheForMap.set(this.Name, [cacheFor.toLowerCase()] );
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
  }

  private getServerOptions() {
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
    return options;
  }

  createSse<T extends SnailSse>(
    constructor: new (server: SnailServer) => T
  ): SnailSse {
    const sseInstance = new constructor(this);
    return sseInstance;
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

  get baseUrl() {
    return this.BaseURL;
  }
}

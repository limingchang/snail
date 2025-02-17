import "reflect-metadata";

import axios, {
  AxiosHeaders,
  AxiosInstance,
  AxiosRequestConfig,
  AxiosResponse,
  CreateAxiosDefaults,
} from "axios";
import { createCache } from "../cache";
import {
  SnailOption,
  Strategy,
  ApiConfig,
  VersioningOption,
  CacheManagementOption,
  CacheStorage,
  MethodOption,
  ApiProxy,
  SseProxy,
  ResponseData,
  RegisterSseEvent,
} from "../typings";

import { apiKey } from "../utils";

import { applyVersioning, VersioningResult } from "../versioning/versioning";

import { API_CONFIG_KEY, METHOD_KEY } from "../decorators/api";
import { SERVER_CONFIG_KEY } from "../decorators/server";
import { STRATEGY_KEY } from "../decorators/strategy";
import { REQUEST_ARGS_KEY } from "../decorators/param";

import { VERSIONING_KEY, VERSION_KEY } from "../decorators/versioning";
import { CACHE_OPTIONS_KEY } from "../decorators/cache";
import { UPLOAD_PROGRESS_KEY } from "../decorators/progress";

import {
  EVENT_SOURCE_OPTION_KEY,
  EVENT_SOURCE_OPEN_KEY,
  EVENT_SOURCE_ERROR_KEY,
  EVENT_SOURCE_EVENTS_KEY,
} from "../decorators/sse";

export class Snail<R extends { data: any } = ResponseData> {
  private axiosInstance: AxiosInstance;
  // private config: SnailConfig;
  private strategies: Strategy[] = [];
  private cacheStorage?: CacheStorage;
  private version?: string;
  private sourceMap: Map<string, string[]> = new Map();

  private eventSource: EventSource;

  registerStrategy(strategy: Strategy) {
    this.strategies.push(strategy);
  }

  createApi<T extends object>(constructor: new () => T): ApiProxy<T, R> {
    const instance = new constructor();
    const serverConfig = this.getServerConfig();
    const { baseURL, timeout, CacheManage, enableLog } = serverConfig;
    enableLog && console.log("serverConfig:", serverConfig);
    // 初始化axios
    this.initAxios({ baseURL, timeout });
    enableLog && console.log("CacheManage:", CacheManage);
    // 初始化缓存管理
    this.initCacheManage(CacheManage);
    const apiConfig = this.getApiConfig(constructor);
    enableLog && console.log("ApiConfig:", apiConfig);
    //  配置类版本号
    this.version = apiConfig.version;

    return new Proxy(instance, {
      get: (target: Object, propertyKey: string | symbol) => {
        enableLog && console.log("proxy:", target, "|", propertyKey);
        if (typeof propertyKey !== "string") return;
        // 正常请求
        const methodConfig = Reflect.getMetadata(
          METHOD_KEY,
          target,
          propertyKey
        ) as MethodOption;
        if (!methodConfig) return (target as any)[propertyKey];

        return async (...args: []) => {
          const url =
            methodConfig.path == ""
              ? apiConfig.url
              : apiConfig.url + `/${methodConfig.path}`;
          enableLog && console.log("url:", url);
          let request: AxiosRequestConfig = {
            // baseURL: serverConfig.baseURL,
            url,
            method: methodConfig.method,
            timeout: apiConfig.timeout
              ? apiConfig.timeout
              : serverConfig.timeout,
          };
          // 版本管理
          request = {
            ...request,
            ...this.applyVersion(request, target, propertyKey),
          };
          enableLog && console.log("版本管理参数:", request);
          // 获取策略
          const strategies = this.getStrategies(target, propertyKey);

          // 构建请求参数
          const params = this.buildRequestArgs(target, propertyKey, args);
          request = { ...request, ...params };
          enableLog && console.log("构建请求参数：", request);
          // 应用请求策略
          const requestStrategies = strategies.filter(
            (strategy) => strategy.applyRequest
          );
          request = await this.applyStrategies(
            request,
            requestStrategies,
            "request"
          );

          // 处理失效源
          const hitSource = this.getHitSource(target, propertyKey);
          enableLog && console.log("hitSource:", hitSource);
          // 设置了当前方法的失效源
          if (typeof hitSource == "string") {
            this.setHitSource(request, hitSource);
          }
          // 未定义失效源，未设置null失效缓存
          // 处理缓存
          if (hitSource !== null) {
            // 获取缓存
            const cachedResponse = await this.getCache(request, strategies);
            if (cachedResponse) {
              enableLog && console.warn("数据从缓存获取");
              return this.handleResponse(cachedResponse, true);
            }
          }
          const onUploadProgress = Reflect.getMetadata(
            UPLOAD_PROGRESS_KEY,
            target,
            propertyKey
          );
          // 发送请求
          try {
            enableLog && console.log("send request:", request);
            const response = await this.axiosInstance({
              ...request,
              onUploadProgress,
            });
            hitSource !== null && this.setCache(request, response);
            // 请求成功后，处理应失效的缓存
            this.expireCache(propertyKey);
            return this.handleResponse(response, false);
          } catch (error) {
            return this.handleError(error);
          }
        };
      },
    }) as ApiProxy<T, R>;
  }

  private buildRequestArgs(target: any, propertyKey: string, args: any[]) {
    const requestArgs: any = { params: {}, data: {} };
    const paramConfigs =
      Reflect.getMetadata(REQUEST_ARGS_KEY, target, propertyKey) || [];

    paramConfigs.forEach(({ index, type, key }: any) => {
      const value = args[index];
      if (type === "params" && !key && typeof value === "object") {
        requestArgs.params = { ...requestArgs.params, ...value };
      }
      if (type === "params" && key) {
        requestArgs.params[key] = value;
      }
      if (type === "data" && !key && typeof value === "object") {
        requestArgs.data = { ...requestArgs.data, ...value };
      }
      if (type === "data" && key) {
        requestArgs.data[key] = value;
      }
    });

    return requestArgs;
  }

  private getStrategies(target: any, propertyKey: string) {
    const serverStrategies =
      Reflect.getMetadata(STRATEGY_KEY, this.constructor) || [];
    // console.log("serverStrategies:", serverStrategies);
    const classStrategies =
      Reflect.getMetadata(STRATEGY_KEY, target.constructor) || [];
    // console.log("classStrategies:", classStrategies);
    const methodStrategies =
      Reflect.getMetadata(
        `${STRATEGY_KEY.toString()}_${propertyKey}`,
        target
      ) || [];
    // console.log("methodStrategies:", methodStrategies);
    const allStrategies: Strategy[] = [
      ...this.strategies,
      ...serverStrategies,
      ...classStrategies,
      ...methodStrategies,
    ];

    return allStrategies;
  }

  private async applyStrategies<T extends "request">(
    data: AxiosRequestConfig,
    strategies: Strategy[],
    type: T
  ): Promise<AxiosRequestConfig>;
  private async applyStrategies<T extends "response">(
    data: AxiosRequestConfig,
    strategies: Strategy[],
    type: T
  ): Promise<AxiosResponse>;
  private async applyStrategies(
    data: AxiosRequestConfig | AxiosResponse,
    strategies: Strategy[],
    type = "request"
  ): Promise<AxiosRequestConfig | AxiosResponse> {
    return await strategies.reduce(async (result: any, strategy: Strategy) => {
      if (type == "response")
        return await strategy.applyResponse!(await result);
      return await strategy.applyRequest!(await result);
    }, Promise.resolve(data));
  }

  private applyVersion(
    request: any,
    target: any,
    propertyKey: string
  ): VersioningResult {
    // 版本管理器
    const versioning = Reflect.getMetadata(
      VERSIONING_KEY,
      this.constructor
    ) as VersioningOption;

    if (!versioning) return request;
    // 获得版本
    // 方法版本
    const version = Reflect.getMetadata(VERSION_KEY, target, propertyKey);
    // 覆盖版本：方法版本>当前api版本>server版本
    const currentVersion = version || this.version || versioning.defaultVersion;
    const { url, headers, params } = applyVersioning(
      currentVersion,
      versioning
    );
    const versionUrl = url ? `${url}/${request.url}` : request.url;
    return { ...request, url: versionUrl, headers, params };
  }

  private async getCache(request: any, strategies: Strategy[]) {
    if (!this.cacheStorage) return undefined;
    const cacheKey = apiKey(request);
    const cached = await this.cacheStorage?.get(cacheKey);
    if (cached && cached.error === null) {
      let cacheResponse: AxiosResponse = {
        data: cached.data,
        status: 304,
        headers: {},
        statusText: "get response data from cache",
        config: { headers: new AxiosHeaders() },
      };
      // 应用响应策略
      const responseStrategies = strategies.filter(
        (strategy) => strategy.applyResponse
      );
      const strategyResponse = await this.applyStrategies(
        cacheResponse,
        responseStrategies,
        "response"
      );
      return strategyResponse;
    }
  }

  private initCacheManage(options?: CacheManagementOption) {
    // 如果未创建缓存管理
    if (!this.cacheStorage && options !== undefined) {
      this.cacheStorage = createCache(options.type, options.ttl || 300);
    }
  }

  private getHitSource(
    target: any,
    propertyKey: string
  ): string | null | undefined {
    // 当前方法的hitSource
    const methodHitSource = Reflect.getMetadata(
      `${CACHE_OPTIONS_KEY.toString()}_${propertyKey}`,
      target
    );
    if (methodHitSource !== undefined) return methodHitSource;
    // 当前api类的hitSource
    const apiHitSource = Reflect.getMetadata(
      CACHE_OPTIONS_KEY,
      target.constructor
    );
    return apiHitSource;
  }

  private setHitSource(request: any, hitSource: string) {
    const cacheKeys = this.sourceMap.get(hitSource);
    const currentCacheKey = apiKey(request as any);
    if (cacheKeys) {
      cacheKeys.push(currentCacheKey);
      this.sourceMap.set(hitSource, cacheKeys);
    } else {
      this.sourceMap.set(hitSource, [currentCacheKey]);
    }
  }

  private async setCache(request: any, response: AxiosResponse) {
    const cacheKey = apiKey(request);
    // console.log("set cache key:", cacheKey);
    await this.cacheStorage?.set(cacheKey, response.data);
    // console.log("set cache:", this.cacheStorage);
  }

  private async expireCache(hitSource: string) {
    // console.log("sourceMap:", this.sourceMap);
    const keys = this.sourceMap.get(hitSource);
    if (keys) {
      Promise.all(
        keys.map(async (key) => {
          await this.cacheStorage?.delete(key);
        })
      );
    }
  }

  private getServerConfig() {
    return Reflect.getMetadata(
      SERVER_CONFIG_KEY,
      this.constructor
    ) as SnailOption;
  }

  private getApiConfig<T extends object>(constructor: new () => T) {
    return Reflect.getMetadata(API_CONFIG_KEY, constructor) as ApiConfig & {
      url: string;
    };
  }

  private initAxios(config: CreateAxiosDefaults) {
    // 如果未创建axiosInstance，创建axiosInstance
    if (!this.axiosInstance) {
      this.axiosInstance = axios.create({
        baseURL: config.baseURL,
        timeout: config.timeout,
      });
    }
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

  createSse<T extends object>(constructor: new () => T): SseProxy<T> {
    const instance = new constructor();
    const serverConfig = this.getServerConfig();
    const { baseURL, enableLog } = serverConfig;
    const apiConfig = this.getApiConfig(constructor);
    enableLog && console.log("ApiConfig:", apiConfig);
    //  配置类版本号
    this.version = apiConfig.version;

    return new Proxy(instance, {
      get: (target: object, propertyKey: string | symbol) => {
        enableLog && console.log("proxy:", target, "|", propertyKey);
        if (typeof propertyKey !== "string") return;
        // 处理SSE连接
        const sseOption = Reflect.getMetadata(
          EVENT_SOURCE_OPTION_KEY,
          target,
          propertyKey
        ) as { path: string; withCredentials: boolean };
        // 如果被@sse装饰
        if (sseOption) {
          const url =
            sseOption.path == ""
              ? apiConfig.url
              : apiConfig.url + `/${sseOption.path}`;
          const { url: versionUrl } = this.applyVersion(
            { url },
            target,
            propertyKey
          );
          const sseUrl = this.generateSseUrl(baseURL, versionUrl || url);
          enableLog && console.log("sse-url:", sseUrl);
          const { eventSource, close } = this.initSse(sseUrl, sseOption);
          this.eventSource = eventSource;
          // 处理其OnSseOpen,OnSseError函数
          this.setSse(target);
          // 注册事件处理
          this.registerSseEvent(target);
          return () => {
            return { eventSource, close };
          };
        }
      },
    }) as SseProxy<T>;
  }

  private initSse(
    url: string,
    options: { path: string; withCredentials: boolean }
  ) {
    const eventSource = new EventSource(url, {
      withCredentials: options.withCredentials
        ? options.withCredentials
        : false,
    });
    console.log("EventSource:", eventSource);
    return {
      eventSource,
      close: eventSource.close,
    };
  }

  private setSse(target: any) {
    // 如果被@OnSseOpen装饰
    const onOpenFunc = Reflect.getMetadata(EVENT_SOURCE_OPEN_KEY, target);
    console.log("sse-proxy[open]:", onOpenFunc);
    if (typeof onOpenFunc == "function") {
      this.eventSource && (this.eventSource.onopen = onOpenFunc);
    }
    // 如果被@OnSseOpen装饰
    const onErrorFunc = Reflect.getMetadata(EVENT_SOURCE_ERROR_KEY, target);
    console.log("sse-proxy[error]:", onErrorFunc);
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
}

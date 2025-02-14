import "reflect-metadata";

import axios, {
  AxiosHeaders,
  AxiosInstance,
  AxiosRequestConfig,
  AxiosResponse,
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
  ResponseData,
} from "../typings";

import { apiKey } from "../utils";

import { applyVersioning } from "../versioning/versioning";

import { API_CONFIG_KEY, METHOD_KEY } from "../decorators/api";
import { SERVER_CONFIG_KEY } from "../decorators/server";
import { STRATEGY_KEY } from "../decorators/strategy";
import { REQUEST_ARGS_KEY } from "../decorators/param";

import { VERSIONING_KEY, VERSION_KEY } from "../decorators/versioning";
import { CACHE_KEY } from "../decorators/cache";

export class Snail<R extends { data: any } = ResponseData> {
  private axiosInstance: AxiosInstance;
  // private config: SnailConfig;
  private strategies: Strategy[] = [];
  private cacheStorage?: CacheStorage;
  private version?: string;

  registerStrategy(strategy: Strategy) {
    this.strategies.push(strategy);
  }

  createApi<T extends object>(constructor: new () => T): ApiProxy<T, R> {
    const instance = new constructor();
    const serverConfig = Reflect.getMetadata(
      SERVER_CONFIG_KEY,
      this.constructor
    ) as SnailOption;
    console.log("serverConfig:", serverConfig);
    // 如果未创建axiosInstance，创建axiosInstance
    if (!this.axiosInstance) {
      this.axiosInstance = axios.create({
        baseURL: serverConfig.baseURL,
        timeout: serverConfig.timeout,
      });
    }
    const cacheManage = Reflect.getMetadata(
      CACHE_KEY,
      this
    ) as CacheManagementOption;
    // 如果未创建缓存管理
    if (!this.cacheStorage && cacheManage !== undefined) {
      this.cacheStorage = createCache(cacheManage.type, cacheManage.ttl || 300);
    }
    const apiConfig = Reflect.getMetadata(
      API_CONFIG_KEY,
      constructor
    ) as ApiConfig & { url: string };
    console.log("ApiConfig:", apiConfig);
    //  配置类版本
    this.version = apiConfig.version;

    return new Proxy(instance, {
      get: (target: Object, propertyKey: string | symbol) => {
        console.log("proxy:", target, "|", propertyKey);
        if (typeof propertyKey !== "string") return;

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
          console.log("url:", url);
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
          console.log("版本管理参数:", request);
          // 获取策略
          const strategies = this.getStrategies(target, propertyKey);

          // 处理缓存
          // 获取缓存
          const methodCache =
            (this.getCacheConfig(target, propertyKey) as null) || undefined;
          if (methodCache == undefined) {
            const cached = await this.applyCache(request, cacheManage);
            if (cached && cached.error === null) {
              // 这里应该还要应用响应策略
              // 应用响应策略
              let cacheResponse: AxiosResponse = {
                data: cached.data,
                status: 304,
                headers: {
                  hitCache: true,
                },
                statusText: "get response data from cache",
                config: { headers: new AxiosHeaders() },
              };
              // for (const strategy of strategies) {
              //   if (strategy.applyResponse) {
              //     await strategy.applyResponse(cacheResponse);
              //   }
              // }
              const responseStrategies = strategies.filter(
                (strategy) => strategy.applyResponse
              );
              // const strategyResponse = await responseStrategies.reduce(
              //   async (result: Promise<AxiosResponse>, strategy: Strategy) => {
              //     if (strategy.applyResponse) {
              //       return await strategy.applyResponse(await result);
              //     }
              //     return result;
              //   },
              //   Promise.resolve(cacheResponse)
              // );
              const strategyResponse = await this.applyStrategies(
                cacheResponse,
                responseStrategies,
                "response"
              );
              return strategyResponse;
            }
          }
          // 构建请求参数
          const params = this.buildRequestArgs(target, propertyKey, args);
          request = { ...request, ...params };
          console.log("构建请求参数：", request);
          // 应用请求策略
          const requestStrategies = strategies.filter(
            (strategy) => strategy.applyRequest
          );
          // request = await requestStrategies.reduce(
          //   async (result: Promise<AxiosRequestConfig>, strategy: Strategy) => {
          //     return await strategy.applyRequest!(await result);
          //   },
          //   Promise.resolve(request)
          // );
          request = await this.applyStrategies(
            request,
            requestStrategies,
            "request"
          );
          // for (const strategy of strategies) {
          //   if (strategy.applyRequest) {
          //     request = await strategy.applyRequest(request);
          //   }
          // }

          // 发送请求
          try {
            console.log("send request:", request);
            const response = await this.axiosInstance(request);
            return this.handleResponse(response);
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

    console.log("请求参数:", paramConfigs);

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
    console.log("serverStrategies:", serverStrategies);
    const classStrategies =
      Reflect.getMetadata(STRATEGY_KEY, target.constructor) || [];
    console.log("classStrategies:", classStrategies);
    const methodStrategies =
      Reflect.getMetadata(
        `${STRATEGY_KEY.toString()}_${propertyKey}`,
        target
      ) || [];
    console.log("methodStrategies:", methodStrategies);
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

  private applyVersion(request: any, target: any, propertyKey: string) {
    // 版本管理器
    const versioning = Reflect.getMetadata(
      VERSIONING_KEY,
      this.constructor
    ) as VersioningOption;
    console.log("版本管理器：", versioning);

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

  private async applyCache(request: any, options: CacheManagementOption) {
    // const cacheKey = this.generateCacheKey(request);
    const cacheKey = apiKey(request);
    if (this.cacheStorage) {
      return await this.cacheStorage?.get(cacheKey);
    }
    return undefined;
  }

  private getCacheConfig(target: any, propertyKey: string) {
    return (
      Reflect.getMetadata(`${CACHE_KEY.toString()}_${propertyKey}`, target) || // 方法级
      Reflect.getMetadata(CACHE_KEY, target.constructor) // 类级
    );
  }

  private handleResponse(response: any) {
    console.log("Response:", response);
    return {
      data: response.data,
      error: null,
      hitCache: false,
    };
  }

  private handleError(error: any) {
    return {
      data: null,
      error,
    };
  }
}

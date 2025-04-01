import { AxiosResponse, AxiosRequestConfig, AxiosError, Method } from "axios";

import {
  // EventHandler,
  Strategy,
  MethodOption,
  VersioningType,
  ResponseData,
  StandardResponseData,
  SnailSuccessListener,
  SnailErrorListener,
  SnailHitCacheListener,
  SnailFinishListener,
} from "../typings";

import {
  resolveUrl,
  applyStrategies,
  generateCacheKey,
  buildRequestArgs,
  replacePlaceholders,
  isSpecialResponse,
} from "../utils";

import {
  CacheStorageMap,
  CacheForMap,
  ExpireSourceMap,
  StrategyMap,
  VersioningMap,
  AxiosInstanceMap,
  ServerStatusCodeRuleMap,
} from "./snailServer";
import { SnailApi } from "./snailApi";

// event
import { SnailEvent } from "../eventEmmit";

import { applyVersioning } from "../versioning";

// import keys
import { STRATEGY_KEY } from "../decorators/strategy";
import { METHOD_KEY } from "../decorators/method";
import { VERSION_KEY } from "../decorators/versioning";
import { NO_CACHE_KEY } from "../decorators/cache";
import {
  UPLOAD_PROGRESS_KEY,
  DOWNLOAD_PROGRESS_KEY,
} from "../decorators/progress";

/**
 * SnailMethod
 * 泛型参数: RT => response.data类型,默认标准json返回
 *  DK => response.data.data 类型
 */
export class SnailMethod<RT extends ResponseData = StandardResponseData> {
  // 私有属性
  // private serverInstance: SnailServer;
  private Name: string;
  private apiInstance: SnailApi;
  private target: Object;
  private strategies: Array<new () => Strategy> = [];
  private Request: AxiosRequestConfig;
  private Response: AxiosResponse<RT>;
  private Error: any;
  private EventEmit: SnailEvent;
  // private eventMap: Map<string, Set<EventHandler>>;
  // private onceWrapperMap: Map<EventHandler, EventHandler>;
  private propertyKey: string;

  private Url: string = "";
  private Path: string = "";
  private Method: Method = "GET";
  private Adapter: AxiosRequestConfig["adapter"] = undefined;
  private Version?: string;
  // private Args: any[] = [];

  constructor(
    apiInstance: SnailApi,
    target: Object,
    propertyKey: string | symbol,
  ) {
    this.apiInstance = apiInstance;
    this.target = target;
    this.propertyKey = propertyKey.toString();
    // this.Args = args ?? [];
    // 初始化方法设置
    this.init();
    this.enableLog() && console.log("url:", this.Url);
    // 默认事件初始化
    this.EventEmit = new SnailEvent<RT>();
  }

  public send = (...args: any) => {
    // 发送请求方法
    this.enableLog() && console.log("send:", this.name);
    const [serverName] = this.apiInstance.name.split(".");
    const axios = AxiosInstanceMap.get(serverName);
    if (!axios) throw new Error("AxiosInstance not created");
    // const response = await axios.request(this.Request);
    return new Promise(async (resolve, reject) => {
      const serverStatusCodeRule = ServerStatusCodeRuleMap.get(serverName);
      const strategies = this.getStrategies();
      // console.log("strategies:", strategies.length);
      // 应用请求策略
      this.Request = await applyStrategies(this.Request, strategies, "request");
      // 添加进度条
      this.Request = this.applyProgress(this.Request);
      // 构建请求参数
      // data 请求数据
      // params url参数
      // querys 查询参数
      const { data, querys, params } = buildRequestArgs(
        this.target,
        this.propertyKey,
        // this.Args
        args
      );
      this.enableLog() &&
        console.log("methodUrl:", this.Request.baseURL, this.Request.url);
      // 通过路由参数构建新路由
      const newUrl = replacePlaceholders(this.Url, params);
      this.Request = {
        ...this.Request,
        url: newUrl,
        params: {
          ...this.Request.params,
          ...querys,
        },
        data,
      };
      this.enableLog() && console.log("request:", this.Request);
      // this.enableLog() && console.log("expSources:", ExpireSourceMap);
      // return
      // // 获取缓存
      // ----
      const isNoCache = this.isNoCache();
      this.enableLog() && console.log("method is noCache:", isNoCache);
      if (!isNoCache) {
        // 启用缓存
        const { data } = await this.getCacheData(serverName);
        this.enableLog() && console.log("getCacheData:", data);
        if (data) {
          this.EventEmit.emit("hitCache", data);
          this.EventEmit.emit("success", data);
          this.EventEmit.emit("finish", data);
          resolve(data);
          return;
        }
      }
      // 发送请求
      const requester = AxiosInstanceMap.get(serverName);
      if (!requester) throw new Error("AxiosInstance not created");
      try {
        const rawResponse = await requester.request<RT>(this.Request);
        const isSpecial = isSpecialResponse(rawResponse);
        // 应用响应策略
        const response = (await applyStrategies(
          rawResponse,
          strategies,
          "response"
        )) as AxiosResponse<RT>;
        // // 设置缓存
        if (!isNoCache) {
          // 启用缓存
          !isSpecial && (await this.setCacheData(serverName, response.data));
        }
        this.Response = response;
        // 触发hitSource
        this.applyHitSource(serverName);
        // console.log("当前方法请求成功要让下面的缓存失效");
        // console.log(this.getExpireSources());
        isSpecial && console.log("isSpecial:", isSpecial);
        if (isSpecial) {
          // 特殊响应处理
          this.EventEmit.emit("success", response.data);
          this.EventEmit.emit("finish", response.data);
          resolve(response);
          return;
        }
        !isSpecial && console.log("isSpecial:", isSpecial);
        // 触发事件
        // 应用规则触发事件
        if (serverStatusCodeRule) {
          const { key, rule } = serverStatusCodeRule;
          const statuCodeKey = key ?? "code";
          const data = response.data as unknown as RT;
          if (rule(data[statuCodeKey as keyof RT] as number)) {
            this.EventEmit.emit("success", response.data);
          } else {
            this.EventEmit.emit("error", response.data);
          }
        }
        resolve(response.data);
      } catch (error: AxiosError | any) {
        this.EventEmit.emit("error", error);
        this.EventEmit.emit("finish", error);
        console.error(error);
        this.Error = error;
        reject(error);
        return;
      }
    });
  };

  private init() {
    const methodOptions = this.getMethodOptions();
    if (!methodOptions) {
      throw new Error("Create SnailMethod must be used for decoration");
    }
    const { path, method, name, adapter } = methodOptions;
    this.Name = name ?? this.propertyKey;
    this.Path = path;
    this.Method = method;
    this.Adapter = adapter;
    this.createRequest();
    this.initUrl();
    this.initVersion();
  }

  private initUrl() {
    if (this.Path === "") {
      this.Url = this.apiInstance.url || "";
      return;
    }
    this.Url = `${this.apiInstance.url || ""}${resolveUrl(this.Path)}`;
  }

  private initVersion() {
    // 设置版本
    const version = Reflect.getMetadata(
      VERSION_KEY,
      this.target,
      this.propertyKey
    );
    this.Version = version ?? this.apiInstance.version;
    if (!this.Version) return;
    const [serverName] = this.apiInstance.name.split(".");
    const versioningOptions = VersioningMap.get(serverName);
    if (!versioningOptions) {
      console.warn("Version Manager not configured");
      console.log(
        "Please use @Versioning() to configure the version manager on the ` SnailServer ` class"
      );
      return;
    }
    const versioningResult = applyVersioning(this.Version, versioningOptions);
    if (!versioningResult) {
      console.warn("Apply Versioning error");
      return;
    }
    const { type, result } = versioningResult;
    // console.log("versioningResult:", { type, result });
    if (type === VersioningType.Uri) {
      this.Url = `${resolveUrl(result as string)}${resolveUrl(this.Url)}`;
    }
    if (type === VersioningType.Header) {
      this.Request.headers = {
        ...this.Request.headers,
        ...(result as Record<string, any>),
      };
    }
    if (type === VersioningType.Query) {
      this.Request.params = {
        ...this.Request.params,
        ...(result as Record<string, any>),
      };
    }
  }

  private getExpireSources() {
    // console.log("getExpireSources:", this.name);
    const invalidSources = ExpireSourceMap.get(this.name) ?? new Set();
    if (invalidSources.size === 0) return [];
    return Array.from(invalidSources);
  }

  private createRequest() {
    const request: AxiosRequestConfig = {
      url: this.Url,
      method: this.Method,
      adapter: this.Adapter,
      timeout: this.apiInstance.timeout,
      data: {},
      params: {},
      headers: {},
    };
    this.Request = request;
    return request;
  }

  onSuccess = (listener: SnailSuccessListener<RT>) => {
    this.EventEmit.on("success", listener);
  };

  onError = <ErrorData = any>(listener: SnailErrorListener<RT, ErrorData>) => {
    this.EventEmit.on<ErrorData>("error", listener);
  };

  onHitCache = (listener: SnailHitCacheListener<RT>) => {
    this.EventEmit.on("hitCache", listener);
  };

  onFinish = (listener: SnailFinishListener<RT>) => {
    this.EventEmit.on("finish", listener);
  };

  private async getCacheData(serverName: string) {
    const methodKey = await generateCacheKey(
      this.name,
      this.version,
      this.Request
    );
    const cacheStorage = CacheStorageMap.get(serverName);
    if (!cacheStorage) {
      throw new Error("CacheStorage not created");
    }
    const cacheData = await cacheStorage.get<RT>(methodKey);
    const { error } = cacheData;
    if (!error) {
      // 缓存命中
      this.enableLog() && console.warn(`[${this.Name}]`, "Cache hit");
    }
    return cacheData;
  }

  private async setCacheData(
    serverName: string,
    // Bug 修复：泛型类型“StandardResponseData”需要介于 0 和 4 类型参数之间，这里只传递 3 个参数
    responseData: any
  ) {
    const methodKey = await generateCacheKey(
      this.name,
      this.version,
      this.Request
    );
    this.enableLog() && console.log("setCacheData:", methodKey);
    // 设置tt
    const cacheStorage = CacheStorageMap.get(serverName);
    if (!cacheStorage) throw new Error("CacheStorage not created");
    // const ttl = CacheTtlMap.get(serverName) as number;
    // const cacheData: CacheSetData = {
    //   data: responseData,
    //   exp: Date.now() + ttl * 1000,
    // };
    cacheStorage.set(methodKey, responseData);
  }

  get response() {
    return this.Response;
  }

  get request() {
    return this.Request;
  }

  get version() {
    return this.Version;
  }

  get name() {
    return `${this.apiInstance.name}.${this.Name}`;
  }

  get error() {
    if (this.Error) return this.Error;
    return null;
  }

  registerStrategies = (...strategys: Array<new () => Strategy>) => {
    this.strategies.push(...strategys);
  };

  private getStrategies() {
    const [serverName, apiName] = this.apiInstance.name.split(".");
    const serverStrategies = StrategyMap.get(serverName) ?? [];
    // console.log("serverStrategies:", serverStrategies);
    const apiStrategies = StrategyMap.get(apiName) ?? [];
    // console.log("apiStrategies:", apiStrategies);
    const methodStrategies =
      Reflect.getMetadata(
        `${STRATEGY_KEY.toString()}_${this.propertyKey}`,
        this.target
      ) || ([] as Array<new () => Strategy>);
    // console.log("methodStrategies:", methodStrategies);
    const allStrategies: Array<new () => Strategy> = [
      ...serverStrategies,
      ...apiStrategies,
      ...methodStrategies,
    ];

    return allStrategies;
  }

  private getMethodOptions() {
    // 获取方法配置
    const methodConfig = Reflect.getMetadata(
      METHOD_KEY,
      this.target,
      this.propertyKey
    ) as MethodOption;
    return methodConfig;
  }

  private isNoCache() {
    const [serverName] = this.apiInstance.name.split(".");
    const cacheForMap = CacheForMap.get(serverName);
    let flag = false;
    if (cacheForMap) {
      flag = cacheForMap.includes(this.Method.toLowerCase());
    }
    this.enableLog() && console.log('cacheForMap:',cacheForMap)
    this.enableLog() && console.log('cacheMethodFlag:',flag)
    // console.log("cacheForMap:", cacheForMap, this.Method, flag);
    // 方法是否开启缓存
    const isMethodNoCache = Reflect.getMetadata(
      NO_CACHE_KEY,
      this.target,
      this.propertyKey
    ) as boolean;
    const isApiNoCache = this.apiInstance.noCache;
    this.enableLog() && console.log("isApiNoCache:", isApiNoCache);
    this.enableLog() && console.log("isMethodNoCache:", isMethodNoCache);
    const noCacheFlag = isMethodNoCache
      ? true
      : false || isApiNoCache
      ? true
      : false;
    this.enableLog() && console.log("noCacheFlag:", noCacheFlag);

    return flag ? noCacheFlag : true;
  }

  private enableLog() {
    return this.apiInstance.enableLog;
  }

  private async applyHitSource(serverName: string) {
    const sources = this.getExpireSources();
    const cacheStorage = CacheStorageMap.get(serverName);
    if (cacheStorage) {
      const cacheKeys = await cacheStorage.keys();
      sources.map((source) => {
        cacheKeys.map((key) => {
          if (key.startsWith(source)) {
            this.enableLog() &&
              console.warn(`[${this.name}]请求成功，触发清除缓存：${source}`);
            cacheStorage.delete(key);
          }
        });
      });
    }
  }

  private applyProgress(request: AxiosRequestConfig): AxiosRequestConfig {
    // 应用进度
    const onUploadProgress = Reflect.getMetadata(
      UPLOAD_PROGRESS_KEY,
      this.target,
      this.propertyKey
    );
    const onDownloadProgress = Reflect.getMetadata(
      DOWNLOAD_PROGRESS_KEY,
      this.target,
      this.propertyKey
    );
    return {
      ...request,
      onUploadProgress,
      onDownloadProgress,
    };
  }
}

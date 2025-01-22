import {
  RequestBody,
  RequestMethod,
  ApiConfig,
  SendOptions,
  ApiResponse,
  RequestPipe,
  ResponseData,
  ResponseSuccessData,
  PipeResult,
  PaginationData,
} from "../typings";
import { apiKey } from "../utils";
import { applyVersioning } from "../versioning/versioning";

import { Snail } from "./snail";

/**
 * 泛型 R response success 时 返回的data类型
 * 泛型 E error 时 返回的error类型
 * 泛型 D error 时 返回error携带的data类型
 */
export class Api<R = any, E = any, D = any> {
  public baseURL: string;

  public url: string;

  public data?: RequestBody;

  public params?: Record<string, any>;

  public headers?: Record<string, any>;

  private key: string;

  // public config: ApiConfig<R> | undefined;

  public method: RequestMethod;

  private hitCache: boolean;

  public context: Snail;

  public version?: string;

  private versioning?: { url?: string; headers?: Record<string, any> };

  private name?: string;

  private hitSource?: string | Api;

  private timeout: number;

  private transform?: (data: R | PaginationData<R>) => R | PaginationData<R>;

  private pipes: RequestPipe[] = [];

  constructor(
    method: RequestMethod,
    url: string,
    context?: any,
    config?: ApiConfig<R>
  ) {
    const instance = this;
    instance.name = config?.name;
    instance.name ?? this.context.cacheSource.push(this);
    instance.hitSource = config?.hitSource;
    instance.method = method;
    instance.url = url;
    instance.params = config?.params;
    instance.headers = config?.headers;
    instance.transform = config?.transform;
    instance.context = context;
    // instance.config = config;
    instance.version =
      config?.version || instance.context.versioning?.defaultVersion;

    // 2. 合并配置

    this.timeout = config?.timeout || this.context.options.timeout || 5000;

    // 4. 执行一次版本管理器
    this.handleVersioning();

    // 5. 创建缓存key
    this.key = apiKey(this);
  }

  private handleVersioning(version?: string) {
    // console.log("版本管理器上下文：", this.context);
    if (!this.context) return;
    const { versioning } = this.context;
    // console.log("版本管理器:", versioning);
    if (versioning) {
      const { url, headers } = applyVersioning(
        version || (this.version as string),
        versioning
      );
      // console.log("执行版本管理:", url, headers);
      // this.url = url;
      this.versioning = {
        url,
        headers,
      };
    }
    return;
  }

  /**
   *
   * @param options 发送配置：子项params,data
   * 泛型<R = any, E = any>R返回数据类型, E返回错误类型(code!=0)
   * @returns
   */
  send(options?: SendOptions): Promise<ApiResponse<R, E>> {
    this.data = options?.data;
    this.params = options?.params;

    if (options?.params || options?.data) {
      // 更新key
      this.key = apiKey(this);
    }
    // 执行临时版本管理
    const version = options?.version || this.version;
    console.log("send version:", version);
    this.handleVersioning(version);

    return new Promise(async (resolve, reject) => {
      // 1. 请求前处理
      const { data, headers } = this.processRequestPipes();
      // 处理后更新instance
      this.data = data;
      this.headers = headers;
      // 处理后应更新key
      this.key = apiKey(this);

      // 2. 查找缓存,按版本查找
      const cachedResponse = await this.checkCache(version);
      // console.log("检查缓存：", cachedResponse);
      if (cachedResponse) {
        const versionUrl = this.versioning?.url ? this.versioning?.url : "";
        console.warn(
          `请求[${this.context.baseURL}/${
            versionUrl == "" ? "" : `${versionUrl}/`
          }${this.url}]命中缓存`
        );
        return resolve({
          error: null,
          data: cachedResponse,
          hitCache: this.hitCache,
          Catch: (handler: () => void) => handler(),
        });
      }

      try {
        // 5. 发送请求
        const response = await this.sendRequest();

        // 6. 处理响应
        const { code, data, message } = response.data as ResponseData<R, E>;
        // const result = await this.handleResponse(response);
        if (code !== 0) {
          reject({
            error: new Error(message, { cause: { code, data } }),
            data: null,
            hitCache: false,
            Catch: (handler: () => void) => handler(),
          });
        }
        // 数据转换
        const transformedData = this.transform
          ? this.transform(data as any)
          : (data as R | PaginationData<R>);
        // 缓存存储
        this.context.cacheStorage?.set(this.key, transformedData);
        resolve({
          error: null,
          data: transformedData as ResponseSuccessData<R>,
          hitCache: false,
          Catch: (handler: () => void) => handler(),
        });
        // 处理hitSource失效缓存
        this.lapsed(version);
      } catch (error: any) {
        resolve({
          error,
          data: null,
          hitCache: false,
          Catch: (handler: (error: any) => void) => handler(error),
        });
      }
    });
  }

  private async checkCache<T extends ResponseSuccessData<R>>(
    version?: string
  ): Promise<T | null> {
    if (!this.context.cacheStorage) return null;
    return new Promise(async (resolve) => {
      if (!this.context.cacheStorage) {
        return resolve(null);
      }
      // console.log("cache-key:", this.key);
      let tempKey;
      if (version) {
        tempKey = apiKey({
          ...this,
          version,
        });
      }
      const { error, data } = await this.context.cacheStorage!.get<T>(
        tempKey ? tempKey : this.key
      );
      // console.log(error, data);
      if (error) {
        console.warn(error);
        return resolve(null);
      }
      this.hitCache = true;
      return resolve(data);
    });
  }

  public async delCache(version?: string) {
    let tempKey;
    if (version) {
      tempKey = apiKey({
        ...this,
        version,
      });
    }
    await this.context.cacheStorage!.delete(tempKey ? tempKey : this.key);
  }

  public use(pipe: RequestPipe) {
    this.pipes.push(pipe);
  }

  private processRequestPipes() {
    let requestData = this.data;
    let requestHeaders = this.headers || {};

    if (this.pipes.length > 0) {
      const pipeResult = this.pipes.reduce(
        (result: PipeResult, pipe: RequestPipe) => {
          return pipe(result.data, result.headers);
        },
        { data: requestData, headers: requestHeaders }
      );

      requestData = pipeResult.data;
      requestHeaders = pipeResult.headers;
    }
    return { data: requestData, headers: requestHeaders };
  }

  private async sendRequest() {
    // if (!timeout) throw new Error("Timeout is required");
    const headers = {
      ...this.headers,
      ...this.versioning?.headers,
    };
    const versionUrl = this.versioning?.url ? this.versioning?.url : "";
    return await this.context.axiosInstance.request({
      url: `${versionUrl}/${this.url}`,
      method: this.method,
      data: this.data,
      headers,
      params: this.params,
      timeout: this.timeout,
    });
  }

  private async lapsed(version?: string) {
    if (!this.hitSource) return;
    if (typeof this.hitSource === "string") {
      const { cacheSource } = this.context;
      const source = cacheSource.find((api) => api.name == this.hitSource);
      source ?? source!.delCache(version);
    } else {
      this.hitSource.delCache(version);
    }
  }
}

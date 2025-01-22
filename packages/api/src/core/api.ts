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

  private context: Snail;

  public version?: string;

  private versioning?: { url?: string; headers?: Record<string, any> };

  // private name?: string;

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
    // instance.name = config?.name;
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
    // 3. 创建缓存key
    this.key = apiKey(this);
    // 4. 执行版本管理
    this.handleVersioning();
  }

  private handleVersioning() {
    // console.log("版本管理器上下文：", this.context);
    if (!this.context) return;
    const { versioning } = this.context;
    // console.log("版本管理器:", versioning);
    if (versioning) {
      const { url, headers } = applyVersioning(
        this.version as string,
        versioning
      );
      console.log("执行版本管理:", url, headers);
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

    return new Promise(async (resolve, reject) => {
      // 1. 查找缓存
      const cachedResponse = await this.checkCache();
      // console.log("检查缓存：", cachedResponse);
      if (cachedResponse) {
        return resolve({
          error: null,
          data: cachedResponse,
          hitCache: this.hitCache,
        });
      }

      // 4. 请求前处理
      const { data, headers } = this.processRequestPipes();
      // 处理后更新instance
      this.data = data;
      this.headers = headers;

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
        });
      } catch (error: any) {
        reject({ error, data: null, hitCache: false });
      }
    });
  }

  private async checkCache<
    T extends ResponseSuccessData<R>
  >(): Promise<T | null> {
    if (!this.context.cacheStorage) return null;
    return new Promise(async (resolve) => {
      if (!this.context.cacheStorage) {
        return resolve(null);
      }
      // console.log("cache-key:", this.key);
      const { error, data } = await this.context.cacheStorage!.get<T>(this.key);
      // console.log(error, data);
      if (error) {
        // console.log("[Cache]", error);
        return resolve(null);
      }
      this.hitCache = true;
      return resolve(data);
    });
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
}

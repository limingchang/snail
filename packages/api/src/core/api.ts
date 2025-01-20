import { RequestBody, RequestMethod, ApiConfig } from "../typings";
import { apiKey, deepCopy } from "../utils";
import { applyVersioning } from "../versioning/versioning";

import { Snail } from "./snail";

export class Api<T = any> {
  public baseURL: string;

  public url: string;

  public data?: RequestBody;

  private key: string;

  public config: ApiConfig<T> | undefined;

  public method: RequestMethod;

  public hitCache: boolean;

  public context: Snail;

  public version?: string;

  public name?: string;

  private timeout: number;

  constructor(
    method: RequestMethod,
    url: string,
    context?: any,
    config?: ApiConfig<T>,
    data?: RequestBody
  ) {
    const instance = this;
    instance.name = config?.name;
    instance.method = method;
    instance.url = url;
    instance.data = data;
    instance.context = context;
    instance.config = config;
    instance.version =
      config?.version || instance.context.versioning?.defaultVersion;
    this.key = apiKey(instance);
    // 2. 合并配置
    const { apiConfig, timeout } = this.mergeConfig();
    this.timeout = timeout ? timeout : 5000;
    // 3. 版本管理
    const updatedConfig = this.handleVersioning(apiConfig);
    this.config = updatedConfig;
  }

  private async checkCache(): Promise<{
    code: number;
    message: string;
    data: T | null;
  } | null> {
    if (!this.context.cacheStorage) return null;

    try {
      const { error, data } = await this.context.cacheStorage.get<T>(this.key);
      if (error) {
        console.warn(`[Cache] ${error.message}`);
        return null;
      }
      this.hitCache = true;
      return {
        code: 0,
        message: "success",
        data,
      };
    } catch (error) {
      console.warn(`[Cache] 缓存查询失败: ${error}`);
      console.log(error)
      return null;
    }
  }

  private mergeConfig() {
    const apiConfig = deepCopy(this.config);
    const timeout = apiConfig?.timeout || this.context.options.timeout;
    return { apiConfig, timeout };
  }

  private handleVersioning(apiConfig: ApiConfig<T> | undefined) {
    if (!apiConfig) return;
    if (this.context.options.Versioning) {
      const versioning = this.context.options.Versioning;
      const version = apiConfig?.version || versioning.defaultVersion;
      if (version) {
        const result = applyVersioning(
          this.url,
          version,
          versioning,
          apiConfig
        );
        if (typeof result === "string") {
          this.url = result;
        } else {
          this.url = result.url;
          apiConfig = result.config;
        }
      }
    }
    return apiConfig;
  }

  private processRequestPipes(apiConfig: ApiConfig<T> | undefined) {
    if (!apiConfig) return { requestData: this.data, requestHeaders: {} };
    let requestData = this.data;
    let requestHeaders = apiConfig?.headers || {};

    if (apiConfig?.requestPipes) {
      const pipeResult = apiConfig.requestPipes.reduce(
        (result: any, pipe: Function) => {
          const { data, headers } = pipe(result);
          return {
            data: data || result.data,
            headers: headers || result.headers,
          };
        },
        { data: requestData, headers: requestHeaders }
      );

      requestData = pipeResult.data;
      requestHeaders = pipeResult.headers;
    }
    return { requestData, requestHeaders };
  }

  private async sendRequest(
    requestData: any,
    requestHeaders: any,
    timeout: number | undefined
  ) {
    // if (!timeout) throw new Error("Timeout is required");
    return await this.context.axiosInstance.request({
      url: this.url,
      method: this.method,
      data: requestData,
      headers: requestHeaders,
      timeout,
    });
  }

  private async handleResponse(
    response: any,
    apiConfig: ApiConfig<T> | undefined,
    cacheStorage: any
  ): Promise<{ data: any }> {
    if (!apiConfig) throw new Error("ApiConfig is required");
    const isJson =
      response.headers["content-type"]?.includes("application/json");
    if (!isJson) {
      return { data: response.data };
    }

    const { code, message, data } = response.data;
    if (code !== 0) {
      throw { code, message, error: data };
    }

    const transformedData = apiConfig?.transform
      ? apiConfig.transform(data)
      : data;

    if (this.context.options.CacheManage) {
      await cacheStorage?.set(this.key, transformedData);
    }

    return { data: transformedData };
  }

  send(): Promise<{ error: null; data: any } | { error: any; data: null }> {
    return new Promise(async (resolve, reject) => {
      const cacheStorage = this.context.cacheStorage;

      // 1. 检查缓存
      const cachedResponse = await this.checkCache();
      console.log("检查缓存：", cachedResponse);
      if (cachedResponse) {
        return resolve({ error: null, data: cachedResponse.data });
      }

      // 4. 请求前处理
      const { requestData, requestHeaders } = this.processRequestPipes(
        this.config
      );

      try {
        // 5. 发送请求
        const response = await this.sendRequest(
          requestData,
          requestHeaders,
          this.timeout
        );

        // 6-9. 处理响应
        const result = await this.handleResponse(
          response,
          this.config,
          cacheStorage
        );
        resolve({ error: null, data: result.data });
      } catch (error: any) {
        reject({ error, data: null });
      }
    });
  }
}

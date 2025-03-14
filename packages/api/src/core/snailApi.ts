import { resolveUrl } from "../utils";

import {
  Strategy,
  ApiConfig,
  // VersioningType,
  ApiInstanceOptions,
} from "../typings";
// import keys
// import { STRATEGY_KEY } from "../decorators/strategy";
// import { VERSION_KEY } from "../decorators/versioning";
import { API_CONFIG_KEY } from "../decorators/api";
import { STRATEGY_KEY } from "../decorators/strategy";
import { CACHE_EXPIRE_SOURCE_KEY, NO_CACHE_KEY } from "../decorators/cache";

import { SnailServer, StrategyMap, ExpireSourceMap } from "./snailServer";

export class SnailApi {
  private Name: string;
  private serverInstance: SnailServer;
  private Version?: string;
  private Url?: string;
  private Timeout?: number;
  private EnableLog?: boolean;

  constructor(options: ApiInstanceOptions) {
    const apiConfig = this.getApiConfig();
    if (!apiConfig) {
      throw new Error("Create SnailApi must be used for @Api() decoration");
    }
    const { serverInstance, enableLog } = options;
    this.serverInstance = serverInstance;
    this.EnableLog = enableLog ? true : false;
    this.init();
  }

  private init() {
    // console.log("serverInstance:", this.serverInstance.name);
    const apiConfig = this.getApiConfig();
    this.initName();
    // console.log("apiName:", this.Name);
    this.initStrategy();
    // console.log('server-version:', this.serverInstance.version)
    // 同步或覆盖版本号
    this.Version = apiConfig.version ?? this.serverInstance.version;
    // console.log("api-version:", this.Version);
    this.Url = apiConfig.url;
    this.Timeout = apiConfig.timeout;
    // this.initExpireSource();
  }

  private initStrategy() {
    const serverStrategies =
      Reflect.getMetadata(STRATEGY_KEY, this.constructor) || [];
    StrategyMap.set(this.Name, serverStrategies);
  }

  registerStrategys(...strategys:  Array<new () => Strategy>) {
    const serverStrategies = StrategyMap.get(this.Name) ?? [];
    serverStrategies.push(...strategys);
    StrategyMap.set(this.Name, serverStrategies);
  }

  private initName() {
    const { name } = this.getApiConfig();
    const apiName = name ?? this.constructor.name;
    this.Name = `${this.serverInstance.name}.${apiName}`;
  }


  private getApiConfig() {
    return Reflect.getMetadata(
      API_CONFIG_KEY,
      this.constructor
    ) as ApiConfig & {
      url: string;
    };
  }

  private isNoCache() {
    // 开启缓存
    const isServerNoCache = Reflect.getMetadata(
      NO_CACHE_KEY,
      this.serverInstance.constructor
    ) as boolean;
    const isApiNoCache = Reflect.getMetadata(
      NO_CACHE_KEY,
      this.constructor
    ) as boolean;
    // 查这里逻辑
    return isServerNoCache || isApiNoCache;
  }

  get version() {
    return this.Version;
  }

  get url() {
    return this.Url;
  }

  get name() {
    return this.Name;
  }

  get noCache() {
    return this.isNoCache();
  }

  get enableLog() {
    return this.EnableLog;
  }

  get timeout() {
    return this.Timeout;
  }

}

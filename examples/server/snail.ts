import { Snail, SnailConfig, VersioningType, CacheType } from "@snail-js/api";
import { AxiosRequestConfig } from "axios";

const config: SnailConfig = {
  baseURL: "api",
  Versioning: {
    type: VersioningType.Uri,
    prefix: "v",
    defaultVersion: "0.1.0",
  },
  timeout: 5000,
  requestInterceptors: {
    onFulfilled(config: AxiosRequestConfig) {
      console.log("requestInterceptors:", config.url);
    },
  },
  responseInterceptors: {
    onFulfilled(value) {
      console.log(value);
    },
    onRejected(error) {
      console.log(error);
    },
  },
  CacheManage: {
    type: CacheType.LocalStorage,
    ttl: 600,
  },
};

export default new Snail(config);

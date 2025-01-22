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
    onFulfilled(config) {
      console.log("requestInterceptors:", config.url);
      return config
    },
  },
  responseInterceptors: {
    onFulfilled(response) {
      console.log(response);
      return response
    },
    onRejected(error) {
      console.log(error);
      return error
    },
  },
  CacheManage: {
    type: CacheType.Memory,
    ttl: 60,
  },
};

export default new Snail(config);

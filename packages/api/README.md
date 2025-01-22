<p>
  <img src="https://img.shields.io/badge/TypeScript-1e80ff"></img>
  <img src="https://img.shields.io/npm/v/axios?label=axios&labelColor=1e80ff&color=67C23A"></img>
</p>
## 项目介绍

- 基于 Axios 二次封装
- 提供请求基本实例`Snail`，请求实例`Api`

## 安装

`npm install @snail-js/api`

## 使用

1. 创建`Snail`实例

```typescript
import { Snail, SnailConfig, VersioningType, CacheType } from "@snail-js/api";
import { AxiosRequestConfig } from "axios";

const options:SnailConfig = {
  baseUrl:'api',
  Versioning: {
    type: VersioningType.Uri,
    prefix: "v",
    defaultVersion: "0.1.0",
  },
  timeout: 5000,
  requestInterceptors: {
    onFulfilled(config: AxiosRequestConfig) {
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
    },
  },
  CacheManage: {
    type: CacheType.LocalStorage,
    ttl: 60, //缓存过期时间
  },
}
export SnailInstance = new Snail(options)
```

2. 创建请求方法实例

```typescript
import { ApiConfig, RequestPipe } from "@snail-js/api";

import { SnailInstance } from "./snail";
const pipe: RequestPipe = (input) => {
  const { data, headers } = input;
  const newHeaders = {
    ...headers,
    pipe: "RequestPipe",
  };
  return {
    data,
    headers: newHeaders,
  };
};

const transform = (data: any) => {
  return {
    ...data,
    transform: "transform",
  };
};

const options: ApiConfig = {
  transform,
  version: "0.3.0", //会覆盖defaultVersion
};
const Api = Snail.Get("test", options);
Api.use(pipe);
export const testApi = Api;

// 配置了hitSource，Api2请求成功时会使Api的缓存失效
// 当你更新了数据时，get请求的缓存失效，会发起请求，这很有用
const Api2 = Snail.Post("test",{hitSource:Api})
export const testApi2 = Api2
```

3. 使用请求

```typescript
import { testApi } from "./testApi";
// 发送时也可临时更改version，便于测试
const res = await TestApi.send({ version: "0.1.0" });
const { Catch, error, data } = res;
if (error == null) {
  console.log("Snail-Api:", data);
}
Catch((error) => {
  console.log(error);
});
// success {error:null,data}
// error {error,data:null} 附带的相关错误数据会保存在error.cause中
// 某些服务端标记的code !=0的请求，会被捕获为错误，而且携带数据
```

### Snail 配置

- `baseUrl`：同`Axios`
- `Versioning`:版本管理器
- type:管理器类型，enum:Uri,Head,Query,Custom
- prifix:前缀
- defaultVersion:全局默认版本
- timenout:全局超时时间，会被 Api 的 timeout 值覆盖
- requestInterceptors：全局请求拦截器
- responseInterceptors：全局响应拦截器
- CacheManage：缓存管理器
- type:缓存管理器类型，CacheType,enum:localStorage,IndexDB,Memory
- ttl: 缓存过期时间

## Api 配置

- name?: 请求名称，用于hitSource来使缓存失效
- timeout?: 请求超时时间;会覆盖`SnailConfig.timeout`
- version?: 请求版本，会覆盖`SnailConfig.Versioning.defaultVersion`;
- transform?: `(data: any) => T`;响应数据转换器，用于对返回数据进行转换操作
- headers?: Record<string, string>;
- params?: Record<string, string>;
- hitSource?: string | Api;失效源

## send参数配置

- params?: Record<string, string>; 请求Query参数
- data?: RequestBody; 请求体数据
- version?: string; 请求版本，如设置，会临时使用此版本运行版本管理器

### 代码仓库
- ![Static Badge](https://img.shields.io/badge/snail-js?style=flat&label=gitee&labelColor=F56C6C&link=https%3A%2F%2Fgitee.com%2Flimich%2Fsnail)
- ![Static Badge](https://img.shields.io/badge/snail-js?style=flat&label=github&labelColor=F56C6C&link=https%3A%2F%2Fgihub.com%2Flimingchang%2Fsnail)


### 作者
- mc.lee
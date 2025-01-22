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
    ttl: 600,
  },
}
export SnailInstance = new Snail(options)
```
2. 创建请求方法实例
```typescript
import {  ApiConfig, RequestPipe } from "@snail-js/api";

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

const transform = (data:any) => {
  return {
    ...data,
    transform: "transform",
  };
};

const options: ApiConfig = {
  requestPipes: [pipe],
  transform,
};
export const testApi = SnailInstance.Get('test',options)
```
3. 使用请求
```typescript
import { testApi } from './testApi'
const res = await testApi.send()
// success {error:null,data}
// error {error,data}
// 某些服务端标记的code !=0的请求，会被捕获为错误，而且携带数据
```

### Snail配置
- `baseUrl`：同`Axios`
- `Versioning`:版本管理器
 - type:管理器类型，enum:Uri,Head,Query,Custom
 - prifix:前缀
 - defaultVersion:全局默认版本
- timenout:全局超时时间，会被Api的timeout值覆盖
- requestInterceptors：全局请求拦截器
- responseInterceptors：全局响应拦截器
- CacheManage：缓存管理器
 - type:缓存管理器类型，CacheType,enum:localStorage,IndexDB,Memory
 - ttl: 缓存过期时间

## Api配置
- name?: 请求名称
- timeout?: 请求超时时间;
- version?: 请求版本，会覆盖`SnailConfig.Versioning.defaultVersion`;
- transform?: `(data: any) => T`;响应数据转换器，用于对返回数据进行转换操作
- requestPipes?: RequestPipe[];请求前pipe,会依次处理请求的data和headers

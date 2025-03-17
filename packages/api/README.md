<p>
  <img src="https://img.shields.io/badge/TypeScript-1e80ff"></img>
  <img src="https://img.shields.io/npm/v/axios?label=axios&labelColor=1e80ff&color=67C23A"></img>
  <img src="https://img.shields.io/npm/v/reflect-metadata?label=reflect-metadata&labelColor=1e80ff&color=67C23A"></img>
</p>

中文文档|<a href='./README_EN.md'>English Document</a>

## 项目介绍

- 基于 Axios 二次封装
- 使用`reflect-metadata`创建和处理元数据
- 提供装饰器定义请求请求的方式，支持所有请求方法和 SSE

## 安装

`npm install @snail-js/api`

## 使用

1. 请开启`TypeScript`相关装饰器配置

```json
// tsconfig.json
{
  "module": "ESNext",
  // 模块解析策略
  "moduleResolution": "node",
  "baseUrl": ".",
  // target 必须大于ES6
  "target": "ESNext",
  // lib 需要包含大于ES6的ES版本
  "lib": ["ESNext", "DOM"],
  // 包含reflect-metadata类型
  "types": ["reflect-metadata"],
  "emitDecoratorMetadata": true,
  "experimentalDecorators": true,

  "skipLibCheck": true,
  "strictNullChecks": false
}
```

2. 创建`Snail`后端基本配置实例

```typescript
// service.ts
import { SnailServer, Server } from "@snail-js/api";

@Server({
  baseURL: "/api",
  timeout: 5000,
})
class BackEnd extends SnailServer {}

export const Service = new BackEnd();
```

3. 创建 Api 实例

```typescript
// user.ts
import { Api, Get, Post, Query, Data,SnailApi } from "@snail-js/api";

import { Service } from "./service";

@Api("user")
class UserApi extends SnailApi {
  @Get()
  get(@Query("id") id: string) {}

  @Post()
  create(@Data() user: User) {}
}
// 创建并导出api
export const userApi = Service.createApi(UserApi);
```

3. 发送请求

```typescript
import { userApi } from "./user";

const getUser = await userApi.get("1");
const { send, onSuccess, onError, onHitCache, on } = getUser;
const data = await send();
```

## `SnailMethod` 实例
- 调用`Service.createApi(ApiInstance)`后会为`ApiInstance`内被`RequestMethod`(如：@Get、@Post...)装饰的方法创建一个代理，返回一个函数，此函数包含请求参数，调用此函数返回`SnailMethod` 实例

### `SnailMethod` 实例方法

- `send` 发送请求
 _异步函数，发送当前请求_
- `onSuccess` 请求成功回调
 _注册请求成功事件_
- `onError` 请求失败回调
 _注册请求失败事件_
- `onHitCache` 请求命中缓存回调
 _注册请求命中缓存事件_
- `onFinish` 请求完成回调
 _注册请求完成事件_
- `on` 监听事件
 _注册自定义事件_
- `emit` 触发事件
 _触发自定义事件_
- `off` 取消监听事件
 _取消自定义事件监听_


### `SnailMethod` 实例属性
- response : AxiosResponse
- request : AxiosRequestConfig ,最终请求的request,这个request是被Versioning和Strategy处理过的
- version : string,最终请求的版本，如果没有开启Versioning则为undefine
- name : string,完整的SnailMethod名称，格式为`ServerName.ApiName.MethodName`
- error : Error | null,请求失败的错误信息,无错误为null

### Server 配置

<table>
  <tr>
    <th>配置项</th>
    <th>类型</th>
    <th>是否必须</th>
    <th>默认值</th>
    <th>说明</th>
  </tr>
  <tr>
    <td>name</td>
    <td>string</td>
    <td>否</td>
    <td>默认使用继承`SnailServer`的类名作为name</td>
    <td>server实例唯一标识，请勿与其他server重复</td>
  </tr>
  <tr>
    <td>baseUrl</td>
    <td>string</td>
    <td>否</td>
    <td>'\'</td>
    <td>请求后端的api地址前缀，同`axios`的baseUrl</td>
  </tr>
  <tr>
    <td>Versioning</td>
    <td><a href="#versioningoption">VersioningOption</a></td>
    <td>否</td>
    <td>undefine</td>
    <td>版本管理器配置，默认不开启</td>
  </tr>
  <tr>
    <td>timeout</td>
    <td>number</td>
    <td>否</td>
    <td>5000</td>
    <td>单位:毫秒；全局超时时间，会被 Api 的 timeout 值覆盖</td>
  </tr>
  <tr>
    <td>cacheManage</td>
    <td>{type:CacheType,ttl:number}</td>
    <td>否</td>
    <td>{
      type: CacheType.Memory,
      ttl: 500
    }</td>
    <td>缓存管理器,ttl单位为秒</td>
  </tr>
  <tr>
    <td>cacheFor</td>
    <td>RequestMethod | RequestMethod[] | 'All' | 'all' </td>
    <td>否</td>
    <td>Get</td>
    <td>要启用缓存的方法，默认仅开启Get缓存</td>
  </tr>
  <tr>
    <td>enableLog</td>
    <td>boolean</td>
    <td>否</td>
    <td>false</td>
    <td>是否开启日志，用于调试</td>
  </tr>
</table>

### Api 配置
- 请使用`@Api()`装饰自定义Api类并继承`SnailApi`

<table>
  <tr>
    <th>配置项</th>
    <th>类型</th>
    <th>是否必须</th>
    <th>默认值</th>
    <th>说明</th>
  </tr>
  <tr>
    <td>name</td>
    <td>string</td>
    <td>否</td>
    <td>默认使用继承`SnailApi`的类名作为name</td>
    <td>api实例唯一标识，请勿与其他api重复</td>
  </tr>
  <tr>
    <td>timeout</td>
    <td>number</td>
    <td>否</td>
    <td></td>
    <td>请求超时时间;会覆盖Server的timeout设置</td>
  </tr>
  <tr>
    <td>version</td>
    <td>string</td>
    <td>否</td>
    <td></td>
    <td>api版本号，会覆盖server的`defaultVersion`配置</td>
  </tr>
</table>

## 请求方法装饰器

- 在`Api`类中使用，用于标记请求方法
- 提供 axios 的全部请求方法`Get,Post,Head,Put,Delete,Patch,Options`
- 参数: `path?: string`; 请求端点路径，与`baseUrl,api.url`共同拼接组成最终请求路径

## 参数装饰器

### 查询参数 `@Query`

- `@Query(key?:string)`

- 单个参数使用

```typescript
@Api("user")
class UserApi {
  @Get()
  get(@Query("id") id: string, @Query("sign") sign: string) {}
}
```

> 传入 key，标记单个查询参数，拼接到请求`?k1=v1&k2=v2`

### 路由参数 `@Params`

- `@Params(key?:string)`

- 单个参数使用

```typescript
@Api("user/:id/:sign")
class UserApi {
  @Get()
  get(@Params("id") id: string, @Params("sign") sign: string) {}
}
```

> 传入 key，标记单个查询参数，拼接到请求`?k1=v1&k2=v2`

- 对象参数使用

```typescript
class RouteParams {
  id: string;
  sign: string;
}

@Api("user/:id/:sign")
class UserApi {
  @Get()
  get(@Params() params: RouteParams) {}
}
```

> 不传入 key，会被标记为对象类型查询参数；也能自动拼接到请求

- 混合使用

```typescript
class RouteParams {
  id: string;
  sign: string;
}

@Api("user/:id/:sign")
class UserApi {
  @Get()
  get(@Params() params: Query, @Params("a") a: number) {}
}
```

### 请求数据

- `@Data(key?:string)`
- 使用方式和`@Params`相同，也支持混合使用

## 策略装饰器`@UseStrategy`

- `@UseStrategy(...Strategy[])`

### 请求策略

- 在请求发送前执行，后面的策略返回结果会覆盖前面的策略
- 若返回处理后的request，则使用处理后的 request 发送请求，否则使用原始 request 或上一个策略返回的request发送请求

```typescript
class CustomStrategy extends Strategy {
  applyRequest(request: AxiosRequestConfig) {
    request.headers["Access-Token"] = "abcde";
    return request;
  }
}

// 用在Snail，全局的请求策略

@Server({
  baseURL: "/api",
  timeout: 5000,
})
@UseStrategy(CustomStrategy)
class BackEnd extends Snail<ShanheResponse> {}
export const Service = new BackEnd();
// 创建Service实例后再注册策略
Service.registerStrategies(CustomStrategy);

// 用在Api, 当Api下的方法请求时生效
@Api("test")
@UseStrategy(CustomStrategy)
class Test {}
const TestApi = Service.createApi(Test);
// 创建Api实例后再注册策略
TestApi.registerStrategies(CustomStrategy);

// 用在方法，此方法请求时生效
@Api("test")
@UseStrategy(CustomStrategy)
class Test {
  @Get()
  @UseStrategy(CustomStrategy)
  get() {}
}
// 发送请求前注册策略
const TestApi = Service.createApi(Test);
const getSomething = TestApi.get();
getSomething.registerStrategies(CustomStrategy);
{ send, registerStrategies } = getSomething;

```

### 响应策略

- 在收到服务器响应后执行
- 若返回处理后的response，则使用处理后的response进行下一个策略或返回，否则使用原始response或上一个策略返回的response返回

```typescript
// 如何定义
class CustomStrategy extends Strategy {
  applyResponse(response: AxiosResponse) {
    const { status } = response;
    if (status == 200) {
      // do something
    }
    return response;
  }
}
```

## 版本管理装饰器`@Versioning`和`@Version`

### 版本管理器`@Versioning(VersioningOption)`

- 全局管理版本

```typescript
@Server({
  baseURL: "/api",
  timeout: 5000,
})
@Versioning({
  type: VersioningType.Header,
  defaultVersion: "0.1.0",
})
class BackEnd extends Snail<ShanheResponse> {}

export const Service = new BackEnd();
```

#### <a id="versioningoption">`VersioningOption`</a>类型

```typescript
export enum VersioningType {
  Uri,
  Header,
  Query,
  Custom,
}

interface VersioningCommonOption {
  defaultVersion: string;
}

export interface VersioningUriOption extends VersioningCommonOption {
  type: VersioningType.Uri;
  prefix?: string;
}

export interface VersioningHeaderOption extends VersioningCommonOption {
  type: VersioningType.Header;
  header?: string;
}

export interface VersioningQueryOption extends VersioningCommonOption {
  type: VersioningType.Query;
  key?: string;
}

export interface VersioningCustomOption extends VersioningCommonOption {
  type: VersioningType.Custom;
  extractor: (requestOptions: unknown) => {
    url: string;
    headers: Record<string, any>;
  };
}

export type VersioningOption =
  | VersioningUriOption
  | VersioningHeaderOption
  | VersioningQueryOption
  | VersioningCustomOption;
```

### 临时版本修改器`@Version`

- 临时改变方法请求的版本

```typescript
@Api("test")
class Test {
  @Get("HelloWorld")
  @Version("0.2.0")
  test() {}
}
```

> 临时改变 api 版本，便于测试

### 缓存装饰器`@HitSource`

- `@HitSource(name:string)`
- 为被装饰的方法设置缓存失效源，当设置的名称方法被调用且正常响应时，被装饰的方法缓存失效
- name格式为：`serverName:apiName:methodName`
> 注意：若您配置了SnailServer/SnailApi的name选项，请使用此name作为名称，否则使用类名作为名称

```typescript
@Api("test",{name:'api1'})
@HitSource("api1")
class Test {
  @Get("HelloWorld")
  @HitSource("api1.test2")
  test1() {}

  @Post()
  test2() {}

  @Get()
  // Test类下任何请求成功，这个方法的缓存都会失效
  @HitSource("api1")
  test3() {}
}
```

> 当请求`[Post]test`成功时，`[Get]test/HelloWorld`的缓存失效
> 默认仅Get方法会进行缓存ing缓存，若要开启其他方法的缓存，请使用`@Server({cacheFor:'all'})`配置

> `test3`方法请求成功时，不缓存

> 注意：要使用缓存，请配置`@Server({CacheManage})`缓存管理器

### 上传进度装饰器`@UploadProgress`

- `@UploadProgress((progressEvent: AxiosProgressEvent) => void)`

### 下载进度装饰器`@DownloadProgress`

- `@DownloadProgress((progressEvent: AxiosProgressEvent) => void)`

## Server Send Event 服务端推送

### 创建 sse 端点

```typescript
@Sse("sse")
class ServerSend extend SnailSse {

  @OnSseOpen()
  handleOpen(event: Event) {
    console.log("sse-open:", event);
  }

  @OnSseError()
  handleError(event: Event) {
    console.log("sse-error:", event);
  }

  // 处理默认message事件
  @SseEvent()
  handleEvent(event: MessageEvent) {
    console.log("sse-event[message]:", event.data);
  }

  // 处理自定义名称事件
  @SseEvent("chunk")
  handleEvent(event: Event) {
    console.log("sse-event[chunk]:", event);
  }
}

export const Sse = Service.createSse(ServerSend);
```

### 服务端推送装饰器`@Sse`

- `@Sse(path:string,options?:{withCredentials?: boolean,version?: string;})`
- 创建一个服务端推送连接，返回一个函数，用于打开 sse 连接
  - 返回的打开函数调用后会返回`{eventSource:EventSource,close:function}`
    - eventSource: sse 连接实例
    - close: 关闭此 sse 连接的方法

### 注册`onopen`装饰器`@OnSseOpen`

- 当`@Sse`装饰的方法被调用时，将`@OnSseOpen`装饰的方法注册为`@Sse`装饰的方法返回的`EventSource`实例`onopen`处理函数

### 注册`onerror`装饰器`@OnSseError`

- 当`@Sse`装饰的方法被调用时，将`@OnSseError`装饰的方法注册为`@Sse`装饰的方法返回的`EventSource`实例`onerror`处理函数

### 事件处理装饰器`@SseEvent`

- `@SseEvent(eventName?:string)`
- 未传入`eventName`，默认注册为`message`事件处理器
- 传入`eventName`，注册为对应名称的事件处理器

---

## TypeScript 支持

### 默认返回类型

```typescript
export type StandardResponseData<
  T extends ResponseJsonData = Record<string, any>
> = {
  code: number;
  message: string;
  data: T;
};
```

### 定义返回类型

1. 定义后端标准数据格式

```typescript
export class CustomResponse {
  status_code: number;
  msg: string;
}
```

2. 创建时应用格式

```typescript
// service.ts
import { SnailServer, Server } from "@snail-js/api";

@Server({
  baseURL: "/api",
  timeout: 5000,
})
class BackEnd extends SnailServer<CustomResponse> {}

export const Service = new BackEnd();
```

3. 调用 API 时携带数据格式

```typescript
import { userApi } from "./user";

class User {
  id: number;
  name: string;
  tel: string;
  age: number;
}

const getUser = userApi.get<User>("1");
const { send } = getUser;

const res = await send();

// 默认情况，以data为key存储数据
// res.data => CustomResponse & { data : User}
```

> API 被调用的返回格式

```typescript
const getUser = userApi.get<User>("1");
const { send } = getUser;
const res = await send();

// res.data => CustomResponse & { data: User }

const getUser = userApi.get<Blob>("1");
const { send } = getUser;
const res = await send();
// res => AxiosResponse<Blob>
```

> `data: T`,后端响应数据；默认为`ResponseData<T = any>`类型；可由用户自定义修改

> `error: null | Error` ; 请求过程中的错误包含在此，可先判断 error 是否为 null 再进行数据处理

> `hitCache?: boolean`; 标识请求是否击中缓存；若从缓存获得数据，则不会发送请求。

4. 若后端返回数据不是以 data 为 key 包含数据

```typescript
@Server({
  baseURL: "/api",
  timeout: 5000,
})
class BackEnd extends Snail<CustomResponse, "record"> {}

const res = await userApi.get<User>("1");
// 自定义数据key
// res.data => CustomResponse & { record : User}
```

### 非json数据的返回
- 若后端返回的content-type不是json类型，send方法返回的将是`AxiosResponse`
- 若后端返回的content-type是json类型，send方法返回的将是`AxiosResponse.data`

### 代码仓库

<p>
  <a href="https://gitee.com/limich/snail">
    <img src="https://img.shields.io/badge/snail-js?style=flat&label=gitee&labelColor=F56C6C&link=https%3A%2F%2Fgitee.com%2Flimich%2Fsnail"></img>
  </a>
</p>
<p>
  <a href="https://github.com/limingchang/snail">
    <img src="https://img.shields.io/badge/snail-js?style=flat&label=github&labelColor=F56C6C&link=https%3A%2F%2Fgihub.com%2Flimingchang%2Fsnail"></img>
  </a>
</p>

### 作者

- mc.lee

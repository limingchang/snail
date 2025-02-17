<p>
  <img src="https://img.shields.io/badge/TypeScript-1e80ff"></img>
  <img src="https://img.shields.io/npm/v/axios?label=axios&labelColor=1e80ff&color=67C23A"></img>
</p>

## 项目介绍
- 基于 Axios 二次封装
- 使用`reflect-metadata`创建和处理元数据
- 提供装饰器方式定义请求，基本实例`Snail`，请求实例`Api`

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
import { Snail, Server } from "@snail-js/api";

@Server({
  baseURL: "/api",
  timeout: 5000,
})
class BackEnd extends Snail {}

export const Service = new BackEnd();
```

3. 创建请求实例

```typescript
// user.ts
import { Api, Get, Post, Params, Data } from "@snail-js/api";

import { Service } from "./service";

@Api("user")
class UserApi {

  @Get()
  get(@Params("id") id: string) {}

  @Post()
  create(@Data() user: User) {}
}
// 创建并导出api
export const userApi = Service.createApi(UserApi);
```

3. 发送请求

```typescript
import { userApi } from "./user";

const res = await userApi.get("1");
const { error, data } = res;
if (error !== null) {
  console.log(data);
}
```

### Server 配置

- `baseUrl`：同`Axios`，使用`vite.proxy`时，请使用`\`开头，直接跨域请求请填写完整地址
- `Versioning`:版本管理器
  - type:管理器类型，enum:Uri,Head,Query,Custom
  - prifix:前缀,字符串；添加在版本号前面的字符，默认为`v`
  - defaultVersion:全局默认版本
- timenout:全局超时时间，会被 Api 的 timeout 值覆盖
- CacheManage：缓存管理器
  - type:缓存管理器类型，CacheType,`enum:localStorage,IndexDB,Memory`
  - ttl: 缓存过期时间
- enableLog:  是否打印日志

## Api 配置

- url?: api 请求端点，与 Server 中的`baseUrl`拼接请求地址，不要使用`/`开头
- timeout?: 请求超时时间;会覆盖`Server.timeout`
- version?: 请求版本，会覆盖`Server.Versioning.defaultVersion`;

## 请求方法装饰器

- 提供 axios 的全部请求方法`Get,Post,Head,Put,Delete,Patch,Options`
- path?: string; 请求端点路径，与`baseUrl,api.url`共同拼接组成最终请求路径，不要使用`/`开头

## 参数装饰器

### 查询参数 `@Params`

- `@Params(key?:string)`

- 单个参数使用

```typescript
@Api("user")
class UserApi {

  @Get()
  get(@Params("id") id: string, @Params("sign") sign: string) {}
}
```

> 传入 key，标记单个查询参数，拼接到请求`?k1=v1&k2=v2`

- 对象参数使用

```typescript
class QueryParams {
  id: string;
  sign: string;
}

@Api("user")
class UserApi {

  @Get()
  get(@Params() params: QueryParams) {}
}
```

> 不传入 key，会被标记为对象类型查询参数；也能自动拼接到请求

- 混合使用

```typescript
class QueryParams {
  id: string;
  sign: string;
}

@Api("user")
class UserApi {

  @Get()
  get(@Params() params: QueryParams, @Params("a") a: number) {}
}
```

### 请求数据

- `@Data(key?:string)`
- 使用方式和`@Params`相同，也支持混合使用

## 策略装饰器`@UseStrategy`

- `@UseStrategy(Strategy[])`

### 请求策略

- 在请求发送前执行，后面的策略返回结果会覆盖前面的策略
- 必须将处理后的 request 返回

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
@UseStrategy(new CustomStrategy())
class BackEnd extends Snail<ShanheResponse> {}
export const Service = new BackEnd();

// 用在Api, 当Api下的方法请求时生效
@Api("test")
@UseStrategy(new CustomStrategy())
class Test {}

// 用在方法，此方法请求时生效
@Api("test")
@UseStrategy(new CustomStrategy())
class Test {
  @Get()
  @UseStrategy(new CustomStrategy())
  get() {}
}
```

### 响应策略

- 在收到服务器响应后执行
- 必须将处理后的 response 返回

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

#### `VersioningOption`类型

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

### 缓存装饰器`@Cache`
- `@Cache(string | null)`
 - 当设置为null时，此方法不应用缓存
 - 当设置为string时，应为此Api类下的方法名称，当设置的此名称方法被调用且正常响应时，被装饰的方法缓存失效

```typescript

@Api("test")
class Test {

  @Get("HelloWorld")
  @Cache("test2")
  test1() {}

  @Post()
  test2() {}

  @Get()
  @Cache(null)
  test3() {}
}
```

> 当请求`[Post]test`成功时，`[Get]test/HelloWorld`的缓存失效
> 注意：`test2`方法请求成功的前提是需要设置`@Cache(null)`,否则仅第一次请求会发送，后续请求需等待缓存管理设置的ttl时间到期才会发送请求
> 因此，若未设置`test2`方法的`@Cache(null)`，仅第一次请求会使`[Get]test/HelloWorld`的缓存失效，后续需等待ttl时间到期，才会继续失效

> `test3`方法请求成功时，不缓存

> 注意：要使用缓存，请配置`@Server({CacheManage})`缓存管理器

### 代码仓库

<p>
  <a src="https://gitee.com/limich/snail">
    <img src="https://img.shields.io/badge/snail-js?style=flat&label=gitee&labelColor=F56C6C&link=https%3A%2F%2Fgitee.com%2Flimich%2Fsnail"></img>
  </a>
</p>
<p>
  <a src="https://github.com/limingchang/snail">
    <img src="https://img.shields.io/badge/snail-js?style=flat&label=github&labelColor=F56C6C&link=https%3A%2F%2Fgihub.com%2Flimingchang%2Fsnail"></img>
  </a>
</p>

### 作者

- mc.lee

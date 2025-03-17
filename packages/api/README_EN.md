<p>
  <img src="https://img.shields.io/badge/TypeScript-1e80ff"></img>
  <img src="https://img.shields.io/npm/v/axios?label=axios&labelColor=1e80ff&color=67C23A"></img>
  <img src="https://img.shields.io/npm/v/reflect-metadata?label=reflect-metadata&labelColor=1e80ff&color=67C23A"></img>
</p>

<a href='./README.md'>中文文档</a>|English Document

## Project Introduction

- Secondary encapsulation based on Axios
- Use `reflect-metadata` to create and process metadata
- Provide decorators to define request methods, supporting all HTTP methods and SSE

## Installation

`npm install @snail-js/api`

## Usage

1. Enable TypeScript decorator configuration:

```json
// tsconfig.json
{
  "module": "ESNext",
  // Module resolution strategy
  "moduleResolution": "node",
  "baseUrl": ".",
  // Target must be higher than ES6
  "target": "ESNext",
  // lib should include ES versions above ES6
  "lib": ["ESNext", "DOM"],
  // Include reflect-metadata types
  "types": ["reflect-metadata"],
  "emitDecoratorMetadata": true,
  "experimentalDecorators": true,

  "skipLibCheck": true,
  "strictNullChecks": false
}
```

2. Create Snail backend configuration instance:

```ts
// service.ts
import { SnailServer, Server } from "@snail-js/api";

@Server({
  baseURL: "/api",
  timeout: 5000,
})
class BackEnd extends SnailServer {}

export const Service = new BackEnd();
```

3. Create API instance:

```ts
// user.ts
import { Api, Get, Post, Query, Data, SnailApi } from "@snail-js/api";
import { Service } from "./service";

@Api("user")
class UserApi extends SnailApi {
  @Get()
  get(@Query("id") id: string) {}

  @Post()
  create(@Data() user: User) {}
}
// Create and export API
export const userApi = Service.createApi(UserApi);
```

4. Send requests:

```ts
import { userApi } from "./user";

const getUser = await userApi.get("1");
const { send, onSuccess, onError, onHitCache, on } = getUser;
const data = await send();
```

## `SnailMethod` Instance

- When calling `Service.createApi(ApiInstance)`, creates a proxy for methods decorated with `RequestMethod` (e.g. @Get, @Post)
- Returns a function containing request parameters, which when called returns a `SnailMethod` instance

### `SnailMethod` Methods

- `send`: Send request  
  _Async function that executes the current request_
- `onSuccess`: Request success callback  
  _Register success event handler_
- `onError`: Request failure callback  
  _Register error event handler_
- `onHitCache`: Cache hit callback  
  _Register cache hit event handler_
- `onFinish`: Request completion callback  
  _Register completion event handler (fires on both success/error)_
- `on`: Event listener  
  _Register custom event handlers_
 _Register custom event handlers_
- `emit`: Trigger custom events  
  _Emit custom events_
- `off`: Remove event listeners  
  _Unregister custom event handlers_

### `SnailMethod` Properties
- `response`: AxiosResponse - Raw response object
- `request`: AxiosRequestConfig - Final processed request after applying Versioning and Strategies
- `version`: string - Effective request version (undefined if Versioning disabled)
- `name`: string - Full method identifier in `ServerName.ApiName.MethodName` format
- `error`: Error | null - Error object if request failed, null otherwise

### Server Configuration

<table>
  <tr>
    <th>Option</th>
    <th>Type</th>
    <th>Required</th>
    <th>Default Value</th>
    <th>Description</th>
  </tr>
  <tr>
    <td>name</td>
    <td>string</td>
    <td>No</td>
    <td>Class name inheriting SnailServer</td>
    <td>Unique server identifier</td>
  </tr>
  <tr>
    <td>baseUrl</td>
    <td>string</td>
    <td>No</td>
    <td>'\'</td>
    <td>API prefix (same as axios baseURL)</td>
  </tr>
  <tr>
    <td>Versioning</td>
    <td><a href="#versioningoption">VersioningOption</a></td>
    <td>No</td>
    <td>undefine</td>
    <td>Versioning configuration</td>
  </tr>
  <tr>
    <td>timeout</td>
    <td>number</td>
    <td>No</td>
    <td>5000</td>
    <td>Global timeout (ms)</td>
  </tr>
  <tr>
    <td>cacheManage</td>
    <td>{type:CacheType,ttl:number}</td>
    <td>No</td>
    <td>{
      type: CacheType.Memory,
      ttl: 500
    }</td>
    <td>Cache manager (ttl in seconds)</td>
  </tr>
  <tr>
    <td>cacheFor</td>
    <td>RequestMethod | RequestMethod[] | 'All' | 'all' </td>
    <td>No</td>
    <td>Get</td>
    <td>Methods to enable caching</td>
  </tr>
  <tr>
    <td>enableLog</td>
    <td>boolean</td>
    <td>No</td>
    <td>false</td>
    <td>Enable debug logs</td>
  </tr>
</table>

### API Configuration
- Decorate API classes with `@Api()` and extend `SnailApi`

<table>
  <tr>
    <th>Option</th>
    <th>Type</th>
    <th>Required</th>
    <th>Default Value</th>
    <th>Description</th>
  </tr>
  <tr>
    <td>name</td>
    <td>string</td>
    <td>No</td>
    <td>default use extends`SnailApi` class name</td>
    <td>Unique API identifier</td>
  </tr>
  <tr>
    <td>timeout</td>
    <td>number</td>
    <td>No</td>
    <td></td>
    <td>Overrides server timeout</td>
  </tr>
  <tr>
    <td>version</td>
    <td>string</td>
    <td>No</td>
    <td></td>
    <td>Overrides server defaultVersion</td>
  </tr>
</table>

## Request Method Decorators
- Used in API classes to mark request methods
- Supports all axios methods: Get, Post, Head, Put, Delete, Patch, Options
- Parameter: path?: string - Endpoint path (combined with baseURL)

## Parameter Decorators
### Query Parameters @Query
- @Query(key?:string)
Example:

```ts
@Api("user")
class UserApi {
  @Get()
  get(@Query("id") id: string, @Query("sign") sign: string) {}
}
```
> Parameters will be appended as ?k1=v1&k2=v2

### Route Parameters @Params
- @Params(key?:string)
Example with object:
```ts
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

> Automatically maps object properties to route parameters

### Request Data

- `@Data(key?:string)`
- Usage pattern same as `@Params`, supports mixed usage

## Strategy Decorator `@UseStrategy`

- `@UseStrategy(...Strategy[])`

### Request Strategy

- Executed before request sending, subsequent strategy results override previous ones
- If returns processed request, uses it for sending; otherwise uses original or previous strategy's result

```typescript
class CustomStrategy extends Strategy {
  applyRequest(request: AxiosRequestConfig) {
    request.headers["Access-Token"] = "abcde";
    return request;
  }
}

// Applied to Snail for global request strategies
@Server({
  baseURL: "/api",
  timeout: 5000,
})
@UseStrategy(CustomStrategy)
class BackEnd extends Snail<ShanheResponse> {}
export const Service = new BackEnd();
// Register strategy after instance creation
Service.registerStrategies(CustomStrategy);

// Applied to API for method-specific strategies
@Api("test")
@UseStrategy(CustomStrategy)
class Test {}
const TestApi = Service.createApi(Test);
TestApi.registerStrategies(CustomStrategy);

// Applied to method for endpoint-level strategies
@Api("test")
@UseStrategy(CustomStrategy)
class Test {
  @Get()
  @UseStrategy(CustomStrategy)
  get() {}
}
// Register strategy before request
const TestApi = Service.createApi(Test);
const getSomething = TestApi.get();
getSomething.registerStrategies(CustomStrategy);
{ send, registerStrategies } = getSomething;
```

### Response Strategy
- Executed after receiving server response
- Processed response propagates through strategy chain

```typescript
class CustomStrategy extends Strategy {
  applyResponse(response: AxiosResponse) {
    const { status } = response;
    if (status == 200) {
      // Custom processing
    }
    return response;
  }
}
```

## Version Management Decorators @Versioning & @Version
### Version Manager @Versioning(VersioningOption)
- Global version management

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

### <a id='versioningOption'>VersioningOption Type</a>

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

### Temporary Version Modifier @Version
- Override version for specific methods
```typescript
@Api("test")
class Test {
  @Get("HelloWorld")
  @Version("0.2.0")
  test() {}
}
```

> Enables temporary version override for testing

### Cache Decorator @HitSource
- @HitSource(name:string)
- Defines cache invalidation sources
- Name format: serverName:apiName:methodName
> Note: Use configured names if available, otherwise class names

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
  // Invalidates cache for all Test class methods
  @HitSource("api1")
  test3() {}
}
```

> Successful [Post]test calls invalidate [Get]test/HelloWorld cache Default caching only for GET methods. Use @Server({cacheFor:'all'}) for other methods

> When `test3` method request succeeds, it won't be cached

> Note: To enable caching, configure `@Server({cacheManage})` cache manager

### Upload Progress Decorator `@UploadProgress`

- `@UploadProgress((progressEvent: AxiosProgressEvent) => void)`

### Download Progress Decorator `@DownloadProgress`

- `@DownloadProgress((progressEvent: AxiosProgressEvent) => void)`

## Server-Sent Events (SSE)

### Create SSE Endpoint

```typescript
@Sse("sse")
class ServerSend extends SnailSse {

  @OnSseOpen()
  handleOpen(event: Event) {
    console.log("SSE connection opened:", event);
  }

  @OnSseError()
  handleError(event: Event) {
    console.log("SSE error occurred:", event);
  }

  // Handle default message events
  @SseEvent()
  handleEvent(event: MessageEvent) {
    console.log("SSE message event:", event.data);
  }

  // Handle custom named events
  @SseEvent("chunk")
  handleChunkEvent(event: Event) {
    console.log("SSE chunk event:", event);
  }
}

export const Sse = Service.createSse(ServerSend);
```

### SSE Decorator @Sse
- @Sse(path: string, options?: { withCredentials?: boolean, version?: string })
- Creates a server-sent events connection, returns a function to open SSE connection:
  - Returns { eventSource: EventSource, close: () => void } when called:
    - eventSource: SSE connection instance
    - close: Method to close the connection
### SSE Open Handler Decorator @OnSseOpen
- Registers decorated method as onopen handler for EventSource instances created by @Sse decorated methods
### SSE Error Handler Decorator @OnSseError
- Registers decorated method as onerror handler for EventSource instances created by @Sse decorated methods
### SSE Event Handler Decorator @SseEvent
- @SseEvent(eventName?: string)
- Without eventName : Registers as default message event handler
- With eventName : Registers as handler for specified custom event

------

## TypeScript Support
### Default Response Type

```typescript
export type StandardResponseData<
  T extends ResponseJsonData = Record<string, any>
> = {
  code: number;
  message: string;
  data: T;
};
```

### Custom Response Types
1. Define backend response format:
```typescript
export class CustomResponse {
  status_code: number;
  msg: string;
}
```
2. Apply type when creating service:
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

3. Type annotation when calling APIs:
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

// Default data key:
// res.data => CustomResponse & { data: User }
```

> API response format:
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

4. Custom data key configuration:

```typescript
@Server({
  baseURL: "/api",
  timeout: 5000,
})
class BackEnd extends Snail<CustomResponse, "record"> {}

const { send } = userApi.get<User>("1");
const res = await send();
// Custom data key:
// res.data => CustomResponse & { record: User }
```

### Non-JSON Responses
- For non-JSON content-type responses: send() returns AxiosResponse
- For JSON content-type responses: send() returns AxiosResponse.data

### Repository
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

### Author

- mc.lee
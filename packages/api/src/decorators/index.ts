/**
 * 内置装饰器。
 *
 * 请求层以装饰器形式暴露的一切都从这里再导出，因此
 * `import { Get, Post, Query } from "@snail-js/api"` 与
 * `import { Get, Post, Query } from "@snail-js/api/decorators"` 拿到的是同一个东西。
 *
 * Built-in decorators.
 *
 * Everything the request layer exposes as a decorator is re-exported from here,
 * so `import { Get, Post, Query } from "@snail-js/api"` and
 * `import { Get, Post, Query } from "@snail-js/api/decorators"` are the same
 * thing.
 */

export { Api } from "./api";
export { Server } from "./server";
export {
  Delete,
  Get,
  Head,
  Options,
  Patch,
  Post,
  Put,
  Request,
  type RequestMethodOptions
} from "./methods";
export {
  Data,
  HeaderParam,
  HeaderValue,
  Params,
  Query,
  createParamDecoratorFor,
  defineParamDescriptor,
  normalizeParamInput,
  type ParamDecoratorInput
} from "./args";
export { Header } from "./header";
export { DownloadProgress, UploadProgress, type SnailProgressCallback } from "./progress";
export {
  HttpStream,
  OnSseError,
  OnSseOpen,
  OnWsClose,
  OnWsError,
  OnWsMessage,
  OnWsOpen,
  Sse,
  SseEvent,
  WebSocket,
  Ws,
  type SnailSseHandlers,
  type SnailWsHandlers
} from "./stream";
export {
  createClassDecorator,
  createMethodDecorator,
  createParamDecorator,
  createPropertyDecorator,
  customMetadataKey,
  getClassMetadata,
  getMethodMetadata,
  getOwnMethodMetadata
} from "./custom";

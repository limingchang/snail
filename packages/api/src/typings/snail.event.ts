import { AxiosResponse } from "axios";

export type SnailSuccessListener<T = any> = (data?: T) => void;
export type SnailErrorListener<T = any, ErrorData = any> = (
  response?: AxiosResponse<T> | Error | ErrorData
) => void;
export type SnailHitCacheListener<T = any> = (cacheData?: T) => void;
export type SnailFinishListener<T = any> = (data?: T) => void;

export type SnailEventListener<T = any, ErrorData = any> =
  | SnailSuccessListener<T>
  | SnailErrorListener<T, ErrorData>
  | SnailHitCacheListener<T>
  | SnailFinishListener<T>;

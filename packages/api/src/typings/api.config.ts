import { RequestBody } from "./request.body";
import { ResponseErrorData, ResponseSuccessData,PaginationData } from "./response.data";
export interface PipeResult {
  data: RequestBody | undefined;
  headers: Record<string, string>;
}

export type RequestPipe = (
  data: RequestBody | undefined,
  headers: Record<string, string>
) => PipeResult;

export interface ApiConfig<R = any> {
  name?: string;
  timeout?: number;
  version?: string;
  transform?: (data: R | PaginationData<R>) => R | PaginationData<R>;
  headers?: Record<string, string>;
  params?: Record<string, string>;
}

export interface SendOptions {
  params?: Record<string, string>;
  data?: RequestBody;
}

interface ApiSuccessResponse<T> {
  error: null;
  data: ResponseSuccessData<T>;
  hitCache:boolean
}

interface ApiErrorResponse<T> {
  error: ResponseErrorData<T>;
  data: null;
  hitCache:boolean
}

export type ApiResponse<T = any, E = any> =
  | ApiSuccessResponse<T>
  | ApiErrorResponse<E>;

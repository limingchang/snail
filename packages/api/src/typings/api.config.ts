import { RequestBody } from "./request.body";
import { Api } from "../core/api";
import {
  ResponseErrorData,
  ResponseSuccessData,
  PaginationData,
} from "./response.data";
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
  hitSource?: string | Api;
}

export interface SendOptions {
  params?: Record<string, string>;
  data?: RequestBody;
  version?: string;
}

// interface ApiSuccessResponse<T> {
//   error: null;
//   data: ResponseSuccessData<T>;
//   hitCache: boolean;
// }

export interface ApiResponse<T, E> {
  error: ResponseErrorData<E> | null;
  data: ResponseSuccessData<T> | null;
  hitCache: boolean;
  Catch: (error: any) => any;
}

// export type ApiResponse<T = any, E = any> =
//   | ApiSuccessResponse<T>
//   | ApiErrorResponse<E>;

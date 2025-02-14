export interface ResponseErrorData<E> {
  code: number;
  message: string;
  data: E;
}

export interface PaginationData<T> {
  // 数据总数
  total: number;
  // 第几页
  page: number;
  // 每页条数
  size: number;
  // 数据
  record: T[];
}

export interface ResponseSuccessData<T> {
  code: 0;
  message: string;
  data: T | PaginationData<T>;
}

export type ResponseData<T = any, E = any> =
  | ResponseSuccessData<T>
  | ResponseErrorData<E>;

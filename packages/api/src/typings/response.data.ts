export interface ResponseErrorData<E = any> {
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

export interface ResponseSuccessData<T = any> {
  code: 0;
  message: string;
  data: T | PaginationData<T>;
}

export type ResponseData<T, E> = ResponseSuccessData<T> | ResponseErrorData<E>;

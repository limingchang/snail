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

export type ResponseJsonData = Record<string, any> | object;

export type SpecialResponseData =
  | string // 纯文本
  | ArrayBuffer // 二进制数据
  | Blob // 二进制大对象
  | FormData; // 表单数据

export type StandardResponseData<T = any> = {
  code: number;
  message: string;
  data: T;
};

export type ResponseData =
  | ResponseJsonData
  | StandardResponseData
  | SpecialResponseData;

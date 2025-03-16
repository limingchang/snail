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

// export interface ResponseData {
//   code: 0;
//   message: string;
// }

export type ResponseJsonData = Record<string, any> | object;

export type SpecialResponseData =
  | string // 纯文本
  | ArrayBuffer // 二进制数据
  | Blob // 二进制大对象
  | FormData; // 表单数据

export type StandardResponseData<
  T extends ResponseJsonData = any,
  DK extends string = "data",
  SK extends string = "code",
  MK extends string = "message"
> = {
  [K in SK]: number;
} & {
  [K in MK]: string;
} & {
  [K in DK]: T;
};


export type ResponseData = ResponseJsonData | SpecialResponseData;

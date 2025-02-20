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

export interface ResponseData{
  code: 0;
  message: string;
}

export interface RequestPipeResult {
  data?: any;
  headers?: Record<string, string>;
}

export type RequestPipe = (input: RequestPipeResult) => RequestPipeResult;

export interface ApiConfig<T = any> {
  name?: string;
  timeout?: number;
  version?: string;
  transform?: (data: any) => T;
  requestPipes?: RequestPipe[];
  headers?: Record<string, string>;
}

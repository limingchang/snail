// import { ResponseData } from "./response.data";

export type ApiResponse<T> = Promise<{
  data: T | null;
  error: Error | null;
}>;

export type ApiProxy<T, R extends { data: any }> = {
  [K in keyof T]: T[K] extends (...args: infer A) => any
    ? <D = any, E = any>(...args: A) => ApiResponse<R & { data: D }>
    : T[K];
};

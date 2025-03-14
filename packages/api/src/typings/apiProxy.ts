import { ResponseData } from "./response.data";

import { SnailMethod } from "../core/snailMethod";

export type ApiResponse<T> = Promise<{
  data: T | null;
  error: Error | null;
  hitCache?: boolean;
}>;

// export type ApiProxy<
//   T,
//   R extends {} = ResponseData,
//   DK extends string = "data"
// > = {
//   [K in keyof T]: T[K] extends (...args: infer A) => any
//     ? <D = any>(...args: A) => ApiResponse<R & { [KK in DK]: D }>
//     : T[K];
// };

export type ApiProxy<T, R extends {} = ResponseData> = {
  [K in keyof T]: T[K] extends (...args: infer A) => any
    ? <D = any>(...args: A) => SnailMethod<R, D>
    : T[K];
};

import {
  ResponseData,
  ResponseJsonData,
  SpecialResponseData,
  StandardResponseData,
} from "./response.data";

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

// export type ApiProxy<T, R extends ResponseData = ResponseJsonData> = {
//   [K in keyof T]: T[K] extends (...args: infer A) => any
//     ? <D = any>(...args: A) => SnailMethod<R, D>
//     : T[K];
// };

//T 代理的api cass,
//RT response.data类型,
//DK response.data.data key,
//SK response.data.status key,
//MK response.data.message key
export type ApiProxy<
  T extends object,
  RT extends ResponseData = StandardResponseData<ResponseJsonData>,
  DK extends string = "data",
  SK extends string = "code",
  MK extends string = "message"
> = {
  [K in keyof T]: T[K] extends (...args: infer A) => any
    ? RT extends SpecialResponseData
      ? <RD extends SpecialResponseData>(...args: A) => SnailMethod<RD>
      : <RD extends ResponseJsonData>(
          ...args: A
        ) => SnailMethod<StandardResponseData<RD, DK, SK, MK>>
    : T[K];
};

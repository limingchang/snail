import {
  SpecialResponseData,
  StandardResponseData,
  ResponseJsonData,
} from "./response.data";


import { MethodProxy } from "./snail.method";

export type StandardResponseWithoutData = Omit<StandardResponseData, "data">;


export type ApiProxy<
  T extends object,
  RT extends StandardResponseWithoutData | ResponseJsonData,
  DK extends string = "data"
> = {
  [K in keyof T]: T[K] extends (...args: infer A) => any
    ? <RD = unknown>() => MethodProxy<
        RD extends SpecialResponseData ? RD : RT & { [KK in DK]: RD },
        A extends any[] ? A : []
      >
    : T[K];
};

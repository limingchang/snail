import { AxiosRequestConfig, Method, AxiosResponse } from "axios";
import {
  ResponseData,
  ResponseJsonData,
  SpecialResponseData,
} from "./response.data";

import { SnailMethod } from "../core";

export interface MethodSendOptions {
  name?: string;
  adapter?: AxiosRequestConfig["adapter"];
}

export interface MethodOption extends MethodSendOptions {
  method: Method;
  path: string;
}

export interface MethodProxy<
  RD extends ResponseData = ResponseJsonData,
  ArgsType extends any[] = []
> extends SnailMethod<RD> {
  send: (
    ...args: ArgsType
  ) => Promise<RD extends SpecialResponseData ? AxiosResponse<RD> : RD>;
}
// export type EventHandler<T = any> = (data?: T) => void;

// export enum EventType {
//   Success = "success",
//   Error = "error",
//   hitCache = "hitCache",
//   Finish = "finish",
// }

// export type SnailMethodEventType = `${EventType}` | EventType | string;

// export type SendRequest<
//   RD extends ResponseData = StandardResponseData<ResponseJsonData>
// > = () => Promise<RD extends SpecialResponseData ? AxiosResponse<RD> : RD>;

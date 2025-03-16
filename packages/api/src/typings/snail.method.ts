import { AxiosResponse } from "axios";
import {
  ResponseData,
  ResponseJsonData,
  StandardResponseData,
  SpecialResponseData,
} from "./response.data";

export type EventHandler<T = any> = (data?: T) => void;

export enum EventType {
  Success = "success",
  Error = "error",
  hitCache = "hitCache",
  Finish = "finish",
}

export type SnailMethodEventType = `${EventType}` | EventType & string


export type SendRequest<
  RD extends ResponseData = StandardResponseData<ResponseJsonData>
> = () =>
  | Promise<RD extends SpecialResponseData ? AxiosResponse<RD> : RD>
  | Promise<Error>;

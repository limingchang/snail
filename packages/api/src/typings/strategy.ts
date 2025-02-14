import { AxiosRequestConfig, AxiosResponse } from "axios";

// 策略接口
export class Strategy {
  applyRequest?(request: AxiosRequestConfig): AxiosRequestConfig|Promise<AxiosRequestConfig>;
  applyResponse?(response: AxiosResponse):AxiosResponse|Promise<AxiosResponse>;
}

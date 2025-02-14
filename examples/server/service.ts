import { AxiosRequestConfig } from "axios";
import {
  Snail,
  Server,
  Versioning,
  VersioningType,
  Strategy,
  UseStrategy,
} from "@snail-js/api";
import "reflect-metadata";

export class CustomStrategy extends Strategy {
  applyRequest(request: AxiosRequestConfig) {
    request.headers["Access-Control-Allow-Origin"] = "*";
    return request;
  }
}

export class ShanheResponse<T=any> {
  code: number;
  text: string;
  data: T;
}

@Server({
  baseURL: "/api",
  timeout: 5000,
})
@Versioning({
  type: VersioningType.Header,
  defaultVersion: "0.1.0",
})
@UseStrategy(new CustomStrategy())
class BackEnd extends Snail<ShanheResponse> {}

export const Service = new BackEnd();

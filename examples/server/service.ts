import { AxiosRequestConfig } from "axios";
import {
  Snail,
  Server,
  Versioning,
  VersioningType,
  Strategy,
  UseStrategy,
  CacheType,
} from "@snail-js/api";
import "reflect-metadata";

export class CustomStrategy extends Strategy {
  applyRequest(request: AxiosRequestConfig) {
    request.headers["Access-Control-Allow-Origin"] = "*";
    return request;
  }
}

export class ShanheResponse {
  code: number;
  text: string;
}

@Server({
  baseURL: "/api",
  timeout: 5000,
  CacheManage: {
    type: CacheType.IndexDB,
    ttl: 500,
  },
  // enableLog:true
})
@Versioning({
  type: VersioningType.Header,
  defaultVersion: "0.1.0",
})
@UseStrategy(new CustomStrategy())
class BackEnd extends Snail<ShanheResponse> {}

export const Service = new BackEnd();

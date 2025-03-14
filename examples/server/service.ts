import { AxiosRequestConfig } from "axios";
import {
  SnailServer,
  Server,
  Versioning,
  VersioningType,
  Strategy,
  UseStrategy,
  CacheType,
  HitSource
} from "@snail-js/api";
import "reflect-metadata";
import { server } from "typescript";

export class CustomStrategy extends Strategy {
  applyRequest(request: AxiosRequestConfig) {
    request.headers["Access-Control-Allow-Origin"] = "*";
    request.headers["Snail-Header"] = "snail";
    return request;
  }
}

export class ShanheResponse {
  code: number;
  text: string;
}

@Server({
  name: "shanhe",
  baseURL: "/api",
  timeout: 5000,
  cacheManage: {
    type: CacheType.IndexDB,
    ttl: 500,
  },
  enableLog:true
})
@Versioning({
  type: VersioningType.Query,
  defaultVersion: "0.1.0",
})
// @HitSource("shanhe.Test.shanheNongli")
// @UseStrategy(new CustomStrategy())
class BackEnd extends SnailServer<ShanheResponse> {}

export const Service = new BackEnd();
Service.registerStrategys(CustomStrategy);

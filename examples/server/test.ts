import { ApiConfig, RequestPipe } from "@snail-js/api";

import Snail from "./snail";

const pipe: RequestPipe = (data, headers) => {
  const newHeaders = {
    ...headers,
    pipe: "RequestPipe",
    aaa: "lmc",
  };
  return {
    data,
    headers: newHeaders,
  };
};

const transform = (data: any) => {
  return {
    ...data,
    transform: "transform",
  };
};

const options: ApiConfig = {
  transform,
  version: "0.1.0",
};

const Api = Snail.Get("test", options);
Api.use(pipe);
export const TestApi = Api;

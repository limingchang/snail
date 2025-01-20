import { Api, ApiConfig, RequestPipe } from "@snail-js/api";

import Snail from "./snail";

const pipe: RequestPipe = (input) => {
  const { data, headers } = input;
  const newHeaders = {
    ...headers,
    pipe: "RequestPipe",
  };
  return {
    data,
    headers: newHeaders,
  };
};

const transform = (data:any) => {
  return {
    ...data,
    transform: "transform",
  };
};

const options: ApiConfig = {
  requestPipes: [pipe],
  transform,
};

export default Snail.Get("test", options);

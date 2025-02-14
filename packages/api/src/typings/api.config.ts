import { RequestMethod } from "./request.method";
export interface ApiConfig{
  timeout?: number;
  version?: string;
}

export interface MethodOption {
  method: RequestMethod;
  path: string;
}

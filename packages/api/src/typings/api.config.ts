import { RequestMethod } from "./request.method";
import { SnailServer } from "../core"; '../core/snailServer'
export interface ApiConfig {
  name?: string;
  timeout?: number;
  version?: string;
}

export interface MethodOption {
  name?: string;
  method: RequestMethod;
  path: string;
}

export interface ApiInstanceOptions{
  serverInstance:SnailServer;
  enableLog?:boolean;
}
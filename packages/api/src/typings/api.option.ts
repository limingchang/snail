import { SnailServer } from "../core";
export interface ApiOptions {
  name?: string;
  timeout?: number;
  version?: string;
}



export interface ApiInstanceOptions{
  serverInstance:SnailServer;
  enableLog?:boolean;
}
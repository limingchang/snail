export type EventHandler<T = any> = (data?: T) => void;

export enum EventType {
  Success = "success",
  Error = "error",
  Finish = "finish",
}

// export interface SnailMethodOptions {
//   url: string;
//   method: string;
//   data?: any;
//   version?: string;
//   params?: Record<string, any>;
//   headers?: Record<string, any>;
// }

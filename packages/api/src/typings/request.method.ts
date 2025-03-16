export enum RequestMethodEnum {
  GET = "Get",
  HEAD = "Head",
  POST = "Post",
  PUT = "Put",
  DELETE = "delete",
  PATCH = "Patch",
  OPTIONS = "Options",
}

export type RequestMethod =
  | Uppercase<`${RequestMethodEnum}`>
  | Lowercase<`${RequestMethodEnum}`>
  | `${RequestMethodEnum}`
  | RequestMethodEnum;

import { AxiosRequestConfig, AxiosResponse } from "axios";
import { Strategy } from "../typings";
import { REQUEST_ARGS_KEY } from "../decorators/args";

export async function generateCacheKey(
  methodName: string,
  version: string | undefined,
  request: AxiosRequestConfig
) {
  const { method, url, params, headers } = request;
  const hash = await generateShortUniqueHash(
    `${params ? `-${recordToString(params)}` : ""}${
      headers ? `-${recordToString(headers)}` : ""
    }`
  );

  return `${methodName}${
    version ? `[v${version}]` : ""
  }[${method}]${url}-${hash}`;
}

export async function generateShortUniqueHash(str: string) {
  // 创建一个文本编码器实例
  const encoder = new TextEncoder();
  const data = encoder.encode(str);

  // 使用SHA-256算法生成哈希值
  const hashBuffer = await window.crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  let hashBase64 = btoa(String.fromCharCode.apply(null, hashArray));

  // 替换Base64编码中的特殊字符
  hashBase64 = hashBase64
    .replace(/\+/g, "0")
    .replace(/\//g, "1")
    .replace(/=/g, "");

  // 截取前16个字符作为短哈希值
  return hashBase64.substring(0, 16);
}

export function recordToString(record: Record<string, any>) {
  return Object.keys(record)
    .map((key) => {
      return `${key}=${record[key]}`;
    })
    .sort((a, b) => a.localeCompare(b))
    .join("&");
}

export function replacePlaceholders(
  route: string,
  values: { [key: string]: any }
) {
  // 正则表达式用于匹配以冒号开头的占位符
  const placeholderRegex = /:([a-zA-Z0-9_]+)/g;

  // 使用replace方法进行占位符替换
  const newRoute = route.replace(placeholderRegex, (match, key) => {
    // 如果values对象中存在对应的键，则进行替换
    if (values.hasOwnProperty(key)) {
      return values[key];
    } else {
      // 如果不存在对应的键，可以选择跳过替换或返回null
      // 这里选择跳过替换，保留占位符
      console.error(`路由[${route}]中的占位符${match}，没有对应的值`);
      console.error(`请在该路由对应的方法中添加@Params('${key}')装饰器`);
      throw new TypeError(`route params error in ${route}`)
      return match;
      // 或者抛出错误或返回null，根据具体需求决定
      // throw new Error(`Missing value for placeholder: ${match}`);
      // return null;
    }
  });

  return newRoute;
}

export const resolveUrl = (url?: string) => {
  if (!url) return "";
  if (url.startsWith("/")) return url;
  return `/${url}`;
};

export async function applyStrategies<T extends "request">(
  data: AxiosRequestConfig,
  strategies: Array<new () => Strategy>,
  type: T
): Promise<AxiosRequestConfig>;
export async function applyStrategies<T extends "response">(
  data: AxiosResponse,
  strategies: Array<new () => Strategy>,
  type: T
): Promise<AxiosResponse>;
export async function applyStrategies(
  data: AxiosRequestConfig | AxiosResponse,
  strategies: Array<new () => Strategy>,
  type = "request"
): Promise<AxiosRequestConfig | AxiosResponse> {
  return await strategies.reduce(
    async (result: any, strategy: new () => Strategy) => {
      let handler: Function;
      const instance = new strategy();
      if (type == "response") {
        handler = instance.applyResponse!;
      }
      handler = instance.applyRequest!;
      const currentResult = handler(await result);
      if (!currentResult) return result;
      return currentResult;
    },
    Promise.resolve(data)
  );
}

/**
 * 一个无用函数，避免tsc报错
 */
export const SnailPass = (...args: any) => {
  const flag = false;
  flag && console.log(args);
};

interface IJson {
  [key: string]: any;
}
interface IArgs {
  params: IJson;
  data: IJson;
  querys: IJson;
}

export const buildRequestArgs = (
  target: any,
  propertyKey: string,
  args: any[]
) => {
  const requestArgs: IArgs = { params: {}, data: {}, querys: {} };
  const argsConfigs =
    Reflect.getMetadata(REQUEST_ARGS_KEY, target, propertyKey) || [];
  console.log("argsConfigs:", argsConfigs);
  argsConfigs.forEach(({ index, type, key }: any) => {
    const value = args[index];
    if (type === "params" && !key && typeof value === "object") {
      requestArgs.params = { ...requestArgs.params, ...value };
    }
    if (type === "params" && key) {
      requestArgs.params[key] = value;
    }
    if (type === "querys" && !key && typeof value === "object") {
      requestArgs.querys = { ...requestArgs.params, ...value };
    }
    if (type === "querys" && key) {
      requestArgs.querys[key] = value;
    }
    if (type === "data" && !key && typeof value === "object") {
      requestArgs.data = { ...requestArgs.data, ...value };
    }
    if (type === "data" && key) {
      requestArgs.data[key] = value;
    }
  });

  return requestArgs;
};


// 判断是否是特殊Response数据
/**
 * 判断响应的数据类型是否为 application/json
 * @param {AxiosResponse} response - Axios 的响应对象
 * @returns {boolean} - 如果响应的数据类型是 application/json 则返回 true，否则返回 false
 */
export function isSpecialResponse(response: AxiosResponse): boolean {
  const contentType = response.headers['content-type'];
  return contentType && contentType.includes('application/json');
}
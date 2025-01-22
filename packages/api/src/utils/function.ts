export const apiKey = <
  T extends {
    url: string;
    method: string;
    data?: any;
    version?: string;
    params?: Record<string, any>;
    headers?: Record<string, any>;
  }
>(
  apiInstance: T
) => {
  const { version, method, url, params, headers } = apiInstance;
  return `[${method}]${version ? `-v${version}` : ""}-${url}${
    params ? `-${recordToString(params)}` : ""
  }${headers ? `-${recordToString(headers)}` : ""}`;
};

// export function createPromise(resolveResult: any, rejectResult: any) {
//   const promise = new Promise((resolve, rejectResult) => {
//     resolve(resolveResult);
//     rejectResult(rejectResult);
//   });
//   return promise
// }

export function recordToString(record: Record<string, any>) {
  return Object.keys(record)
    .map((key) => {
      return `${key}=${record[key]}`;
    })
    .sort((a, b) => a.localeCompare(b))
    .join("&");
}

export function getResponseDataFromCache(cacheKey: string) {
  return cacheKey;
}

export function deepCopy<T>(obj: T): T {
  if (typeof obj !== "object" || obj === null) {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map((item) => deepCopy(item)) as T;
  }
  const copy: any = {};
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      copy[key] = deepCopy(obj[key]);
    }
  }
  return copy as T;
}

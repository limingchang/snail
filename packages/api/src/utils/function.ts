export const getConfig = <T extends { config: any }>(
  apiInstance: T
): T["config"] => apiInstance.config;

export const apiKey = <
  T extends {
    url: string;
    method: string;
    data?: any;
    version?: string;
    config: any;
  }
>(
  apiInstance: T
) => {
  const { params, headers } = getConfig(apiInstance);
  return `${apiInstance.method}[${
    apiInstance.version ? apiInstance.version : "v"
  }]-${apiInstance.url}-${JSON.stringify(params)}-${JSON.stringify(headers)}`;
};

// export function createPromise(resolveResult: any, rejectResult: any) {
//   const promise = new Promise((resolve, rejectResult) => {
//     resolve(resolveResult);
//     rejectResult(rejectResult);
//   });
//   return promise
// }

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

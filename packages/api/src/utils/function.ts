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


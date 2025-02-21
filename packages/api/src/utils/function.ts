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
  const str = `${params ? `-${recordToString(params)}` : ""}${
    headers ? `-${recordToString(headers)}` : ""
  }`;
  return `[${method}]${version ? `-v${version}` : ""}-${url}-${generateShortUniqueHash(str)}`;
};

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

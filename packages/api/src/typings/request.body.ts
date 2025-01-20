type JsonBody = Record<string, any>;

export type RequestBody = JsonBody | string | FormData | Blob | ArrayBuffer | URLSearchParams | ReadableStream;
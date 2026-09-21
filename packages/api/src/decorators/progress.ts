import type { AxiosProgressEvent } from "axios";
import { defineMetadata } from "../core/metadata";
import {
  SNAIL_DOWNLOAD_PROGRESS,
  SNAIL_UPLOAD_PROGRESS
} from "../core/metadata.keys";

/**
 * 上传/下载进度回调的签名。
 *
 * Signature of an upload/download progress callback.
 */
export type SnailProgressCallback = (event: AxiosProgressEvent) => void;

/**
 * 为被装饰的方法上报上传进度。
 *
 * 进度事件需要 `xhr` 适配器；axios 的 `fetch` 适配器无法上报。在浏览器中使用该
 * 装饰器时，请在方法或 server 上设置 `adapter: "xhr"`。
 *
 * Report upload progress for the decorated method.
 *
 * ```ts
 * @Post("/upload")
 * @UploadProgress((e) => { if (e.total) bar.value = e.loaded / e.total; })
 * upload(@Data() file: FormData) {}
 * ```
 *
 * Progress events require the `xhr` adapter; axios' `fetch` adapter cannot
 * report them. Set `adapter: "xhr"` on the method or the server when using this
 * decorator in a browser.
 *
 * @param callback 收到每个进度事件时调用 / Called with every progress event
 */
export function UploadProgress(callback: SnailProgressCallback): MethodDecorator {
  return (target, propertyKey) => {
    defineMetadata(SNAIL_UPLOAD_PROGRESS, callback, target, propertyKey);
  };
}

/**
 * 为被装饰的方法上报下载进度。
 *
 * 适配器方面的限制见 {@link UploadProgress}。
 *
 * Report download progress for the decorated method.
 *
 * @see {@link UploadProgress} 适配器方面的限制 / for the adapter caveat.
 *
 * @param callback 收到每个进度事件时调用 / Called with every progress event
 */
export function DownloadProgress(callback: SnailProgressCallback): MethodDecorator {
  return (target, propertyKey) => {
    defineMetadata(SNAIL_DOWNLOAD_PROGRESS, callback, target, propertyKey);
  };
}

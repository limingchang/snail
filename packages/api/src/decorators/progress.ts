import type { AxiosProgressEvent } from "axios";
import { defineMetadata } from "../core/metadata";
import {
  SNAIL_DOWNLOAD_PROGRESS,
  SNAIL_UPLOAD_PROGRESS
} from "../core/metadata.keys";

/** Signature of an upload/download progress callback. */
export type SnailProgressCallback = (event: AxiosProgressEvent) => void;

/**
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
 */
export function UploadProgress(callback: SnailProgressCallback): MethodDecorator {
  return (target, propertyKey) => {
    defineMetadata(SNAIL_UPLOAD_PROGRESS, callback, target, propertyKey);
  };
}

/**
 * Report download progress for the decorated method.
 *
 * @see {@link UploadProgress} for the adapter caveat.
 */
export function DownloadProgress(callback: SnailProgressCallback): MethodDecorator {
  return (target, propertyKey) => {
    defineMetadata(SNAIL_DOWNLOAD_PROGRESS, callback, target, propertyKey);
  };
}

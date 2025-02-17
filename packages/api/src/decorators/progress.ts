import "reflect-metadata";
import { AxiosProgressEvent } from "axios";
export const UPLOAD_PROGRESS_KEY = Symbol("SNAIL_UPLOAD_PROGRESS_KEY");

// 上传进度装饰器
export const UploadProgress = (
  handler: (progressEvent: AxiosProgressEvent) => void
) => {
  return (target: any, propertyKey: string) => {
    Reflect.defineMetadata(UPLOAD_PROGRESS_KEY, handler, target, propertyKey);
  };
};

export const DOWNLOAD_PROGRESS_KEY = Symbol("SNAIL_DOWNLOAD_PROGRESS_KEY");
// 下载进度装饰器
export const DownloadProgress = (
  handler: (progressEvent: AxiosProgressEvent) => void
) => {
  return (target: any, propertyKey: string) => {
    Reflect.defineMetadata(DOWNLOAD_PROGRESS_KEY, handler, target, propertyKey);
  };
};

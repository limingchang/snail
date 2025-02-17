import "reflect-metadata";
import { AxiosProgressEvent } from "axios";
export const UPLOAD_PROGRESS_KEY = Symbol("SNAIL_UPLOAD_PROGRESS_KEY");

// 上传进度装饰器
export const UploadProgress = (
  handler: (progress: AxiosProgressEvent) => void
) => {
  return (target: any, propertyKey: string) => {
    Reflect.defineMetadata("UPLOAD_PROGRESS_KEY", handler, target, propertyKey);
  };
};

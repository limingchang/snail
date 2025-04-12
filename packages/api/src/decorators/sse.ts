import "reflect-metadata";
export const EVENT_SOURCE_OPTION_KEY = Symbol("SNAIL_EVENT_SOURCE_OPTION_KEY");

import { SseOptions } from "../typings";
/**
 * 将装饰的方法创建为SSE连接
 * @param path 路径，要连接到服务端sse端点路径
 * @param options 配置选项
 * @returns 调用被装饰的方法可获得返回{close,eventSource}
 */
export const Sse = (path?: string, options?: SseOptions) => {
  return (target: object) => {
    Reflect.defineMetadata(
      EVENT_SOURCE_OPTION_KEY,
      {
        path,
        ...options,
      },
      target
    );
  };
};

export const EVENT_SOURCE_EVENTS_KEY = Symbol("EVENT_SOURCE_EVENTS_KEY");

/**
 * 将装饰的方法注册为eventSource的对应事件
 * @param eventName 事件名称，可选，默认处理message事件
 * @param options boolean | AddEventListenerOptions 可选，注册事件选项
 * @returns
 */
export const SseEvent = (
  eventName?: string,
  options?: boolean | AddEventListenerOptions
) => {
  return (target: any, propertyKey: string) => {
    // console.log("SseEvent:", target.constructor);
    const events = Reflect.getMetadata(EVENT_SOURCE_EVENTS_KEY, target) || [];
    events.push({
      eventName: eventName ? eventName : "message",
      emit: target[propertyKey],
      options,
    });
    Reflect.defineMetadata(EVENT_SOURCE_EVENTS_KEY, events, target.constructor);
  };
};

export const EVENT_SOURCE_OPEN_KEY = Symbol("EVENT_SOURCE_OPEN_KEY");
/**
 * 将装饰的方法注册为eventSource.onOpen
 * @returns
 */
export const OnSseOpen = () => {
  return (target: any, propertyKey: string) => {
    Reflect.defineMetadata(EVENT_SOURCE_OPEN_KEY, target[propertyKey], target);
  };
};
export const EVENT_SOURCE_ERROR_KEY = Symbol("EVENT_SOURCE_ERROR_KEY");
/**
 * 将装饰的方法注册eventSource.onError
 * @returns
 */
export const OnSseError = () => {
  return (target: any, propertyKey: string) => {
    Reflect.defineMetadata(EVENT_SOURCE_ERROR_KEY, target[propertyKey], target);
  };
};

import "reflect-metadata";
import { Strategy } from "../typings";
export const STRATEGY_KEY = Symbol("SNAIL_STRATEGY_KEY");
// 策略装饰器
/**
 * 策略装饰器，为请求添加请求策略或响应策略
 * @param strategies @type Strategy[]
 * - 传入的策略请使用new 实例化
 * @returns
 */
export const UseStrategy = (...strategies: Array<new () => Strategy>) => {
  return (target: any, propertyKey?: string) => {
    const key = propertyKey
      ? `${STRATEGY_KEY.toString()}_${propertyKey}`
      : STRATEGY_KEY;
    Reflect.defineMetadata(key, strategies, target);
  };
};

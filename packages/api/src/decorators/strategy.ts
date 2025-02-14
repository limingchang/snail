import "reflect-metadata";
import { Strategy } from "../typings";
export const STRATEGY_KEY = Symbol("SNAIL_STRATEGY_KEY");
// 策略装饰器
export const UseStrategy = (...strategies: Strategy[]) => {
  return (target: any, propertyKey?: string) => {
    const key = propertyKey ? `${STRATEGY_KEY.toString()}_${propertyKey}` : STRATEGY_KEY;
    Reflect.defineMetadata(key, strategies, target);
  };
};

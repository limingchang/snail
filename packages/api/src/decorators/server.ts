import "reflect-metadata";

import { SnailOption } from "../typings";

// 元数据键常量
export const SERVER_CONFIG_KEY = Symbol('SANIL_SERVER_CONFIG_KEY');

// const PARAM_KEY = Symbol("param");
// const STRATEGY_KEY = Symbol("strategy");

// Snail 配置装饰器
/**
 * 装饰一个继承Snail 的 class，创建后端交互基本实例
 * @param config @type SnailOption
 * @returns 
 */
export const Server = (config: SnailOption) => {
  return (target: any) => {
    Reflect.defineMetadata(SERVER_CONFIG_KEY, config, target);
  };
};


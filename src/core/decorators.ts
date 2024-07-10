import { setSymbol } from './utils'



/**
 * 装饰器助手
 */
export class SnailDecorators {
  static setModelName(target: any, name: string) {
    return setSymbol(target, 'modelName', name)
  }
}

/**
 * 为模型类标注模型名称
 */
export function Model(name: string) {
  // console.log('set Model name:',name)
  return function (target: any) {
    SnailDecorators.setModelName(target, name)
    target[Symbol.toPrimitive] = (hint: "string" | "number" | "default") => {
      if (hint === 'string') {
        return `[Snail Model: ${name}]`
      }
    }
    target.prototype.toString = function () { return `[Snail Model: ${name}]` }
  }
}
import "reflect-metadata";
export const REQUEST_ARGS_KEY = Symbol("SNAIL_REQUEST_ARGS_KEY");

// 路由参数装饰器
/**
 * 将被装饰的参数定义为查询参数
 * @param key 可选，查询参数的key，未给定key，则被装饰的参数应为对象
 * @returns 
 */
export const Params = (key?: string) => createArgsDecorator("params", key);

// 查询参数装饰器
/**
 * 将被装饰的参数定义为查询参数
 * @param key 可选，查询参数的key，未给定key，则被装饰的参数应为对象
 * @returns 
 */
export const Query = (key?: string) => createArgsDecorator("querys", key);

/**
 * 将被装饰的参数定义为请求数据
 * @param key 可选，请求data的key，未给定key，则被装饰的参数应为对象
 * @returns 
 */
export const Data = (key?: string) => createArgsDecorator("data", key);

const createArgsDecorator = (type: string, key?: string) => {
  return (
    target: any,
    propertyKey: string | symbol,
    parameterIndex: number
  ) => {
    const args =
      Reflect.getMetadata(REQUEST_ARGS_KEY, target, propertyKey) || [];
    args.push({ index: parameterIndex, type, key });
    Reflect.defineMetadata(REQUEST_ARGS_KEY, args, target, propertyKey);
  };
};

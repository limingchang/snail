import "reflect-metadata";
export const REQUEST_ARGS_KEY = Symbol("SNAIL_REQUEST_ARGS_KEY");

// 参数装饰器
export const Params = (key?:string) => createArgsDecorator("params",key);
export const Data = () => createArgsDecorator("data");

const createArgsDecorator = (type: string,key?:string) => {
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

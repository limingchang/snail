

export const setSymbol = (target: Object, key: string, value: any) => {
  // console.log("target:", target);
  Reflect.set(target, Symbol.for(key), value);
  // target[Symbol.for(key)] = value;
  return target;
};

export const getSymbol = (target: Object, key: string): string | undefined => {
  return Reflect.get(target, Symbol.for(key));
};

export const setModelMeta = (target: Object, key: string, value: any) => {
  Reflect.defineProperty(target, key, {
    value,
    writable: false,
    enumerable: false,
    configurable: true,
  });
  return target;
};


export const getModelMeta =(target: Object, key: string) => {
  return Reflect.get(target, key);
};
